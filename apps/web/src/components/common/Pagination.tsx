'use client';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, total, limit, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center gap-2 justify-center mt-10">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="inline-flex h-9 items-center px-4 rounded-pill border border-hairline-strong text-sm font-medium text-muted hover:text-ink hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-surface-card"
      >
        Trước
      </button>
      <span className="text-sm text-muted px-2">
        {page} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="inline-flex h-9 items-center px-4 rounded-pill border border-hairline-strong text-sm font-medium text-muted hover:text-ink hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-surface-card"
      >
        Sau
      </button>
    </div>
  );
}
