import React, { useEffect, useRef, memo } from 'react';

export const MatrixBackground = memo(function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isVisible = true;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
      if (isVisible) {
        lastLightning = Date.now();
        animationFrameId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animationFrameId);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Lightning bolt generators
    interface Bolt {
      path: { x: number; y: number }[];
      color: string;
      life: number;
      maxLife: number;
      width: number;
    }

    let bolts: Bolt[] = [];

    const createLightning = () => {
      const startX = Math.random() * width;
      const startY = Math.random() * height * 0.3;
      const points: { x: number; y: number }[] = [{ x: startX, y: startY }];

      let currX = startX;
      let currY = startY;
      const segments = 6 + Math.floor(Math.random() * 6);

      for (let i = 0; i < segments; i++) {
        currX += (Math.random() - 0.5) * 40;
        currY += Math.random() * 35 + 10;
        points.push({ x: currX, y: currY });
      }

      const colors = ['#ff2a00', '#ff0055', '#ff9900', '#00d5ff'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      bolts.push({
        path: points,
        color,
        life: 0,
        maxLife: 10 + Math.random() * 10,
        width: 1.5,
      });
    };

    // Floating Particles (Sparks)
    const sparks = Array.from({ length: 25 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 1.2,
      vy: -0.3 - Math.random() * 1.2,
      size: 1 + Math.random() * 2.5,
      color: Math.random() > 0.4 ? '#ffcc00' : Math.random() > 0.5 ? '#ff0055' : '#00d5ff',
    }));

    let lastLightning = Date.now();

    const render = (time: number) => {
      if (!isVisible) return;
      ctx.clearRect(0, 0, width, height);

      // Randomly spawn lightning bolts
      if (Date.now() - lastLightning > 2000 + Math.random() * 3000) {
        createLightning();
        lastLightning = Date.now();
      }

      // Draw bolts
      for (let i = bolts.length - 1; i >= 0; i--) {
        const bolt = bolts[i];
        bolt.life++;

        const alpha = 1 - bolt.life / bolt.maxLife;
        if (alpha <= 0) {
          bolts.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.strokeStyle = bolt.color;
        ctx.lineWidth = bolt.width;
        ctx.globalAlpha = alpha;

        for (let j = 0; j < bolt.path.length; j++) {
          const p = bolt.path[j];
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // Draw floating sparks smoothly
      const nowTime = time * 0.002;
      sparks.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;
        if (s.y < 0) {
          s.y = height;
          s.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = 0.3 + 0.5 * Math.sin(nowTime + s.x);
        ctx.fill();
      });

      ctx.globalAlpha = 1;

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none content-contain gpu-layer">
      {/* Deep Background Base Radial Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-gradient-radial from-red-600/10 via-amber-600/5 to-transparent blur-3xl pointer-events-none gpu-layer" />
      <div className="absolute top-1/3 left-0 w-[350px] h-[350px] bg-gradient-radial from-blue-600/10 via-cyan-500/5 to-transparent blur-3xl pointer-events-none gpu-layer" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-gradient-radial from-red-600/15 via-amber-500/5 to-transparent blur-3xl pointer-events-none gpu-layer" />

      {/* Lightning & Particle Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none gpu-layer" />

      {/* 1. TOP-LEFT ROTATING CASINO ROULETTE WHEEL */}
      <div className="absolute -top-16 -left-20 w-80 h-80 sm:w-96 sm:h-96 opacity-25 pointer-events-none animate-[spin_50s_linear_infinite]">
        <div className="w-full h-full rounded-full border-[6px] border-amber-500/60 relative bg-black/90 overflow-hidden flex items-center justify-center p-2">
          {/* Outer Wheel Rim Pockets */}
          <div className="w-full h-full rounded-full border-2 border-red-600 flex items-center justify-center relative bg-gradient-conic from-red-700 via-zinc-900 to-red-700">
            <div className="absolute inset-0 rounded-full border border-amber-400/40" />
            <div className="w-64 h-64 sm:w-76 sm:h-76 rounded-full border-2 border-amber-400/60 flex items-center justify-center bg-gradient-to-tr from-black via-red-950 to-zinc-950">
              <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 border-amber-300 bg-red-950 flex items-center justify-center font-black text-amber-300 text-4xl">
                ₹
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MID-RIGHT ROTATING CASINO ROULETTE WHEEL */}
      <div className="absolute top-1/2 -right-28 -translate-y-1/2 w-88 h-88 sm:w-104 sm:h-104 opacity-20 pointer-events-none animate-[spin_60s_linear_infinite_reverse]">
        <div className="w-full h-full rounded-full border-[8px] border-red-600/70 relative bg-black/90 overflow-hidden flex items-center justify-center p-3">
          <div className="w-full h-full rounded-full border-2 border-amber-400 flex items-center justify-center relative bg-gradient-conic from-zinc-950 via-red-800 to-zinc-950">
            <div className="w-68 h-68 sm:w-80 sm:h-80 rounded-full border-2 border-amber-500/60 flex items-center justify-center bg-gradient-to-tr from-black via-amber-950 to-black">
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full border-2 border-amber-300 bg-black flex items-center justify-center font-black text-amber-300 text-5xl">
                ₮
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FLOATING CASINO POKER CHIPS & GOLD COINS */}
      <div className="absolute top-24 left-8 sm:left-16 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-red-500 via-red-700 to-red-950 p-1.5 opacity-80 flex items-center justify-center">
        <div className="w-full h-full rounded-full border-2 border-dashed border-white/80 bg-black/90 flex items-center justify-center text-amber-300 font-black text-lg sm:text-xl">
          ₹
        </div>
      </div>

      <div className="absolute top-28 right-8 sm:right-20 w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-gradient-to-br from-yellow-300 via-amber-500 to-red-600 p-1.5 opacity-80 flex items-center justify-center">
        <div className="w-full h-full rounded-full border-2 border-dashed border-yellow-100 bg-gradient-to-tr from-amber-950 to-black flex items-center justify-center text-amber-300 font-black text-xl sm:text-2xl">
          ₮
        </div>
      </div>

      <div className="absolute top-1/2 left-4 sm:left-12 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-emerald-400 via-emerald-600 to-teal-950 p-1.5 opacity-75 flex items-center justify-center">
        <div className="w-full h-full rounded-full border-2 border-dashed border-emerald-200 bg-black/90 flex items-center justify-center text-emerald-300 font-black text-lg sm:text-xl">
          ₹
        </div>
      </div>

      <div className="absolute bottom-1/3 right-6 sm:right-16 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-950 p-1.5 opacity-75 flex items-center justify-center">
        <div className="w-full h-full rounded-full border-2 border-dashed border-cyan-100 bg-black/90 flex items-center justify-center text-cyan-300 font-black text-lg sm:text-xl">
          $
        </div>
      </div>

      <div className="absolute bottom-24 left-10 sm:left-20 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-600 p-1 opacity-70 flex items-center justify-center">
        <div className="w-full h-full rounded-full border border-yellow-100 bg-amber-950/90 flex items-center justify-center text-yellow-300 font-black text-base">
          ₹
        </div>
      </div>

      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-red-600 p-0.5 opacity-70 flex items-center justify-center">
        <div className="w-full h-full rounded-full border border-amber-200 bg-black/90 flex items-center justify-center text-amber-300 font-black text-xs sm:text-sm">
          ₮
        </div>
      </div>
    </div>
  );
});
