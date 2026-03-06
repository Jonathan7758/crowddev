import { Router, Request, Response } from 'express';
import { sessionRepo } from '../db/repository.js';
import { negotiationEngine } from '../services/negotiation-engine.js';
import { logger } from '../logger.js';
import type { NegotiationEvent } from '../../src/types/message.js';

const router = Router();

function setupSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Send initial comment to establish connection
  res.write(':ok\n\n');
}

function sendSSE(res: Response, event: NegotiationEvent): void {
  const eventType = event.event;
  res.write(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`);
}

async function streamGenerator(
  req: Request,
  res: Response,
  generator: AsyncGenerator<NegotiationEvent>
): Promise<void> {
  let closed = false;

  // Handle client disconnect
  req.on('close', () => {
    closed = true;
    logger.info('SSE client disconnected');
  });

  // Keep-alive timer
  const keepAlive = setInterval(() => {
    if (!closed) {
      try {
        res.write(':keepalive\n\n');
      } catch {
        closed = true;
      }
    }
  }, 15000);

  try {
    for await (const event of generator) {
      if (closed) break;
      sendSSE(res, event);
    }
  } catch (error: any) {
    if (!closed) {
      sendSSE(res, { event: 'error', error: error.message });
    }
    logger.error('Negotiation stream error', { error: error.message });
  } finally {
    clearInterval(keepAlive);
    if (!closed) {
      res.end();
    }
  }
}

// Re-read session from DB to get latest status
router.post('/:sessionId/opinions', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, negotiationEngine.runOpinions(session));
});

router.post('/:sessionId/analysis', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, negotiationEngine.runAnalysis(session));
});

router.post('/:sessionId/debate', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, negotiationEngine.runDebate(session, req.body?.moderatorPrompt));
});

router.post('/:sessionId/consensus', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, negotiationEngine.runConsensus(session));
});

router.post('/:sessionId/prd-check', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, negotiationEngine.runPrdCheck(session));
});

export default router;
