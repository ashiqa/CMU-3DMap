import React, { useEffect, useRef } from 'react';

const DROP_COUNT = 170;
const FRAME_MS = 33; // ~30 fps is plenty for rain and keeps the GPU free for the 3D map
const WIND = 0.16; // horizontal drift as a fraction of fall speed

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
}

function makeDrop(y = Math.random()): Drop {
  return { x: Math.random(), y, len: 9 + Math.random() * 13, speed: 0.95 + Math.random() * 0.75, alpha: 0.16 + Math.random() * 0.26 };
}

/**
 * Overcast tint plus animated rain streaks drawn on a canvas over the map. Purely visual: it never blocks clicks,
 * draws a single still frame when the user prefers reduced motion, and pauses while the tab is hidden.
 */
export default function RainOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drops: Drop[] = Array.from({ length: DROP_COUNT }, () => makeDrop());
    let raf = 0;
    let last = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    const paint = (dtSec: number) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1.1 * dpr;
      ctx.lineCap = 'round';
      for (const d of drops) {
        if (dtSec > 0) {
          d.y += d.speed * dtSec * 1.15;
          d.x += d.speed * dtSec * WIND;
          if (d.y > 1.04) Object.assign(d, makeDrop(-0.04));
          if (d.x > 1.04) d.x = -0.04;
        }
        const x = d.x * w;
        const y = d.y * h;
        const len = d.len * dpr;
        ctx.strokeStyle = `rgba(214, 222, 230, ${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * WIND, y - len);
        ctx.stroke();
      }
    };

    const frame = (t: number) => {
      raf = window.requestAnimationFrame(frame);
      if (t - last < FRAME_MS) return;
      const dt = last === 0 ? 0 : Math.min(0.05, (t - last) / 1000);
      last = t;
      paint(dt);
    };

    const start = () => {
      window.cancelAnimationFrame(raf);
      last = 0;
      raf = window.requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (document.hidden) window.cancelAnimationFrame(raf);
      else if (!reduced) start();
    };

    if (reduced) paint(0);
    else start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active]);

  if (!active) return null;
  return (
    <>
      <div className="cp-rain-tint" aria-hidden />
      <canvas ref={canvasRef} className="cp-rain-canvas" aria-hidden />
    </>
  );
}
