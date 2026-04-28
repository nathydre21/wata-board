import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { useState, useEffect, useRef, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Networks, TransactionBuilder, Operation, Asset, BASE_FEE, Horizon, Memo } from '@stellar/stellar-sdk';

// Internal components
import { ResponsiveNavigation } from './components/ResponsiveNavigation';
import { SkipLinks } from './components/SkipLinks';
import { OfflineBanner } from './components/OfflineBanner';
import { OfflineStatusIndicator } from './components/OfflineStatusIndicator';
import { GDPRConsent } from './components/GDPRConsent';
import { WalletBalance } from './components/WalletBalance';
import { WalletSelector } from './components/WalletSelector';
import { TransactionSuccess } from './components/TransactionSuccess';
import type { TransactionDetails } from './components/TransactionSuccess';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalErrorFallback } from './components/GlobalErrorFallback';
import { logClientError } from './services/errorLoggingService';
import { TransactionStatus } from './components/TransactionStatus';
import { QRCodePayment } from './components/QRCodePayment';
import { useRealtimeTransactions } from './hooks/useRealtimeTransactions';
import { ProviderSelector } from './components/ProviderSelector';
import type { UtilityProvider } from './types/provider';

// Hooks & Utils
import { isConnected, requestAccess, signTransaction, setWalletType } from "./utils/wallet-bridge";
import { getCurrentNetworkConfig, getNetworkFromEnv } from './utils/network-config';
import { useWalletBalance } from './hooks/useWalletBalance';
import { useFeeEstimation } from './hooks/useFeeEstimation';
import { useOfflineSync } from './hooks/useOfflineSync';
import { handleOfflineError, getOfflineErrorMessage } from './utils/offlineApi';
import { announceToScreenReader, generateId, setupKeyboardNavigation, setupFocusVisible } from './utils/accessibility';
import { sanitizeAlphanumeric, sanitizeAmount, isValidMeterId } from './utils/sanitize';
import { logger } from './utils/logger';

// Services
import { SchedulingService } from './services/schedulingService';
import { NotificationService } from './services/notificationService';

