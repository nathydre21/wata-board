import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { Server, Networks, TransactionBuilder, Operation, Asset, BASE_FEE } from '@stellar/stellar-sdk';
import * as NepaClient from './contracts';
import { ResponsiveNavigation } from './components/ResponsiveNavigation';
import { SkipLinks } from './components/SkipLinks';
import { OfflineBanner } from './components/OfflineBanner';
import { OfflineStatusIndicator } from './components/OfflineStatusIndicator';
import { OfflineErrorBoundary } from './components/OfflineErrorBoundary';
import { usePaymentWithRateLimit } from './hooks/useRateLimit';
import { useFeeEstimation } from './hooks/useFeeEstimation';
import { useWalletBalance } from './hooks/useWalletBalance';
import { useConnectivity } from './hooks/useConnectivity';
import { useOfflineApi, handleOfflineError, getOfflineErrorMessage } from './utils/offlineApi';
import { getCurrentNetworkConfig } from './utils/network-config';
import { announceToScreenReader, generateId, getAriaLabel, setupKeyboardNavigation, setupFocusVisible } from './utils/accessibility';
import About from './pages/About';
import Contact from './pages/Contact';
import Rate from './pages/Rate';

// Set up accessibility features on app load
useEffect(() => {
  setupKeyboardNavigation();
  setupFocusVisible();
}, []);

function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'text-sky-400' : 'text-slate-300 hover:text-slate-100';
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-50" role="navigation" aria-label="Main navigation">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 rounded" aria-label="Wata-Board home page">
            Wata-Board
          </Link>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm" role="menubar">
              <Link to="/" className={`transition px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isActive('/')}`} aria-current={location.pathname === '/' ? 'page' : undefined} role="menuitem">Pay Bill</Link>
              <Link to="/about" className={`transition px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isActive('/about')}`} aria-current={location.pathname === '/about' ? 'page' : undefined} role="menuitem">About</Link>
              <Link to="/contact" className={`transition px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isActive('/contact')}`} aria-current={location.pathname === '/contact' ? 'page' : undefined} role="menuitem">Contact</Link>
              <Link to="/rate" className={`transition px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isActive('/rate')}`} aria-current={location.pathname === '/rate' ? 'page' : undefined} role="menuitem">Rate Us</Link>
            </div>
            <WalletBalanceCompact className="text-sm" />
            <NetworkSwitcher showLabel={false} />
          </div>
        </div>
      </div>
    </nav>
  );
}

