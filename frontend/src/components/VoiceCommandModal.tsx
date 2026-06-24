import React, { useEffect, useRef, useCallback } from 'react';
import type { ParsedPaymentCommand } from '../hooks/useVoiceCommands';
import { announceToScreenReader, trapFocus } from '../utils/accessibility';

interface VoiceCommandModalProps {
  command: ParsedPaymentCommand;
  isOpen: boolean;
  onConfirm: (command: ParsedPaymentCommand) => void;
  onCancel: () => void;
}

export const VoiceCommandModal: React.FC<VoiceCommandModalProps> = ({
  command,
  isOpen,
  onConfirm,
  onCancel,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      announceToScreenReader(
        `Voice command detected: Pay ${command.amount} XLM${command.meterId ? ` to meter ${command.meterId}` : ''}. Confirm or cancel.`
      );
    }
  }, [isOpen, command]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const cleanup = trapFocus(containerRef.current);
    return cleanup;
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onConfirm(command);
      }
    },
    [onCancel, onConfirm, command]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Confirm voice payment"
    >
      <div
        ref={containerRef}
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Voice Payment Confirmation</h3>
            <p className="text-sm text-slate-400">Confirm the payment details from your voice command</p>
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4 mb-4 space-y-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Amount</p>
            <p className="text-2xl font-bold text-slate-100">{command.amount} XLM</p>
          </div>
          {command.meterId && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Meter ID</p>
              <p className="text-base font-mono text-slate-200">{command.meterId}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Heard</p>
            <p className="text-sm text-slate-400 italic">"{command.raw}"</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onConfirm(command)}
            className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-500 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            aria-label={`Confirm payment of ${command.amount} XLM${command.meterId ? ` to meter ${command.meterId}` : ''}`}
          >
            Confirm Payment
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 bg-slate-700 text-slate-200 rounded-lg font-medium hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
