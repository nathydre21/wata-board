import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Networks, TransactionBuilder, Operation, Asset, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

// Internal components
import { ResponsiveNavigation } from './components/ResponsiveNavigation';
import { SkipLinks } from './components/SkipLinks';
import { OfflineBanner } from './components/OfflineBanner';
import { OfflineStatusIndicator } from './components/OfflineStatusIndicator';
import { WalletBalance } from './components/WalletBalance';
import { TransactionSuccess } from './components/TransactionSuccess';
import type { TransactionDetails } from './components/TransactionSuccess';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalErrorFallback } from './components/GlobalErrorFallback';
import { AnalyticsDashboard } from './components/Analytics/Dashboard';
import { logClientError } from './services/errorLoggingService';
import { TransactionStatus } from './components/TransactionStatus';
import { useRealtimeTransactions } from './hooks/useRealtimeTransactions';

// Hooks & Utils
import { isConnected, requestAccess, signTransaction } from "./utils/wallet-bridge";
import { getCurrentNetworkConfig, getNetworkFromEnv } from './utils/network-config';
import { useWalletBalance } from './hooks/useWalletBalance';
import { useFeeEstimation } from './hooks/useFeeEstimation';
import { handleOfflineError, getOfflineErrorMessage } from './utils/offlineApi';
import { announceToScreenReader, generateId, setupKeyboardNavigation, setupFocusVisible } from './utils/accessibility';
import { sanitizeAlphanumeric, sanitizeAmount, isValidMeterId, isValidAmount } from './utils/sanitize';
import { logger } from './utils/logger';

// Services
import { SchedulingService } from './services/schedulingService';
import { NotificationService } from './services/notificationService';

// Pages
import About from './pages/About';
import Contact from './pages/Contact';
import Rate from './pages/Rate';
import ScheduledPayments from './pages/ScheduledPayments';

