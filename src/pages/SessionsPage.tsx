import { useEffect, useState, useRef } from 'react';
import { useSessionStore } from '@/stores/session-store';
import { useRoleStore } from '@/stores/role-store';
import { Plus, Play, Search, Zap, MessageSquare, Handshake, FileCheck, Trash2, Rocket, Download } from 'lucide-react';
import { renderMarkdown } from '@/utils/markdown';
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
  const { sessions, activeSessionId, messages, loading, negotiationLoading, negotiationStep, thinkingRole, error, fetchSessions, setActiveSession, createSession, deleteSession, runOpinions, runAnalysis, runDebate, runConsensus, runPrdCheck, runFull } = useSessionStore();
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
      case 'full': return s === 'created';
      default: return false;
    }
  };

  const hasCompletedSessions = sessions.some(s => s.status === 'prd_check_done' || s.status === 'consensus_reached');

  const handleDownloadSummary = () => {
    window.open('/api/evolution/summary/download', '_blank');
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
            <div key={s.id} className="group relative">
              <button
                onClick={() => setActiveSession(s.id)}
                className={clsx(
                  'w-full text-left p-3 rounded-lg text-sm transition-colors',
                  s.id === activeSessionId ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-gray-700'
                )}
              >
                <div className="font-medium truncate pr-6">{s.topic}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Tag color={PHASE_COLORS[s.phase] as any}>{PHASE_LABELS[s.phase]}</Tag>
                  <span className="text-xs text-gray-500">{STATUS_LABELS[s.status]}</span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('确定删除此会话？')) deleteSession(s.id); }}
                className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
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
            <div className="p-3 border-b border-gray-700 flex flex-col gap-2">
              {/* Primary: auto-run all + download */}
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!canRun('full')} onClick={() => runFull(activeSession.id)}>
                  <Rocket size={14} className="mr-1" /> 一键协商
                </Button>
                {hasCompletedSessions && (
                  <Button size="sm" variant="secondary" onClick={handleDownloadSummary}>
                    <Download size={14} className="mr-1" /> 下载汇总
                  </Button>
                )}
                <span className="text-xs text-gray-500 ml-2">自动执行：表态→分析→辩论→共识→PRD检查</span>
              </div>
              {/* Manual step-by-step controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">分步执行：</span>
                <Button size="sm" variant="secondary" disabled={!canRun('opinions')} onClick={() => runOpinions(activeSession.id)}>
                  <Play size={14} className="mr-1" /> 表态
                </Button>
                <Button size="sm" variant="secondary" disabled={!canRun('analysis')} onClick={() => runAnalysis(activeSession.id)}>
                  <Search size={14} className="mr-1" /> 分析
                </Button>
                <Button size="sm" variant="secondary" disabled={!canRun('debate')} onClick={() => runDebate(activeSession.id, moderatorInput || undefined)}>
                  <Zap size={14} className="mr-1" /> 辩论
                </Button>
                <Button size="sm" variant="secondary" disabled={!canRun('consensus')} onClick={() => runConsensus(activeSession.id)}>
                  <Handshake size={14} className="mr-1" /> 共识
                </Button>
                <Button size="sm" variant="secondary" disabled={!canRun('prd-check')} onClick={() => runPrdCheck(activeSession.id)}>
                  <FileCheck size={14} className="mr-1" /> PRD
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
            </div>

            {/* Negotiation Progress */}
            <NegotiationProgress status={activeSession.status} />

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {thinkingRole && negotiationLoading && (
                <div className="flex items-center gap-3 text-sm text-gray-400 bg-gray-800/60 rounded-lg px-4 py-3 border border-gray-700/50">
                  <div className="relative flex items-center justify-center w-5 h-5">
                    <div className="absolute w-5 h-5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                  </div>
                  <span className="animate-pulse">
                    <span className="font-medium text-gray-300">{thinkingRole}</span>
                    {' '}正在{negotiationStep}...
                  </span>
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

  return (
    <div className={clsx('border-l-4 rounded-lg bg-gray-800 p-4', style.border)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {message.roleAvatar && <span className="text-lg">{message.roleAvatar}</span>}
          <span className="font-medium text-sm">{message.roleName || '协商引擎'}</span>
          <Tag color={style.color as any}>{style.label}</Tag>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(message.createdAt).toLocaleTimeString('zh-CN')}
        </span>
      </div>
      <div
        className="text-sm text-gray-300 max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:text-gray-400 [&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_a]:text-blue-400 [&_a]:underline [&_strong]:text-gray-200 [&_em]:text-gray-300"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
      />
    </div>
  );
}

function NegotiationProgress({ status }: { status: string }) {
  const steps = [
    { key: 'opinions', label: '表态', doneStatus: ['opinions_done', 'analysis_running', 'analysis_done', 'debate_running', 'debate_done', 'consensus_running', 'consensus_reached', 'prd_check_running', 'prd_check_done'] },
    { key: 'analysis', label: '分析', doneStatus: ['analysis_done', 'debate_running', 'debate_done', 'consensus_running', 'consensus_reached', 'prd_check_running', 'prd_check_done'] },
    { key: 'debate', label: '辩论', doneStatus: ['debate_done', 'consensus_running', 'consensus_reached', 'prd_check_running', 'prd_check_done'] },
    { key: 'consensus', label: '共识', doneStatus: ['consensus_reached', 'prd_check_running', 'prd_check_done'] },
    { key: 'prd', label: 'PRD', doneStatus: ['prd_check_done'] },
  ];

  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-gray-800/50 border-b border-gray-700">
      {steps.map((step, i) => {
        const isDone = step.doneStatus.includes(status);
        const isRunning = status.includes(step.key) && status.endsWith('_running');
        return (
          <div key={step.key} className="flex items-center">
            <div className={clsx(
              'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              isDone ? 'bg-green-500/20 text-green-400' :
              isRunning ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
              'bg-gray-700/50 text-gray-500'
            )}>
              {isDone && <span>&#10003;</span>}
              {isRunning && <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping" />}
              {step.label}
            </div>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-700 mx-1" />}
          </div>
        );
      })}
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
