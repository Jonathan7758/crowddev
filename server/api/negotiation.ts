import { Router, Request, Response } from 'express';
import { sessionRepo } from '../db/repository.js';
import { negotiationEngine } from '../services/negotiation-engine.js';
import { logger } from '../logger.js';
import type { NegotiationEvent } from '../../src/types/message.js';

const router = Router();

// Map running statuses back to their previous stable status for rollback
const ROLLBACK_MAP: Record<string, string> = {
  opinions_running: 'created',
  analysis_running: 'opinions_done',
  debate_running: 'analysis_done',
  consensus_running: 'debate_done',
  prd_check_running: 'consensus_reached',
};

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
  sessionId: string,
  generator: AsyncGenerator<NegotiationEvent>
): Promise<void> {
  let closed = false;
  let receivedComplete = false;

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
      if (event.event === 'complete') {
        receivedComplete = true;
      }
    }
  } catch (error: any) {
    logger.error('Negotiation stream error', { error: error.message, sessionId });

    // Rollback session status on error
    try {
      const session = sessionRepo.getById(sessionId);
      if (session) {
        const rollbackTo = ROLLBACK_MAP[session.status];
        if (rollbackTo) {
          sessionRepo.updateStatus(sessionId, rollbackTo as any);
          logger.info(`Rolled back session ${sessionId} from ${session.status} to ${rollbackTo}`);
        }
      }
    } catch (rollbackErr: any) {
      logger.error('Failed to rollback session status', { error: rollbackErr.message });
    }

    if (!closed) {
      sendSSE(res, { event: 'error', error: error.message });
      // Send a complete event so the client knows the stream is done
      sendSSE(res, { event: 'complete', sessionStatus: ROLLBACK_MAP[sessionRepo.getById(sessionId)?.status || ''] || 'created' });
    }
  } finally {
    clearInterval(keepAlive);

    // If no complete event was received and no error, rollback as safety net
    if (!receivedComplete && !closed) {
      try {
        const session = sessionRepo.getById(sessionId);
        if (session) {
          const rollbackTo = ROLLBACK_MAP[session.status];
          if (rollbackTo) {
            sessionRepo.updateStatus(sessionId, rollbackTo as any);
            logger.warn(`Safety rollback: session ${sessionId} from ${session.status} to ${rollbackTo}`);
          }
        }
      } catch {
        // ignore
      }
    }

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
  await streamGenerator(req, res, session.id, negotiationEngine.runOpinions(session));
});

router.post('/:sessionId/analysis', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, session.id, negotiationEngine.runAnalysis(session));
});

router.post('/:sessionId/debate', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, session.id, negotiationEngine.runDebate(session, req.body?.moderatorPrompt));
});

router.post('/:sessionId/consensus', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, session.id, negotiationEngine.runConsensus(session));
});

router.post('/:sessionId/prd-check', async (req: Request, res: Response) => {
  const session = sessionRepo.getById(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  setupSSE(res);
  await streamGenerator(req, res, session.id, negotiationEngine.runPrdCheck(session));
});

export default router;
