export function StarRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="flex items-center gap-1 text-sm">
      <span className="text-yellow-400">★</span>
      <span className="font-medium">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-gray-400">({count.toLocaleString()})</span>}
    </span>
  );
}
