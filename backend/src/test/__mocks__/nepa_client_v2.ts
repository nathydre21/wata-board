export const Client = jest.fn().mockImplementation(() => ({
  pay_bill: jest.fn().mockResolvedValue({
    hash: 'test_payment_hash_12345',
    result: { success: true },
    signAndSend: jest.fn().mockResolvedValue({}),
  }),
  get_total_paid: jest.fn().mockResolvedValue({ result: '100.5000000' }),
}));

export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CDRRJ7IPYDL36YSK5ZQLBG3LICULETIBXX327AGJQNTWXNKY2UMDO4DA',
  },
  mainnet: {
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    contractId: 'MAINNET_CONTRACT_ID_PLACEHOLDER',
  },
};

export default { Client, networks };
