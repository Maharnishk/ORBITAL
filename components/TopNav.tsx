'use client';
import { useEffect, useState } from 'react';
import { Orbit } from 'lucide-react';
import type { DataOrigin } from '@/lib/types';

export type ConnectionStatus = 'loading' | 'ready' | 'error';

interface Props {
  eventCount: number;
  sourceCount: number;
  /** Data origins present in the loaded result set (empty while loading/error). */
  origins: DataOrigin[];
  status: ConnectionStatus;
}

interface ModeBadge {
  label: string;
  /** Compact label for narrow screens. */
  short: string;
  title: string;
  classes: string;
  dot: string;
}

function modeBadge(status: ConnectionStatus, origins: DataOrigin[]): ModeBadge {
  if (status === 'error') {
    return {
      label: 'API OFFLINE',
      short: 'OFFLINE',
      title:
        'The ORBITAL API is unreachable. The dashboard shows no fallback data.',
      classes: 'border-coral/50 bg-coral/10 text-coral',
      dot: 'bg-coral',
    };
  }
  if (status === 'loading') {
    return {
      label: 'CONNECTING',
      short: 'CONNECTING',
      title: 'Connecting to the ORBITAL API…',
      classes: 'border-border bg-elevated text-secondary',
      dot: 'bg-secondary animate-pulse',
    };
  }
  if (origins.length === 0) {
    return {
      label: 'API CONNECTED · NO EVENTS',
      short: 'NO EVENTS',
      title:
        'The API is reachable but the dataset is empty. Load simulation data explicitly with the seed command.',
      classes: 'border-border bg-elevated text-secondary',
      dot: 'bg-secondary',
    };
  }
  const unique = new Set(origins);
  if (unique.size === 1 && unique.has('simulation')) {
    return {
      label: 'SIMULATION MODE',
      short: 'SIMULATION',
      title:
        'All loaded records carry data_origin=simulation. Never a real attack record.',
      classes: 'border-amber/40 bg-amber/10 text-amber',
      dot: 'bg-amber animate-pulse',
    };
  }
  if (unique.has('simulation')) {
    return {
      label: 'MIXED DATA ORIGINS',
      short: 'MIXED',
      title:
        'The result set mixes simulation records with public intelligence or observed telemetry. Check each record’s data origin in the inspector.',
      classes: 'border-amber/40 bg-amber/10 text-amber',
      dot: 'bg-amber animate-pulse',
    };
  }
  if (unique.has('public-intel') && unique.has('observed')) {
    return {
      label: 'PUBLIC + OBSERVED DATA',
      short: 'PUBLIC + OBS',
      title: 'Loaded records are public intelligence and observed telemetry.',
      classes: 'border-phosphor/40 bg-phosphor/10 text-phosphor',
      dot: 'bg-phosphor',
    };
  }
  if (unique.has('public-intel')) {
    return {
      label: 'PUBLIC INTELLIGENCE',
      short: 'PUBLIC INTEL',
      title:
        'Loaded records are public threat-intelligence reports, not confirmed attacks.',
      classes: 'border-phosphor/40 bg-phosphor/10 text-phosphor',
      dot: 'bg-phosphor',
    };
  }
  return {
    label: 'OBSERVED TELEMETRY',
    short: 'OBSERVED',
    title: 'Loaded records are observed telemetry.',
    classes: 'border-phosphor/40 bg-phosphor/10 text-phosphor',
    dot: 'bg-phosphor',
  };
}

export default function TopNav({ eventCount, sourceCount, origins, status }: Props) {
  const [utc, setUtc] = useState('');
  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19) + ' UTC');
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const badge = modeBadge(status, origins);
  return (
    <header className="border-b border-border bg-panel/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-[1440px] px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <span className="grid place-items-center w-8 h-8 rounded-md bg-elevated border border-border">
            <Orbit size={17} className="text-phosphor" strokeWidth={1.75} />
          </span>
          <div className="leading-none">
            <div className="font-semibold tracking-[0.18em] text-[13px]">ORBITAL</div>
            <div className="text-[11px] text-secondary hidden sm:block mt-1">Map the signals. Understand the threat.</div>
          </div>
        </div>
        <span
          className={`ml-0 sm:ml-2 inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1 text-[10px] font-mono font-semibold tracking-[0.12em] sm:tracking-[0.14em] ${badge.classes}`}
          title={badge.title}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dot}`} aria-hidden />
          <span className="truncate sm:hidden">{badge.short}</span>
          <span className="hidden truncate sm:inline">{badge.label}</span>
        </span>
        <div className="ml-auto flex items-center gap-3 sm:gap-4 text-[11px] font-mono text-secondary shrink-0">
          <span className="hidden md:inline whitespace-nowrap">
            <span className="text-primary">{eventCount}</span> events · <span className="text-primary">{sourceCount}</span> sources
          </span>
          <span className="hidden sm:inline tabular-nums text-primary/90 whitespace-nowrap" aria-live="off">{utc}</span>
        </div>
      </div>
    </header>
  );
}
