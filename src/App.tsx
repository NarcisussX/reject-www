import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";

/**
 * App shell:
 * - Sticky mono header
 * - Global CRT scanlines + glow + MATRIX rain background
 * - Pages (Home, JCode, Admin) render in <Outlet />
 */
export default function App() {
  const loc = useLocation();

  // Scroll to top on route change
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh flex flex-col bg-black text-green-400 font-mono">
      <GlobalStyles />
      <CRTOverlays />
      <MatrixOverlay />  {/* << add the animated matrix bg */}

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

/** CRT scanlines + soft vignette/glow */
function CRTOverlays() {
  return (
    <>
      {/* Scanlines */}
      <div
        className="pointer-events-none fixed inset-0 opacity-15"
        style={{
          background:
            "repeating-linear-gradient(180deg, rgba(0,255,100,0.06) 0px, rgba(0,255,100,0.06) 1px, transparent 2px, transparent 4px)",
          zIndex: 2, // above matrix, below content
        }}
      />
      {/* Soft glow/vignette */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20 mix-blend-screen"
        style={{
          background:
            "radial-gradient(1200px 500px at 50% -10%, rgba(0,255,140,0.15), transparent 60%), radial-gradient(800px 400px at 90% 10%, rgba(0,255,140,0.12), transparent 60%)",
          zIndex: 1, // sits with the matrix layer
        }}
      />
    </>
  );
}

/** Animated matrix "rain" behind content */
function MatrixOverlay() {
  const rain =
    "0110 1001 0011 1010 1101 0010 1111 0001 0101 0011 1110 1010 0101 1011 0000 1101\n" +
    "0100 1101 1001 0001 1011 0110 0101 1110 0011 0101 1010 1111 0101 0011 0001 0010\n" +
    "1110 0001 1010 0101 1101 1000 0111 0001 0110 1100 0011 1011 0101 1110 0001 1111\n" +
    "0011 0101 1010 1110 0101 0011 0001 0010 0110 1110 1001 0001 0011 0101 0001 1110\n";

  const Col = (props: { left: string; dur: number; delay?: number }) => (
    <pre
      aria-hidden
      className="matrix-col select-none"
      style={{
        left: props.left,
        animationDuration: `${props.dur}s`,
        animationDelay: `${props.delay ?? 0}s`,
      }}
    >
      {rain.repeat(6)}
    </pre>
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0, opacity: 0.18 }}
    >
      <Col left="6%" dur={18} />
      <Col left="38%" dur={22} delay={-6} />
      <Col left="74%" dur={26} delay={-12} />
    </div>
  );
}

/** Global utilities (blink + matrix CSS) */
function GlobalStyles() {
  return (
    <style>{`
      .crt-cursor { display:inline-block; width: 0.6ch; animation: blink 1.1s steps(1,end) infinite; }
      @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }

      /* Matrix columns */
      .matrix-col{
        position:absolute;
        top:-110%;
        white-space:pre;
        font-size:12px;
        line-height:1.25;
        color:#27f376;
        text-shadow: 0 0 6px rgba(39,243,118,.55);
        animation-name: matrixRain;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
        filter: saturate(120%);
      }
      @keyframes matrixRain { to { transform: translateY(210%); } }
    `}</style>
  );
}
