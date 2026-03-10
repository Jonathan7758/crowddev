export type MessageType =
  | 'opinion'
  | 'analysis'
  | 'rebuttal'
  | 'consensus'
  | 'prd_update';

export interface Message {
  id: string;
  sessionId: string;
  roleId: string | null;
  roleName?: string;
  roleAvatar?: string;
  type: MessageType;
  content: string;
  phase: string;
  createdAt: string;
}

export interface ConflictAnalysis {
  summary: string;
  conflicts: Array<{
    id: string;
    core: string;
    involvedRoles: string[];
    positions: Array<{ roleId: string; position: string }>;
    rootCause: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  focusQuestions: string[];
}

export type NegotiationEvent =
  | { event: 'role_thinking'; roleId: string; roleName: string; step: string }
  | { event: 'role_done'; message: Message }
  | { event: 'analysis_start' }
  | { event: 'analysis_done'; message: Message }
  | { event: 'consensus_start' }
  | { event: 'consensus_done'; message: Message }
  | { event: 'prd_check_done'; message: Message }
  | { event: 'step_progress'; stepLabel: string; stepNumber: number; totalSteps: number }
  | { event: 'error'; error: string }
  | { event: 'complete'; sessionStatus: string };
