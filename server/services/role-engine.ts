import { roleRepo, evolutionRepo } from '../db/repository.js';
import { buildRolePrompt } from '../llm/prompt-builder.js';
import type { Role, RoleInput, Phase } from '../../src/types/role.js';

const CRITICAL_FIELDS = new Set(['concerns', 'personality', 'decisionPowers', 'expertise']);

function bumpVersion(current: string, changedFields: string[]): string {
  const [major, minor, patch] = current.split('.').map(Number);
  const isCritical = changedFields.some(f => CRITICAL_FIELDS.has(f));
  if (isCritical) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
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
};
