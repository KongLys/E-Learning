export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className ?? 'h-64'}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-strong border-t-emphasis" />
    </div>
  );
}
