import React from 'react';
import { useTranslation } from 'react-i18next';

interface GlobalErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

/**
 * A stunning, premium fullscreen fallback UI for catastrophic application errors.
 * Designed with glassmorphism, vibrant gradients, and clear call-to-actions.
 */
export const GlobalErrorFallback: React.FC<GlobalErrorFallbackProps> = ({ 
  error, 
  resetErrorBoundary 
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[9999] min-h-screen w-screen flex items-center justify-center p-4 bg-slate-950 text-slate-50 overflow-auto">
      {/* Background gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 -translate-x-1/4 -translate-y-1/4 w-[400px] h-[400px] bg-sky-500/10 blur-[100px] rounded-full pointer-events-none" />

      <main className="relative z-10 max-w-lg w-full rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-8 lg:p-10 shadow-2xl text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 mb-8">
          <svg className="h-8 w-8 text-red-500" strokeWidth={2} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-4">
          Unexpected Error occurred
        </h1>

        <p className="text-slate-400 text-base mb-8 leading-relaxed">
           The application encountered a serious error. 
           Please reload to continue your work without interruption.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <div className="mb-8 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-left">
            <h2 className="text-xs uppercase tracking-widest text-red-400 font-bold mb-2">Error Log</h2>
            <div className="text-xs font-mono text-red-200/80 bg-slate-950/60 p-3 rounded-lg overflow-auto max-h-[150px] border border-white/5 break-all">
              {error.message}
              {error.stack && (
                <div className="mt-2 text-[10px] opacity-60">
                   {error.stack}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={resetErrorBoundary}
            className="h-12 w-full inline-flex items-center justify-center rounded-xl px-6 bg-sky-500 font-semibold text-white shadow-lg shadow-sky-500/10 transition hover:bg-sky-400 active:scale-[0.98] active:bg-sky-600 focus:outline-none focus:ring-4 focus:ring-sky-500/20"
          >
             Re-initialize Application
          </button>
          
          <button
            onClick={() => window.location.reload()}
            className="h-12 w-full inline-flex items-center justify-center rounded-xl px-6 bg-slate-800 font-semibold text-slate-100 shadow-lg shadow-black/10 transition hover:bg-slate-700 border border-slate-700 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-slate-500/20"
          >
             Hard Refresh
          </button>
        </div>

        <footer className="mt-8 pt-8 border-t border-slate-800">
           <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} Wata-Board. All rights reserved. 
           </p>
        </footer>
      </main>
    </div>
  );
};
