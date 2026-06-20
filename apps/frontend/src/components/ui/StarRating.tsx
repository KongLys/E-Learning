import { Star } from 'lucide-react';

export function StarRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <Star size={14} className="fill-sun text-sun" />
      <span className="font-medium text-ink">{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-muted-soft">({count.toLocaleString()})</span>
      )}
    </span>
  );
}
