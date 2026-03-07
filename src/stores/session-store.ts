import { create } from 'zustand';
import { api } from '@/api/client';
import { consumeSSE } from '@/api/sse-client';
import type { Session, SessionInput } from '@/types/session';
import type { Message, NegotiationEvent } from '@/types/message';

interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, Message[]>;
  loading: boolean;
  negotiationLoading: boolean;
  negotiationStep: string | null;
  thinkingRole: string | null;
  error: string | null;
  fetchSessions: () => Promise<void>;
  createSession: (input: SessionInput) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  fetchMessages: (sessionId: string) => Promise<void>;
  runOpinions: (sessionId: string) => Promise<void>;
  runAnalysis: (sessionId: string) => Promise<void>;
  runDebate: (sessionId: string, moderatorPrompt?: string) => Promise<void>;
  runConsensus: (sessionId: string) => Promise<void>;
  runPrdCheck: (sessionId: string) => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: {},
  loading: false,
  negotiationLoading: false,
  negotiationStep: null,
  thinkingRole: null,
  error: null,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await api.get<Session[]>('/sessions');
      set({ sessions, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createSession: async (input: SessionInput) => {
    const session = await api.post<Session>('/sessions', input);
    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  deleteSession: async (id: string) => {
    await api.delete(`/sessions/${id}`);
    const state = get();
    set({
      sessions: state.sessions.filter(s => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    });
  },

  setActiveSession: (id: string) => {
    set({ activeSessionId: id });
    get().fetchMessages(id);
  },

  fetchMessages: async (sessionId: string) => {
    const msgs = await api.get<Message[]>(`/sessions/${sessionId}/messages`);
    set({ messages: { ...get().messages, [sessionId]: msgs } });
  },

  runOpinions: (sessionId) => runNegotiationStep(sessionId, 'opinions', '表态'),
  runAnalysis: (sessionId) => runNegotiationStep(sessionId, 'analysis', '分析'),
  runDebate: (sessionId, moderatorPrompt) => runNegotiationStep(sessionId, 'debate', '辩论', { moderatorPrompt }),
  runConsensus: (sessionId) => runNegotiationStep(sessionId, 'consensus', '共识'),
  runPrdCheck: (sessionId) => runNegotiationStep(sessionId, 'prd-check', 'PRD检查'),
}));

async function runNegotiationStep(sessionId: string, endpoint: string, label: string, body?: unknown) {
  const store = useSessionStore;
  store.setState({ negotiationLoading: true, negotiationStep: label, error: null });

  const handleEvent = (event: NegotiationEvent) => {
    const state = store.getState();
    const currentMsgs = state.messages[sessionId] || [];

    switch (event.event) {
      case 'role_thinking':
        store.setState({ thinkingRole: event.roleName });
        break;
      case 'role_done':
      case 'analysis_done':
      case 'consensus_done':
      case 'prd_check_done':
        store.setState({
          messages: { ...state.messages, [sessionId]: [...currentMsgs, event.message] },
          thinkingRole: null,
        });
        break;
      case 'complete':
        store.setState({
          sessions: state.sessions.map(s =>
            s.id === sessionId ? { ...s, status: event.sessionStatus as any } : s
          ),
          negotiationLoading: false,
          negotiationStep: null,
          thinkingRole: null,
        });
        break;
      case 'error':
        store.setState({ error: event.error });
        break;
    }
  };

  try {
    await consumeSSE(`/api/negotiation/${sessionId}/${endpoint}`, body || {}, handleEvent);
  } catch (e: any) {
    store.setState({ error: e.message });
  } finally {
    // Always reset loading state when SSE stream ends, regardless of how it ended.
    // Also refresh session list to get the latest status from server.
    const state = store.getState();
    if (state.negotiationLoading) {
      store.setState({ negotiationLoading: false, negotiationStep: null, thinkingRole: null });
    }
    // Refresh sessions and messages to sync with server state
    try {
      const sessions = await api.get<Session[]>('/sessions');
      const msgs = await api.get<Message[]>(`/sessions/${sessionId}/messages`);
      store.setState({
        sessions,
        messages: { ...store.getState().messages, [sessionId]: msgs },
      });
    } catch {
      // Ignore refresh errors
    }
  }
}
