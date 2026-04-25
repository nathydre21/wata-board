import request from 'supertest';
import app from '../server';

describe('API Integration', () => {
  it('returns analytics report on /api/analytics/:userId', async () => {
    const response = await request(app).get('/api/analytics/test-user');
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('test-user');
    expect(response.body.totalSpendMonthly).toBeGreaterThan(0);
  });

  it('returns transaction status on /api/transaction-status/:transactionId', async () => {
    const response = await request(app).get('/api/transaction-status/test-tx');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, transactionId: 'test-tx' });
    expect(['pending', 'confirming', 'confirmed', 'failed']).toContain(response.body.status);
  });
});
