import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';
import { initDb } from './db/database.js';
import { roleRepo } from './db/repository.js';
import { presetRoles } from './services/preset-roles.js';
import rolesRouter from './api/roles.js';
import sessionsRouter from './api/sessions.js';
import negotiationRouter from './api/negotiation.js';
import documentsRouter from './api/documents.js';
import evolutionRouter from './api/evolution.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Request logging
if (config.log.api) {
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/roles', rolesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/negotiation', negotiationRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/evolution', evolutionRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    server: 'ok',
    database: 'ok',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

// Serve static files in production
if (config.nodeEnv === 'production') {
  const clientPath = path.resolve(__dirname, '../client');
  app.use(express.static(clientPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Initialize DB and start server
async function start() {
  await initDb();

  // Load preset roles if none exist
  const existingRoles = roleRepo.list();
  if (existingRoles.length === 0) {
    logger.info('Loading preset roles...');
    for (const role of presetRoles) {
      roleRepo.create(role);
      logger.info(`Created preset role: ${role.name}`);
    }
  }

  app.listen(config.port, () => {
    logger.info(`CrowdDev server running on port ${config.port} (${config.nodeEnv})`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});

export default app;
