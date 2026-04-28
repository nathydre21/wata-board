import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TransactionSuccess } from '../components/TransactionSuccess';
import type { TransactionDetails } from '../components/TransactionSuccess';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { isConnected, requestAccess, signTransaction } from '../utils/wallet-bridge';
import { getCurrentNetworkConfig, getNetworkFromEnv } from '../utils/network-config';
import { useWalletBalance } from '../hooks/useWalletBalance';
import { handleOfflineError, getOfflineErrorMessage } from '../utils/offlineApi';
import { announceToScreenReader } from '../utils/accessibility';
import { logger } from '../utils/logger';
import { paymentEvents } from '../utils/paymentEvents';
import { TransactionBuilder, Operation, Asset, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

interface QRPaymentData {
  meterId: string;
  amount: number;
  timestamp: string;
  network: string;
  version: string;
}

export const QRPaymentHandler: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isSufficientBalance, refreshBalance } = useWalletBalance();

  useEffect(() => {
    const paymentDataParam = searchParams.get('data');
    
    if (!paymentDataParam) {
      setError('No payment data found in QR code');
      setIsLoading(false);
      return;
    }

    try {
      const paymentData: QRPaymentData = JSON.parse(decodeURIComponent(paymentDataParam));
      
      // Validate payment data
      if (!paymentData.meterId || !paymentData.amount || !paymentData.network) {
        throw new Error('Invalid payment data format');
      }

      // Check if payment is too old (older than 30 minutes)
      const paymentTime = new Date(paymentData.timestamp);
      const now = new Date();
      const ageInMinutes = (now.getTime() - paymentTime.getTime()) / (1000 * 60);
      
      if (ageInMinutes > 30) {
        throw new Error('QR code has expired. Please generate a new one.');
      }

      // Check network compatibility
      const currentNetwork = getNetworkFromEnv();
      if (paymentData.network !== currentNetwork) {
        throw new Error(`Network mismatch. QR code is for ${paymentData.network}, current network is ${currentNetwork}`);
      }

      // Auto-process the payment
      processPayment(paymentData);
      
    } catch (err) {
      logger.error('Failed to parse QR payment data', { error: err, paymentDataParam });
      setError(err instanceof Error ? err.message : 'Invalid QR code data');
      setIsLoading(false);
    }
  }, [searchParams]);

  const processPayment = async (paymentData: QRPaymentData) => {
    try {
      setIsLoading(true);
      setStatus(t('payment.status.processing') || 'Processing payment...');

      // Check wallet connection
      const result = await isConnected();
      if (!result.isConnected) {
        throw new Error(t('payment.status.installWallet') || 'Wallet not connected');
      }

      // Validate amount
      if (!isSufficientBalance(paymentData.amount)) {
        throw new Error(t('payment.status.insufficientBalance') || 'Insufficient balance');
      }

      // Create and sign transaction
      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        throw new Error(accessResult.error || 'Wallet access denied');
      }
      const pubKeyString = accessResult.address;

      const networkConfig = getCurrentNetworkConfig();
      const horizonUrl = networkConfig.rpcUrl.replace('soroban', 'horizon');
      const server = new Horizon.Server(horizonUrl);
      
      let account;
      if ((window as any).__MOCK_STELLAR_ACCOUNT__) {
        account = (window as any).__MOCK_STELLAR_ACCOUNT__(pubKeyString);
      } else {
        account = await server.loadAccount(pubKeyString);
      }

      let transaction;
      if ((window as any).__MOCK_STELLAR_TRANSACTION__) {
        transaction = (window as any).__MOCK_STELLAR_TRANSACTION__(account, paymentData.amount);
      } else {
        transaction = new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase: networkConfig.networkPassphrase,
        })
          .addOperation(Operation.payment({
            destination: "GDOPTS553GBKXNF3X4YCQ7NPZUQ644QAN4SV7JEZHAVOVROAUQTSKEHO",
            asset: Asset.native(),
            amount: paymentData.amount.toString(),
          }))
          .setTimeout(30)
          .build();
      }

      setStatus(t('payment.status.signing') || 'Signing transaction...');
      const signedResponse = await signTransaction(transaction.toXDR());
      const signedXdr = typeof signedResponse === 'string' ? signedResponse : (signedResponse as any).signedTxXdr;

      setStatus(t('payment.status.submitting') || 'Submitting transaction...');
      const submitResult = await server.submitTransaction(signedXdr);

      setStatus(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }) || 'Payment successful');
      announceToScreenReader(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }) || 'Payment successful');
      
      setTransactionDetails({
        hash: submitResult.hash,
        meterId: paymentData.meterId,
        amount: paymentData.amount,
        timestamp: new Date(),
        network: getNetworkFromEnv(),
        explorerUrl: networkConfig.explorerUrl
      });
      
      logger.audit('QR code payment successful', { 
        hash: submitResult.hash, 
        meterId: paymentData.meterId, 
        amount: paymentData.amount,
        source: 'qr_code'
      });

      // Emit custom event for QR component to handle
      window.dispatchEvent(new CustomEvent('paymentComplete', {
        detail: { transactionId: submitResult.hash }
      }));

      // Emit payment completion event for automatic balance refresh
      paymentEvents.emitPaymentCompleted({
        transactionId: submitResult.hash,
        amount: paymentData.amount,
        meterId: paymentData.meterId,
        source: 'qr_payment'
      });

    } catch (err: any) {
      logger.error('QR code payment processing failed', err, { paymentData });
      
      const errorInfo = handleOfflineError(err);
      let errorMessage: string;
      
      if (errorInfo.isOffline) {
        errorMessage = getOfflineErrorMessage(err, 'payment');
      } else {
        errorMessage = t('payment.status.paymentFailed', { error: err?.message || 'Transaction failed' });
      }
      
      setStatus(errorMessage);
      setError(errorMessage);
      announceToScreenReader(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  const handleGenerateNewQR = () => {
    navigate('/qr-payment');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">{status || t('payment.status.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error && !transactionDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t('payment.error.title') || 'Payment Failed'}
            </h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={handleBackToHome}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {t('payment.backToHome') || 'Back to Home'}
              </button>
              <button
                onClick={handleGenerateNewQR}
                className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                {t('payment.qr.new') || 'Generate New QR Code'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (transactionDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md mx-auto">
          <TransactionSuccess 
            details={transactionDetails}
            onReset={handleBackToHome}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">{status || t('payment.status.loading') || 'Loading...'}</p>
      </div>
    </div>
  );
};
