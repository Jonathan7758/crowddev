import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export default function TextArea({ label, className, ...props }: TextAreaProps) {
  return (
    <div>
      {label && <label className="block text-sm text-gray-400 mb-1">{label}</label>}
      <textarea
        className={clsx(
          'w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none',
          className
        )}
        {...props}
      />
    </div>
  );
}
