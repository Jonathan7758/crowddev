import { Router } from 'express';
import { z } from 'zod';
import { roleEngine } from '../services/role-engine.js';
import { logger } from '../logger.js';

const router = Router();

const roleInputSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  organization: z.string().min(1),
  avatar: z.string().min(1),
  responsibilities: z.array(z.string()),
  decisionPowers: z.array(z.string()),
  expertise: z.array(z.string()),
  personality: z.array(z.string()),
  concerns: z.array(z.string()),
});

router.get('/', (_req, res) => {
  const roles = roleEngine.list();
  res.json(roles);
});

router.get('/:id', (req, res) => {
  const role = roleEngine.getById(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  res.json(role);
});

router.post('/', (req, res) => {
  const parsed = roleInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
  const role = roleEngine.create(parsed.data);
  res.status(201).json(role);
});

router.patch('/:id', (req, res) => {
  const partial = roleInputSchema.partial().safeParse(req.body);
  if (!partial.success) return res.status(400).json({ error: partial.error.errors });
  const role = roleEngine.update(req.params.id, partial.data, req.body.notes);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  res.json(role);
});

router.delete('/:id', (req, res) => {
  const deleted = roleEngine.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Role not found' });
  res.status(204).send();
});

// Get role participation stats
router.get('/:id/stats', (req, res) => {
  const role = roleEngine.getById(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  const stats = roleEngine.getParticipationStats(req.params.id);
  res.json(stats);
});

// Get role version history
router.get('/:id/history', (req, res) => {
  const role = roleEngine.getById(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  res.json({
    roleId: role.id,
    roleName: role.name,
    currentVersion: role.version,
    history: role.history,
  });
});

export default router;
