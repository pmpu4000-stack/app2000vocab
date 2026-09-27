// =====================================================================
// confetti.js — a tiny canvas celebration on correct answers.
// Respects prefers-reduced-motion.
// =====================================================================
const canvas = document.getElementById("fx");
const ctx = canvas.getContext("2d");
const COLORS = ["#6C4CE0", "#FFD84D", "#2FB47C", "#FF6B6B", "#2D9CDB"];

let parts = [];
let raf = null;

function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
resize();
addEventListener("resize", resize);

export function burst() {
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  for (let i = 0; i < 80; i++) {
    parts.push({
      x: canvas.width / 2, y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 11, vy: Math.random() * -11 - 3,
      g: 0.32, s: 6 + Math.random() * 7, c: COLORS[i % COLORS.length],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 0,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
    ctx.restore();
  }
  parts = parts.filter((p) => p.y < canvas.height + 30 && p.life < 160);
  if (parts.length) {
    raf = requestAnimationFrame(tick);
  } else {
    raf = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
