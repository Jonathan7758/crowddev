export interface RoleInput {
  name: string;
  title: string;
  organization: string;
  avatar: string;
  responsibilities: string[];
  decisionPowers: string[];
  expertise: string[];
  personality: string[];
  concerns: string[];
}

export interface VersionRecord {
  version: string;
  date: string;
  notes: string;
  changedFields?: string[];
}

export interface Role extends RoleInput {
  id: string;
  version: string;
  history: VersionRecord[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type Phase = 'design' | 'acceptance' | 'operations';
