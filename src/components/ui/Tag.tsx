import clsx from 'clsx';

interface TagProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
}

const colors = {
  blue: 'bg-blue-500/20 text-blue-400',
  green: 'bg-green-500/20 text-green-400',
  amber: 'bg-amber-500/20 text-amber-400',
  red: 'bg-red-500/20 text-red-400',
  purple: 'bg-purple-500/20 text-purple-400',
  gray: 'bg-gray-500/20 text-gray-400',
};

export default function Tag({ children, color = 'gray' }: TagProps) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colors[color])}>
      {children}
    </span>
  );
}
