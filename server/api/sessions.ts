import { Router } from 'express';
import { z } from 'zod';
import { sessionRepo, messageRepo } from '../db/repository.js';

const router = Router();

const sessionInputSchema = z.object({
  topic: z.string().min(1),
  description: z.string().optional(),
  phase: z.enum(['design', 'acceptance', 'operations']),
  participantIds: z.array(z.string()).min(1),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  prdSection: z.string().optional(),
});

router.get('/', (_req, res) => {
  res.json(sessionRepo.list());
});

router.get('/:id', (req, res) => {
  const session = sessionRepo.getById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

router.post('/', (req, res) => {
  const parsed = sessionInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
  const session = sessionRepo.create(parsed.data);
  res.status(201).json(session);
});

router.delete('/:id', (req, res) => {
  const deleted = sessionRepo.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Session not found' });
  res.status(204).send();
});

router.get('/:id/messages', (req, res) => {
  const type = req.query.type as string | undefined;
  if (type) {
    res.json(messageRepo.listBySessionAndType(req.params.id, type as any));
  } else {
    res.json(messageRepo.listBySession(req.params.id));
  }
});

// Reset a stuck session back to the appropriate previous status
router.post('/:id/reset', (req, res) => {
  const session = sessionRepo.getById(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Map running statuses back to their previous stable status
  const resetMap: Record<string, string> = {
    opinions_running: 'created',
    analysis_running: 'opinions_done',
    debate_running: 'analysis_done',
    consensus_running: 'debate_done',
    prd_check_running: 'consensus_reached',
  };

  const resetTo = resetMap[session.status];
  if (!resetTo) {
    return res.status(400).json({ error: `会话状态 "${session.status}" 不需要重置` });
  }

  sessionRepo.updateStatus(session.id, resetTo as any);
  const updated = sessionRepo.getById(session.id);
  res.json(updated);
});

export default router;