// Pages - Lazy loaded for performance
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Rate = lazy(() => import('./pages/Rate'));
const ScheduledPayments = lazy(() => import('./pages/ScheduledPayments'));
const QRPaymentHandler = lazy(() => import('./pages/QRPaymentHandler').then(module => ({ default: module.QRPaymentHandler })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const DataRetentionPolicy = lazy(() => import('./pages/DataRetentionPolicy'));
const AnalyticsDashboard = lazy(() => import('./components/Analytics/Dashboard').then(module => ({ default: module.AnalyticsDashboard })));
const RealTimeMonitoringDashboard = lazy(() => import('./components/RealTimeMonitoringDashboard'));

const Home = memo(() => {
  const { t } = useTranslation();
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [memoText, setMemoText] = useState('');
  const [status, setStatus] = useState('');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [paymentType, setPaymentType] = useState<'manual' | 'qr'>('manual');
  const [selectedProvider, setSelectedProvider] = useState<UtilityProvider | null>(null);
  const { connectionState, transactionState, lastUpdated, error: transactionUpdateError } = useRealtimeTransactions(transactionDetails?.hash);

  const networkConfig = getCurrentNetworkConfig();
  const { isSufficientBalance, refreshBalance } = useWalletBalance();
  const { estimate: feeEstimate, estimateFee, isLoading: isEstimatingFee } = useFeeEstimation();

  // Generate unique IDs for accessibility
  const meterInputId = useRef(generateId('meter-input'));
  const amountInputId = useRef(generateId('amount-input'));
  const memoInputId = useRef(generateId('memo-input'));
  const payButtonId = useRef(generateId('pay-button'));
  const statusId = useRef(generateId('status-message'));

  // Update fee estimation when amount changes
  useEffect(() => {
    if (amount && Number(amount) > 0) {
      estimateFee(amount);
    }
  }, [amount, estimateFee]);

  const handlePayment = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    try {
      logger.info('Payment process initiated', { meterId: sanitizeAlphanumeric(meterId, 50), amount });
      const result = await isConnected();
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
        setStatus(t('payment.status.invalidMeter') || 'Invalid meter ID format.');
        announceToScreenReader(t('payment.status.invalidMeter') || 'Invalid meter ID format.');
        document.getElementById(meterInputId.current)?.focus();
        return;
      }

      const sanitizedMeterId = sanitizeAlphanumeric(meterId, 50);
      const parsedAmount = sanitizeAmount(amount);
      
      if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        setStatus(t('payment.status.enterValidAmount'));
        announceToScreenReader(t('payment.status.enterValidAmount'));
        document.getElementById(amountInputId.current)?.focus();
        return;
      }

      const amountU32 = Math.floor(parsedAmount);

      if (!isSufficientBalance(amountU32)) {
        setStatus(t('payment.status.insufficientBalance'));
        announceToScreenReader(t('payment.status.insufficientBalance'));
        return;
      }

      const accessResult = await requestAccess();
      if (accessResult.error || !accessResult.address) {
        throw new Error(accessResult.error || `We couldn't access your wallet.`);
      }
      const pubKeyString = accessResult.address;

      const horizonUrl = networkConfig.rpcUrl.replace('soroban', 'horizon');
      const server = new Horizon.Server(horizonUrl);
      
      const account = await server.loadAccount(pubKeyString);
      const transactionBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: "GDOPTS553GBKXNF3X4YCQ7NPZUQ644QAN4SV7JEZHAVOVROAUQTSKEHO",
          asset: Asset.native(),
          amount: amountU32.toString(),
        }))
        .setTimeout(30);

      if (memoText.trim()) {
        transactionBuilder.addMemo(Memo.text(memoText.trim()));
      }

      const transaction = transactionBuilder.build();

      const signedResponse = await signTransaction(transaction.toXDR());
      const signedXdr = typeof signedResponse === 'string' ? signedResponse : (signedResponse as any).signedTxXdr;

      const submitWithRetry = async () => {
        let lastError: unknown;
        const maxAttempts = 4;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          try {
            const result = await server.submitTransaction(signedXdr);
            return result;
          } catch (submissionError) {
            lastError = submissionError;
            const message = submissionError instanceof Error ? submissionError.message.toLowerCase() : String(submissionError).toLowerCase();
            const retryable =
              message.includes('timeout') ||
              message.includes('network') ||
              message.includes('rate') ||
              message.includes('congestion') ||
              message.includes('tx_insufficient_fee') ||
              message.includes('503');

            if (!retryable || attempt === maxAttempts - 1) {
              break;
            }

            const delayMs = Math.min(1000 * (2 ** attempt), 8000);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }

        throw lastError instanceof Error ? lastError : new Error('Transaction submission failed');
      };

      const submitResult = await submitWithRetry();

      setStatus(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }));
      announceToScreenReader(t('payment.status.paymentSuccess', { id: (submitResult as any).hash.slice(0, 10) }));
      
      setTransactionDetails({
        hash: submitResult.hash,
        meterId: sanitizedMeterId,
        amount: amountU32,
        memo: memoText.trim() || undefined,
        timestamp: new Date(),
        network: getNetworkFromEnv(),
        explorerUrl: networkConfig.explorerUrl
      });
      
      setMeterId('');
      setAmount('');
      setMemoText('');
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
  }, [meterId, amount, t, isSufficientBalance, estimateFee, networkConfig]);

  const isProcessing = status === t('payment.form.processing');

  return (
    <main id="main-content" role="main" aria-labelledby="app-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 p-4 sm:p-6 lg:p-8 shadow-xl shadow-black/10 dark:shadow-black/20">
          <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 id="app-title" className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{t('app.title')}</h1>
              <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-300">
                {t('app.tagline')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <OfflineStatusIndicator variant="compact" />
              <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset shrink-0 ${networkConfig.networkPassphrase === Networks.PUBLIC
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-300 ring-orange-500/20'
                : 'bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-sky-500/20'
                }`} role="status" aria-live="polite">
                {networkConfig.networkPassphrase === Networks.PUBLIC ? t('network.mainnet') : t('network.testnet')}
              </div>
            </div>
          </header>

          <div className="mt-6 space-y-4">
            <WalletSelector
              onWalletConnected={(_, walletType) => {
                setWalletType(walletType);
                setStatus(t('payment.status.walletConnected'));
              }}
              onWalletError={(error) => {
                setStatus(t('payment.status.walletError', { error }));
              }}
              showLabel={true}
            />
            <WalletBalance className="mt-2" />
          </div>

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
            <div className="mt-8 space-y-6" aria-labelledby="payment-form-title">
              <h2 id="payment-form-title" className="sr-only">Payment Options</h2>
              
              <div className="border-b border-slate-200 dark:border-slate-800">
                <nav className="-mb-px flex space-x-8" aria-label="Payment type">
                  <button
                    onClick={() => setPaymentType('manual')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      paymentType === 'manual'
                        ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                    aria-selected={paymentType === 'manual'}
                    role="tab"
                  >
                    {t('payment.manual.tab') || 'Manual Payment'}
                  </button>
                  <button
                    onClick={() => setPaymentType('qr')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      paymentType === 'qr'
                        ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                    aria-selected={paymentType === 'qr'}
                    role="tab"
                  >
                    {t('payment.qr.tab') || 'QR Code Payment'}
                  </button>
                </nav>
              </div>

              {paymentType === 'manual' ? (
                <form onSubmit={handlePayment} className="space-y-6">
                  {feeEstimate && (
                    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4" aria-labelledby="fee-estimation">
                      <h3 id="fee-estimation" className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t('payment.feeEstimation.title')} {isEstimatingFee && t('payment.feeEstimation.calculating')}
                      </h3>
                      <div className="mt-2 text-sm text-slate-800 dark:text-slate-100">
                        {isEstimatingFee ? t('payment.feeEstimation.calculatingFees') : `${t('payment.feeEstimation.estimatedNetworkFee')}: ${feeEstimate.totalFee} XLM`}
                      </div>
                    </section>
                  )}

                  <div className="space-y-4">
                    <ProviderSelector
                      selectedProviderId={selectedProvider?.id}
                      onProviderSelect={setSelectedProvider}
                      disabled={isProcessing}
                      className="w-full"
                    />
                    <div className="relative">
                      <label htmlFor={meterInputId.current} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                        {t('payment.form.meterNumber')}
                      </label>
                      <input
                        id={meterInputId.current}
                        type="text"
                        value={meterId}
                        onChange={(e) => setMeterId(e.target.value)}
                        placeholder={t('payment.form.meterPlaceholder')}
                        className="h-12 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 text-slate-900 dark:text-slate-100 placeholder-slate-400 ring-sky-500/20 transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4"
                        disabled={isProcessing}
                        autoComplete="off"
                        aria-required="true"
                      />
                    </div>

                    <div className="relative">
                      <label htmlFor={amountInputId.current} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                        {t('payment.form.amount')} (XLM)
                      </label>
                      <input
                        id={amountInputId.current}
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="h-12 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 text-slate-900 dark:text-slate-100 placeholder-slate-400 ring-sky-500/20 transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4"
                        disabled={isProcessing}
                        aria-required="true"
                        step="any"
                      />
                    </div>

                    <div className="relative">
                      <label htmlFor={memoInputId.current} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-1">
                        {t('payment.form.memo') || 'Memo (Optional)'}
                      </label>
                      <input
                        id={memoInputId.current}
                        type="text"
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder={t('payment.form.memoPlaceholder') || 'What is this for?'}
                        className="h-12 w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 px-4 text-slate-900 dark:text-slate-100 placeholder-slate-400 ring-sky-500/20 transition-all focus:border-sky-500/50 focus:outline-none focus:ring-4"
                        disabled={isProcessing}
                        maxLength={28}
                      />
                      <p className="mt-1 text-[10px] text-slate-500 ml-1">Max 28 characters for text memos</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <button
                      id={payButtonId.current}
                      type="submit"
                      disabled={isProcessing}
                      className="relative h-14 w-full overflow-hidden rounded-xl bg-sky-600 px-6 font-semibold text-white transition-all hover:bg-sky-500 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-sky-500/20"
                      aria-busy={isProcessing}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {isProcessing && (
                          <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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
                      className={`min-h-[1.5rem] px-1 text-center text-sm font-medium ${status.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}
                    >
                      {status || ''}
                    </div>
                  </div>
                </form>
              ) : (
                <QRCodePayment 
                  onPaymentComplete={(transactionId) => {
                    setStatus(t('payment.status.paymentSuccess', { id: transactionId.slice(0, 10) }));
                    announceToScreenReader(t('payment.status.paymentSuccess', { id: transactionId.slice(0, 10) }));
                    setPaymentType('manual');
                  }}
                  onError={(error) => {
                    setStatus(error);
                    announceToScreenReader(error);
                  }}
                />
              )}
            </div>
          )}
        </div>

        <footer className="mt-12 text-center text-xs text-slate-400 dark:text-slate-500">
          <p className="mb-2">© {new Date().getFullYear()} Wata-Board. {t('app.footer.tagline')}</p>
          <div className="flex justify-center gap-4">
            <a href="/privacy-policy" className="hover:text-sky-500 transition-colors">Privacy Policy</a>
            <a href="/retention-policy" className="hover:text-sky-500 transition-colors">Data Retention Policy</a>
          </div>
        </footer>
      </div>
    </main>
  );
});

