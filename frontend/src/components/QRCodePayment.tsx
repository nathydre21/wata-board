import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { sanitizeAlphanumeric, sanitizeAmount, isValidMeterId } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { announceToScreenReader, generateId } from '../utils/accessibility';

interface QRCodePaymentProps {
  onPaymentComplete?: (transactionId: string) => void;
  onError?: (error: string) => void;
}

interface QRPaymentData {
  meterId: string;
  amount: number;
  timestamp: string;
  network: string;
  version: string;
}

export const QRCodePayment: React.FC<QRCodePaymentProps> = ({ 
  onPaymentComplete, 
  onError 
}) => {
  const { t } = useTranslation();
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  
    const meterInputId = useRef(generateId('qr-meter-input'));
  const amountInputId = useRef(generateId('qr-amount-input'));
  const generateButtonId = useRef(generateId('qr-generate-button'));

  // Get current network configuration
  const getNetworkConfig = () => {
    const isTestnet = import.meta.env.VITE_NETWORK === 'testnet';
    return {
      network: isTestnet ? 'testnet' : 'mainnet',
      rpcUrl: isTestnet 
        ? 'https://soroban-testnet.stellar.org:443'
        : 'https://soroban-mainnet.stellar.org:443',
      contractId: import.meta.env.VITE_CONTRACT_ID || ''
    };
  };

  const generateQRCode = async (paymentData: QRPaymentData): Promise<string> => {
    try {
      // Create payment URL with all necessary data
      const baseUrl = window.location.origin;
      const paymentUrl = `${baseUrl}/payment?data=${encodeURIComponent(JSON.stringify(paymentData))}`;
      
      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(paymentUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      return qrDataUrl;
    } catch (error) {
      logger.error('Failed to generate QR code', { error, paymentData });
      throw new Error('Failed to generate QR code');
    }
  };

  const handleGenerateQR = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      // Validate inputs
      if (!meterId.trim()) {
        const errorMsg = t('payment.status.enterMeter') || 'Please enter a meter ID';
        announceToScreenReader(errorMsg);
        onError?.(errorMsg);
        document.getElementById(meterInputId.current)?.focus();
        return;
      }

      if (!isValidMeterId(meterId)) {
        const errorMsg = t('payment.status.invalidMeter') || 'Invalid meter ID format';
        announceToScreenReader(errorMsg);
        onError?.(errorMsg);
        document.getElementById(meterInputId.current)?.focus();
        return;
      }

      const parsedAmount = sanitizeAmount(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        const errorMsg = t('payment.status.enterValidAmount') || 'Please enter a valid amount';
        announceToScreenReader(errorMsg);
        onError?.(errorMsg);
        document.getElementById(amountInputId.current)?.focus();
        return;
      }

      const amountU32 = Math.floor(parsedAmount);
      if (amountU32 <= 0) {
        const errorMsg = t('payment.status.enterValidAmount') || 'Please enter a valid amount';
        announceToScreenReader(errorMsg);
        onError?.(errorMsg);
        document.getElementById(amountInputId.current)?.focus();
        return;
      }

      setIsGenerating(true);
      setShowQR(false);

      // Sanitize meter ID
      const sanitizedMeterId = sanitizeAlphanumeric(meterId, 50);

      // Create payment data
      const networkConfig = getNetworkConfig();
      const paymentData: QRPaymentData = {
        meterId: sanitizedMeterId,
        amount: amountU32,
        timestamp: new Date().toISOString(),
        network: networkConfig.network,
        version: '1.0'
      };

      // Generate QR code
      const qrDataUrl = await generateQRCode(paymentData);
      setQrCodeUrl(qrDataUrl);
      setShowQR(true);

      logger.info('QR code generated successfully', { 
        meterId: sanitizedMeterId, 
        amount: amountU32,
        network: networkConfig.network 
      });

      const successMsg = t('payment.qr.generated') || 'QR code generated successfully';
      announceToScreenReader(successMsg);

    } catch (error) {
      logger.error('QR code generation failed', { error, meterId, amount });
      const errorMsg = t('payment.qr.error') || 'Failed to generate QR code';
      announceToScreenReader(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPaymentData = async () => {
    try {
      const sanitizedMeterId = sanitizeAlphanumeric(meterId, 50);
      const amountU32 = Math.floor(sanitizeAmount(amount));
      const networkConfig = getNetworkConfig();
      
      const paymentData: QRPaymentData = {
        meterId: sanitizedMeterId,
        amount: amountU32,
        timestamp: new Date().toISOString(),
        network: networkConfig.network,
        version: '1.0'
      };

      const paymentText = `Meter: ${paymentData.meterId}\nAmount: ${paymentData.amount}\nNetwork: ${paymentData.network}`;
      
      await navigator.clipboard.writeText(paymentText);
      setCopied(true);
      
      setTimeout(() => setCopied(false), 2000);
      
      const copyMsg = t('payment.qr.copied') || 'Payment details copied to clipboard';
      announceToScreenReader(copyMsg);
      
      logger.info('Payment data copied to clipboard', { meterId: sanitizedMeterId, amount: amountU32 });
    } catch (error) {
      logger.error('Failed to copy payment data', { error });
      const errorMsg = t('payment.qr.copyError') || 'Failed to copy payment details';
      onError?.(errorMsg);
    }
  };

  const handleReset = () => {
    setMeterId('');
    setAmount('');
    setQrCodeUrl('');
    setShowQR(false);
    setCopied(false);
    
    const resetMsg = t('payment.qr.reset') || 'QR code form reset';
    announceToScreenReader(resetMsg);
    
    document.getElementById(meterInputId.current)?.focus();
  };

  // Handle payment completion (this would be called by the payment page after successful payment)
  useEffect(() => {
    const handlePaymentComplete = (event: CustomEvent) => {
      const { transactionId } = event.detail;
      onPaymentComplete?.(transactionId);
      handleReset();
    };

    window.addEventListener('paymentComplete', handlePaymentComplete as EventListener);
    return () => {
      window.removeEventListener('paymentComplete', handlePaymentComplete as EventListener);
    };
  }, [onPaymentComplete]);

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-6">
        {t('payment.qr.title') || 'QR Code Payment'}
      </h2>
      
      <p className="text-gray-600 text-center mb-6">
        {t('payment.qr.description') || 'Generate a QR code for easy mobile payment without typing meter IDs'}
      </p>

      {!showQR ? (
        <form onSubmit={handleGenerateQR} className="space-y-4">
          <div>
            <label htmlFor={meterInputId.current} className="block text-sm font-medium text-gray-700 mb-1">
              {t('payment.meterId') || 'Meter ID'}
            </label>
            <input
              id={meterInputId.current}
              type="text"
              value={meterId}
              onChange={(e) => setMeterId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('payment.meterIdPlaceholder') || 'Enter meter ID'}
              aria-describedby="meter-help"
            />
            <p id="meter-help" className="mt-1 text-sm text-gray-500">
              {t('payment.meterIdHelp') || 'Letters, numbers, hyphens, and underscores (3-50 chars)'}
            </p>
          </div>

          <div>
            <label htmlFor={amountInputId.current} className="block text-sm font-medium text-gray-700 mb-1">
              {t('payment.amount') || 'Amount'}
            </label>
            <input
              id={amountInputId.current}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('payment.amountPlaceholder') || 'Enter amount'}
              min="1"
              step="0.01"
              aria-describedby="amount-help"
            />
            <p id="amount-help" className="mt-1 text-sm text-gray-500">
              {t('payment.amountHelp') || 'Enter the payment amount'}
            </p>
          </div>

          <button
            id={generateButtonId.current}
            type="submit"
            disabled={isGenerating}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating 
              ? (t('payment.qr.generating') || 'Generating...')
              : (t('payment.qr.generate') || 'Generate QR Code')
            }
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-lg">
              <img 
                src={qrCodeUrl} 
                alt={t('payment.qr.alt') || 'Payment QR Code'}
                className="w-64 h-64 mx-auto"
              />
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-semibold mb-2">{t('payment.qr.details') || 'Payment Details'}</h3>
            <div className="space-y-1 text-sm">
              <p><strong>{t('payment.meterId') || 'Meter ID'}:</strong> {sanitizeAlphanumeric(meterId, 50)}</p>
              <p><strong>{t('payment.amount') || 'Amount'}:</strong> {Math.floor(sanitizeAmount(amount))}</p>
              <p><strong>{t('payment.network') || 'Network'}:</strong> {getNetworkConfig().network}</p>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleCopyPaymentData}
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              {copied 
                ? (t('payment.qr.copied') || 'Copied!')
                : (t('payment.qr.copy') || 'Copy Details')
              }
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('payment.qr.new') || 'New Payment'}
            </button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            {t('payment.qr.instructions') || 'Scan this QR code with your mobile wallet to complete the payment'}
          </div>
        </div>
      )}
    </div>
  );
};
