import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { Server, Networks, TransactionBuilder, Operation, Asset, BASE_FEE } from '@stellar/stellar-sdk';
import * as NepaClient from './contracts';
import { NetworkSwitcher } from './components/NetworkSwitcher';
import { usePaymentWithRateLimit } from './hooks/useRateLimit';
import { useFeeEstimation } from './hooks/useFeeEstimation';
import { getCurrentNetworkConfig } from './utils/network-config';
import About from './pages/About';
import Contact from './pages/Contact';
import Rate from './pages/Rate';

function Navigation() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path ? 'text-sky-400' : 'text-slate-300 hover:text-slate-100';
  };

  return (
    <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight text-slate-100">
            Wata-Board
          </Link>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-sm">
              <Link to="/" className={`transition ${isActive('/')}`}>Pay Bill</Link>
              <Link to="/about" className={`transition ${isActive('/about')}`}>About</Link>
              <Link to="/contact" className={`transition ${isActive('/contact')}`}>Contact</Link>
              <Link to="/rate" className={`transition ${isActive('/rate')}`}>Rate Us</Link>
            </div>
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
  const networkConfig = getCurrentNetworkConfig();
  const isMainnet = networkConfig.networkPassphrase === Networks.PUBLIC;

  // Update fee estimation when amount changes
  useEffect(() => {
    if (amount && Number(amount) > 0) {
      estimateFee(amount);
    }
  }, [amount, estimateFee]);

  const handlePayment = async () => {
    if (!(await isConnected())) {
      setStatus("Please install Freighter Wallet extension!");
      return;
    }

    try {
      if (!meterId.trim()) {
        setStatus('Please enter a meter number.');
        return;
      }

      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setStatus('Please enter a valid amount greater than 0.');
        return;
      }

      const amountU32 = Math.floor(parsedAmount);
      if (amountU32 !== parsedAmount) {
        setStatus('Amount must be a whole number.');
        return;
      }

      if (amountU32 > 0xffffffff) {
        setStatus('Amount is too large.');
        return;
      }

      // Show fee confirmation before proceeding
      if (!feeEstimate) {
        setStatus('Estimating transaction fees... Please wait.');
        await estimateFee(amountU32.toString());
        return;
      }

      // Create and sign the transaction
      const publicKey = await requestAccess();
      if (!publicKey) {
        setStatus('Could not get wallet access.');
        return;
      }

      const server = new Server(networkConfig.rpcUrl);
      const account = await server.loadAccount(publicKey);

      // Build the payment transaction
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
      setMeterId('');
      setAmount('');

    } catch (err: any) {
      console.error(err);
      setStatus(`Payment failed: ${err?.message || 'Check console.'}`);
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
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-xl shadow-black/20 sm:p-10">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Wata-Board</h1>
              <p className="mt-2 max-w-prose text-sm text-slate-300">

              </p>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
              isMainnet 
                ? 'bg-orange-500/10 text-orange-300 ring-orange-500/20' 
                : 'bg-sky-500/10 text-sky-300 ring-sky-500/20'
            }`}>
              {isMainnet ? 'MAINNET' : 'TESTNET'}
            </div>
          </div>

          {/* Rate Limit Status */}
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rate Limit Status</div>
            <div className="mt-2 flex items-center justify-between">
              <div className="text-sm text-slate-100">
                {paymentRateLimit.canMakeRequest 
                  ? `${paymentRateLimit.status?.remainingRequests || 5}/5 requests available`
                  : `Rate limited. Reset in ${formatTimeUntilReset(paymentRateLimit.timeUntilReset)}`
                }
              </div>
              {paymentRateLimit.queueLength > 0 && (
                <div className="text-xs text-amber-300">
                  Queue: {paymentRateLimit.queueLength}
                </div>
              )}
            </div>
          </div>

          {/* Fee Estimation Display */}
          {feeEstimate && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Transaction Fee Estimation {isEstimatingFee && '(Calculating...)'}
              </div>
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
                    <div className="h-px bg-slate-700 my-2"></div>
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
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">Meter number</span>
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-500 focus:ring-4"
                placeholder="e.g. METER-123"
                value={meterId}
                onChange={(e: any) => setMeterId(e.target.value)}
                disabled={paymentRateLimit.isProcessing}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-200">Amount</span>
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950/50 px-4 text-sm text-slate-100 outline-none ring-sky-500/30 placeholder:text-slate-500 focus:ring-4"
                placeholder="Whole number"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
                disabled={paymentRateLimit.isProcessing}
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={handlePayment}
              disabled={buttonState.disabled}
              className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 ring-1 ring-inset ring-white/10 transition focus:outline-none focus:ring-4 focus:ring-sky-500/30 ${buttonState.className}`}
            >
              {buttonState.text}
            </button>
            <p className="text-xs text-slate-400">
              Requires Freighter extension. 5 transactions per minute limit.
            </p>
          </div>

          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
            <div className="mt-2 text-sm text-slate-100">
              {status || 'Ready.'}
              {paymentRateLimit.paymentError && (
                <div className="mt-2 text-amber-300">
                  {paymentRateLimit.paymentError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Navigation />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/rate" element={<Rate />} />
      </Routes>
    </Router>
  );
}

export default App;