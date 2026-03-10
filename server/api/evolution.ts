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

// Generate downloadable .md summary of all completed PRD updates
router.get('/summary/download', (_req, res) => {
  try {
    const db = getDb();

    // Get all sessions that have reached prd_check_done
    const completedSessions = db.prepare(`
      SELECT s.id, s.topic, s.description, s.phase, s.status, s.created_at
      FROM sessions s
      WHERE s.status = 'prd_check_done'
      ORDER BY s.created_at ASC
    `).all() as any[];

    const PHASE_LABELS: Record<string, string> = {
      design: '设计期',
      acceptance: '验收期',
      operations: '运营期',
    };

    const lines: string[] = [];
    lines.push('# CrowdDev 协商结果汇总报告');
    lines.push('');
    lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
    lines.push(`> 已完成协商议题：${completedSessions.length} 项`);
    lines.push('');
    lines.push('---');
    lines.push('');

    if (completedSessions.length === 0) {
      lines.push('暂无已完成的协商议题。');
    }

    for (const session of completedSessions) {
      lines.push(`## 议题：${session.topic}`);
      lines.push('');
      lines.push(`- **阶段**：${PHASE_LABELS[session.phase] || session.phase}`);
      if (session.description) {
        lines.push(`- **描述**：${session.description}`);
      }
      lines.push(`- **创建时间**：${new Date(session.created_at).toLocaleString('zh-CN')}`);
      lines.push('');

      // Get consensus message
      const consensusMsgs = db.prepare(`
        SELECT content FROM messages WHERE session_id = ? AND type = 'consensus' ORDER BY created_at DESC LIMIT 1
      `).all(session.id) as any[];

      if (consensusMsgs.length > 0) {
        lines.push('### 共识方案');
        lines.push('');
        lines.push(consensusMsgs[0].content);
        lines.push('');
      }

      // Get PRD update message
      const prdMsgs = db.prepare(`
        SELECT content FROM messages WHERE session_id = ? AND type = 'prd_update' ORDER BY created_at DESC LIMIT 1
      `).all(session.id) as any[];

      if (prdMsgs.length > 0) {
        lines.push('### PRD 更新建议');
        lines.push('');
        lines.push(prdMsgs[0].content);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    // Also include sessions that have reached consensus but not prd_check_done
    const consensusSessions = db.prepare(`
      SELECT s.id, s.topic, s.description, s.phase, s.status, s.created_at
      FROM sessions s
      WHERE s.status IN ('consensus_reached', 'prd_check_running')
      ORDER BY s.created_at ASC
    `).all() as any[];

    if (consensusSessions.length > 0) {
      lines.push('## 已达成共识（PRD检查未完成）');
      lines.push('');
      for (const session of consensusSessions) {
        lines.push(`### 议题：${session.topic}`);
        lines.push('');
        const consensusMsgs = db.prepare(`
          SELECT content FROM messages WHERE session_id = ? AND type = 'consensus' ORDER BY created_at DESC LIMIT 1
        `).all(session.id) as any[];
        if (consensusMsgs.length > 0) {
          lines.push(consensusMsgs[0].content);
          lines.push('');
        }
      }
      lines.push('---');
      lines.push('');
    }

    lines.push('*报告由 CrowdDev 协商引擎自动生成*');

    const content = lines.join('\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crowddev-summary-${new Date().toISOString().slice(0, 10)}.md"`);
    res.send(content);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
