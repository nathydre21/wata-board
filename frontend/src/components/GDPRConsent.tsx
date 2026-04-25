import React, { useState, useEffect } from 'react';

export const GDPRConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('gdpr-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('gdpr-consent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('gdpr-consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 bg-slate-900 border-t border-slate-800 shadow-2xl animate-in slide-in-from-bottom duration-300"
      role="dialog"
      aria-labelledby="gdpr-title"
      aria-describedby="gdpr-desc"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h2 id="gdpr-title" className="text-lg font-semibold text-white">Your Privacy Matters</h2>
          <p id="gdpr-desc" className="mt-1 text-sm text-slate-300">
            We use cookies and process personal data (like your wallet address) to provide our service and ensure security. 
            By using Wata Board, you agree to our <a href="/privacy" className="text-sky-400 hover:underline">Privacy Policy</a>.
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={handleDecline}
            className="flex-1 md:flex-none px-6 py-2 text-sm font-medium text-slate-300 hover:text-white border border-slate-700 rounded-lg transition-colors focus:ring-2 focus:ring-slate-500"
          >
            Decline
          </button>
          <button 
            onClick={handleAccept}
            className="flex-1 md:flex-none px-6 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors shadow-lg shadow-sky-900/20 focus:ring-2 focus:ring-sky-500"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
};
