export const getNetworkStatus = () => {
  return {
    online: navigator.onLine,
    connection: (navigator as any).connection?.effectiveType || 'unknown'
  };
};

export const subscribeToNetworkChanges = (callback: (online: boolean) => void) => {
  const onlineHandler = () => callback(true);
  const offlineHandler = () => callback(false);

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
};