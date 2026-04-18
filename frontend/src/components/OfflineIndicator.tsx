import React, { useState, useEffect } from 'react';
import { subscribeToNetworkChanges } from '../utils/networkStatus';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    return subscribeToNetworkChanges(setIsOnline);
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-orange-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 animate-pulse">
      <span className="w-2 h-2 bg-white rounded-full"></span>
      <span className="text-sm font-medium">Offline Mode - Transactions will sync later</span>
    </div>
  );
};