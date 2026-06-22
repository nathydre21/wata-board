export interface UtilityProvider {
  id: string;
  name: string;
  logo?: string;
  contractId: string;
  network: 'testnet' | 'mainnet';
  rpcUrl: string;
  isActive: boolean;
  supportedMeterTypes: ('electricity' | 'water' | 'gas')[];
  metadata?: Record<string, any>;
}

export interface ProviderConfig {
  providerId: string;
  network: 'testnet' | 'mainnet';
}

export interface ProviderPaymentRequest {
  meter_id: string;
  amount: number;
  userId: string;
  providerId: string;
}

export interface ProviderPaymentResult {
  success: boolean;
  transactionId?: string;
  providerId: string;
  error?: string;
  rateLimitInfo?: any;
  retryCount?: number;
}
