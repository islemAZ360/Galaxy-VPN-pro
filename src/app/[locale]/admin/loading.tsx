export default function AdminLoading() {
  return (
    <div className="flex h-[50vh] w-full flex-col items-center justify-center space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-bounce rounded-full bg-galaxy-primary [animation-delay:-0.3s]"></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-galaxy-primary [animation-delay:-0.15s]"></div>
        <div className="h-2 w-2 animate-bounce rounded-full bg-galaxy-primary"></div>
      </div>
      <p className="text-sm font-medium text-galaxy-primary/70">Loading Admin Dashboard...</p>
    </div>
  );
}
