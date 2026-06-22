import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProviderSelector } from '../components/ProviderSelector';
import { useProvider } from '../hooks/useProvider';
import { ProviderService } from '../services/providerService';
import type { UtilityProvider } from '../types/provider';

// Mock the ProviderService
vi.mock('../services/providerService');
const mockedProviderService = ProviderService as any;

// Mock environment variables
const mockEnv = {
  VITE_API_URL: 'http://localhost:3001'
};

Object.defineProperty(window, 'import', {
  value: {
    meta: {
      env: mockEnv
    }
  }
});

describe('Multi-Provider Frontend', () => {
  const mockProviders: UtilityProvider[] = [
    {
      id: 'wata-board',
      name: 'Wata-Board',
      contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      isActive: true,
      supportedMeterTypes: ['electricity', 'water', 'gas'],
      metadata: {
        region: 'Global',
        description: 'Default utility payment provider'
      }
    },
    {
      id: 'nepa',
      name: 'National Electric Power Authority',
      contractId: 'NEPA_CONTRACT_ID',
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      isActive: true,
      supportedMeterTypes: ['electricity'],
      metadata: {
        region: 'Nigeria',
        description: 'National electricity provider'
      }
    },
    {
      id: 'waterboard',
      name: 'National Water Board',
      contractId: 'WATERBOARD_CONTRACT_ID',
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      isActive: true,
      supportedMeterTypes: ['water'],
      metadata: {
        region: 'Global',
        description: 'National water utility provider'
      }
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ProviderSelector Component', () => {
    test('renders loading state initially', () => {
      mockedProviderService.getActiveProviders.mockImplementation(() => new Promise(() => {})); // Never resolves

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      // Component shows a skeleton/pulse loader, not text, during loading
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    test('renders provider options when loaded', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Utility Provider')).toBeInTheDocument();
      });

      // Check if all providers are in the select dropdown
      expect(screen.getByText('Wata-Board (testnet)')).toBeInTheDocument();
      expect(screen.getByText('National Electric Power Authority (testnet)')).toBeInTheDocument();
      expect(screen.getByText('National Water Board (testnet)')).toBeInTheDocument();
    });

    test('auto-selects first provider when no initial selection', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(onProviderSelect).toHaveBeenCalledWith(mockProviders[0]);
      });
    });

    test('selects specific provider when initial providerId is provided', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          selectedProviderId="nepa"
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(onProviderSelect).toHaveBeenCalledWith(mockProviders[1]);
      });
    });

    test('filters providers by meter type', async () => {
      mockedProviderService.getProvidersByMeterType.mockResolvedValue(
        mockProviders.filter(p => p.supportedMeterTypes.includes('electricity'))
      );

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          meterType="electricity"
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(mockedProviderService.getProvidersByMeterType).toHaveBeenCalledWith('electricity');
        expect(onProviderSelect).toHaveBeenCalled();
      });
    });

    test('calls onProviderSelect when user changes selection', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue('Wata-Board (testnet)')).toBeInTheDocument();
      });

      // Change selection
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'nepa' } });

      expect(onProviderSelect).toHaveBeenCalledWith(mockProviders[1]);
    });

    test('displays error state when loading fails', async () => {
      mockedProviderService.getActiveProviders.mockRejectedValue(new Error('Network error'));

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Error loading providers: Network error')).toBeInTheDocument();
      });
    });

    test('displays no providers message when list is empty', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue([]);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No providers available')).toBeInTheDocument();
      });
    });

    test('displays provider information when provider is selected', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          selectedProviderId="wata-board"
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Contract: CDRRJ7IPY/)).toBeInTheDocument();
        expect(screen.getByText('Network: testnet')).toBeInTheDocument();
        expect(screen.getByText('Supports: electricity, water, gas')).toBeInTheDocument();
      });
    });

    test('disables selector when disabled prop is true', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          disabled={true}
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox');
        expect(select).toBeDisabled();
      });
    });
  });

  describe('useProvider Hook', () => {
    test('loads providers and auto-selects first provider', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider();
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.providers).toEqual(mockProviders);
        expect(hookResult.selectedProvider).toEqual(mockProviders[0]);
        expect(hookResult.loading).toBe(false);
        expect(hookResult.error).toBeNull();
      });
    });

    test('loads providers with specific initial provider', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider('nepa');
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.selectedProvider).toEqual(mockProviders[1]);
      });
    });

    test('filters providers by meter type', async () => {
      const electricityProviders = mockProviders.filter(p => p.supportedMeterTypes.includes('electricity'));
      mockedProviderService.getProvidersByMeterType.mockResolvedValue(electricityProviders);

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider(undefined, { meterType: 'electricity' });
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.providers).toEqual(electricityProviders);
        expect(mockedProviderService.getProvidersByMeterType).toHaveBeenCalledWith('electricity');
      });
    });

    test('handles loading errors', async () => {
      mockedProviderService.getActiveProviders.mockRejectedValue(new Error('API Error'));

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider();
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.loading).toBe(false);
        expect(hookResult.error).toBe('API Error');
        expect(hookResult.providers).toEqual([]);
        expect(hookResult.selectedProvider).toBeNull();
      });
    });

    test('selectProvider function updates selected provider', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider();
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.selectedProvider).toEqual(mockProviders[0]);
      });

      // Select different provider
      hookResult.selectProvider(mockProviders[2]);
      expect(hookResult.selectedProvider).toEqual(mockProviders[2]);
    });

    test('refreshProviders function reloads providers', async () => {
      mockedProviderService.getActiveProviders
        .mockResolvedValueOnce(mockProviders.slice(0, 2))
        .mockResolvedValueOnce(mockProviders);

      let hookResult: any;
      const TestComponent = () => {
        hookResult = useProvider();
        return <div data-testid="loaded">Loaded</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(hookResult.providers).toHaveLength(2);
      });

      await hookResult.refreshProviders();

      await waitFor(() => {
        expect(hookResult.providers).toHaveLength(3);
        expect(mockedProviderService.getActiveProviders).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Integration Scenarios', () => {
    test('complete provider selection workflow', async () => {
      mockedProviderService.getActiveProviders.mockResolvedValue(mockProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          onProviderSelect={onProviderSelect}
        />
      );

      // Initial load and auto-selection
      await waitFor(() => {
        expect(onProviderSelect).toHaveBeenCalledWith(mockProviders[0]);
        expect(onProviderSelect).toHaveBeenCalledTimes(1);
      });

      // User changes selection
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'nepa' } });

      expect(onProviderSelect).toHaveBeenCalledWith(mockProviders[1]);
      expect(onProviderSelect).toHaveBeenCalledTimes(2);

      // Verify provider info is displayed
      // Contract ID is truncated: slice(0,8)...slice(-8)
      expect(screen.getByText(/Contract: NEPA_CON/)).toBeInTheDocument();
      expect(screen.getByText('Region: Nigeria')).toBeInTheDocument();
    });

    test('handles provider selection for specific meter type', async () => {
      const electricityProviders = mockProviders.filter(p => p.supportedMeterTypes.includes('electricity'));
      mockedProviderService.getProvidersByMeterType.mockResolvedValue(electricityProviders);

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          meterType="electricity"
          onProviderSelect={onProviderSelect}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Wata-Board (testnet)')).toBeInTheDocument();
        expect(screen.getByText('National Electric Power Authority (testnet)')).toBeInTheDocument();
        expect(screen.queryByText('National Water Board (testnet)')).not.toBeInTheDocument();
      });

      expect(onProviderSelect).toHaveBeenCalledWith(electricityProviders[0]);
    });

    test('handles disabled state during loading', async () => {
      mockedProviderService.getActiveProviders.mockImplementation(() => new Promise(() => {})); // Never resolves

      const onProviderSelect = vi.fn();
      render(
        <ProviderSelector
          disabled={true}
          onProviderSelect={onProviderSelect}
        />
      );

      // Component shows a skeleton/pulse loader, not text, during loading
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      
      // Component should not crash and should show loading state even when disabled
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });
});
