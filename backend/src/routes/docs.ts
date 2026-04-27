import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import * as yaml from 'js-yaml';

const router = Router();

// Load Swagger specification
const swaggerPath = path.join(__dirname, '../swagger.yaml');
let swaggerDocument: any;

try {
  const swaggerFile = fs.readFileSync(swaggerPath, 'utf8');
  swaggerDocument = yaml.load(swaggerFile);
} catch (error) {
  console.error('Error loading Swagger specification:', error);
  swaggerDocument = { openapi: '3.0.0', info: { title: 'API Documentation', version: '1.0.0' } };
}

// Serve Swagger UI
router.use('/', swaggerUi.serve);

// Get Swagger JSON specification
router.get('/json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerDocument);
});

// Get Swagger YAML specification
router.get('/yaml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(fs.readFileSync(swaggerPath, 'utf8'));
});

// Custom Swagger UI configuration
router.get('/', swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Wata-Board API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'none',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
  }
}));

export default router;
