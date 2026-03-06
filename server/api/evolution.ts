import { Router } from 'express';
import { evolutionRepo } from '../db/repository.js';

const router = Router();

router.get('/stats', (_req, res) => {
  const stats = evolutionRepo.getStats();
  res.json(stats);
});

router.get('/timeline', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const timeline = evolutionRepo.getTimeline(limit);
  res.json(timeline);
});

export default router;
