import React, { useEffect, useRef, useState } from "react";

const CORP = "REJECT.APP";
const WALLET = "Triffnixxx";    // in-game wallet/character for ISK
const AMOUNT = "1.50b ISK";
const DEADLINE_MIN = 10;

function MatrixRain() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const fontSize = 16;
    const columns = Math.floor(w / fontSize);
    const chars = "アイウエオカキクケコｱｲｳｴｵｶｷｸｹｺ0123456789#$%&*+-/<>".split("");
    const drops = Array(columns).fill(0).map(() => Math.floor(Math.random() * h / fontSize));

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#00ff66";
      ctx.font = `${fontSize}px "Share Tech Mono", monospace`;

      for (let i = 0; i < columns; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > h && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas className="matrix" ref={ref} />;
}

function useTerminalFeed() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const script = [
      "[INIT] Linking wormhole grid… ok",
      "[SCAN] Enumerating citadels…  ▓▓▓▓▓▓▓▓▓▓ 100%",
      "[SCAN] Rolling mass thresholds… ok",
      "[AUTH] ESI scopes … ok",
      "[HOOK] Dropping ransom banner… ok",
      "[NOTE] This is a roleplay UI for EVE Online. No real systems are harmed.",
      "[WARN] Grid is locked. Contact negotiator or pay ransom.",
    ];
    let i = 0;
    const id = setInterval(() => {
      setLines((prev) => [...prev, script[i]]);
      i++;
      if (i >= script.length) clearInterval(id);
    }, 600);
    return () => clearInterval(id);
  }, []);
  return lines;
}

export default function App() {
  const lines = useTerminalFeed();
  const [endsAt] = useState<number>(Date.now() + DEADLINE_MIN * 60_000);
  const [, rerender] = useState(0);

  // simple countdown ticker
  useEffect(() => {
    const id = setInterval(() => rerender((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const remain = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");

  return (
    <div className="screen">
      <MatrixRain />
      <div className="wrap content">
        <header className="header">
          <div className="badge glow">[{CORP}] NODE-ALPHA</div>
          <div className="glow">SECURITY CONSOLE <span className="blink">▮</span></div>
        </header>

        <main className="grid">
          <section className="panel ransom">
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16 }}>
              <pre className="skull">
{String.raw`
      .----.
   _.'__    \\
 .--(#)(##)---.
' @          @ '
|   .------.   |
|  /  ☠  ☠  \  |
\_/|   __   |\_/
   |  (__)  |
   \        /
    '------'
`}
              </pre>
              <div>
                <h1 className="glow">RANSOM NOTICE</h1>
                <div className="kv">
                  <div>Target</div><div>{CORP} // WH GRID</div>
                  <div>Amount</div><div>{AMOUNT}</div>
                  <div>Deadline</div><div>{mm}:{ss} (mm:ss)</div>
                  <div>Pay To</div><div>{WALLET} (in-game)</div>
                </div>
                <div className="btns">
                  <button onClick={() => alert("Open EVE, send ISK in-game to " + WALLET)}>
                    PAY RANSOM
                  </button>
                  <button onClick={() => alert("Open EVE mail to negotiate…")}>
                    NEGOTIATE
                  </button>
                </div>
                <p style={{ marginTop: 10, opacity: .8 }}>
                  For EVE Online roleplay / diplomacy only. No real-world systems are targeted.
                </p>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="badge" style={{ marginBottom: 10 }}>TERMINAL</div>
            <div className="term" id="term">
              {lines.map((l, i) => (
                <div className="row" key={i}>{l}</div>
              ))}
            </div>
          </section>
        </main>

        <footer className="footer">
          <div>© {new Date().getFullYear()} Reject.App</div>
          <div>channel: <span className="glow">#diplomacy</span>  ·  contact: <span className="glow">@{WALLET}</span></div>
        </footer>
      </div>
    </div>
  );
}
