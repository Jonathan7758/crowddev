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

export default router;
