import { Outlet, NavLink } from 'react-router-dom';
import { MessageSquare, Users, FileText, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { to: '/sessions', label: '协商会话', icon: MessageSquare },
  { to: '/roles', label: '角色管理', icon: Users },
  { to: '/prd', label: 'PRD 拆解', icon: FileText },
  { to: '/evolution', label: '演化追踪', icon: BarChart3 },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-lg font-bold text-blue-400">CrowdDev</h1>
          <p className="text-xs text-gray-400 mt-1">众开协商引擎</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500">
          v0.1.0 MVP
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
