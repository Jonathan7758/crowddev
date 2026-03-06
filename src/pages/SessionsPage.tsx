import { useEffect, useState, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useRoleStore } from '@/stores/role-store';
import { Plus, Play, Search, Zap, MessageSquare, Handshake, FileCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Tag from '@/components/ui/Tag';
import clsx from 'clsx';
import type { SessionInput } from '@/types/session';
import type { Message } from '@/types/message';

const STATUS_LABELS: Record<string, string> = {
  created: '已创建',
  opinions_running: '表态中...',
  opinions_done: '表态完成',
  analysis_running: '分析中...',
  analysis_done: '分析完成',
  debate_running: '辩论中...',
  debate_done: '辩论完成',
  consensus_running: '生成共识...',
  consensus_reached: '已达成共识',
  prd_check_running: 'PRD检查中...',
  prd_check_done: 'PRD已更新',
};

const TYPE_STYLES: Record<string, { border: string; label: string; color: string }> = {
  opinion: { border: 'border-l-blue-500', label: '立场表态', color: 'blue' },
  analysis: { border: 'border-l-purple-500', label: '冲突分析', color: 'purple' },
  rebuttal: { border: 'border-l-amber-500', label: '辩论回应', color: 'amber' },
  consensus: { border: 'border-l-green-500', label: '共识方案', color: 'green' },
  prd_update: { border: 'border-l-emerald-500', label: 'PRD更新', color: 'green' },
};

const PHASE_COLORS: Record<string, string> = {
  design: 'blue',
  acceptance: 'amber',
  operations: 'green',
};

const PHASE_LABELS: Record<string, string> = {
  design: '设计期',
  acceptance: '验收期',
  operations: '运营期',
};

export default function SessionsPage() {
  const { sessions, activeSessionId, messages, loading, negotiationLoading, negotiationStep, thinkingRole, error, fetchSessions, setActiveSession, createSession, runOpinions, runAnalysis, runDebate, runConsensus, runPrdCheck } = useSessionStore();
  const { roles, fetchRoles } = useRoleStore();
  const [showNew, setShowNew] = useState(false);
  const [moderatorInput, setModeratorInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchSessions(); fetchRoles(); }, []);

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const activeMessages = activeSessionId ? messages[activeSessionId] || [] : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const canRun = (step: string) => {
    if (!activeSession || negotiationLoading) return false;
    const s = activeSession.status;
    switch (step) {
      case 'opinions': return s === 'created';
      case 'analysis': return s === 'opinions_done';
      case 'debate': return s === 'analysis_done' || s === 'debate_done';
      case 'consensus': return s === 'analysis_done' || s === 'debate_done';
      case 'prd-check': return s === 'consensus_reached';
      default: return false;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-72 bg-gray-800/50 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold">会话列表</h2>
          <Button size="sm" onClick={() => setShowNew(true)}><Plus size={14} /></Button>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={clsx(
                'w-full text-left p-3 rounded-lg text-sm transition-colors',
                s.id === activeSessionId ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-gray-700'
              )}
            >
              <div className="font-medium truncate">{s.topic}</div>
              <div className="flex items-center gap-2 mt-1">
                <Tag color={PHASE_COLORS[s.phase] as any}>{PHASE_LABELS[s.phase]}</Tag>
                <span className="text-xs text-gray-500">{STATUS_LABELS[s.status]}</span>
              </div>
            </button>
          ))}
          {sessions.length === 0 && !loading && (
            <p className="text-center text-gray-500 text-sm py-8">暂无会话</p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {activeSession ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-800/30">
              <h2 className="text-lg font-semibold">{activeSession.topic}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Tag color={PHASE_COLORS[activeSession.phase] as any}>{PHASE_LABELS[activeSession.phase]}</Tag>
                <span className="text-sm text-gray-400">{STATUS_LABELS[activeSession.status]}</span>
                {error && <span className="text-sm text-red-400">{error}</span>}
              </div>
            </div>

            {/* Action bar */}
            <div className="p-3 border-b border-gray-700 flex items-center gap-2 flex-wrap">
              <Button size="sm" disabled={!canRun('opinions')} onClick={() => runOpinions(activeSession.id)}>
                <Play size={14} className="mr-1" /> 启动表态
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRun('analysis')} onClick={() => runAnalysis(activeSession.id)}>
                <Search size={14} className="mr-1" /> 分析冲突
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRun('debate')} onClick={() => runDebate(activeSession.id, moderatorInput || undefined)}>
                <Zap size={14} className="mr-1" /> 辩论回应
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRun('consensus')} onClick={() => runConsensus(activeSession.id)}>
                <Handshake size={14} className="mr-1" /> 寻求共识
              </Button>
              <Button size="sm" variant="secondary" disabled={!canRun('prd-check')} onClick={() => runPrdCheck(activeSession.id)}>
                <FileCheck size={14} className="mr-1" /> PRD检查
              </Button>
              {(canRun('debate')) && (
                <input
                  className="flex-1 min-w-[200px] px-3 py-1 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="引导问题（可选）"
                  value={moderatorInput}
                  onChange={e => setModeratorInput(e.target.value)}
                />
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {thinkingRole && negotiationLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 animate-pulse">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                  {thinkingRole} 正在{negotiationStep}...
                </div>
              )}
              {activeMessages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
              <p>选择一个会话或创建新会话</p>
            </div>
          </div>
        )}
      </div>

      {/* New Session Modal */}
      <NewSessionModal open={showNew} onClose={() => setShowNew(false)} roles={roles} onCreate={async (input) => { await createSession(input); setShowNew(false); }} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const style = TYPE_STYLES[message.type] || TYPE_STYLES.opinion;
  const isSystem = !message.roleId;

  return (
    <div className={clsx('border-l-4 rounded-lg bg-gray-800 p-4', style.border)}>
      <div className="flex items-center gap-2 mb-2">
        {message.roleAvatar && <span className="text-lg">{message.roleAvatar}</span>}
        <span className="font-medium text-sm">{message.roleName || '协商引擎'}</span>
        <Tag color={style.color as any}>{style.label}</Tag>
      </div>
      <div className="text-sm text-gray-300 whitespace-pre-wrap">{message.content}</div>
    </div>
  );
}

