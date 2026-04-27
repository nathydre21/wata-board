import React, { useState, useEffect } from 'react';
import type { UtilityProvider } from '../types/provider';
import { ProviderService } from '../services/providerService';

interface ProviderSelectorProps {
  meterType?: 'electricity' | 'water' | 'gas';
  selectedProviderId?: string;
  onProviderSelect: (provider: UtilityProvider) => void;
  className?: string;
  disabled?: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  meterType,
  selectedProviderId,
  onProviderSelect,
  className = '',
  disabled = false
}) => {
  const [providers, setProviders] = useState<UtilityProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        setLoading(true);
        setError(null);
        
        let providerList: UtilityProvider[];
        
        if (meterType) {
          providerList = await ProviderService.getProvidersByMeterType(meterType);
        } else {
          providerList = await ProviderService.getActiveProviders();
        }
        
        setProviders(providerList);
        
        // Auto-select the first provider if none is selected
        if (!selectedProviderId && providerList.length > 0) {
          onProviderSelect(providerList[0]);
        } else if (selectedProviderId) {
          const selectedProvider = providerList.find(p => p.id === selectedProviderId);
          if (selectedProvider) {
            onProviderSelect(selectedProvider);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load payment providers. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadProviders();
  }, [meterType, selectedProviderId, onProviderSelect]);

  const handleProviderChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = event.target.value;
    const provider = providers.find(p => p.id === providerId);
    if (provider) {
      onProviderSelect(provider);
    }
  };

  if (loading) {
    return (
      <div className={`provider-selector ${className}`}>
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 rounded-md mb-2"></div>
          <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`provider-selector ${className}`}>
        <div className="text-red-600 text-sm">
          Error loading providers: {error}
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className={`provider-selector ${className}`}>
        <div className="text-gray-500 text-sm">
          No providers available
        </div>
      </div>
    );
  }

  return (
    <div className={`provider-selector ${className}`}>
      <label htmlFor="provider-select" className="block text-sm font-medium text-gray-700 mb-2">
        Utility Provider
      </label>
      
      <select
        id="provider-select"
        value={selectedProviderId || ''}
        onChange={handleProviderChange}
        disabled={disabled}
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        {providers.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.name} ({provider.network})
          </option>
        ))}
      </select>
      
      {selectedProviderId && (
        <div className="mt-2 text-xs text-gray-500">
          {(() => {
            const provider = providers.find(p => p.id === selectedProviderId);
            if (!provider) return null;
            
            return (
              <div className="space-y-1">
                <div>Contract: {provider.contractId.slice(0, 8)}...{provider.contractId.slice(-8)}</div>
                <div>Network: {provider.network}</div>
                <div>Supports: {provider.supportedMeterTypes.join(', ')}</div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default ProviderSelector;
