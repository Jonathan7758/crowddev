import { create } from 'zustand';
import { api } from '@/api/client';
import type { Role, RoleInput } from '@/types/role';

interface RoleStore {
  roles: Role[];
  loading: boolean;
  error: string | null;
  fetchRoles: () => Promise<void>;
  createRole: (input: RoleInput) => Promise<Role>;
  updateRole: (id: string, input: Partial<RoleInput>, notes?: string) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;
}

export const useRoleStore = create<RoleStore>((set, get) => ({
  roles: [],
  loading: false,
  error: null,

  fetchRoles: async () => {
    set({ loading: true, error: null });
    try {
      const roles = await api.get<Role[]>('/roles');
      set({ roles, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createRole: async (input: RoleInput) => {
    const role = await api.post<Role>('/roles', input);
    set({ roles: [role, ...get().roles] });
    return role;
  },

  updateRole: async (id: string, input: Partial<RoleInput>, notes?: string) => {
    const role = await api.patch<Role>(`/roles/${id}`, { ...input, notes });
    set({ roles: get().roles.map(r => (r.id === id ? role : r)) });
    return role;
  },

  deleteRole: async (id: string) => {
    await api.delete(`/roles/${id}`);
    set({ roles: get().roles.filter(r => r.id !== id) });
  },
}));
