console.log('[App] App.tsx execution started');
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useRef, useEffect, useCallback, memo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Networks, TransactionBuilder, Operation, Asset, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

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
const AnalyticsDashboard = lazy(() => import('./components/Analytics/Dashboard').then(module => ({ default: module.AnalyticsDashboard })));
const RealTimeMonitoringDashboard = lazy(() => import('./components/RealTimeMonitoringDashboard'));
import { logClientError } from './services/errorLoggingService';
import { TransactionStatus } from './components/TransactionStatus';
import { QRCodePayment } from './components/QRCodePayment';
import { useRealtimeTransactions } from './hooks/useRealtimeTransactions';

// Hooks & Utils
import { isConnected, requestAccess, signTransaction, setWalletType } from "./utils/wallet-bridge";
import { getCurrentNetworkConfig, getNetworkFromEnv } from './utils/network-config';
import { useWalletBalance } from './hooks/useWalletBalance';
import { useFeeEstimation } from './hooks/useFeeEstimation';
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

const Home = memo(() => {
  const { t } = useTranslation();
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [transactionDetails, setTransactionDetails] = useState<TransactionDetails | null>(null);
  const [paymentType, setPaymentType] = useState<'manual' | 'qr'>('manual');
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

  const handlePayment = useCallback(async (e?: React.FormEvent) => {
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
  }, [meterId, amount, t, isSufficientBalance, estimateFee, networkConfig]);

  const isProcessing = status === t('payment.form.processing');

  return (
    <main id="main-content" role="main" aria-labelledby="app-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="rounded-2xl glass-card p-4 sm:p-6 lg:p-8 shadow-xl shadow-black/20">
          <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 id="app-title" className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-brand-text-primary">{t('app.title')}</h1>
              <p className="mt-2 max-w-prose text-sm text-brand-text-secondary">
                {t('app.tagline')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <OfflineStatusIndicator variant="compact" />
              <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset shrink-0 ${networkConfig.networkPassphrase === Networks.PUBLIC
                ? 'bg-brand-warning/10 text-brand-warning ring-brand-warning/20'
                : 'bg-brand-primary/10 text-brand-primary ring-brand-primary/20'
                }`} role="status" aria-live="polite" aria-label={`Current network: ${networkConfig.networkPassphrase === Networks.PUBLIC ? 'Mainnet' : 'Testnet'}`}>
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
              
              {/* Payment Type Tabs */}
              <div className="border-b border-brand-surface-high">
                <nav className="-mb-px flex space-x-8" aria-label="Payment type">
                  <button
                    onClick={() => setPaymentType('manual')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      paymentType === 'manual'
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-surface-high'
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
                        ? 'border-brand-primary text-brand-primary'
                        : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:border-brand-surface-high'
                    }`}
                    aria-selected={paymentType === 'qr'}
                    role="tab"
                  >
                    {t('payment.qr.tab') || 'QR Code Payment'}
                  </button>
                </nav>
              </div>

              {/* Tab Content */}
              {paymentType === 'manual' ? (
                <form onSubmit={handlePayment} className="space-y-6">
              {/* Fee Estimation Display */}
              {feeEstimate && (
                <section className="rounded-xl border border-brand-surface-high bg-brand-surface-low/40 p-4" aria-labelledby="fee-estimation">
                  <h3 id="fee-estimation" className="text-xs font-semibold uppercase tracking-wide text-brand-text-secondary">
                    {t('payment.feeEstimation.title')} {isEstimatingFee && t('payment.feeEstimation.calculating')}
                  </h3>
                  <div className="mt-2 text-sm text-brand-text-primary">
                    {isEstimatingFee ? t('payment.feeEstimation.calculatingFees') : `${t('payment.feeEstimation.estimatedNetworkFee')}: ${feeEstimate.totalFee} XLM`}
                  </div>
                </section>
              )}

              <div className="space-y-4">
                <div className="relative">
                  <label htmlFor={meterInputId.current} className="block text-sm font-medium text-brand-text-secondary mb-1.5 ml-1">
                    {t('payment.form.meterNumber')}
                  </label>
                  <input
                    id={meterInputId.current}
                    type="text"
                    value={meterId}
                    onChange={(e) => setMeterId(e.target.value)}
                    placeholder={t('payment.form.meterPlaceholder')}
                    className="h-12 w-full rounded-xl border border-brand-surface-high bg-brand-bg px-4 text-brand-text-primary placeholder-brand-text-secondary/50 ring-brand-primary/20 transition-all focus:border-brand-primary/50 focus:outline-none focus:ring-4"
                    disabled={isProcessing}
                    autoComplete="off"
                    aria-required="true"
                  />
                </div>

                <div className="relative">
                  <label htmlFor={amountInputId.current} className="block text-sm font-medium text-brand-text-secondary mb-1.5 ml-1">
                    {t('payment.form.amount')} (XLM)
                  </label>
                  <input
                    id={amountInputId.current}
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 w-full rounded-xl border border-brand-surface-high bg-brand-bg px-4 text-brand-text-primary placeholder-brand-text-secondary/50 ring-brand-primary/20 transition-all focus:border-brand-primary/50 focus:outline-none focus:ring-4"
                    disabled={isProcessing}
                    aria-required="true"
                    step="any"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  id={payButtonId.current}
                  type="submit"
                  disabled={isProcessing}
                  className="relative h-14 w-full overflow-hidden rounded-xl bg-brand-primary px-6 font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-brand-primary/20"
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
                  className={`min-h-[1.5rem] px-1 text-center text-sm font-medium ${(status || '').includes('success') ? 'text-brand-success' : 'text-brand-warning'}`}
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

        <footer className="mt-12 text-center text-xs text-brand-text-secondary/60">
          <p className="mb-2">© {new Date().getFullYear()} Wata-Board. {t('app.footer.tagline')}</p>
          <div className="flex justify-center gap-4">
            <a href="/privacy-policy" className="hover:text-brand-primary transition-colors">Privacy Policy</a>
            <a href="/retention-policy" className="hover:text-brand-primary transition-colors">Data Retention Policy</a>
          </div>
        </footer>
      </div>
    </main>
  );
});

export default function App() {
  useEffect(() => {
    setupKeyboardNavigation();
    setupFocusVisible();
    // ...
    SchedulingService.getInstance();
    NotificationService.getInstance();
  }, []);

  return (
    <Router>
      <ErrorBoundary
        FallbackComponent={GlobalErrorFallback}
        onError={(error, errorInfo) => logClientError(error, errorInfo?.componentStack || undefined, { module: 'App' })}
      >
        <div className="app-container min-h-screen bg-brand-bg text-brand-text-primary">
          <SkipLinks />
          <OfflineBanner />
          <ResponsiveNavigation />
          
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <About />
              </Suspense>
            } />
            <Route path="/contact" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <Contact />
              </Suspense>
            } />
            <Route path="/rate" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <Rate />
              </Suspense>
            } />
            <Route path="/schedules" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <ScheduledPayments />
              </Suspense>
            } />
            <Route path="/analytics" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <AnalyticsDashboard />
              </Suspense>
            } />
            <Route path="/monitoring" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <RealTimeMonitoringDashboard />
              </Suspense>
            } />
            <Route path="/privacy-policy" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <PrivacyPolicy />
              </Suspense>
            } />
            <Route path="/retention-policy" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <DataRetentionPolicy />
              </Suspense>
            } />
            <Route path="/payment" element={
              <Suspense fallback={
                <div className="flex items-center justify-center min-h-[200px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              }>
                <QRPaymentHandler />
              </Suspense>
            } />
          </Routes>
          <GDPRConsent />
        </div>
      </ErrorBoundary>

    </Router>
  );
}