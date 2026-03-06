import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import Tag from '@/components/ui/Tag';
import { Users, MessageSquare, Handshake, BarChart3 } from 'lucide-react';

interface Stats {
  totalRoles: number;
  totalSessions: number;
  totalMessages: number;
  totalConsensus: number;
  sessionsByPhase: { design: number; acceptance: number; operations: number };
}

interface TimelineEvent {
  id: string;
  eventType: string;
  entityName: string;
  details: Record<string, unknown>;
  createdAt: string;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  role_created: { label: '角色创建', color: 'green' },
  role_updated: { label: '角色更新', color: 'blue' },
  role_deleted: { label: '角色删除', color: 'red' },
  consensus_reached: { label: '共识达成', color: 'amber' },
  prd_updated: { label: 'PRD更新', color: 'purple' },
};

export default function EvolutionPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    api.get<Stats>('/evolution/stats').then(setStats);
    api.get<TimelineEvent[]>('/evolution/timeline').then(setTimeline);
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">演化追踪</h1>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Users} label="角色" value={stats.totalRoles} color="blue" />
          <StatCard icon={MessageSquare} label="会话" value={stats.totalSessions} color="purple" />
          <StatCard icon={BarChart3} label="发言" value={stats.totalMessages} color="amber" />
          <StatCard icon={Handshake} label="共识" value={stats.totalConsensus} color="green" />
        </div>
      )}

      {stats && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-8">
          <h2 className="text-sm font-semibold mb-4">按阶段分布</h2>
          <div className="flex gap-4">
            {(['design', 'acceptance', 'operations'] as const).map(phase => {
              const count = stats.sessionsByPhase[phase];
              const total = stats.totalSessions || 1;
              const pct = Math.round((count / total) * 100);
              const labels = { design: '设计期', acceptance: '验收期', operations: '运营期' };
              const colors = { design: 'bg-blue-500', acceptance: 'bg-amber-500', operations: 'bg-green-500' };
              return (
                <div key={phase} className="flex-1">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{labels[phase]}</span>
                    <span>{count} ({pct}%)</span>
                  </div>
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[phase]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h2 className="text-sm font-semibold mb-4">事件时间线</h2>
        <div className="space-y-3 max-h-[500px] overflow-auto">
          {timeline.map(e => {
            const info = EVENT_LABELS[e.eventType] || { label: e.eventType, color: 'gray' };
            return (
              <div key={e.id} className="flex items-start gap-3 p-3 bg-gray-700/50 rounded-lg">
                <Tag color={info.color as any}>{info.label}</Tag>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{e.entityName}</p>
                  <p className="text-xs text-gray-500">{new Date(e.createdAt).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            );
          })}
          {timeline.length === 0 && <p className="text-sm text-gray-500 text-center py-4">暂无事件</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    green: 'text-green-400 bg-green-500/10',
  };
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
