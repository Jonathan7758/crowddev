import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database.js';
import { logger } from '../logger.js';
import type { Role, RoleInput } from '../../src/types/role.js';
import type { Session, SessionInput, SessionStatus } from '../../src/types/session.js';
import type { Message, MessageType } from '../../src/types/message.js';

// === Role Repository ===
export const roleRepo = {
  list(): Role[] {
    const rows = getDb().prepare('SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY created_at DESC').all() as any[];
    return rows.map(mapRole);
  },

  getById(id: string): Role | null {
    const row = getDb().prepare('SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    return row ? mapRole(row) : null;
  },

  create(input: RoleInput): Role {
    const id = uuidv4();
    const now = new Date().toISOString();
    const history = JSON.stringify([{ version: '1.0.0', date: now, notes: '初始创建' }]);
    getDb().prepare(`
      INSERT INTO roles (id, name, title, organization, avatar, version, responsibilities, decision_powers, expertise, personality, concerns, history, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.title, input.organization, input.avatar,
      JSON.stringify(input.responsibilities), JSON.stringify(input.decisionPowers),
      JSON.stringify(input.expertise), JSON.stringify(input.personality),
      JSON.stringify(input.concerns), history, now, now
    );
    return roleRepo.getById(id)!;
  },

  update(id: string, input: Partial<RoleInput>, newVersion: string, notes: string): Role | null {
    const existing = roleRepo.getById(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const changedFields = Object.keys(input);
    const history = [...existing.history, { version: newVersion, date: now, notes, changedFields }];

    const fields: string[] = ['version = ?', 'history = ?', 'updated_at = ?'];
    const values: any[] = [newVersion, JSON.stringify(history), now];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.title !== undefined) { fields.push('title = ?'); values.push(input.title); }
    if (input.organization !== undefined) { fields.push('organization = ?'); values.push(input.organization); }
    if (input.avatar !== undefined) { fields.push('avatar = ?'); values.push(input.avatar); }
    if (input.responsibilities !== undefined) { fields.push('responsibilities = ?'); values.push(JSON.stringify(input.responsibilities)); }
    if (input.decisionPowers !== undefined) { fields.push('decision_powers = ?'); values.push(JSON.stringify(input.decisionPowers)); }
    if (input.expertise !== undefined) { fields.push('expertise = ?'); values.push(JSON.stringify(input.expertise)); }
    if (input.personality !== undefined) { fields.push('personality = ?'); values.push(JSON.stringify(input.personality)); }
    if (input.concerns !== undefined) { fields.push('concerns = ?'); values.push(JSON.stringify(input.concerns)); }

    values.push(id);
    getDb().prepare(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return roleRepo.getById(id);
  },

  delete(id: string): boolean {
    const now = new Date().toISOString();
    const result = getDb().prepare('UPDATE roles SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, id);
    return result.changes > 0;
  },
};

// === Session Repository ===
export const sessionRepo = {
  list(): Session[] {
    const rows = getDb().prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as any[];
    return rows.map(mapSession);
  },

  getById(id: string): Session | null {
    const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    return row ? mapSession(row) : null;
  },

  create(input: SessionInput): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO sessions (id, topic, description, phase, participant_ids, status, priority, prd_section, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)
    `).run(
      id, input.topic, input.description || '', input.phase,
      JSON.stringify(input.participantIds), input.priority || 'medium',
      input.prdSection || '', now, now
    );
    return sessionRepo.getById(id)!;
  },

  updateStatus(id: string, status: SessionStatus): boolean {
    const now = new Date().toISOString();
    const result = getDb().prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
    return result.changes > 0;
  },

  delete(id: string): boolean {
    const result = getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  },
};

// === Message Repository ===
export const messageRepo = {
  listBySession(sessionId: string): Message[] {
    const rows = getDb().prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as any[];
    return rows.map(mapMessage);
  },

  listBySessionAndType(sessionId: string, type: MessageType): Message[] {
    const rows = getDb().prepare('SELECT * FROM messages WHERE session_id = ? AND type = ? ORDER BY created_at ASC').all(sessionId, type) as any[];
    return rows.map(mapMessage);
  },

  create(data: { sessionId: string; roleId: string | null; roleName?: string; roleAvatar?: string; type: MessageType; content: string; phase: string }): Message {
    const id = uuidv4();
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO messages (id, session_id, role_id, role_name, role_avatar, type, content, phase, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.sessionId, data.roleId, data.roleName || null, data.roleAvatar || null, data.type, data.content, data.phase, now);
    return { id, sessionId: data.sessionId, roleId: data.roleId, roleName: data.roleName, roleAvatar: data.roleAvatar, type: data.type, content: data.content, phase: data.phase, createdAt: now };
  },
};

// === Evolution Log Repository ===
export const evolutionRepo = {
  log(eventType: string, entityId: string, entityName: string, details: Record<string, unknown>): void {
    const id = uuidv4();
    const now = new Date().toISOString();
    getDb().prepare(`
      INSERT INTO evolution_log (id, event_type, entity_id, entity_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, eventType, entityId, entityName, JSON.stringify(details), now);
  },

  getStats() {
    const db = getDb();
    const totalRoles = (db.prepare('SELECT COUNT(*) as count FROM roles WHERE deleted_at IS NULL').get() as any).count;
    const totalSessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count;
    const totalMessages = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count;
    const totalConsensus = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE type = 'consensus'").get() as any).count;
    const sessionsByPhase = {
      design: (db.prepare("SELECT COUNT(*) as count FROM sessions WHERE phase = 'design'").get() as any).count,
      acceptance: (db.prepare("SELECT COUNT(*) as count FROM sessions WHERE phase = 'acceptance'").get() as any).count,
      operations: (db.prepare("SELECT COUNT(*) as count FROM sessions WHERE phase = 'operations'").get() as any).count,
    };
    return { totalRoles, totalSessions, totalMessages, totalConsensus, sessionsByPhase };
  },

  getTimeline(limit: number = 50) {
    const rows = getDb().prepare('SELECT * FROM evolution_log ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
    return rows.map((r: any) => ({
      id: r.id,
      eventType: r.event_type,
      entityId: r.entity_id,
      entityName: r.entity_name,
      details: JSON.parse(r.details),
      createdAt: r.created_at,
    }));
  },
};

// === Mappers ===
function mapRole(row: any): Role {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    organization: row.organization,
    avatar: row.avatar,
    version: row.version,
    responsibilities: JSON.parse(row.responsibilities),
    decisionPowers: JSON.parse(row.decision_powers),
    expertise: JSON.parse(row.expertise),
    personality: JSON.parse(row.personality),
    concerns: JSON.parse(row.concerns),
    history: JSON.parse(row.history),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapSession(row: any): Session {
  return {
    id: row.id,
    topic: row.topic,
    description: row.description,
    phase: row.phase,
    participantIds: JSON.parse(row.participant_ids),
    status: row.status,
    priority: row.priority,
    prdSection: row.prd_section,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    roleId: row.role_id,
    roleName: row.role_name,
    roleAvatar: row.role_avatar,
    type: row.type,
    content: row.content,
    phase: row.phase,
    createdAt: row.created_at,
  };
}
