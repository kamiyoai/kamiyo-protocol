'use client';

export function AnimatedBackground() {
  return (
    <div className="animated-gradient-bg" aria-hidden="true">
      <div className="absolute inset-x-0 top-[16%] h-px bg-black/10 dark:bg-white/10" />
      <div className="absolute inset-x-0 top-[16.5%] h-px bg-black/5 dark:bg-white/5" />
      <div className="absolute inset-x-0 top-[62%] h-px bg-black/10 dark:bg-white/10" />
      <div className="animated-gradient-orb animated-gradient-orb-1" />
      <div className="animated-gradient-orb animated-gradient-orb-2" />
    </div>
  );
}