export default function App() {
  useOfflineSync();

  useEffect(() => {
    setupKeyboardNavigation();
    setupFocusVisible();
    SchedulingService.getInstance();
    NotificationService.getInstance();
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <ErrorBoundary
          FallbackComponent={GlobalErrorFallback}
          onError={(error, errorInfo) => logClientError(error, errorInfo?.componentStack || '', { module: 'App' })}
        >
          <div className="app-container min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
            <SkipLinks />
            <OfflineBanner />
            <ResponsiveNavigation />
            
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<Suspense fallback={<div>Loading...</div>}><About /></Suspense>} />
              <Route path="/contact" element={<Suspense fallback={<div>Loading...</div>}><Contact /></Suspense>} />
              <Route path="/rate" element={<Suspense fallback={<div>Loading...</div>}><Rate /></Suspense>} />
              <Route path="/schedules" element={<Suspense fallback={<div>Loading...</div>}><ScheduledPayments /></Suspense>} />
              <Route path="/analytics" element={<Suspense fallback={<div>Loading...</div>}><AnalyticsDashboard /></Suspense>} />
              <Route path="/monitoring" element={<Suspense fallback={<div>Loading...</div>}><RealTimeMonitoringDashboard /></Suspense>} />
              <Route path="/privacy-policy" element={<Suspense fallback={<div>Loading...</div>}><PrivacyPolicy /></Suspense>} />
              <Route path="/retention-policy" element={<Suspense fallback={<div>Loading...</div>}><DataRetentionPolicy /></Suspense>} />
              <Route path="/payment" element={<Suspense fallback={<div>Loading...</div>}><QRPaymentHandler /></Suspense>} />
            </Routes>
            <GDPRConsent />
          </div>
        </ErrorBoundary>
      </Router>
    </ThemeProvider>
  );
}