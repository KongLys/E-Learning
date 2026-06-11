'use client';

import { useState } from 'react';

interface StarInputProps {
  value: number;
  onChange: (value: number) => void;
  size?: number;
}

/** Bộ chọn rating 1–5 sao (hover + click). */
export function StarInput({ value, onChange, size = 28 }: StarInputProps) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          className="leading-none transition-transform hover:scale-110"
          aria-label={`${star} sao`}
        >
          <span
            style={{ fontSize: size }}
            className={star <= active ? 'text-amber-400' : 'text-gray-300'}
          >
            &#9733;
          </span>
        </button>
      ))}
    </div>
  );
}
