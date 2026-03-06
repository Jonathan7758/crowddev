import { Router } from 'express';
import { evolutionRepo } from '../db/repository.js';
import { roleEngine } from '../services/role-engine.js';
import { getDb } from '../db/database.js';

const router = Router();

// Get overall stats
router.get('/stats', (_req, res) => {
  const stats = evolutionRepo.getStats();
  res.json(stats);
});

// Get event timeline
router.get('/timeline', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const timeline = evolutionRepo.getTimeline(limit);
  res.json(timeline);
});

// Get role-specific evolution data
router.get('/roles/:roleId', (req, res) => {
  const role = roleEngine.getById(req.params.roleId);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const stats = roleEngine.getParticipationStats(req.params.roleId);
  const evolution = {
    role: {
      id: role.id,
      name: role.name,
      avatar: role.avatar,
      version: role.version,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    },
    history: role.history,
    stats,
    versionCount: role.history.length,
    hasCriticalChanges: role.history.some(h =>
      h.changedFields?.some(f => ['concerns', 'personality', 'decisionPowers', 'expertise'].includes(f))
    ),
  };

  res.json(evolution);
});

// Get role version diff history
router.get('/roles/:roleId/diff', (req, res) => {
  const role = roleEngine.getById(req.params.roleId);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const versionDiffs = role.history.map((entry, index) => ({
    version: entry.version,
    date: entry.date,
    notes: entry.notes,
    changedFields: entry.changedFields || [],
    hasCriticalChanges: (entry.changedFields || []).some(f =>
      ['concerns', 'personality', 'decisionPowers', 'expertise'].includes(f)
    ),
    isInitial: index === 0,
  }));

  res.json({
    roleId: role.id,
    roleName: role.name,
    currentVersion: role.version,
    totalVersions: role.history.length,
    versionDiffs,
  });
});

// Get consensus history across all sessions
router.get('/consensus', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  try {
    const db = getDb();
    const consensusMessages = db.prepare(`
      SELECT m.id, m.content, m.phase, m.created_at, s.topic, s.id as session_id
      FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE m.type = 'consensus'
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    const result = consensusMessages.map((row: any) => ({
      id: row.id,
      sessionId: row.session_id,
      topic: row.topic,
      phase: row.phase,
      content: row.content,
      createdAt: row.created_at,
    }));

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
