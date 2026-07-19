import React, { useState, useCallback, useEffect } from 'react';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { VoiceCommandModal } from './VoiceCommandModal';
import { announceToScreenReader } from '../utils/accessibility';
import { paymentEvents } from '../utils/paymentEvents';
import type { ParsedPaymentCommand } from '../hooks/useVoiceCommands';

interface VoicePaymentButtonProps {
  position?: 'fixed' | 'inline';
}

type PaymentStage = 'idle' | 'submitting' | 'success' | 'failed';

export const VoicePaymentButton: React.FC<VoicePaymentButtonProps> = ({ position = 'fixed' }) => {
  const {
    status,
    transcript,
    interimTranscript,
    command,
    error,
    isSupported,
    startListening,
    stopListening,
    reset,
  } = useVoiceCommands();

  const [showModal, setShowModal] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<ParsedPaymentCommand | null>(null);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [submittedAmount, setSubmittedAmount] = useState(0);

  useEffect(() => {
    if (command && status === 'processing') {
      setPendingCommand(command);
      setShowModal(true);
      stopListening();
    }
  }, [command, status, stopListening]);

  useEffect(() => {
    if (error) {
      announceToScreenReader(`Voice command error: ${error}`);
    }
  }, [error]);

  useEffect(() => {
    if (status === 'listening') {
      announceToScreenReader('Listening for voice payment command');
    }
  }, [status]);

  const submitPayment = useCallback(async (cmd: ParsedPaymentCommand) => {
    setPaymentStage('submitting');
    setSubmittedAmount(cmd.amount);
    setPaymentError(null);

    try {
      const response = await fetch('/api/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id: cmd.meterId || 'default',
          amount: cmd.amount,
          userId: 'current-user',
        }),
      });

      const result = await response.json();

      if (result.success && result.transactionId) {
        setTransactionId(result.transactionId);
        setPaymentStage('success');

        paymentEvents.emitPaymentCompleted({
          transactionId: result.transactionId,
          amount: cmd.amount,
          meterId: cmd.meterId,
          source: 'manual_payment',
        });

        announceToScreenReader(
          `Voice payment of ${cmd.amount} XLM completed successfully. Transaction ID: ${result.transactionId}`
        );
      } else {
        throw new Error(result.error || 'Payment failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setPaymentError(msg);
      setPaymentStage('failed');

      paymentEvents.emitPaymentFailed({
        amount: cmd.amount,
        meterId: cmd.meterId,
        source: 'manual_payment',
      });

      announceToScreenReader(`Voice payment failed: ${msg}`);
    }
  }, []);

  const handleConfirm = useCallback(
    (cmd: ParsedPaymentCommand) => {
      setShowModal(false);
      void submitPayment(cmd);
    },
    [submitPayment]
  );

  const handleCancel = useCallback(() => {
    setShowModal(false);
    setPendingCommand(null);
    reset();
    announceToScreenReader('Voice payment cancelled');
  }, [reset]);

  const handleToggleListening = useCallback(() => {
    if (status === 'listening') {
      stopListening();
    } else {
      setPaymentStage('idle');
      setPaymentError(null);
      setTransactionId(null);
      startListening();
    }
  }, [status, stopListening, startListening]);

  if (!isSupported) return null;

  const isListening = status === 'listening';
  const isProcessing = status === 'processing';

  const buttonBase = 'rounded-full flex items-center justify-center shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900';
  const buttonSize = position === 'fixed' ? 'w-14 h-14' : 'w-10 h-10';
  const buttonPosition = position === 'fixed' ? 'fixed bottom-6 right-6 z-40' : '';
  const transcriptPosition = position === 'fixed' ? 'fixed bottom-24 right-6 z-40' : 'mt-2';

  return (
    <>
      <button
        onClick={handleToggleListening}
        disabled={isProcessing || paymentStage === 'submitting'}
        className={`${buttonBase} ${buttonSize} ${buttonPosition} ${
          isListening
            ? 'bg-red-500 hover:bg-red-400 animate-pulse'
            : 'bg-sky-600 hover:bg-sky-500'
        } ${(isProcessing || paymentStage === 'submitting') ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={
          isListening
            ? 'Stop listening for voice payment commands'
            : 'Start voice payment command'
        }
        aria-pressed={isListening}
      >
        {isListening || paymentStage === 'submitting' ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      <div className={transcriptPosition} aria-live="polite" aria-atomic="true">
        {(interimTranscript || transcript) && status !== 'processing' && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 shadow-xl max-w-xs">
            {transcript && (
              <p className="text-slate-100 text-sm font-medium">{transcript}</p>
            )}
            {interimTranscript && !transcript && (
              <p className="text-slate-400 text-sm italic">{interimTranscript}</p>
            )}
            {isListening && (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-slate-500">Listening...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className={transcriptPosition} role="alert">
          <div className="bg-red-900/80 border border-red-700 rounded-lg px-4 py-2 shadow-xl text-sm text-red-200 max-w-xs">
            {error}
          </div>
        </div>
      )}

      {pendingCommand && (
        <VoiceCommandModal
          command={pendingCommand}
          isOpen={showModal}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {paymentStage === 'submitting' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl text-center">
            <div className="w-12 h-12 border-4 border-slate-700 border-t-sky-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-100 font-medium mb-1">Processing Voice Payment</p>
            <p className="text-slate-400 text-sm">Sending {submittedAmount} XLM...</p>
          </div>
        </div>
      )}

      {paymentStage === 'success' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Payment Successful</h3>
              <p className="text-sm text-slate-400 mt-1">
                {submittedAmount} XLM sent successfully
              </p>
            </div>
            {transactionId && (
              <div className="bg-slate-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-slate-500 mb-1">Transaction ID</p>
                <p className="text-sm font-mono text-slate-300 break-all">{transactionId}</p>
              </div>
            )}
            <button
              onClick={() => { setPaymentStage('idle'); reset(); }}
              className="w-full px-4 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-500 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {paymentStage === 'failed' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-100">Payment Failed</h3>
              <p className="text-sm text-red-400 mt-1">{paymentError}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setPaymentStage('idle'); setPendingCommand(null); startListening(); }}
                className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-500 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => { setPaymentStage('idle'); reset(); }}
                className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-lg font-medium hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
