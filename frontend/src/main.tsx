import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Add global error listener for early debugging
window.onerror = function(message, source, lineno, colno, error) {
  console.error('[Global Error]', { message, source, lineno, colno, error });
};

window.onunhandledrejection = function(event) {
  console.error('[Unhandled Rejection]', event.reason);
};
import './index.css'
import App from './App.tsx'
import { registerServiceWorker, listenToServiceWorkerMessages } from './utils/serviceWorkerRegistration'
import './i18n'
import { initFrontendConfigTracking } from './utils/configVersion'

/*
// Track and version the active frontend configuration at startup
initFrontendConfigTracking();

// Register service worker for offline support
registerServiceWorker().then((result) => {
  if (result.success) {
    console.log('[Main] Service worker registered successfully');

    // Listen for service worker messages
    const cleanup = listenToServiceWorkerMessages((message) => {
      console.log('[Main] Message from service worker:', message);

      // Handle connectivity status updates
      if (message.type === 'CONNECTIVITY_STATUS') {
        console.log('[Main] Connectivity status changed:', message.isOnline);
        // You can dispatch this to React state management here if needed
      }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
    // Return cleanup function to remove event listener
    return () => {
      window.removeEventListener('beforeunload', cleanup);
    };
  } else {
    console.warn('[Main] Service worker registration failed:', result.error);
  }
});
*/

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
