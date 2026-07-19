export interface NepaClientConfig {
  networkPassphrase: string;
  contractId: string;
  rpcUrl?: string;
}

export class Client {
  constructor(_config: NepaClientConfig) {}

  async pay_bill(_args: {
    meter_id: string;
    amount: number;
    memo?: string;
    nonce?: string;
  }): Promise<{
    hash: string;
    result: { success: boolean };
    signAndSend: (opts: {
      signTransaction: (tx: { sign: (kp: unknown) => void; toXDR: () => string }) => Promise<string>;
    }) => Promise<unknown>;
  }> {
    return {
      hash: `tx_${Date.now()}`,
      result: { success: true },
      signAndSend: async () => ({}),
    };
  }

  async get_total_paid(_args: { meter_id: string }): Promise<{ result: string | number }> {
    return { result: '0' };
  }
}

export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
  },
  mainnet: {
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    contractId: '',
  },
};

export default { Client, networks };
