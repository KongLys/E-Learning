export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`h-1.5 w-full rounded-full bg-surface-strong ${className}`}>
      <div
        className="h-1.5 rounded-full bg-emphasis transition-all duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
