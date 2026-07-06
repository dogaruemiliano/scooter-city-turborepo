export function Under18Warning({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-warning bg-warning-subtle px-3 py-2 text-sm font-medium text-warning sm:col-span-2"
    >
      {message}
    </div>
  );
}