function Home() {
  const { t } = useTranslation();
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const { connectionState, transactionState, lastUpdated, error: transactionUpdateError } = useRealtimeTransactions(transactionDetails?.hash);

  const networkConfig = getCurrentNetworkConfig();
  const { isSufficientBalance, refreshBalance } = useWalletBalance();
  const { estimate: feeEstimate, estimateFee, isLoading: isEstimatingFee } = useFeeEstimation();

  // Generate unique IDs for accessibility
  const meterInputId = useRef(generateId('meter-input'));
  const amountInputId = useRef(generateId('amount-input'));
  const payButtonId = useRef(generateId('pay-button'));
  const statusId = useRef(generateId('status-message'));

  // Update fee estimation when amount changes
  useEffect(() => {
    if (amount && Number(amount) > 0) {
      estimateFee(amount);
    }
  }, [amount, estimateFee]);

  const handlePayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    try {
      logger.info('Payment process initiated', { meterId: sanitizeAlphanumeric(meterId, 50), amount });
      const result = await isConnected();
      logger.debug('Wallet connection status checked', { result });
      if (!result.isConnected) {
        setStatus(t('payment.status.installWallet'));
        announceToScreenReader(t('payment.status.installWallet'));
        return;
      }

      if (!meterId.trim()) {
        setStatus(t('payment.status.enterMeter'));
        announceToScreenReader(t('payment.status.enterMeter'));
        document.getElementById(meterInputId.current)?.focus();
        return;
      }

      if (!isValidMeterId(meterId)) {
        setStatus(t('payment.status.invalidMeter') || 'Meter ID may only contain letters, numbers, hyphens, and underscores (3–50 chars).');
        announceToScreenReader(t('payment.status.invalidMeter') || 'Invalid meter ID format.');
        document.getElementById(meterInputId.current)?.focus();
        return;
      }

      // Sanitize once and use the clean value everywhere
      const sanitizedMeterId = sanitizeAlphanumeric(meterId, 50);

      const parsedAmount = sanitizeAmount(amount);
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setStatus(t('payment.status.enterValidAmount'));
        announceToScreenReader(t('payment.status.enterValidAmount'));
        document.getElementById(amountInputId.current)?.focus();
        return;
      }

      // Floor to integer for the contract — must still be > 0 after flooring
      const amountU32 = Math.floor(parsedAmount);
      if (amountU32 <= 0) {
        setStatus(t('payment.status.enterValidAmount'));
        announceToScreenReader(t('payment.status.enterValidAmount'));
        document.getElementById(amountInputId.current)?.focus();
        return;
      }

      if (!isSufficientBalance(amountU32)) {
        setStatus(t('payment.status.insufficientBalance'));
        announceToScreenReader(t('payment.status.insufficientBalance'));
        return;
      }

      // Create and sign transaction
      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        throw new Error(accessResult.error || 'Wallet access denied');
      }
      const pubKeyString = accessResult.address;

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
        transaction = (window as any).__MOCK_STELLAR_TRANSACTION__(account, amountU32);
      } else {
        transaction = new TransactionBuilder(account, {
          fee: BASE_FEE,
          networkPassphrase: networkConfig.networkPassphrase,
        })
          .addOperation(Operation.payment({
            destination: "GDOPTS553GBKXNF3X4YCQ7NPZUQ644QAN4SV7JEZHAVOVROAUQTSKEHO",
            asset: Asset.native(),
            amount: amountU32.toString(),
          }))
          .setTimeout(30)
          .build();
      }

      const signedResponse = await signTransaction(transaction.toXDR());
      const signedXdr = typeof signedResponse === 'string' ? signedResponse : (signedResponse as any).signedTxXdr;

      const submitResult = await server.submitTransaction(signedXdr);

      setStatus(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }));
      announceToScreenReader(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }));
      
      setTransactionDetails({
        hash: submitResult.hash,
        meterId: sanitizedMeterId,
        amount: amountU32,
        timestamp: new Date(),
        network: getNetworkFromEnv(),
        explorerUrl: networkConfig.explorerUrl
      });
      
      logger.audit('Payment transaction successful', { 
        hash: submitResult.hash, 
        meterId: sanitizedMeterId, 
        amount: amountU32 
      });

      setMeterId('');
      setAmount('');
      setTimeout(() => refreshBalance(), 2000);

    } catch (err: any) {
      logger.error('Payment processing failed', err, { meterId, amount });
      const errorInfo = handleOfflineError(err);
      if (errorInfo.isOffline) {
        setStatus(getOfflineErrorMessage(err, 'payment'));
        announceToScreenReader(getOfflineErrorMessage(err, 'payment'));
      } else {
        const errorMessage = t('payment.status.paymentFailed', { error: err?.message || 'Transaction failed' });
        setStatus(errorMessage);
        announceToScreenReader(errorMessage);
      }
    }
  };

  const isProcessing = status === t('payment.form.processing');

  return (
    <main id="main-content" role="main" aria-label="Payment form">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6 lg:p-8 shadow-xl shadow-black/20">
          <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">{t('app.title')}</h1>
              <p className="mt-2 max-w-prose text-sm text-slate-300">
                {t('app.tagline')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <OfflineStatusIndicator variant="compact" />
              <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset shrink-0 ${networkConfig.networkPassphrase === Networks.PUBLIC
                ? 'bg-orange-500/10 text-orange-300 ring-orange-500/20'
                : 'bg-sky-500/10 text-sky-300 ring-sky-500/20'
                }`} role="status" aria-live="polite">
                {networkConfig.networkPassphrase === Networks.PUBLIC ? t('network.mainnet') : t('network.testnet')}
              </div>
            </div>
          </header>

          <WalletBalance className="mt-6" />

          {transactionDetails ? (
            <>
              <TransactionStatus
                transactionId={transactionDetails.hash}
                connectionState={connectionState}
                transactionState={transactionState}
                lastUpdated={lastUpdated}
                error={transactionUpdateError}
              />
              <TransactionSuccess 
                details={transactionDetails} 
                onReset={() => {
                  setTransactionDetails(null);
                  setStatus('');
                }} 
              />
            </>
          ) : (
            <form onSubmit={handlePayment} className="mt-8 space-y-6">
              {/* Fee Estimation Display */}
              {feeEstimate && (
                <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-labelledby="fee-estimation">
                  <h2 id="fee-estimation" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t('payment.feeEstimation.title')} {isEstimatingFee && t('payment.feeEstimation.calculating')}
                  </h2>
                  <div className="mt-2 text-sm text-slate-100">
                    {isEstimatingFee ? t('payment.feeEstimation.calculatingFees') : `${t('payment.feeEstimation.estimatedNetworkFee')}: ${feeEstimate.totalFee} XLM`}
                  </div>
                </section>
              )}

              <div className="space-y-4">
                <div className="relative">
                  <label htmlFor={meterInputId.current} className="block text-sm font-medium text-slate-400 mb-1.5 ml-1">
                    {t('payment.form.meterNumber')}
                  </label>
                  <input
                    id={meterInputId.current}
                    type="text"
                    value={meterId}
                    onChange={(e) => setMeterId(e.target.value)}
                    placeholder={t('payment.form.meterPlaceholder')}
                    className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-slate-100 placeholder-slate-600 ring-sky-500/20 transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4"
                    disabled={isProcessing}
                    autoComplete="off"
                  />
                </div>

                <div className="relative">
                  <label htmlFor={amountInputId.current} className="block text-sm font-medium text-slate-400 mb-1.5 ml-1">
                    {t('payment.form.amount')} (XLM)
                  </label>
                  <input
                    id={amountInputId.current}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-slate-100 placeholder-slate-600 ring-sky-500/20 transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4"
                    disabled={isProcessing}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  id={payButtonId.current}
                  type="submit"
                  disabled={isProcessing}
                  className="relative h-14 w-full overflow-hidden rounded-xl bg-sky-500 px-6 font-semibold text-white transition-all hover:bg-sky-400 active:scale-[0.98] disabled:opacity-50"
                  aria-busy={isProcessing}
                >
                  <div className="flex items-center justify-center gap-2">
                    {isProcessing && (
                      <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    <span>{isProcessing ? t('payment.form.processing') : t('payment.form.payButton')}</span>
                  </div>
                </button>

                <div 
                  id={statusId.current}
                  role="status" 
                  aria-live="polite"
                  className={`min-h-[1.5rem] px-1 text-center text-sm font-medium ${status.includes('success') ? 'text-green-400' : 'text-amber-400'}`}
                >
                  {status}
                </div>
              </div>
            </form>
          )}
        </div>

        <footer className="mt-12 text-center text-xs text-slate-500">
          <p>© {new Date().getFullYear()} Wata-Board. {t('app.footer.tagline')}</p>
        </footer>
      </div>
    </main>
  );
}

export default function App() {
  useEffect(() => {
    setupKeyboardNavigation();
    setupFocusVisible();
    
    const schedulingService = SchedulingService.getInstance();
    NotificationService.getInstance();
    
    const processInterval = setInterval(() => {
      schedulingService.processScheduledPayments();
    }, 60000);

    return () => clearInterval(processInterval);
  }, []);

  return (
    <Router>
      <ErrorBoundary
        FallbackComponent={GlobalErrorFallback}
        onError={(error, errorInfo) => logClientError(error, errorInfo.componentStack, { module: 'App' })}
      >
        <div className="app-container min-h-screen bg-slate-950">
          <SkipLinks />
          <OfflineBanner />
          <ResponsiveNavigation />
          
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/rate" element={<Rate />} />
            <Route path="/schedules" element={<ScheduledPayments />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
          </Routes>
        </div>
      </ErrorBoundary>
    </Router>
  );
}