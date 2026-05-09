import { formatVND } from '@/lib/utils';

interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  className?: string;
}

export function PriceDisplay({ price, originalPrice, className }: PriceDisplayProps) {
  if (price === 0) {
    return (
      <span className={`font-semibold text-semantic-success ${className}`}>Miễn phí</span>
    );
  }
  return (
    <span className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-semibold text-ink">{formatVND(price)}</span>
      {originalPrice && originalPrice > price && (
        <span className="text-sm text-muted-soft line-through">{formatVND(originalPrice)}</span>
      )}
    </span>
  );
}
