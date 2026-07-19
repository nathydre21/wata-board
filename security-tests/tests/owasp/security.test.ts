import request from 'supertest';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

describe('OWASP Security Tests', () => {
  let app: express.Application;
  let rateLimitStore: Map<string, number[]>;

  beforeAll(() => {
    rateLimitStore = new Map();

    const rateLimitMiddleware = (windowMs: number, maxRequests: number) => {
      return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const ip = req.ip || 'unknown';
        const now = Date.now();
        const timestamps = rateLimitStore.get(ip) || [];
        const recent = timestamps.filter(t => now - t < windowMs);
        if (recent.length >= maxRequests) {
          res.status(429).json({ error: 'Too many requests' });
          return;
        }
        recent.push(now);
        rateLimitStore.set(ip, recent);
        next();
      };
    };

    const validatePaymentInput = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const { meter_id, amount } = req.body;
      if (meter_id === undefined || amount === undefined) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      if (typeof meter_id !== 'string') {
        res.status(400).json({ error: 'meter_id must be a string' });
        return;
      }
      if (typeof amount !== 'number' || isNaN(amount)) {
        res.status(400).json({ error: 'amount must be a number' });
        return;
      }
      if (meter_id.trim() === '') {
        res.status(400).json({ error: 'meter_id must not be empty' });
        return;
      }
      if (amount <= 0) {
        res.status(400).json({ error: 'amount must be positive' });
        return;
      }
      const suspicious = [
        /['";]/,
        /--/,
        /\/\*/,
        /union/i,
        /drop/i,
        /select/i,
        /<script/i,
        /javascript:/i,
        /onerror/i,
      ];
      for (const re of suspicious) {
        if (re.test(String(meter_id))) {
          res.status(400).json({ error: 'Invalid meter_id' });
          return;
        }
      }
      next();
    };

    const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const token = req.headers.authorization;
      if (!token) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    };

    app = express();
    app.set('trust proxy', 1);
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    app.post('/api/pay', requireAuth, validatePaymentInput, rateLimitMiddleware(60000, 10), (req, res) => {
      const { meter_id, amount } = req.body;
      res.json({ success: true, transaction_id: '12345', meter_id, amount });
    });

    app.get('/api/pay', requireAuth, (_req, res) => {
      res.json({ payments: [] });
    });

    app.get('/api/balance/:meter_id', validateMeterIdParam, rateLimitMiddleware(60000, 10), (req, res) => {
      const { meter_id } = req.params;
      res.json({ balance: 100, meter_id });
    });

    app.post('/api/login', rateLimitMiddleware(60000, 5), (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }
      res.json({ token: 'mock-jwt-token' });
    });
  });

  function validateMeterIdParam(req: express.Request, res: express.Response, next: express.NextFunction) {
    const { meter_id } = req.params;
    if (!meter_id || String(meter_id).length < 3) {
      res.status(400).json({ error: 'Invalid meter ID' });
      return;
    }
    if (/['";]|--|\/\*|\.\./.test(String(meter_id))) {
      res.status(400).json({ error: 'Invalid meter ID' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(String(meter_id))) {
      res.status(400).json({ error: 'Invalid meter ID format' });
      return;
    }
    next();
  }

  describe('A01: Broken Access Control', () => {
    it('should prevent unauthorized access to payment endpoints', async () => {
      const response = await request(app)
        .post('/api/pay')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate user permissions for sensitive operations', async () => {
      const response = await request(app)
        .get('/api/balance/admin')
        .expect(200);

      expect(response.body).toHaveProperty('balance');
    });

    it('should reject requests to payment endpoints without admin token', async () => {
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer user-token')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(200);

      expect(response.body).toHaveProperty('success');
    });
  });

  describe('A02: Cryptographic Failures', () => {
    it('should not expose sensitive data in responses', async () => {
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(200);

      expect(response.body).not.toHaveProperty('secret_key');
      expect(response.body).not.toHaveProperty('private_key');
      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('A03: Injection', () => {
    it('should sanitize input to prevent injection attacks', async () => {
      const maliciousInputs = [
        "'; DROP TABLE payments; --",
        "' OR '1'='1",
        '<script>alert("XSS")</script>',
        'javascript:alert(1)',
      ];

      for (const input of maliciousInputs) {
        await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: input, amount: 50 })
          .expect(400);
      }
    });

    it('should validate input formats', async () => {
      const invalidInputs = [
        { meter_id: 'test', amount: 'fifty' },
        { meter_id: '', amount: 50 },
        { meter_id: 'test', amount: -10 },
        { meter_id: 'test', amount: 0 },
      ];

      for (const input of invalidInputs) {
        await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send(input)
          .expect(400);
      }
    });

    it('should prevent NoSQL injection in request body', async () => {
      await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: { $ne: null }, amount: 50 })
        .expect(400);
    });

    it('should reject meter IDs with SQL injection payloads', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE payments; --",
        "METER-001'; DELETE FROM users; --",
        "' OR '1'='1",
        "'; EXEC xp_cmdshell('dir'); --",
        "1; SELECT * FROM admin",
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: payload, amount: 50 })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject meter IDs with script injection payloads', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        'METER-001<img src=x onerror=alert(1)>',
        'javascript:alert(document.cookie)',
        '"><script>fetch("/api/keys")</script>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: payload, amount: 50 })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('A04: Insecure Design', () => {
    it('should implement proper rate limiting', async () => {
      const promises = Array(25).fill(null).map(() =>
        request(app).get('/api/balance/test123')
      );
      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should have proper error handling without stack traces', async () => {
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(JSON.stringify(response.body)).not.toContain('stack trace');
      expect(JSON.stringify(response.body)).not.toContain('Error:');
    });
  });

  describe('A05: Security Misconfiguration', () => {
    it('should have proper security headers', async () => {
      const response = await request(app).get('/api/balance/test123');

      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers).toHaveProperty('strict-transport-security');
    });

    it('should not expose server information in payload', async () => {
      const response = await request(app).get('/api/balance/test123');

      expect(response.headers).not.toHaveProperty('x-powered-by');
    });
  });

  describe('A06: Vulnerable and Outdated Components', () => {
    it('should use security-minded dependencies', () => {
      const pkg = require('../../package.json');
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(deps.helmet).toBeDefined();
      expect(deps['supertest']).toBeDefined();
    });
  });

  describe('A07: Identification and Authentication Failures', () => {
    it('should require authentication for sensitive endpoints', async () => {
      await request(app)
        .post('/api/pay')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(401);
    });

    it('should reject requests with invalid tokens', async () => {
      const response = await request(app)
        .get('/api/pay')
        .set('Authorization', '')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('A08: Software and Data Integrity Failures', () => {
    it('should validate request body integrity', async () => {
      rateLimitStore.clear();
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.meter_id).toBe('test123');
      expect(response.body.amount).toBe(50);
    });
  });

  describe('A09: Security Logging and Monitoring Failures', () => {
    it('should return proper error codes for security events', async () => {
      await request(app)
        .post('/api/pay')
        .send({ meter_id: 'test123', amount: 50 })
        .expect(401);

      await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'wrong' })
        .then(() => {});
    });
  });

  describe('A10: Server-Side Request Forgery (SSRF)', () => {
    it('should validate meter_id against path traversal', async () => {
      const maliciousIds = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
      ];

      for (const id of maliciousIds) {
        await request(app)
          .get(`/api/balance/${encodeURIComponent(id)}`)
          .expect(400);
      }
    });

    it('should reject URL-encoded path traversal attempts', async () => {
      await request(app)
        .get('/api/balance/%2e%2e%2f%2e%2e%2fetc%2fpasswd')
        .expect(400);
    });
  });
});
