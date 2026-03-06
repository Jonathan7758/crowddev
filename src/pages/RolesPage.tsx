import { useEffect, useState } from 'react';
import { useRoleStore } from '@/stores/role-store';
import { Plus, Edit, Trash2, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Tag from '@/components/ui/Tag';
import type { RoleInput } from '@/types/role';

export default function RolesPage() {
  const { roles, loading, fetchRoles, createRole, updateRole, deleteRole } = useRoleStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);

  useEffect(() => { fetchRoles(); }, []);

  const editingRole = editingId ? roles.find(r => r.id === editingId) : null;
  const historyRole = showHistory ? roles.find(r => r.id === showHistory) : null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">角色管理</h1>
          <p className="text-gray-400 text-sm mt-1">管理参与协商的 AI 角色</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus size={16} className="mr-1" /> 新建角色</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:border-gray-600 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{role.avatar}</span>
                <div>
                  <h3 className="font-semibold">{role.name}</h3>
                  <p className="text-xs text-gray-400">{role.title}</p>
                  <p className="text-xs text-gray-500">{role.organization}</p>
                </div>
              </div>
              <Tag color="blue">v{role.version}</Tag>
            </div>

            <div className="mt-4 space-y-2">
              <div>
                <span className="text-xs text-gray-500">核心关切</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {role.concerns.slice(0, 2).map((c, i) => (
                    <span key={i} className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-300 truncate max-w-[200px]">{c.split('：')[0]}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-gray-700 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditingId(role.id)}><Edit size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => setShowHistory(role.id)}><Clock size={14} /></Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm('确定删除此角色？')) deleteRole(role.id); }}><Trash2 size={14} /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* New/Edit Modal */}
      <RoleEditorModal
        open={showNew || !!editingId}
        onClose={() => { setShowNew(false); setEditingId(null); }}
        role={editingRole || undefined}
        onSave={async (input) => {
          if (editingId) {
            await updateRole(editingId, input);
          } else {
            await createRole(input);
          }
          setShowNew(false);
          setEditingId(null);
        }}
      />

      {/* Version History Modal */}
      <Modal open={!!showHistory} onClose={() => setShowHistory(null)} title={`${historyRole?.name || ''} 版本历史`}>
        <div className="space-y-3 max-h-[400px] overflow-auto">
          {historyRole?.history.map((h, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
              <Tag color="blue">v{h.version}</Tag>
              <div>
                <p className="text-sm">{h.notes}</p>
                <p className="text-xs text-gray-500 mt-1">{new Date(h.date).toLocaleString('zh-CN')}</p>
                {h.changedFields && (
                  <div className="flex gap-1 mt-1">
                    {h.changedFields.map(f => <Tag key={f} color="gray">{f}</Tag>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function RoleEditorModal({ open, onClose, role, onSave }: {
  open: boolean;
  onClose: () => void;
  role?: { name: string; title: string; organization: string; avatar: string; responsibilities: string[]; decisionPowers: string[]; expertise: string[]; personality: string[]; concerns: string[] };
  onSave: (input: RoleInput) => Promise<void>;
}) {
  const [form, setForm] = useState<RoleInput>({
    name: '', title: '', organization: '', avatar: '👤',
    responsibilities: [], decisionPowers: [], expertise: [], personality: [], concerns: [],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (role) {
      setForm({ ...role });
    } else {
      setForm({ name: '', title: '', organization: '', avatar: '👤', responsibilities: [], decisionPowers: [], expertise: [], personality: [], concerns: [] });
    }
  }, [role, open]);

  const setArrayField = (field: keyof RoleInput, value: string) => {
    setForm(prev => ({ ...prev, [field]: value.split('\n').filter(Boolean) }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSave(form);
    setSubmitting(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={role ? '编辑角色' : '新建角色'} width="max-w-2xl">
      <div className="space-y-4 max-h-[60vh] overflow-auto pr-2">
        <div className="grid grid-cols-2 gap-4">
          <Input label="角色名称" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="头像 Emoji" value={form.avatar} onChange={e => setForm(f => ({ ...f, avatar: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="职位" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Input label="组织" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} />
        </div>
        <TextArea label="职责（每行一条）" rows={3} value={form.responsibilities.join('\n')} onChange={e => setArrayField('responsibilities', e.target.value)} />
        <TextArea label="决策权限（每行一条）" rows={2} value={form.decisionPowers.join('\n')} onChange={e => setArrayField('decisionPowers', e.target.value)} />
        <TextArea label="专业背景（每行一条）" rows={2} value={form.expertise.join('\n')} onChange={e => setArrayField('expertise', e.target.value)} />
        <TextArea label="性格特征（每行一条）" rows={2} value={form.personality.join('\n')} onChange={e => setArrayField('personality', e.target.value)} />
        <TextArea label="核心关切（每行一条）" rows={3} value={form.concerns.join('\n')} onChange={e => setArrayField('concerns', e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-700 mt-4">
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button disabled={!form.name || !form.title || submitting} onClick={handleSubmit}>
          {submitting ? '保存中...' : '保存'}
        </Button>
      </div>
    </Modal>
  );
}
