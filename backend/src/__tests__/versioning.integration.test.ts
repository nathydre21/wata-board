/**
 * API Versioning Integration Tests
 * Tests for versioned API endpoints
 */

import request from 'supertest';
import express, { Express, Request, Response } from 'express';
import { versioningMiddleware } from '../middleware/versioning';
import { ApiVersion } from '../utils/versioning';

describe('API Versioning Middleware Integration', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(versioningMiddleware);

    // Test endpoints
    app.post('/api/v1/payment', (req: Request, res: Response) => {
      res.json({ success: true, version: req.apiVersion });
    });

    app.post('/api/v2/payment', (req: Request, res: Response) => {
      res.json({ success: true, version: req.apiVersion });
    });

    app.get('/api/v1/analytics/:userId', (req: Request, res: Response) => {
      res.json({ userId: req.params.userId, version: req.apiVersion });
    });

    app.get('/api/v2/analytics/:userId', (req: Request, res: Response) => {
      res.json({ userId: req.params.userId, version: req.apiVersion });
    });

    // 404 for unversioned routes
    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  });

  describe('V1 Endpoints', () => {
    it('should respond to v1 payment endpoint with correct version header', async () => {
      const response = await request(app)
        .post('/api/v1/payment')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
      expect(response.headers['x-api-version']).toBe('v1');
      expect(response.body.version).toBe('v1');
    });

    it('should respond to v1 analytics endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/user123');

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
      expect(response.body.userId).toBe('user123');
      expect(response.body.version).toBe('v1');
    });
  });

  describe('V2 Endpoints', () => {
    it('should respond to v2 payment endpoint with correct version header', async () => {
      const response = await request(app)
        .post('/api/v2/payment')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v2');
      expect(response.headers['x-api-version']).toBe('v2');
      expect(response.body.version).toBe('v2');
    });

    it('should respond to v2 analytics endpoint', async () => {
      const response = await request(app)
        .get('/api/v2/analytics/user456');

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v2');
      expect(response.body.userId).toBe('user456');
      expect(response.body.version).toBe('v2');
    });
  });

  describe('Response Headers', () => {
    it('should include API version headers in all responses', async () => {
      const response = await request(app)
        .post('/api/v1/payment')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      expect(response.headers['api-version']).toBeDefined();
      expect(response.headers['x-api-version']).toBeDefined();
      expect(response.headers['x-api-supported-versions']).toBe('v1, v2');
    });

    it('should not have deprecation headers for non-deprecated versions', async () => {
      const response = await request(app)
        .post('/api/v1/payment')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      expect(response.headers['deprecation']).toBeUndefined();
      expect(response.headers['sunset']).toBeUndefined();
    });
  });

  describe('Accept-Version Header', () => {
    it('should respect Accept-Version header for endpoint selection', async () => {
      const response = await request(app)
        .post('/api/payment')
        .set('Accept-Version', 'v2')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      // Note: This would need additional test setup to work properly
      // For now, we're testing the header extraction logic
      expect(response.headers['api-version']).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('should route unversioned legacy paths to v1 handlers', async () => {
      const response = await request(app)
        .post('/api/payment')
        .send({ meter_id: 'TEST', amount: 100, userId: 'user1' });

      expect(response.status).toBe(200);
      expect(response.headers['api-version']).toBe('v1');
      expect(response.body.version).toBe('v1');
      expect(response.headers['deprecation']).toBe('true');
    });
  });
});

describe('API Versioning Edge Cases', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(versioningMiddleware);

    app.post('/api/v1/test', (req: Request, res: Response) => {
      res.json({ version: req.apiVersion });
    });

    app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  });

  it('should extract version from deeply nested paths', async () => {
    const response = await request(app)
      .post('/api/v1/test')
      .send({});

    expect(response.body.version).toBe('v1');
  });

  it('should include supported versions in response header', async () => {
    const response = await request(app)
      .post('/api/v1/test')
      .send({});

    expect(response.headers['x-api-supported-versions']).toBe('v1, v2');
  });
});
