// Decorative galaxy backdrop: drifting stars + nebula glows. Pure CSS (see
// globals.css `.space-bg`), no JS, server-rendered. Drop inside a `relative`
// parent and put content above it with `relative z-10`.
export function SpaceBackground({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`space-bg ${className}`}>
      <div className="nebula nebula--violet" />
      <div className="nebula nebula--cyan" />
      <div className="space-stars" />
      <div className="space-stars space-stars--2" />
    </div>
  );
}
