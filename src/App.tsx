import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

/* --- Matrix Rain from your first iteration --- */
function MatrixRain() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current!, x = c.getContext("2d")!;
    let w = (c.width = innerWidth), h = (c.height = innerHeight);
    const fs = 16, cols = Math.floor(w / fs);
    const chars = "アイウエオｱｲｳｴｵ0123456789#$%&*+-/<>".split("");
    const drops = Array(cols).fill(0).map(() => Math.floor(Math.random() * h / fs));
    const res = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
    addEventListener("resize", res);
    let id = 0;
    (function draw() {
      id = requestAnimationFrame(draw);
      x.fillStyle = "rgba(0,0,0,.08)"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#00ff66"; x.font = `${fs}px "Share Tech Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const t = chars[(Math.random() * chars.length) | 0];
        x.fillText(t, i * fs, drops[i] * fs);
        if (drops[i] * fs > h && Math.random() > .975) drops[i] = 0;
        drops[i]++;
      }
    })();
    return () => { cancelAnimationFrame(id); removeEventListener("resize", res); };
  }, []);
  return <canvas className="matrix" ref={ref} />;
}

export default function App() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-black text-green-400 font-mono">
      {/* the background */}
      <MatrixRain />

      <header className="sticky top-0 z-50 border-b border-green-500/25 bg-black/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-green-300 hover:text-green-200 tracking-tight">
            <span className="mr-2">{">"}</span>
            REJECTED APPLICATIONS INC.
            <span className="ml-1 crt-cursor">_</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-green-500/20 py-6 text-center text-green-300/80">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-green-500/75">
          <div className="flex items-center justify-between gap-3">
            <p>© {new Date().getFullYear()} Rejected Applications Inc.</p>
            <p>Asset Relocation Specialists — “We relocate your assets.”</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
