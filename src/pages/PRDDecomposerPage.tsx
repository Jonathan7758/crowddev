import { useState } from 'react';
import { useRoleStore } from '@/stores/role-store';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/api/client';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import clsx from 'clsx';
import type { Section, ScreenedSection, Topic } from '@/types/document';

const STEPS = ['选择文档', '预筛章节', '提取议题'] as const;

export default function PRDDecomposerPage() {
  const { roles, fetchRoles } = useRoleStore();
  const { createSession } = useSessionStore();
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Array<{ filename: string }>>([]);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [sections, setSections] = useState<ScreenedSection[]>([]);
  const [selectedSections, setSelectedSections] = useState<Set<number>>(new Set());
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadDocs = async () => {
    const d = await api.get<Array<{ filename: string }>>('/documents');
    setDocs(d);
    if (roles.length === 0) fetchRoles();
  };

  const screenDoc = async () => {
    if (!selectedDoc) return;
    setLoading(true);
    try {
      const screened = await api.post<ScreenedSection[]>(`/documents/${encodeURIComponent(selectedDoc)}/screen`);
      setSections(screened);
      setSelectedSections(new Set(screened.filter(s => s.score >= 7).map(s => s.index)));
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const extractTopics = async () => {
    setLoading(true);
    try {
      const t = await api.post<Topic[]>('/documents/extract-topics', {
        filename: selectedDoc,
        sectionIndices: Array.from(selectedSections),
      });
      setTopics(t);
      setSelectedTopics(new Set(t.map((_, i) => i)));
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const batchCreate = async () => {
    setLoading(true);
    for (const idx of selectedTopics) {
      const t = topics[idx];
      const roleIds = roles.filter(r => t.involvedRoles.includes(r.name)).map(r => r.id);
      if (roleIds.length > 0) {
        await createSession({ topic: t.topic, description: t.description, phase: 'design', participantIds: roleIds, priority: t.priority, prdSection: t.prdSection });
      }
    }
    setLoading(false);
    setStep(0);
    setTopics([]);
    setSections([]);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">PRD 智能拆解</h1>
      <p className="text-gray-400 text-sm mb-6">从项目文档中提取协商议题</p>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', i <= step ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-500')}>
              {i + 1}
            </div>
            <span className={clsx('text-sm', i <= step ? 'text-gray-200' : 'text-gray-500')}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-12 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <Button variant="secondary" onClick={loadDocs}>加载文档列表</Button>
          <div className="space-y-2">
            {docs.map(d => (
              <button key={d.filename} onClick={() => setSelectedDoc(d.filename)} className={clsx('w-full text-left p-3 rounded-lg border text-sm', selectedDoc === d.filename ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-gray-800 hover:bg-gray-700')}>
                {d.filename}
              </button>
            ))}
          </div>
          {selectedDoc && <Button onClick={screenDoc} disabled={loading}>{loading ? 'AI 预筛中...' : '开始预筛'}</Button>}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set(sections.filter(s => s.score >= 7).map(s => s.index)))}>选高价值</Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set(sections.map(s => s.index)))}>全选</Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set())}>清空</Button>
          </div>
          {sections.map(s => (
            <div key={s.index} onClick={() => { const n = new Set(selectedSections); n.has(s.index) ? n.delete(s.index) : n.add(s.index); setSelectedSections(n); }}
              className={clsx('p-4 rounded-lg border cursor-pointer', selectedSections.has(s.index) ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-gray-800')}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{s.title}</span>
                <div className="flex items-center gap-2">
                  <Tag color={s.value === 'high' ? 'green' : s.value === 'medium' ? 'amber' : 'gray'}>{s.score}/10</Tag>
                </div>
              </div>
              <p className="text-xs text-gray-400">{s.reason}</p>
              {s.conflictHint && <p className="text-xs text-amber-400 mt-1">{s.conflictHint}</p>}
            </div>
          ))}
          <Button onClick={extractTopics} disabled={selectedSections.size === 0 || loading}>{loading ? '提取中...' : `提取议题 (${selectedSections.size} 章节)`}</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {topics.map((t, i) => (
            <div key={i} onClick={() => { const n = new Set(selectedTopics); n.has(i) ? n.delete(i) : n.add(i); setSelectedTopics(n); }}
              className={clsx('p-4 rounded-lg border cursor-pointer', selectedTopics.has(i) ? 'border-blue-500 bg-blue-600/10' : 'border-gray-700 bg-gray-800')}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{t.topic}</span>
                <Tag color={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'gray'}>{t.priority}</Tag>
              </div>
              <p className="text-sm text-gray-400">{t.description}</p>
              <div className="flex gap-1 mt-2">
                {t.involvedRoles.map(r => <Tag key={r} color="blue">{r}</Tag>)}
              </div>
            </div>
          ))}
          <Button onClick={batchCreate} disabled={selectedTopics.size === 0 || loading}>{loading ? '创建中...' : `批量创建会话 (${selectedTopics.size} 个)`}</Button>
        </div>
      )}
    </div>
  );
}
