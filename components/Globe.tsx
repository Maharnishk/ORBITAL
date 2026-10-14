'use client';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ThreatEvent } from '@/lib/types';
import { latLonToVec3 } from '@/lib/utils';

const SEV_COLOR: Record<string, string> = {
  info: '#929A91',
  low: '#B7F397',
  medium: '#E6B566',
  high: '#E8934A',
  critical: '#E77C72',
};

const R = 1;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
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
  return (
    <points geometry={geom}>
      <pointsMaterial color="#232a24" size={0.006} sizeAttenuation transparent opacity={0.9} />
    </points>
  );
}

function Arc({ from, to, color, animated }: { from: [number, number, number]; to: [number, number, number]; color: string; animated: boolean }) {
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
}

function Markers({ events, selectedId, onSelect }: { events: ThreatEvent[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <group>
      {events.map((e) => {
        const g = e.dstGeo ?? e.srcGeo;
        if (!g) return null;
        const pos = latLonToVec3(g.lat, g.lon, R * 1.01);
        const sel = e.id === selectedId;
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
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <sphereGeometry args={[sel ? 0.024 : 0.014, 16, 16]} />
            <meshBasicMaterial color={SEV_COLOR[e.severity]} />
            {sel && (
              <mesh>
                <ringGeometry args={[0.032, 0.038, 32]} />
                <meshBasicMaterial color="#B7F397" side={THREE.DoubleSide} transparent opacity={0.9} />
              </mesh>
            )}
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({
  events, selectedId, onSelect, showArcs, autoRotate, reduced,
}: {
  events: ThreatEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showArcs: boolean;
  autoRotate: boolean;
  reduced: boolean;
}) {
  const arcs = useMemo(() => {
    if (!showArcs) return [];
    return events.filter((e) => e.srcGeo && e.dstGeo).slice(0, 36);
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
      {arcs.map((e) => (
        <Arc
          key={`arc-${e.id}`}
          from={latLonToVec3(e.srcGeo!.lat, e.srcGeo!.lon, R * 1.01)}
          to={latLonToVec3(e.dstGeo!.lat, e.dstGeo!.lon, R * 1.01)}
          color={SEV_COLOR[e.severity]}
          animated={!reduced}
        />
      ))}
      <Markers events={events} selectedId={selectedId} onSelect={onSelect} />
      <OrbitControls
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
  events, selectedId, onSelect,
}: {
  events: ThreatEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [showArcs, setShowArcs] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);

  useEffect(() => {
    setMounted(true);
    setNoWebgl(!webglAvailable());
  }, []);

  const geoCount = events.filter((e) => e.srcGeo || e.dstGeo).length;
  const flowCount = events.filter((e) => e.srcGeo && e.dstGeo).length;

  return (
    <section aria-label="Threat globe" className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <h2 className="text-[11px] font-mono tracking-[0.18em] text-secondary">THREAT GLOBE · SIMULATED</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowArcs((v) => !v)}
            aria-pressed={showArcs}
            className={`focus-ring rounded border px-2 py-1 text-[11px] font-mono ${showArcs ? 'border-phosphor/50 text-phosphor bg-phosphor/10' : 'border-border text-secondary'}`}
          >
            Flows {showArcs ? 'on' : 'off'}
          </button>
          <button
            onClick={() => setAutoRotate((v) => !v)}
            aria-pressed={autoRotate}
            className={`focus-ring rounded border px-2 py-1 text-[11px] font-mono ${autoRotate ? 'border-phosphor/50 text-phosphor bg-phosphor/10' : 'border-border text-secondary'}`}
          >
            Rotate {autoRotate ? 'on' : 'off'}
          </button>
        </div>
      </div>

      <div
        className="relative h-[420px] lg:h-[560px] bg-void"
        role="application"
        aria-label="Interactive 3D globe. Use the event stream list for full keyboard access to every event."
        tabIndex={0}
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
                    <li key={e.id}>{e.indicator} · {e.severity} · {e.dstGeo?.label ?? 'no geo'}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[12px] font-mono text-secondary">Loading globe…</div>}>
            <Canvas
              camera={{ position: [0, 0.6, 3.2], fov: 42 }}
              dpr={[1, 2]}
              gl={{ antialias: true, alpha: false }}
              onCreated={({ gl }) => gl.setClearColor('#0A0C0B')}
            >
              <Scene
                events={events}
                selectedId={selectedId}
                onSelect={onSelect}
                showArcs={showArcs}
                autoRotate={autoRotate}
                reduced={reduced}
              />
            </Canvas>
          </Suspense>
        )}

        <div className="pointer-events-none absolute left-3 bottom-3 rounded border border-border bg-panel/90 px-2.5 py-1.5 text-[10.5px] font-mono text-secondary">
          drag to rotate · scroll to zoom · click a marker
          <span className="block text-primary/80">{geoCount} plotted · {showArcs ? Math.min(36, flowCount) : 0} flows · arcs only when both endpoints reported</span>
        </div>
        {selectedId && (
          <div className="absolute right-3 top-3 rounded border border-phosphor/40 bg-panel/95 px-2.5 py-1.5 text-[11px] font-mono">
            <span className="text-secondary">SELECTED </span>
            <span className="text-phosphor">{events.find((e) => e.id === selectedId)?.indicator ?? selectedId}</span>
          </div>
        )}
        {events.length > 0 && geoCount === 0 && (
          <div className="absolute inset-x-0 top-12 mx-auto w-fit rounded border border-border bg-panel/95 px-3 py-1.5 text-[11.5px] text-secondary">
            No geography in view — events lack reported coordinates, so nothing is plotted.
          </div>
        )}
      </div>
    </section>
  );
}
