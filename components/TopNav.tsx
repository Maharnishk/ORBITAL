'use client';
import { useEffect, useState } from 'react';
import { Orbit } from 'lucide-react';

export default function TopNav({ eventCount, sourceCount }: { eventCount: number; sourceCount: number }) {
  const [utc, setUtc] = useState('');
  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19) + ' UTC');
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-[1440px] px-4 h-14 flex items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-elevated border border-border">
            <Orbit size={17} className="text-phosphor" strokeWidth={1.75} />
          </span>
          <div className="leading-none">
            <div className="font-semibold tracking-[0.18em] text-[13px]">ORBITAL</div>
            <div className="text-[11px] text-secondary hidden sm:block mt-1">Map the signals. Understand the threat.</div>
          </div>
        </div>
        <span
          className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-1 text-[10px] font-mono font-semibold tracking-[0.14em] text-amber"
          title="All data on this screen is deterministic synthetic data for design evaluation."
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" aria-hidden />
          SIMULATION MODE
        </span>
        <div className="ml-auto flex items-center gap-4 text-[11px] font-mono text-secondary">
          <span className="hidden md:inline">
            <span className="text-primary">{eventCount}</span> events · <span className="text-primary">{sourceCount}</span> sources
          </span>
          <span className="tabular-nums text-primary/90" aria-live="off">{utc}</span>
        </div>
      </div>
    </header>
  );
}
