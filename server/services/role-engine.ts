import { roleRepo, evolutionRepo } from '../db/repository.js';
import { getDb } from '../db/database.js';
import { buildRolePrompt } from '../llm/prompt-builder.js';
import type { Role, RoleInput, Phase } from '../../src/types/role.js';

export const CRITICAL_FIELDS = new Set(['concerns', 'personality', 'decisionPowers', 'expertise']);

export function bumpVersion(current: string, changedFields: string[]): string {
  const [major, minor, patch] = current.split('.').map(Number);
  const isCritical = changedFields.some(f => CRITICAL_FIELDS.has(f));
  if (isCritical) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export interface FieldDiff {
  field: string;
  label: string;
  type: 'scalar' | 'array';
  oldValue: string | string[];
  newValue: string | string[];
  isCritical: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  name: '名称',
  title: '职位',
  organization: '组织',
  avatar: '头像',
  responsibilities: '职责',
  decisionPowers: '决策权限',
  expertise: '专业背景',
  personality: '性格特征',
  concerns: '核心关切',
};

/**
 * Compare two role states and return the differences
 */
function diffRoleFields(roleA: Role, roleB: Role): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const scalarFields: Array<keyof RoleInput> = ['name', 'title', 'organization', 'avatar'];
  const arrayFields: Array<keyof RoleInput> = ['responsibilities', 'decisionPowers', 'expertise', 'personality', 'concerns'];

  for (const field of scalarFields) {
    if (roleA[field] !== roleB[field]) {
      diffs.push({
        field,
        label: FIELD_LABELS[field] || field,
        type: 'scalar',
        oldValue: roleA[field] as string,
        newValue: roleB[field] as string,
        isCritical: CRITICAL_FIELDS.has(field),
      });
    }
  }

  for (const field of arrayFields) {
    const a = roleA[field] as string[];
    const b = roleB[field] as string[];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push({
        field,
        label: FIELD_LABELS[field] || field,
        type: 'array',
        oldValue: a,
        newValue: b,
        isCritical: CRITICAL_FIELDS.has(field),
      });
    }
  }

  return diffs;
}

export const roleEngine = {
  list(): Role[] {
    return roleRepo.list();
  },

  getById(id: string): Role | null {
    return roleRepo.getById(id);
  },

  create(input: RoleInput): Role {
    const role = roleRepo.create(input);
    evolutionRepo.log('role_created', role.id, role.name, { version: role.version });
    return role;
  },

  update(id: string, input: Partial<RoleInput>, notes?: string): Role | null {
    const existing = roleRepo.getById(id);
    if (!existing) return null;
    const changedFields = Object.keys(input);
    const newVersion = bumpVersion(existing.version, changedFields);
    const role = roleRepo.update(id, input, newVersion, notes || `更新 ${changedFields.join(', ')}`);
    if (role) {
      evolutionRepo.log('role_updated', role.id, role.name, { from: existing.version, to: newVersion, changedFields });
    }
    return role;
  },

  delete(id: string): boolean {
    const role = roleRepo.getById(id);
    if (!role) return false;
    const result = roleRepo.delete(id);
    if (result) {
      evolutionRepo.log('role_deleted', id, role.name, {});
    }
    return result;
  },

  buildSystemPrompt(role: Role, phase: Phase, context?: string): string {
    return buildRolePrompt(role, phase, context);
  },

  /**
   * Compare two roles and return field-level differences
   */
  diffRoles(roleA: Role, roleB: Role): FieldDiff[] {
    return diffRoleFields(roleA, roleB);
  },

  /**
   * Get role participation stats across sessions
   */
  getParticipationStats(roleId: string): { totalSessions: number; totalMessages: number; consensusCount: number } {
    const db = getDb();
    const sessionsResult = db.prepare(
      "SELECT COUNT(*) as count FROM sessions WHERE participant_ids LIKE ?"
    ).get(`%${roleId}%`) as any;
    const messagesResult = db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE role_id = ?"
    ).get(roleId) as any;
    const consensusResult = db.prepare(
      "SELECT COUNT(*) as count FROM messages m JOIN sessions s ON m.session_id = s.id WHERE m.type = 'consensus' AND s.participant_ids LIKE ?"
    ).get(`%${roleId}%`) as any;

    return {
      totalSessions: sessionsResult?.count || 0,
      totalMessages: messagesResult?.count || 0,
      consensusCount: consensusResult?.count || 0,
    };
  },
};
