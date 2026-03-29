export const getNetworkStatus = () => {
  return {
    online: navigator.onLine,
    connection: (navigator as any).connection?.effectiveType || 'unknown'
  };
};

export const subscribeToNetworkChanges = (callback: (online: boolean) => void) => {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
  return () => {
    window.removeEventListener('online', () => callback(true));
    window.removeEventListener('offline', () => callback(false));
  };
};