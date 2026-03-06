export type SessionStatus =
  | 'created'
  | 'opinions_running'
  | 'opinions_done'
  | 'analysis_running'
  | 'analysis_done'
  | 'debate_running'
  | 'debate_done'
  | 'consensus_running'
  | 'consensus_reached'
  | 'prd_check_running'
  | 'prd_check_done';

export interface Session {
  id: string;
  topic: string;
  description: string;
  phase: 'design' | 'acceptance' | 'operations';
  participantIds: string[];
  status: SessionStatus;
  priority?: 'high' | 'medium' | 'low';
  prdSection?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionInput {
  topic: string;
  description?: string;
  phase: 'design' | 'acceptance' | 'operations';
  participantIds: string[];
  priority?: 'high' | 'medium' | 'low';
  prdSection?: string;
}
