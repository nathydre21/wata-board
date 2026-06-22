export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA'
  }
};

export class Client {
  constructor(_config: any) {}
  async pay_bill(_params: any): Promise<any> {
    const tx: any = {
      hash: 'test_hash',
      result: { success: true },
      signAndSend: async (_opts: any) => {},
    };
    return tx;
  }
  async get_total_paid(_params: any) {
    return { result: '0' };
  }
}
