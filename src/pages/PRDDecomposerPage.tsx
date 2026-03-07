import { useState, useEffect } from 'react';
import { useRoleStore } from '@/stores/role-store';
import { useSessionStore } from '@/stores/session-store';
import { api } from '@/api/client';
import Button from '@/components/ui/Button';
import Tag from '@/components/ui/Tag';
import clsx from 'clsx';
import type { ScreenedSection, Topic } from '@/types/document';

const STEPS = ['选择文档', '预筛章节', '提取议题'] as const;

const PHASE_OPTIONS = [
  { value: 'design' as const, label: '设计期', desc: '评审设计方案，暴露需求冲突' },
  { value: 'acceptance' as const, label: '验收期', desc: '验收实现结果，检查偏差和遗漏' },
  { value: 'operations' as const, label: '运营期', desc: '运营反馈优化，调整参数和流程' },
];

export default function PRDDecomposerPage() {
  const { roles, fetchRoles } = useRoleStore();
  const { createSession } = useSessionStore();
  const [step, setStep] = useState(0);
  const [docs, setDocs] = useState<Array<{ filename: string; size?: number }>>([]);
  const [selectedDoc, setSelectedDoc] = useState('');
  const [sections, setSections] = useState<ScreenedSection[]>([]);
  const [selectedSections, setSelectedSections] = useState<Set<number>>(new Set());
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<'design' | 'acceptance' | 'operations'>('design');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);

  useEffect(() => {
    fetchRoles();
    loadDocs();
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<Array<{ filename: string; size?: number }>>('/documents');
      setDocs(d);
      if (d.length === 0) {
        setError('未找到项目文档，请确认 project-docs 目录下有 .md 文件');
      }
    } catch (e: any) {
      setError(`加载文档失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const screenDoc = async () => {
    if (!selectedDoc) return;
    setLoading(true);
    setError(null);
    try {
      const screened = await api.post<ScreenedSection[]>(`/documents/${encodeURIComponent(selectedDoc)}/screen`);
      setSections(screened);
      setSelectedSections(new Set(screened.filter(s => s.score >= 7).map(s => s.index)));
      setStep(1);
    } catch (e: any) {
      setError(`预筛失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const extractTopics = async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await api.post<Topic[]>('/documents/extract-topics', {
        filename: selectedDoc,
        sectionIndices: Array.from(selectedSections),
      });
      setTopics(t);
      setSelectedTopics(new Set(t.map((_, i) => i)));
      setStep(2);
    } catch (e: any) {
      setError(`提取议题失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const batchCreate = async () => {
    setLoading(true);
    setError(null);
    setCreatedCount(0);
    let count = 0;
    for (const idx of selectedTopics) {
      const t = topics[idx];
      const roleIds = roles.filter(r => t.involvedRoles.includes(r.name)).map(r => r.id);
      if (roleIds.length > 0) {
        await createSession({
          topic: t.topic,
          description: t.description,
          phase,
          participantIds: roleIds,
          priority: t.priority,
          prdSection: t.prdSection,
        });
        count++;
        setCreatedCount(count);
      }
    }
    setLoading(false);
    if (count > 0) {
      setStep(0);
      setTopics([]);
      setSections([]);
      setSelectedDoc('');
      setDocs([]);
      setCreatedCount(0);
    }
  };

  const resetAll = () => {
    setStep(0);
    setSelectedDoc('');
    setSections([]);
    setSelectedSections(new Set());
    setTopics([]);
    setSelectedTopics(new Set());
    setError(null);
    setCreatedCount(0);
    loadDocs();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">文档智能拆解</h1>
        {step > 0 && (
          <Button size="sm" variant="ghost" onClick={resetAll}>
            重新开始
          </Button>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-6">从项目文档中提取协商议题，支持设计期、验收期和运营期</p>

      {/* Phase selector */}
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-2">选择协商阶段</label>
        <div className="grid grid-cols-3 gap-3">
          {PHASE_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setPhase(p.value)}
              className={clsx(
                'p-3 rounded-lg border text-left transition-colors',
                phase === p.value
                  ? 'border-blue-500 bg-blue-600/15 text-blue-300'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              )}
            >
              <div className="font-medium text-sm">{p.label}</div>
              <div className="text-xs mt-1 opacity-70">{p.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
              i < step ? 'bg-green-600 text-white' :
              i === step ? 'bg-blue-600 text-white' :
              'bg-gray-700 text-gray-500'
            )}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={clsx('text-sm', i <= step ? 'text-gray-200' : 'text-gray-500')}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-12 h-px bg-gray-700" />}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Step 0: Select document */}
      {step === 0 && (
        <div className="space-y-4">
          {loading && docs.length === 0 && (
            <p className="text-sm text-gray-400 animate-pulse">加载文档列表...</p>
          )}
          {docs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">找到 {docs.length} 个文档，点击选择：</p>
              {docs.map(d => (
                <button
                  key={d.filename}
                  onClick={() => setSelectedDoc(d.filename)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border text-sm flex items-center justify-between',
                    selectedDoc === d.filename
                      ? 'border-blue-500 bg-blue-600/10'
                      : 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                  )}
                >
                  <span className="truncate">{d.filename}</span>
                  {d.size && <span className="text-xs text-gray-500 ml-2 shrink-0">{formatSize(d.size)}</span>}
                </button>
              ))}
            </div>
          )}
          {selectedDoc && (
            <div className="flex items-center gap-3">
              <Button onClick={screenDoc} disabled={loading}>
                {loading ? 'AI 预筛中...' : '开始预筛'}
              </Button>
              <span className="text-xs text-gray-500">
                将以「{PHASE_OPTIONS.find(p => p.value === phase)?.label}」视角进行评估
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step 1: Review screened sections */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set(sections.filter(s => s.score >= 7).map(s => s.index)))}>
              选高价值 (≥7分)
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set(sections.map(s => s.index)))}>
              全选
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedSections(new Set())}>
              清空
            </Button>
            <span className="text-xs text-gray-500 ml-2">
              已选 {selectedSections.size}/{sections.length} 个章节
            </span>
          </div>
          {sections.map(s => (
            <div
              key={s.index}
              onClick={() => {
                const n = new Set(selectedSections);
                n.has(s.index) ? n.delete(s.index) : n.add(s.index);
                setSelectedSections(n);
              }}
              className={clsx(
                'p-4 rounded-lg border cursor-pointer transition-colors',
                selectedSections.has(s.index)
                  ? 'border-blue-500 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{s.title}</span>
                <div className="flex items-center gap-2">
                  <Tag color={s.value === 'high' ? 'green' : s.value === 'medium' ? 'amber' : 'gray'}>
                    {s.score}/10
                  </Tag>
                </div>
              </div>
              <p className="text-xs text-gray-400">{s.reason}</p>
              {s.conflictHint && (
                <p className="text-xs text-amber-400 mt-1">⚡ {s.conflictHint}</p>
              )}
            </div>
          ))}
          <Button onClick={extractTopics} disabled={selectedSections.size === 0 || loading}>
            {loading ? '提取中...' : `提取议题 (${selectedSections.size} 章节)`}
          </Button>
        </div>
      )}

      {/* Step 2: Review and create sessions from topics */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Tag color={phase === 'design' ? 'blue' : phase === 'acceptance' ? 'amber' : 'green'}>
              {PHASE_OPTIONS.find(p => p.value === phase)?.label}
            </Tag>
            <span className="text-xs text-gray-500">
              创建的会话将使用此阶段 · 已选 {selectedTopics.size}/{topics.length} 个议题
            </span>
          </div>
          {topics.map((t, i) => (
            <div
              key={i}
              onClick={() => {
                const n = new Set(selectedTopics);
                n.has(i) ? n.delete(i) : n.add(i);
                setSelectedTopics(n);
              }}
              className={clsx(
                'p-4 rounded-lg border cursor-pointer transition-colors',
                selectedTopics.has(i)
                  ? 'border-blue-500 bg-blue-600/10'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{t.topic}</span>
                <Tag color={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'gray'}>
                  {t.priority === 'high' ? '高' : t.priority === 'medium' ? '中' : '低'}
                </Tag>
              </div>
              <p className="text-sm text-gray-400">{t.description}</p>
              <div className="flex gap-1 mt-2">
                {t.involvedRoles.map(r => (
                  <Tag key={r} color="blue">{r}</Tag>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <Button onClick={batchCreate} disabled={selectedTopics.size === 0 || loading}>
              {loading
                ? `创建中... (${createdCount}/${selectedTopics.size})`
                : `批量创建会话 (${selectedTopics.size} 个)`
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
