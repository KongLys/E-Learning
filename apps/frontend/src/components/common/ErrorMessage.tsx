export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-coral-soft border border-coral px-4 py-3 text-sm text-semantic-error">
      {message}
    </div>
  );
}
