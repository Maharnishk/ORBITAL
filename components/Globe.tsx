'use client';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ThreatEvent, ThreatSource } from '@/lib/types';
import { hasValidEndpoints, isValidGeo, latLonToVec3, plottableGeo } from '@/lib/utils';

const SEV_COLOR: Record<string, string> = {
  info: '#929A91',
  low: '#B7F397',
  medium: '#E6B566',
  high: '#E8934A',
  critical: '#E77C72',
};

const SEV_ORDER = ['info', 'low', 'medium', 'high', 'critical'] as const;

const R = 1;
const CAMERA_HOME: [number, number, number] = [0, 0.6, 3.2];

function usePrefersReducedMotion(): boolean {
  // Initialize from the media query when running in the browser so a reduced-
  // motion visitor never sees a frame of auto-rotation before the effect runs.
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);
  return reduced;
}

function Graticule() {
  const geom = useMemo(() => {
    const pts: number[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(...a, ...b);
    for (let lat = -60; lat <= 60; lat += 20) {
      let prev: [number, number, number] | null = null;
      for (let lon = -180; lon <= 180; lon += 6) {
        const p = latLonToVec3(lat, lon, R * 1.001);
        if (prev) seg(prev, p);
        prev = p;
      }
    }
    for (let lon = -180; lon < 180; lon += 20) {
      let prev: [number, number, number] | null = null;
      for (let lat = -90; lat <= 90; lat += 6) {
        const p = latLonToVec3(lat, lon, R * 1.001);
        if (prev) seg(prev, p);
        prev = p;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#2c332d" transparent opacity={0.85} />
    </lineSegments>
  );
}

function Speckle({ count = 1400 }: { count?: number }) {
  const geom = useMemo(() => {
    const pts: number[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      pts.push(Math.cos(th) * rad * R * 0.999, y * R * 0.999, Math.sin(th) * rad * R * 0.999);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [count]);
  useEffect(() => () => geom.dispose(), [geom]);
  return (
    <points geometry={geom}>
      <pointsMaterial color="#232a24" size={0.006} sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

const Arc = memo(function Arc({ from, to, color, animated }: { from: [number, number, number]; to: [number, number, number]; color: string; animated: boolean }) {
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dist = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1 + Math.min(0.55, dist * 0.28)));
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  }, [from, to]);
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  }, [curve, color]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line]
  );
  const dot = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animated || !dot.current) return;
    const t = (clock.elapsedTime * 0.22) % 1;
    dot.current.position.copy(curve.getPoint(t));
  });
  return (
    <group>
      <primitive object={line} />
      {animated && (
        <mesh ref={dot}>
          <sphereGeometry args={[0.011, 12, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
});

interface MarkerHover {
  id: string;
  x: number;
  y: number;
}

/** Both reported endpoints must be valid and distinct enough to draw a curve. */
function arcEndpoints(e: ThreatEvent): {
  from: [number, number, number];
  to: [number, number, number];
} | null {
  if (!hasValidEndpoints(e)) return null;
  const from = latLonToVec3(e.srcGeo!.lat, e.srcGeo!.lon, R * 1.01);
  const to = latLonToVec3(e.dstGeo!.lat, e.dstGeo!.lon, R * 1.01);
  const dist = Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);
  if (dist < 0.02) return null;
  return { from, to };
}

const Markers = memo(function Markers({
  events, selectedId, onSelect, onHover, onLeave,
}: {
  events: ThreatEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (h: MarkerHover, ev: ThreeEvent<PointerEvent>) => void;
  onLeave: () => void;
}) {
  // Precompute positions once per event list so renders stay cheap.
  const plotted = useMemo(
    () =>
      events.flatMap((e) => {
        const g = plottableGeo(e);
        if (!g) return [];
        // Guard against invalid coordinates; never plot or invent locations.
        return [{ e, pos: latLonToVec3(g.lat, g.lon, R * 1.01) }];
      }),
    [events]
  );
  return (
    <group>
      {plotted.map(({ e, pos }) => {
        const sel = e.id === selectedId;
        const n = new THREE.Vector3(...pos).normalize().multiplyScalar(0.022);
        return (
          <mesh
            key={e.id}
            position={pos}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(e.id);
            }}
            onPointerOver={(ev) => {
              ev.stopPropagation();
              document.body.style.cursor = 'pointer';
              onHover({ id: e.id, x: ev.nativeEvent.clientX, y: ev.nativeEvent.clientY }, ev);
            }}
            onPointerMove={(ev) => {
              onHover({ id: e.id, x: ev.nativeEvent.clientX, y: ev.nativeEvent.clientY }, ev);
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
              onLeave();
            }}
          >
            <sphereGeometry args={[sel ? 0.024 : 0.014, 16, 16]} />
            <meshBasicMaterial color={SEV_COLOR[e.severity]} />
            {sel && <SelectedRing offset={[n.x, n.y, n.z]} />}
          </mesh>
        );
      })}
    </group>
  );
});

