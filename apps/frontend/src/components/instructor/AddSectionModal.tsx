'use client';

import { useState } from 'react';

interface AddSectionModalProps {
  /** Vị trí chèn phần mới: 'top' = đầu danh sách, 'bottom' = cuối danh sách. */
  position: 'top' | 'bottom';
  onSubmit: (title: string) => void;
  onClose: () => void;
  isPending?: boolean;
}

export function AddSectionModal({ position, onSubmit, onClose, isPending }: AddSectionModalProps) {
  const [title, setTitle] = useState('');
  const canSubmit = title.trim().length >= 2 && !isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">
            Thêm phần mới {position === 'top' ? '(lên đầu)' : '(xuống cuối)'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          <label className="text-xs text-gray-500">Tiêu đề phần</label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) onSubmit(title.trim());
            }}
            placeholder="Tên phần mới..."
            className="w-full text-sm bg-white rounded-xl px-3 py-2.5 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-600 px-4 py-2 rounded-full hover:bg-gray-100 transition-colors">
            Hủy
          </button>
          <button
            onClick={() => onSubmit(title.trim())}
            disabled={!canSubmit}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-full font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Đang thêm...' : 'Thêm phần'}
          </button>
        </div>
      </div>
    </div>
  );
}
