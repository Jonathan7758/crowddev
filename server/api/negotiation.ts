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
}

function sendSSE(res: Response, event: NegotiationEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function streamGenerator(res: Response, generator: AsyncGenerator<NegotiationEvent>): Promise<void> {
  try {
    for await (const event of generator) {
      sendSSE(res, event);
    }
  } catch (error: any) {
    sendSSE(res, { event: 'error', error: error.message });
  } finally {
    res.end();
  }
}

router.post('/:sessionId/opinions', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(res, negotiationEngine.runOpinions(session));
});

router.post('/:sessionId/analysis', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(res, negotiationEngine.runAnalysis(session));
});

router.post('/:sessionId/debate', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(res, negotiationEngine.runDebate(session, req.body?.moderatorPrompt));
});

router.post('/:sessionId/consensus', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(res, negotiationEngine.runConsensus(session));
});

router.post('/:sessionId/prd-check', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(res, negotiationEngine.runPrdCheck(session));
});

export default router;
