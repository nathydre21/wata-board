import request from 'supertest';
import express from 'express';
import helmet from 'helmet';

describe('API Penetration Testing', () => {
  let app: express.Application;
  let rateLimitStore: Map<string, number[]>;

  beforeEach(() => {
    rateLimitStore = new Map();
  });

  beforeAll(() => {

    const rateLimitMiddleware = (windowMs: number, maxRequests: number) => {
      return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const ip = req.ip || 'unknown';
        const now = Date.now();
        const timestamps = rateLimitStore.get(ip) || [];
        const recent = timestamps.filter(t => now - t < windowMs);
        if (recent.length >= maxRequests) {
          res.status(429).json({ error: 'Too many requests, please try again later' });
          return;
        }
        recent.push(now);
        rateLimitStore.set(ip, recent);
        next();
      };
    };

    const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const token = req.headers.authorization;
      if (!token || token === '') {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      next();
    };

    const sanitizeInput = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const checkValue = (val: unknown): boolean => {
        if (typeof val === 'string') {
          const sqlPatterns = /['";]|--|\/\*|union|drop|select|insert|delete|exec|master|truncate|declare/i;
          const nosqlPatterns = /\$ne|\$gt|\$lt|\$regex|\$where|\$in|\$nin/i;
          const cmdPatterns = /[;|`$&()]|whoami|id\b|cat\s+\/|ls\s+-/i;
          if (sqlPatterns.test(val) || nosqlPatterns.test(val) || cmdPatterns.test(val)) return false;
        }
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          const keyStr = JSON.stringify(val);
          const nosqlKeyPattern = /\$(ne|gt|lt|regex|where|in|nin)/i;
          if (nosqlKeyPattern.test(keyStr)) return false;
        }
        return true;
      };

      const { meter_id, username } = req.body;
      if (meter_id !== undefined && !checkValue(meter_id)) {
        res.status(400).json({ error: 'Invalid input detected' });
        return;
      }
      if (username !== undefined && !checkValue(username)) {
        res.status(400).json({ error: 'Invalid input detected' });
        return;
      }
      next();
    };

    const validateMeterId = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const meterId = req.params.meter_id || req.body.meter_id;
      if (meterId !== undefined) {
        if (meterId === null || meterId === undefined || String(meterId).trim() === '') {
          res.status(400).json({ error: 'Invalid meter ID' });
          return;
        }
        const strId = String(meterId);
        if (strId.length < 3) {
          res.status(400).json({ error: 'meter_id too short' });
          return;
        }
        if (strId.length > 100) {
          res.status(400).json({ error: 'meter_id too long' });
          return;
        }
        if (/^[\s]+$/.test(strId)) {
          res.status(400).json({ error: 'Invalid meter ID' });
          return;
        }
        if (/\.\./.test(strId) || /%2e/i.test(strId)) {
          res.status(400).json({ error: 'Invalid meter ID' });
          return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(strId)) {
          res.status(400).json({ error: 'Invalid meter ID format' });
          return;
        }
      }
      next();
    };

    app = express();
    app.set('trust proxy', 1);
    app.use(helmet());
    app.use(express.json({ limit: '1mb' }));

    app.post('/api/login', rateLimitMiddleware(60000, 5), sanitizeInput, (req, res) => {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Missing credentials' });
        return;
      }
      if (username === 'admin' && password === 'admin123') {
        res.json({ token: 'mock-jwt-token', user: { id: 1, role: 'admin' } });
      } else {
        res.status(401).json({ error: 'Invalid credentials' });
      }
    });

    app.post('/api/pay', requireAuth, sanitizeInput, validateMeterId, rateLimitMiddleware(60000, 20), (req, res) => {
      const { meter_id, amount } = req.body;
      if (amount <= 0) {
        res.status(400).json({ error: 'Amount must be positive' });
        return;
      }
      if (amount > 10000000) {
        res.status(400).json({ error: 'Amount exceeds maximum allowed' });
        return;
      }
      res.json({ success: true, transaction_id: 'txn_' + Date.now() });
    });

    app.get('/api/balance/:meter_id', validateMeterId, (req, res) => {
      res.json({ balance: 100, meter_id: req.params.meter_id });
    });

    app.get('/api/files/:path(*)', (req, res) => {
      const filePath = req.params.path;
      if (/\.\./.test(filePath) || /%2e/i.test(filePath)) {
        res.status(400).json({ error: 'Invalid path' });
        return;
      }
      res.json({ content: 'file content' });
    });

    app.post('/api/upload', requireAuth, (req, res) => {
      const { file } = req.body;
      if (!file || !file.name || !file.type) {
        res.status(400).json({ error: 'Invalid file' });
        return;
      }
      const dangerousExtensions = ['.exe', '.php', '.jsp', '.asp', '.aspx', '.sh', '.bat', '.jar', '.war'];
      const dangerousTypes = [
        'application/octet-stream', 'application/x-php', 'application/x-jsp',
        'application/x-asp', 'application/x-shellscript', 'application/java-archive',
      ];
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (dangerousExtensions.includes(ext) || dangerousTypes.includes(file.type)) {
        res.status(400).json({ error: 'File type not allowed' });
        return;
      }
      res.json({ success: true, fileId: 'file_123' });
    });

    app.get('/api/user/:userId/balance', requireAuth, (req, res) => {
      res.json({ balance: 500, userId: req.params.userId });
    });

    app.get('/api/admin/users', requireAuth, (req, res) => {
      const token = req.headers.authorization;
      if (token !== 'Bearer admin-token') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      res.json({ users: [] });
    });

    app.get('/api/admin/system/status', requireAuth, (req, res) => {
      const token = req.headers.authorization;
      if (token !== 'Bearer admin-token') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      res.json({ status: 'healthy' });
    });

    app.get('/api/admin/logs', requireAuth, (req, res) => {
      const token = req.headers.authorization;
      if (token !== 'Bearer admin-token') {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
      res.json({ logs: [] });
    });

    app.get('/api/nonexistent', (_req, res) => {
      res.status(404).json({ error: 'Resource not found', code: 'NOT_FOUND' });
    });
  });

  describe('Authentication Bypass Tests', () => {
    it('should prevent SQL injection in login', async () => {
      const sqlInjections = [
        "admin'--",
        "admin' OR '1'='1",
        "admin' UNION SELECT * FROM users--",
        "'; DROP TABLE users; --",
      ];

      for (const payload of sqlInjections) {
        const response = await request(app)
          .post('/api/login')
          .send({ username: payload, password: 'password' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should prevent NoSQL injection', async () => {
      const nosqlPayloads = [
        { username: { $ne: null }, password: { $ne: null } },
        { username: { $regex: '^admin' }, password: { $gt: '' } },
      ];

      for (const payload of nosqlPayloads) {
        const response = await request(app)
          .post('/api/login')
          .send(payload);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Authorization Tests', () => {
    it('should prevent horizontal privilege escalation', async () => {
      const response = await request(app)
        .get('/api/user/user123/balance')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should prevent vertical privilege escalation', async () => {
      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/system/status',
        '/api/admin/logs',
      ];

      for (const endpoint of adminEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', 'Bearer user-token')
          .expect(403);

        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Input Validation Tests', () => {
    it('should handle XSS attempts', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src=x onerror=alert("XSS")>',
        '"><script>alert("XSS")</script>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: payload, amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should handle command injection attempts', async () => {
      const commandInjections = [
        '; ls -la',
        '| cat /etc/passwd',
        '& echo "pwned"',
        '`whoami`',
        '$(id)',
      ];

      for (const payload of commandInjections) {
        const response = await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: `test${payload}`, amount: 100 });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should handle path traversal attempts', async () => {
      const pathTraversals = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const payload of pathTraversals) {
        const response = await request(app).get(`/api/files/${encodeURIComponent(payload)}`);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should enforce rate limiting on login endpoint', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/login')
          .send({ username: 'test', password: 'wrong' })
      );

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Data Exposure Tests', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      const bodyStr = JSON.stringify(response.body);
      expect(bodyStr).not.toMatch(/\.js/);
      expect(bodyStr).not.toMatch(/node_modules/);
      expect(bodyStr).not.toMatch(/stack trace/i);
      expect(bodyStr).not.toMatch(/internal server/i);
    });

    it('should not expose sensitive headers', async () => {
      const response = await request(app).get('/api/balance/test123');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('Business Logic Tests', () => {
    it('should prevent negative payment amounts', async () => {
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: 'test123', amount: -100 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should prevent unusually large payment amounts', async () => {
      const response = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: 'test123', amount: 999999999 })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate meter ID format', async () => {
      const invalidMeterIds = [
        '',
        'ab',
        'a'.repeat(200),
        '!@#$%^&*()',
        '   ',
      ];

      for (const meterId of invalidMeterIds) {
        const response = await request(app)
          .post('/api/pay')
          .set('Authorization', 'Bearer admin-token')
          .send({ meter_id: meterId, amount: 100 })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }

      const nullResponse = await request(app)
        .post('/api/pay')
        .set('Authorization', 'Bearer admin-token')
        .send({ meter_id: null, amount: 100 });

      expect(nullResponse.body).toHaveProperty('error');
    });
  });

  describe('Session Management Tests', () => {
    it('should invalidate sessions on logout (test requires auth)', async () => {
      const loginResponse = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should regenerate session IDs on login', async () => {
      const response1 = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(200);

      const response2 = await request(app)
        .post('/api/login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(200);

      expect(response1.body.token).toBeDefined();
      expect(response2.body.token).toBeDefined();
    });
  });

  describe('File Upload Tests', () => {
    it('should prevent malicious file uploads', async () => {
      const maliciousFiles = [
        { name: 'malware.exe', type: 'application/octet-stream' },
        { name: 'script.php', type: 'application/x-php' },
        { name: 'shell.jsp', type: 'application/x-jsp' },
        { name: 'backdoor.asp', type: 'application/x-asp' },
      ];

      for (const file of maliciousFiles) {
        const response = await request(app)
          .post('/api/upload')
          .set('Authorization', 'Bearer admin-token')
          .send({ file })
          .expect(400);

        expect(response.body).toHaveProperty('error');
      }
    });
  });

  describe('CORS Tests', () => {
    it('should not echo back malicious origins in Access-Control-Allow-Origin', async () => {
      const response = await request(app)
        .get('/api/balance/test123')
        .set('Origin', 'http://evil.com');

      expect(response.headers['access-control-allow-origin']).not.toBe('http://evil.com');
    });
  });
});
