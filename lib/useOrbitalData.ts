'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  fetchAllEvents,
  fetchSources,
  toThreatEvent,
  toThreatSource,
} from './api';
import type { ThreatEvent, ThreatSource } from './types';

export type OrbitalDataStatus = 'loading' | 'ready' | 'error';

export interface OrbitalDataState {
  status: OrbitalDataStatus;
  events: ThreatEvent[];
  sources: ThreatSource[];
  error: ApiError | null;
  /** Total matching records reported by the API (may exceed loaded events). */
  total: number;
  truncated: boolean;
  loadedAt: number | null;
  retry: () => void;
}

const INITIAL = {
  status: 'loading' as const,
  events: [] as ThreatEvent[],
  sources: [] as ThreatSource[],
  error: null,
  total: 0,
  truncated: false,
  loadedAt: null,
};

export function useOrbitalData(): OrbitalDataState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<
    Omit<OrbitalDataState, 'retry'>
  >(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState(INITIAL);

    (async () => {
      try {
        const [eventResult, sourceResult] = await Promise.all([
          fetchAllEvents({ signal: controller.signal }),
          fetchSources({ signal: controller.signal }),
        ]);
        if (!active) return;
        setState({
          status: 'ready',
          events: eventResult.items.map(toThreatEvent),
          sources: sourceResult.items.map(toThreatSource),
          error: null,
          total: eventResult.total,
          truncated: eventResult.truncated,
          loadedAt: Date.now(),
        });
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'aborted') return;
        setState({
          ...INITIAL,
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError('An unexpected client error occurred.', {
                  code: 'client_error',
                  status: null,
                }),
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { ...state, retry };
}
