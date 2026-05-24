import React, { useEffect, useRef, useCallback } from 'react';

/**
 * Confetti burst animation using Canvas.
 * Particles fly out from the given origin point in accent color.
 */
export default function ConfettiCanvas({ active, originRef }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const launch = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Get origin from button
    let ox = canvas.width / 2, oy = canvas.height - 60;
    if (originRef?.current) {
      const rect = originRef.current.getBoundingClientRect();
      ox = rect.left + rect.width / 2;
      oy = rect.top + rect.height / 2;
    }

    // Read accent color from CSS variable
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c6af7';
    const dim = getComputedStyle(document.documentElement).getPropertyValue('--accent-dim').trim() || '#5a4fc4';

    // Create particles
    const particles = [];
    const count = 60;
    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6, // bias upward
        size: 4 + Math.random() * 5,
        color: Math.random() > 0.5 ? accent : dim,
        opacity: 1,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        shape: Math.random() > 0.4 ? 'rect' : 'circle',
      });
    }

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // gravity
        p.vx *= 0.98; // air resistance
        p.opacity -= 0.018;
        p.rotation += p.rotSpeed;

        if (p.opacity <= 0) continue;
        alive = true;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (alive) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [originRef]);

  useEffect(() => {
    if (active) launch();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [active, launch]);

  // Resize canvas to fill window
  useEffect(() => {
    const resize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        pointerEvents: 'none', // don't block clicks
      }}
    />
  );
}