function Home() {
  const [meterId, setMeterId] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');

  const paymentRateLimit = usePaymentWithRateLimit();
  const { estimate: feeEstimate, isLoading: isEstimatingFee, estimateFee } = useFeeEstimation();
  const { balance, refreshBalance, isSufficientBalance, isLowBalance } = useWalletBalance();
  const { connectivity, offlineActions } = useConnectivity();
  const { postPayment } = useOfflineApi();
  const networkConfig = getCurrentNetworkConfig();
  const isMainnet = networkConfig.networkPassphrase === Networks.PUBLIC;

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

  const handlePayment = async () => {
    if (!(await isConnected())) {
      setStatus("Please install Freighter Wallet extension!");
      announceToScreenReader("Error: Please install Freighter Wallet extension");
      return;
    }

    try {
      if (!meterId.trim()) {
        setStatus('Please enter a meter number.');
        announceToScreenReader('Error: Please enter a meter number');
        meterInputId.current && document.getElementById(meterInputId.current)?.focus();
        return;
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setStatus('Please enter a valid amount greater than 0.');
        announceToScreenReader('Error: Please enter a valid amount greater than 0');
        amountInputId.current && document.getElementById(amountInputId.current)?.focus();
        return;
      }

      const amountU32 = Math.floor(parsedAmount);
      if (amountU32 !== parsedAmount) {
        setStatus('Amount must be a whole number.');
        announceToScreenReader('Error: Amount must be a whole number');
        amountInputId.current && document.getElementById(amountInputId.current)?.focus();
        return;
      }

      if (amountU32 > 0xffffffff) {
        setStatus('Amount is too large.');
        announceToScreenReader('Error: Amount is too large');
        amountInputId.current && document.getElementById(amountInputId.current)?.focus();
        return;
      }

      // Check if balance is sufficient
      if (!isSufficientBalance(amountU32)) {
        setStatus('Insufficient balance. Please add more XLM to your wallet.');
        announceToScreenReader('Error: Insufficient balance. Please add more XLM to your wallet.');
        return;
      }

      // Show fee confirmation before proceeding
      if (!feeEstimate) {
        setStatus('Estimating transaction fees... Please wait.');
        announceToScreenReader('Estimating transaction fees. Please wait.');
        await estimateFee(amountU32.toString());
        return;
      }

      // Create and sign transaction
      const publicKey = await requestAccess();
      if (!publicKey) {
        setStatus('Could not get wallet access.');
        announceToScreenReader('Error: Could not get wallet access.');
        return;
      }

      const server = new Server(networkConfig.rpcUrl);
      const account = await server.loadAccount(publicKey);

      // Build payment transaction
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: networkConfig.networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: "CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA", // Contract address
          asset: Asset.native(),
          amount: amountU32.toString(),
        }))
        .setTimeout(30)
        .build();

      // Sign the transaction with Freighter
      const signedTransaction = await signTransaction(transaction.toXDR());

      // Submit the transaction
      const result = await server.submitTransaction(signedTransaction);

      setStatus(`Payment successful! Transaction ID: ${result.hash.slice(0, 10)}...`);
      announceToScreenReader(`Payment successful! Transaction ID: ${result.hash.slice(0, 10)}...`);
      setMeterId('');
      setAmount('');

      // Refresh balance after successful transaction
      setTimeout(() => {
        refreshBalance();
      }, 2000);

    } catch (err: any) {
      console.error(err);

      // Handle offline errors specifically
      const errorInfo = handleOfflineError(err);
      if (errorInfo.isOffline) {
        setStatus(getOfflineErrorMessage(err, 'payment'));
        announceToScreenReader(getOfflineErrorMessage(err, 'payment'));
      } else {
        const errorMessage = `Payment failed: ${err?.message || 'Check console.'}`;
        setStatus(errorMessage);
        announceToScreenReader(`Payment failed: ${err?.message || 'Check console.'}`);
      }
    }
  };

  const formatTimeUntilReset = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const getPaymentButtonState = () => {
    if (paymentRateLimit.isProcessing) return { disabled: true, text: 'Processing...', className: 'bg-gray-500' };
    if (!paymentRateLimit.canMakeRequest) return { disabled: true, text: 'Rate Limited', className: 'bg-gray-500' };
    return { disabled: false, text: 'Pay bill', className: 'bg-sky-500 hover:bg-sky-400' };
  };

  const buttonState = getPaymentButtonState();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <SkipLinks />
      <OfflineBanner />

      {/* Offline Status Indicator in Header */}
      <div className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-sm border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex justify-end">
            <OfflineStatusIndicator variant="compact" showText={false} />
          </div>
        </div>
      </div>

      <ResponsiveNavigation />

      <main id="main-content" role="main" aria-label="Payment form">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:p-6 lg:p-8 shadow-xl shadow-black/20">
            <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight">Wata-Board</h1>
                <p className="mt-2 max-w-prose text-sm text-slate-300">
                  Decentralized utility payments on Stellar blockchain
                </p>
              </div>
              <div className="flex items-center gap-3">
                <OfflineStatusIndicator variant="compact" />
                <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset shrink-0 ${isMainnet
                  ? 'bg-orange-500/10 text-orange-300 ring-orange-500/20'
                  : 'bg-sky-500/10 text-sky-300 ring-sky-500/20'
                  }`} role="status" aria-live="polite">
                  {isMainnet ? 'MAINNET' : 'TESTNET'}
                </div>
              </div>
            </header>

            {/* Offline Actions Queue Status */}
            {offlineActions.length > 0 && (
              <section className="mt-6 rounded-xl border border-sky-800 bg-sky-950/40 p-4" aria-labelledby="offline-queue">
                <h2 id="offline-queue" className="text-xs font-semibold uppercase tracking-wide text-sky-400">
                  Offline Queue
                </h2>
                <div className="mt-2 text-sm text-sky-100">
                  {offlineActions.length} action{offlineActions.length === 1 ? '' : 's'} will be processed when you're back online
                </div>
              </section>
            )}

            {/* Wallet Balance Display */}
            <WalletBalance className="mt-6" />

            {/* Rate Limit Status */}
            <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-labelledby="rate-limit-status">
              <h2 id="rate-limit-status" className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rate Limit Status</h2>
              <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-sm text-slate-100">
                  {paymentRateLimit.canMakeRequest
                    ? `${paymentRateLimit.status?.remainingRequests || 5}/5 requests available`
                    : `Rate limited. Reset in ${formatTimeUntilReset(paymentRateLimit.timeUntilReset)}`
                  }
                </div>
                {paymentRateLimit.queueLength > 0 && (
                  <div className="text-xs text-amber-300" aria-live="polite">
                    Queue: {paymentRateLimit.queueLength}
                  </div>
                )}
              </div>
            </section>

            {/* Fee Estimation Display */}
            {feeEstimate && (
              <section className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-labelledby="fee-estimation">
                <h2 id="fee-estimation" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Transaction Fee Estimation {isEstimatingFee && '(Calculating...)'}
                </h2>
                <div className="mt-2 space-y-2">
                  {isEstimatingFee ? (
                    <div className="text-sm text-slate-300">Calculating estimated fees...</div>
                  ) : feeEstimate ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Payment Amount:</span>
                        <span className="text-slate-100 font-medium">{amount} XLM</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">Estimated Network Fee:</span>
                        <span className="text-slate-100 font-medium">{feeEstimate.totalFee.toFixed(7)} XLM</span>
                      </div>
                      <div className="h-px bg-slate-700 my-2" role="separator" aria-hidden="true"></div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-slate-200">Total Cost:</span>
                        <span className="text-sky-400">
                          {(Number(amount) + feeEstimate.totalFee).toFixed(7)} XLM
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-amber-300">Unable to estimate fees at this time</div>
                  )}
                </div>
              </section>
            )}

            <form id="payment-form" className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); handlePayment(); }} noValidate>
              <fieldset>
                <legend className="sr-only">Payment Information</legend>

                <label className="grid gap-2">
                  <span htmlFor={meterInputId.current} className="text-sm font-medium text-slate-200">Meter number</span>
                  <input
                    id={meterInputId.current}
                    className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-500 focus:ring-4 focus:ring-sky-500/20 transition-all"
                    placeholder="e.g. METER-123"
                    value={meterId}
                    onChange={(e: any) => setMeterId(e.target.value)}
                    disabled={paymentRateLimit.isProcessing}
                    aria-label={getAriaLabel('meter-input')}
                    aria-describedby="meter-description"
                    autoComplete="off"
                    required
                  />
                  <div id="meter-description" className="sr-only">
                    Enter your utility meter number as shown on your bill
                  </div>
                </label>

                <label className="grid gap-2">
                  <span htmlFor={amountInputId.current} className="text-sm font-medium text-slate-200">Amount</span>
                  <input
                    id={amountInputId.current}
                    className="h-12 w-full rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-500 focus:ring-4 focus:ring-sky-500/20 transition-all"
                    placeholder="Whole number"
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e: any) => setAmount(e.target.value)}
                    disabled={paymentRateLimit.isProcessing}
                    aria-label={getAriaLabel('amount-input')}
                    aria-describedby="amount-description"
                    inputMode="numeric"
                    required
                  />
                  <div id="amount-description" className="sr-only">
                    Enter the payment amount in whole XLM
                  </div>
                </label>
              </fieldset>

              <div className="mt-6 flex flex-col gap-4">
                <button
                  id={payButtonId.current}
                  type="submit"
                  disabled={buttonState.disabled}
                  className={`w-full h-12 inline-flex items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 ring-1 ring-inset ring-white/10 transition focus:outline-none focus:ring-4 focus:ring-sky-500/30 ${buttonState.className}`}
                  aria-label={getAriaLabel('pay-button')}
                >
                  {buttonState.text}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  Requires Freighter extension. 5 transactions per minute limit.
                </p>
              </div>
            </form>

            <section className="mt-8 rounded-xl border border-slate-800 bg-slate-950/40 p-4" aria-labelledby={statusId.current} aria-live="polite" aria-atomic="true">
              <h2 id={statusId.current} className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</h2>
              <div className="mt-2 text-sm text-slate-100">
                {status || 'Ready.'}
                {paymentRateLimit.paymentError && (
                  <div className="mt-2 text-amber-300">
                    {paymentRateLimit.paymentError}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <OfflineErrorBoundary>
      <Router>
        <ResponsiveNavigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/rate" element={<Rate />} />
        </Routes>
      </Router>
    </OfflineErrorBoundary>
  );
}

export default App;