import { handleClientError } from '../middleware/errorHandler';

describe('Error Handler Middleware', () => {
  it('returns a success response when client errors are reported', () => {
    const req = {
      body: {
        message: 'Client crash',
        stack: 'Error stack'
      },
      path: '/api/client-errors',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('Mozilla/5.0')
    } as any;

    const json = jest.fn();
    const res = {
      status: jest.fn().mockReturnValue({ json })
    } as any;

    handleClientError(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(json).toHaveBeenCalledWith({ success: true, message: 'Client error logged' });
  });
});
