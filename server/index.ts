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
app.use(express.json({ limit: '10mb' }));

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

// LLM health check - test Claude API connectivity
app.get('/api/health/llm', async (_req, res) => {
  const start = Date.now();
  try {
    const { claudeClient } = await import('./llm/claude-client.js');
    const result = await claudeClient.complete(
      '你是一个测试助手。',
      [{ role: 'user', content: '请回复"OK"两个字母。' }],
      10
    );
    res.json({
      status: 'ok',
      model: config.anthropic.model,
      response: result.slice(0, 50),
      latencyMs: Date.now() - start,
      apiKeySet: !!config.anthropic.apiKey,
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      model: config.anthropic.model,
      error: error.message,
      latencyMs: Date.now() - start,
      apiKeySet: !!config.anthropic.apiKey,
      apiKeyPrefix: config.anthropic.apiKey?.slice(0, 10) || 'NOT SET',
    });
  }
});

// SSE test endpoint - for debugging proxy buffering
app.get('/api/health/sse-test', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setTimeout(0);
  }
  res.flushHeaders();
  res.write(':connected\n\n');

  let count = 0;
  const interval = setInterval(() => {
    count++;
    res.write(`data: {"count":${count},"time":"${new Date().toISOString()}"}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
    if (count >= 5) {
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Serve static files in production
if (config.nodeEnv === 'production') {
  // In production: dist/server/server/index.js → need to go up to dist/client
  const clientPath = path.resolve(__dirname, '../../client');
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
