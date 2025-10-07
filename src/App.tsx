import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * App shell:
 * - Sticky mono header (Home / Admin / Map)
 * - CRT scanlines + glow overlays
 * - Font: mono, colors: black/green
 * - <Outlet /> renders Home, JCode, Admin pages you wired
 */
export default function App() {
  const loc = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-black text-green-400 font-mono">
      <GlobalStyles />
      <CRTOverlays />

      <header className="sticky top-0 z-50 border-b border-green-500/25 bg-black/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="text-green-300 hover:text-green-200 tracking-tight"
          >
            <span className="mr-2">{">"}</span>
            REJECTED APPLICATIONS INC.
            <span className="ml-1 crt-cursor">_</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Your pages (Home, JCode, Admin) render here */}
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

/** CRT scanlines + vignette glow overlays */
function CRTOverlays() {
  return (
    <>
      {/* Scanlines */}
      <div
        className="pointer-events-none fixed inset-0 opacity-15"
        style={{
          background:
            "repeating-linear-gradient(180deg, rgba(0,255,100,0.06) 0px, rgba(0,255,100,0.06) 1px, transparent 2px, transparent 4px)",
          zIndex: 0,
        }}
      />
      {/* Soft vignette/glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20 mix-blend-screen"
        style={{
          background:
            "radial-gradient(1200px 500px at 50% -10%, rgba(0,255,140,0.15), transparent 60%), radial-gradient(800px 400px at 90% 10%, rgba(0,255,140,0.12), transparent 60%)",
          zIndex: 0,
        }}
      />
    </>
  );
}

/** A few global keyframes/utilities for the cursor blink */
function GlobalStyles() {
  return (
    <style>{`
      .crt-cursor { display:inline-block; width: 0.6ch; animation: blink 1.1s steps(1, end) infinite; }
      @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }

      /* Optional helper if you want a max-width container anywhere else:
         <div class="mx-auto max-w-6xl px-4"> ... </div>
      */
    `}</style>
  );
}
