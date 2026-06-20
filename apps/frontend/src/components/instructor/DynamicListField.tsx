'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface DynamicListFieldProps {
  label: string;
  placeholder: string;
  items: string[];
  onChange: (items: string[]) => void;
  error?: string;
  hint?: string;
}

export function DynamicListField({
  label,
  placeholder,
  items,
  onChange,
  error,
  hint,
}: DynamicListFieldProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onChange([...items, trimmed]);
    setInput('');
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-canvas-soft rounded-lg px-3 py-2 text-sm">
            <span className="flex-1 text-ink">{item}</span>
            <button type="button" onClick={() => remove(idx)} className="text-ink-subtle hover:text-coral transition-colors">
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            className="flex-1 border border-hairline-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky"
          />
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-strong hover:bg-hairline rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Thêm
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-semantic-error mt-1">{error}</p>}
    </div>
  );
}
