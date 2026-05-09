export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full rounded-full bg-gray-200 ${className}`}>
      <div
        className="h-2 rounded-full bg-blue-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
