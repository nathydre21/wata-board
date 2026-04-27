import http from 'http';

jest.mock('winston-daily-rotate-file', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  }));
});

describe('Logger', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.LOG_AGGREGATION_URL;
    delete process.env.LOG_AGGREGATION_API_KEY;
  });

  it('exports a logger with standard log methods', async () => {
    const { default: logger } = await import('../utils/logger');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('includes combined, application, error, audit, and console transports by default', async () => {
    const { default: logger } = await import('../utils/logger');
    // Console + combined + application + error + audit = 5
    expect(logger.transports.length).toBe(5);
  });

  it('adds HTTP aggregation transport when LOG_AGGREGATION_URL is set', async () => {
    process.env.LOG_AGGREGATION_URL = 'http://localhost:9200/logs';
    const { default: logger } = await import('../utils/logger');
    expect(logger.transports.length).toBe(6);
  });

  it('auditLogger.log calls logger with AUDIT prefix and audit metadata', async () => {
    const { default: logger, auditLogger } = await import('../utils/logger');
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    auditLogger.log('user_login', { userId: '42' });

    expect(spy).toHaveBeenCalledWith(
      '[AUDIT] user_login',
      expect.objectContaining({ audit: true, userId: '42', event_timestamp: expect.any(String) })
    );
    spy.mockRestore();
  });

  it('HttpAggregationTransport posts log entry to aggregation URL', async () => {
    process.env.LOG_AGGREGATION_URL = 'http://localhost:9200/logs';

    const mockEnd = jest.fn();
    const mockWrite = jest.fn();
    const mockRequest = jest.spyOn(http, 'request').mockReturnValue({
      on: jest.fn(),
      write: mockWrite,
      end: mockEnd,
    } as any);

    const { default: logger } = await import('../utils/logger');
    logger.info('test aggregation');

    // Allow the setImmediate inside log() to fire
    await new Promise((r) => setImmediate(r));

    expect(mockRequest).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalled();
    expect(mockEnd).toHaveBeenCalled();

    mockRequest.mockRestore();
  });

  it('HttpAggregationTransport includes Authorization header when API key is set', async () => {
    process.env.LOG_AGGREGATION_URL = 'http://localhost:9200/logs';
    process.env.LOG_AGGREGATION_API_KEY = 'secret-token';

    const mockRequest = jest.spyOn(http, 'request').mockReturnValue({
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    } as any);

    await import('../utils/logger');
    const [[options]] = mockRequest.mock.calls as any;

    expect(options.headers?.Authorization).toBe('Bearer secret-token');
    mockRequest.mockRestore();
  });
});
