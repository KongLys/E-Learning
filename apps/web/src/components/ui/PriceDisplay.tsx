import { formatVND } from '@/lib/utils';

interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  className?: string;
}

export function PriceDisplay({ price, originalPrice, className }: PriceDisplayProps) {
  if (price === 0) {
    return <span className={`font-bold text-green-600 ${className}`}>Miễn phí</span>;
  }
  return (
    <span className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-bold text-gray-900">{formatVND(price)}</span>
      {originalPrice && originalPrice > price && (
        <span className="text-sm text-gray-400 line-through">{formatVND(originalPrice)}</span>
      )}
    </span>
  );
}