function NewSessionModal({ open, onClose, roles, onCreate }: {
  open: boolean;
  onClose: () => void;
  roles: Array<{ id: string; name: string; avatar: string }>;
  onCreate: (input: SessionInput) => Promise<void>;
}) {
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<'design' | 'acceptance' | 'operations'>('design');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleRole = (id: string) => {
    setSelectedRoles(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!topic || selectedRoles.length === 0) return;
    setSubmitting(true);
    await onCreate({ topic, description, phase, participantIds: selectedRoles });
    setSubmitting(false);
    setTopic(''); setDescription(''); setSelectedRoles([]);
  };

  return (
    <Modal open={open} onClose={onClose} title="创建协商会话" width="max-w-xl">
      <div className="space-y-4">
        <Input label="协商议题" value={topic} onChange={e => setTopic(e.target.value)} placeholder="如：视频追踪功能是否需要二次确认？" />
        <TextArea label="议题描述（可选）" value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="对议题的补充说明..." />
        <div>
          <label className="block text-sm text-gray-400 mb-2">协商阶段</label>
          <div className="flex gap-2">
            {(['design', 'acceptance', 'operations'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={clsx('px-3 py-1 rounded-lg text-sm', phase === p ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600')}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">参与角色</label>
          <div className="flex flex-wrap gap-2">
            {roles.map(r => (
              <button
                key={r.id}
                onClick={() => toggleRole(r.id)}
                className={clsx('flex items-center gap-1 px-3 py-1 rounded-lg text-sm border', selectedRoles.includes(r.id) ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-gray-600 bg-gray-700 text-gray-400 hover:bg-gray-600')}
              >
                {r.avatar} {r.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={!topic || selectedRoles.length === 0 || submitting} onClick={handleSubmit}>
            {submitting ? '创建中...' : '创建会话'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
