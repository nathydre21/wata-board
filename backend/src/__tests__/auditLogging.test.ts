import { PaymentService, PaymentRequest } from '../payment-service';
import { auditLogger } from '../utils/logger';
import { kycService, KYCStatus } from '../services/kyc-service';

// Mock the auditLogger
jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  auditLogger: {
    log: jest.fn(),
    error: jest.fn(),
    security: jest.fn(),
  },
}));

// Mock the dependencies of PaymentService
jest.mock('../services/kyc-service');
jest.mock('../services/paymentWebhookService');
jest.mock('../accounting-service');

// Mock dynamic imports for Stellar SDK and NepaClient
jest.mock('../../../contract/nepa_client_v2', () => ({
  Client: jest.fn().mockImplementation(() => ({
    pay_bill: jest.fn().mockResolvedValue({
      signAndSend: jest.fn().mockResolvedValue({}),
      hash: 'test_tx_hash'
    })
  })),
  networks: {
    testnet: {}
  }
}), { virtual: true });

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromSecret: jest.fn().mockReturnValue({
      sign: jest.fn(),
    }),
  },
}), { virtual: true });

describe('Audit Logging Verification', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    jest.clearAllMocks();
    paymentService = new PaymentService({ windowMs: 1000, maxRequests: 10 });
  });

  it('should log audit events for a successful payment', async () => {
    const request: PaymentRequest = {
      meter_id: 'METER-001',
      amount: 100,
      userId: 'user-001',
    };

    (kycService.getStatus as jest.Mock).mockResolvedValue(KYCStatus.VERIFIED);
    (kycService.performAMLCheck as jest.Mock).mockResolvedValue(true);

    await paymentService.processPayment(request);

    // Verify audit logs
    expect(auditLogger.log).toHaveBeenCalledWith('KYC status check', expect.objectContaining({
      userId: request.userId,
      status: KYCStatus.VERIFIED
    }));

    expect(auditLogger.log).toHaveBeenCalledWith('AML check passed', expect.objectContaining({
      userId: request.userId,
      amount: request.amount
    }));

    expect(auditLogger.log).toHaveBeenCalledWith('Payment executed successfully', expect.objectContaining({
      userId: request.userId,
      meterId: request.meter_id,
      amount: request.amount,
      status: 'success'
    }));
  });

  it('should log a security event for KYC rejection', async () => {
    const request: PaymentRequest = {
      meter_id: 'METER-002',
      amount: 100,
      userId: 'user-002',
    };

    (kycService.getStatus as jest.Mock).mockResolvedValue(KYCStatus.PENDING);

    await paymentService.processPayment(request);

    expect(auditLogger.security).toHaveBeenCalledWith('Payment rejected: KYC required', expect.objectContaining({
      userId: request.userId,
      status: KYCStatus.PENDING
    }));
  });

  it('should log a security event for AML flag', async () => {
    const request: PaymentRequest = {
      meter_id: 'METER-003',
      amount: 100,
      userId: 'user-003',
    };

    (kycService.getStatus as jest.Mock).mockResolvedValue(KYCStatus.VERIFIED);
    (kycService.performAMLCheck as jest.Mock).mockResolvedValue(false);

    await paymentService.processPayment(request);

    expect(auditLogger.security).toHaveBeenCalledWith('Payment rejected: AML flag', expect.objectContaining({
      userId: request.userId,
      meterId: request.meter_id,
      reason: expect.any(String)
    }));
  });

  it('should log an audit error for processing failures', async () => {
    const request: PaymentRequest = {
      meter_id: 'METER-004',
      amount: 100,
      userId: 'user-004',
    };

    (kycService.getStatus as jest.Mock).mockResolvedValue(KYCStatus.VERIFIED);
    (kycService.performAMLCheck as jest.Mock).mockResolvedValue(true);
    
    // Force an error in executePayment
    jest.spyOn(paymentService as any, 'executePayment').mockRejectedValue(new Error('Network failure'));

    await paymentService.processPayment(request);

    expect(auditLogger.error).toHaveBeenCalledWith('Payment processing failed', expect.objectContaining({
      userId: request.userId,
      error: 'Network failure'
    }));
  });
});