/** Camera-facing selection ring. Offset outward along the surface normal. */
function SelectedRing({ offset }: { offset: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.quaternion.copy(camera.quaternion);
  });
  return (
    <mesh ref={ref} position={offset}>
      <ringGeometry args={[0.032, 0.038, 32]} />
      <meshBasicMaterial color="#B7F397" side={THREE.DoubleSide} transparent opacity={0.9} />
    </mesh>
  );
}

function Scene({
  events, selectedId, onSelect, onHover, onLeave, showArcs, autoRotate, reduced, controlsRef,
}: {
  events: ThreatEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (h: MarkerHover, ev: ThreeEvent<PointerEvent>) => void;
  onLeave: () => void;
  showArcs: boolean;
  autoRotate: boolean;
  reduced: boolean;
  controlsRef: React.RefObject<any>;
}) {
  const arcs = useMemo(() => {
    if (!showArcs) return [];
    return events
      .flatMap((e) => {
        const g = arcEndpoints(e);
        return g ? [{ e, ...g }] : [];
      })
      .slice(0, 36);
  }, [events, showArcs]);

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 2, 4]} intensity={1.4} />
      <mesh>
        <sphereGeometry args={[R, 64, 64]} />
        <meshStandardMaterial color="#12160f" roughness={0.95} metalness={0.05} />
      </mesh>
      {/* subtle atmosphere rim */}
      <mesh scale={1.06}>
        <sphereGeometry args={[R, 64, 64]} />
        <meshBasicMaterial color="#B7F397" transparent opacity={0.045} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <Graticule />
      <Speckle />
      {arcs.map(({ e, from, to }) => (
        <Arc
          key={`arc-${e.id}`}
          from={from}
          to={to}
          color={SEV_COLOR[e.severity]}
          animated={!reduced}
        />
      ))}
      <Markers events={events} selectedId={selectedId} onSelect={onSelect} onHover={onHover} onLeave={onLeave} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.7}
        maxDistance={6}
        autoRotate={autoRotate && !reduced}
        autoRotateSpeed={0.55}
        makeDefault
      />
    </>
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function GlobePanel({
  events, sources, selectedId, onSelect,
}: {
  events: ThreatEvent[];
  sources: ThreatSource[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [showArcs, setShowArcs] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const sourceNames = useMemo(
    () => new Map(sources.map((s) => [s.id, s.name])),
    [sources]
  );

  useEffect(() => {
    setMounted(true);
    setNoWebgl(!webglAvailable());
  }, []);

  // Position the tooltip via direct DOM writes so pointer movement does not
  // trigger React rerenders of the Canvas subtree.
  const placeTooltip = useCallback((clientX: number, clientY: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    const tip = tooltipRef.current;
    if (!box || !tip) return;
    const x = clientX - box.left;
    const y = clientY - box.top;
    const flipX = x > box.width - 240;
    const flipY = y < 110;
    tip.style.transform = `translate(${flipX ? x - 216 : x + 14}px, ${flipY ? y + 16 : y - 96}px)`;
  }, []);

  const handleHover = useCallback(
    (h: MarkerHover) => {
      lastPos.current = { x: h.x, y: h.y };
      setHoveredId((prev) => (prev === h.id ? prev : h.id));
      placeTooltip(h.x, h.y);
    },
    [placeTooltip]
  );

  // The tooltip element mounts on the first hover of a marker, after
  // placeTooltip above runs against a null ref — position it on mount.
  useEffect(() => {
    if (hoveredId) placeTooltip(lastPos.current.x, lastPos.current.y);
  }, [hoveredId, placeTooltip]);

  const handleLeave = useCallback(() => setHoveredId(null), []);

  const resetCamera = useCallback(() => {
    controlsRef.current?.reset?.();
  }, []);

  const hovered = hoveredId ? events.find((e) => e.id === hoveredId) ?? null : null;
  const geoCount = useMemo(() => events.filter((e) => plottableGeo(e)).length, [events]);
  const arcCount = useMemo(() => events.filter((e) => arcEndpoints(e)).length, [events]);
  const originLabel = useMemo(() => {
    const origins = new Set(events.map((e) => e.dataOrigin));
    if (origins.size === 0) return 'NO DATA';
    if (origins.size > 1) return 'MIXED ORIGINS';
    if (origins.has('simulation')) return 'SIMULATED';
    if (origins.has('public-intel')) return 'PUBLIC INTEL';
    return 'OBSERVED TELEMETRY';
  }, [events]);

  return (
    <section aria-label="Threat globe" className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <h2
          className="text-[11px] font-mono tracking-[0.18em] text-secondary"
          title="Origin label reflects the data_origin values of the events currently in view."
        >
          THREAT GLOBE · {originLabel}
        </h2>
        {mounted && !noWebgl && (
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowArcs((v) => !v)}
            aria-pressed={showArcs}
            title="Arcs are drawn only for events with two valid reported locations. They do not imply attack traffic."
            className={`focus-ring rounded border px-2 py-1 text-[11px] font-mono ${showArcs ? 'border-phosphor/50 text-phosphor bg-phosphor/10' : 'border-border text-secondary'}`}
          >
            Arcs {showArcs ? 'on' : 'off'}
          </button>
          <button
            onClick={() => setAutoRotate((v) => !v)}
            aria-pressed={autoRotate && !reduced}
            disabled={reduced}
            title={reduced ? 'Auto-rotation is off because your system requests reduced motion.' : 'Toggle globe auto-rotation'}
            className={`focus-ring rounded border px-2 py-1 text-[11px] font-mono disabled:cursor-not-allowed disabled:opacity-50 ${autoRotate && !reduced ? 'border-phosphor/50 text-phosphor bg-phosphor/10' : 'border-border text-secondary'}`}
          >
            Rotate {reduced ? 'paused' : autoRotate ? 'on' : 'off'}
          </button>
          <button
            onClick={resetCamera}
            title="Reset the camera to the default position"
            className="focus-ring rounded border border-border px-2 py-1 text-[11px] font-mono text-secondary hover:text-primary"
          >
            Reset view
          </button>
        </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative h-[420px] lg:h-[560px] bg-void"
        role="img"
        aria-label={noWebgl
          ? `3D globe unavailable (WebGL blocked). ${geoCount} events in view have reported coordinates.`
          : `Interactive 3D globe plotting ${geoCount} events with reported coordinates. Use the event stream for keyboard selection.`}
        aria-describedby="globe-hint"
      >
        {!mounted || noWebgl ? (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <p className="text-[14px] font-semibold">{noWebgl ? 'WebGL is unavailable' : 'Loading globe…'}</p>
              <p className="mt-1 text-[12.5px] text-secondary max-w-md">
                {noWebgl
                  ? 'Your browser or device blocked WebGL, so the 3D view cannot render. The event stream, inspector, filters, and timeline below remain fully usable.'
                  : 'Preparing the interactive view.'}
              </p>
              {noWebgl && (
                <ul className="mt-3 text-[12px] font-mono text-secondary space-y-1">
                  {events.slice(0, 6).map((e) => (
                    <li key={e.id}>{e.indicator} · {e.severity} · {plottableGeo(e)?.label ?? 'no reported geo'}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[12px] font-mono text-secondary">Loading globe…</div>}>
            <Canvas
              camera={{ position: CAMERA_HOME, fov: 42 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => gl.setClearColor('#0A0C0B')}
            >
              <Scene
                events={events}
                selectedId={selectedId}
                onSelect={onSelect}
                onHover={handleHover}
                onLeave={handleLeave}
                showArcs={showArcs}
                autoRotate={autoRotate}
                reduced={reduced}
                controlsRef={controlsRef}
              />
            </Canvas>
          </Suspense>
        )}

        {/* Hover tooltip: indicator, severity, source. Pointer-transparent. */}
        {hovered && (
          <div
            ref={tooltipRef}
            className="pointer-events-none absolute left-0 top-0 w-52 rounded-md border border-border bg-panel/95 px-2.5 py-2 shadow-lg"
            style={{ transform: 'translate(-9999px, -9999px)' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SEV_COLOR[hovered.severity] }} aria-hidden />
              <span className="text-[10px] font-mono uppercase tracking-[0.12em]" style={{ color: SEV_COLOR[hovered.severity] }}>
                {hovered.severity}
              </span>
              <span className="ml-auto text-[10px] font-mono text-secondary">{hovered.id}</span>
            </div>
            <div className="mt-1 font-mono text-[12px] text-phosphor truncate">{hovered.indicator}</div>
            <div className="mt-0.5 text-[11px] text-secondary truncate">{sourceNames.get(hovered.sourceId) ?? hovered.sourceId} · {hovered.type}</div>
          </div>
        )}
        {/* Screen-reader announcement for hovered markers. */}
        <span aria-live="polite" className="sr-only">
          {hovered ? `${hovered.indicator}, severity ${hovered.severity}, source ${sourceNames.get(hovered.sourceId) ?? hovered.sourceId}` : ''}
        </span>

        <div id="globe-hint" className="pointer-events-none absolute left-3 bottom-3 max-w-[calc(100%-1.5rem)] rounded border border-border bg-panel/90 px-2.5 py-1.5 text-[10.5px] font-mono text-secondary">
          {!noWebgl && <>drag to rotate · scroll to zoom · click a marker · keyboard: event stream</>}
          <span className="block text-primary/80">
            {geoCount} plotted locations · {showArcs ? Math.min(36, arcCount) : 0} arcs
          </span>
          <span className="block">
            arcs require two valid reported endpoints; they do not imply attack traffic.
          </span>
          {reduced && <span className="block text-amber">reduced motion: auto-rotation and arc animation are off</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2" aria-label="Severity legend">
            {SEV_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[s] }} aria-hidden />
                {s}
              </span>
            ))}
          </span>
        </div>
        {selectedId && (
          <div className="absolute right-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded border border-phosphor/40 bg-panel/95 px-2.5 py-1.5 text-[11px] font-mono">
            <span className="text-secondary">SELECTED </span>
            <span className="text-phosphor">{events.find((e) => e.id === selectedId)?.indicator ?? selectedId}</span>
          </div>
        )}
        {events.length === 0 && mounted && !noWebgl && (
          <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 mx-auto w-fit max-w-lg rounded border border-border bg-panel/95 px-3 py-2 text-center text-[12px] text-secondary">
            No events match the current filters, so there is nothing to plot. Adjust the filters or time range.
          </div>
        )}
        {events.length > 0 && geoCount === 0 && (
          <div className="absolute inset-x-0 top-12 mx-auto w-fit rounded border border-border bg-panel/95 px-3 py-1.5 text-[11.5px] text-secondary">
            No geography in view — the selected events have no valid reported coordinates, so nothing is plotted.
          </div>
        )}
      </div>
    </section>
  );
}
