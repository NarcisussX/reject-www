import React, { useEffect, useMemo, useRef, useState } from "react";

/* ----------------- Site constants ----------------- */
const CORP = "REJECT.APP";
const WALLET = "Leshak Pilot 1";      // in-game wallet/character
const DEADLINE_MIN = 10;

/* structure base prices (in millions of ISK) */
type StructKey = "Astrahus" | "Raitaru" | "Athanor" | "Fortizar" | "Tatara" | "Azbel";
const STRUCT_PRICES_M: Record<StructKey, number> = {
  Astrahus: 1000,
  Raitaru: 700,
  Athanor: 700,
  Fortizar: 14000,
  Tatara: 7000,
  Azbel: 9000,
};

function fmtISKm(millions: number) {
  if (millions >= 1000) return `${(millions / 1000).toFixed(2)}b ISK`;
  return `${Math.round(millions)}m ISK`;
}

/* ----------------- Visuals ----------------- */
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

function useTerminalFeed() {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const script = [
      "[INIT] Linking wormhole grid… ok",
      "[SCAN] Rolling mass thresholds… ok",
      "[AUTH] ESI scopes … ok",
      "[HOOK] Dropping ransom banner… ok",
      "[NOTE] We're watching you.",
      "[WARN] Grid is locked. Contact negotiator or pay ransom.",
    ];
    let i = 0;
    const id = setInterval(() => { setLines(p => [...p, script[i]]); if (++i >= script.length) clearInterval(id); }, 600);
    return () => clearInterval(id);
  }, []);
  return lines;
}

/* ----------------- Generic modal ----------------- */
type ModalProps = { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; };
function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3 className="glow">{title}</h3>
          <button className="ghost" onClick={onClose}>CLOSE ✕</button>
        </header>
        <div>{children}</div>
        <footer>{footer ?? <button className="ghost" onClick={onClose}>OK</button>}</footer>
      </div>
    </div>
  );
}

/* ----------------- Calculator modal ----------------- */
type Counts = Record<StructKey, number>;

function CalcModal({
  initialCounts,
  initialAgeYears,
  onClose,
  onUseTotal,
}: {
  initialCounts?: Partial<Counts>;
  initialAgeYears?: number;
  onClose: () => void;
  onUseTotal: (totalMillions: number) => void;
}) {
  const [counts, setCounts] = useState<Counts>(() => ({
    Astrahus: initialCounts?.Astrahus ?? 0,
    Raitaru: initialCounts?.Raitaru ?? 0,
    Athanor: initialCounts?.Athanor ?? 0,
    Fortizar: initialCounts?.Fortizar ?? 0,
    Tatara: initialCounts?.Tatara ?? 0,
    Azbel: initialCounts?.Azbel ?? 0,
  }));
  const [ageYears, setAgeYears] = useState<number>(initialAgeYears ?? 0);

  const totalStructures = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const baseMillions = useMemo(() => {
    let sum = 0;
    (Object.keys(STRUCT_PRICES_M) as StructKey[]).forEach(k => { sum += STRUCT_PRICES_M[k] * (counts[k] ?? 0); });
    return sum;
  }, [counts]);

  // Age pricing:
  //  - age 0: +500m if ≤2 structures, +800m if ≥3
  //  - age ≥1: +700m per structure per year
  const ageAdderMillions = useMemo(() => {
    if (totalStructures === 0) return 0;
    if (ageYears <= 0) return totalStructures >= 3 ? 800 : 500;
    return 700 * totalStructures * ageYears;
  }, [totalStructures, ageYears]);

  const totalMillions = baseMillions + ageAdderMillions;
  const ageLabel = ageYears <= 0 ? "Less than 1 year" : `${ageYears} year${ageYears === 1 ? "" : "s"}`;

  const set = (k: StructKey, v: number) => setCounts(c => ({ ...c, [k]: Math.max(0, Math.floor(v || 0)) }));

  return (
    <Modal
      title="RANSOM CALCULATOR"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button onClick={() => onUseTotal(totalMillions)}>Use this total</button>
        </>
      }
    >
      <div className="badge" style={{ marginBottom: 10 }}>
        Average age of your structures: Don’t lie, we already know the answer!
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10 }}>
        <input type="range" min={0} max={8} step={1} value={ageYears} onChange={e => setAgeYears(parseInt(e.currentTarget.value, 10))} />
        <div className="glow">{ageLabel}</div>
      </div>

      <div style={{ marginTop: 14 }} />

      <div className="badge" style={{ marginBottom: 8 }}>Structures</div>
      {/* No per-structure prices; only labels + counters */}
      <div className="grid2">
        {(Object.keys(STRUCT_PRICES_M) as StructKey[]).map(k => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 132px", gap: 8, alignItems: "center" }}>
            <div>{k}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="ghost" onClick={() => set(k, (counts[k] ?? 0) - 1)}>-</button>
              <input
                className="countInput"
                type="number"
                min={0}
                value={counts[k] ?? 0}
                onChange={e => set(k, Number(e.currentTarget.value))}
                placeholder="0"
              />
              <button className="ghost" onClick={() => set(k, (counts[k] ?? 0) + 1)}>+</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid rgba(0,255,102,.35)", paddingTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <div>Base total</div><div>{fmtISKm(baseMillions)}</div>
          <div>Age adjustment</div><div>{fmtISKm(ageAdderMillions)}</div>
          <div style={{ borderTop: "1px solid rgba(0,255,102,.35)", marginTop: 6 }}></div>
          <div className="glow">Total ransom</div><div className="glow">{fmtISKm(totalMillions)}</div>
        </div>
        <div style={{ marginTop: 8, opacity: .8 }}>
          {totalStructures === 0 ? "Select at least one structure to calculate." :
            ageYears <= 0
              ? (totalStructures >= 3 ? "Age < 1y: +800m (3+ structures)" : "Age < 1y: +500m (≤2 structures)")
              : `Age ≥ 1y: +700m × ${totalStructures} structs × ${ageYears} years`}
        </div>
      </div>
    </Modal>
  );
}

/* ----------------- Negotiate modal (Discord webhook) ----------------- */
function NegotiateModal({
  onClose,
  wallet,
  amountText,
}: {
  onClose: () => void;
  wallet: string;
  amountText: string;
}) {
  const [jcode, setJcode] = useState("");
  const [ign, setIgn] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState<null | boolean>(null);
  const [err, setErr] = useState<string>("");

  async function submit() {
    setSending(true);
    setOk(null);
    setErr("");

    const payload = {
      username: "Reject.App Bot",
      embeds: [
        {
          title: "Negotiation Request",
          color: 0x00ff66,
          fields: [
            { name: "J-Code", value: jcode || "—", inline: true },
            { name: "Pilot", value: ign || "—", inline: true },
            { name: "Quoted Amount", value: amountText || "—", inline: true },
            { name: "Message", value: msg || "—" },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const res = await fetch("/api/negotiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jcode,
          pilot: ign,
          message: msg,
          amount: amountText || "",
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOk(true);
      setTimeout(onClose, 900);
    } catch (e: any) {
      // Likely CORS or webhook disabled
      setOk(false);
      setErr(e?.message || "Network error (possibly CORS)");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title="NEGOTIATE"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button onClick={submit} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <div className="grid2">
        <div>
          <div className="badge" style={{ marginBottom: 8 }}>J-Code</div>
          <input placeholder="e.g. J123456" value={jcode} onChange={(e) => setJcode(e.target.value)} />
        </div>
        <div>
          <div className="badge" style={{ marginBottom: 8 }}>In-game name</div>
          <input placeholder="Your pilot name" value={ign} onChange={(e) => setIgn(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <div className="badge" style={{ marginBottom: 8 }}>Message</div>
        <textarea rows={5} placeholder="Your terms, timing, collateral…"
          value={msg} onChange={(e) => setMsg(e.target.value)} />
      </div>

      <div style={{ marginTop: 10, opacity: .8 }}>
        Will be sent directly to our directors.
      </div>

      {ok === true && (
        <div style={{ marginTop: 10, border: "1px solid rgba(0,255,102,.5)", padding: 8 }} className="glow">
          Sent. We’ll review and respond via diplomacy.
        </div>
      )}
      {ok === false && (
        <div style={{ marginTop: 10, border: "1px solid #ff3b3b", color: "#ff3b3b", padding: 8 }}>
          Failed to send: {err}. If this persists, ping us in-game.
        </div>
      )}
    </Modal>
  );
}

/* ----------------- Main ----------------- */
export default function App() {
  const lines = useTerminalFeed();
  const [endsAt] = useState<number>(Date.now() + DEADLINE_MIN * 60_000);
  const [, tick] = useState(0);

  const [payOpen, setPayOpen] = useState(false);
  const [negOpen, setNegOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  const [amountMillions, setAmountMillions] = useState<number | null>(null);

  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(id); }, []);
  const remain = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");

  const amountText = amountMillions == null ? "" : fmtISKm(amountMillions);
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); } catch { } };

  return (
    <div className="screen">
      <MatrixRain />
      <div className="wrap content">
        <div className="container">
          <header className="header">
            <div className="badge glow">[{CORP}] Rejected Applications Inc.</div>
            <div className="glow">SECURITY CONSOLE <span className="blink">▮</span></div>
          </header>

          <main className="grid">
            <section className="panel ransom">
              <h1 className="glow">RANSOM NOTICE</h1>

              <div className="kv" style={{ marginTop: 6 }}>
                <div>Target</div><div>{CORP} // WH GRID</div>

                <div>Amount</div>
                <div>
                  {amountMillions == null ? (
                    <button onClick={() => setCalcOpen(true)}>Calculate Your Ransom!</button>
                  ) : (
                    <>
                      <span className="glow">{amountText}</span>
                      <button className="ghost" style={{ marginLeft: 10 }} onClick={() => setCalcOpen(true)}>recalculate</button>
                    </>
                  )}
                </div>

                <div>Deadline</div><div>{mm}:{ss} (mm:ss)</div>
                <div>Pay To</div><div>{WALLET} (in-game)</div>
              </div>

              <div className="btns">
                <button onClick={() => setPayOpen(true)}>PAY RANSOM</button>
                <button className="ghost" onClick={() => setNegOpen(true)}>NEGOTIATE</button>
              </div>

              <p style={{ marginTop: 10, opacity: .8 }}>
                The timer here is fake but your structure timer isn't!
              </p>
            </section>

            <section className="panel">
              <div className="badge" style={{ marginBottom: 10 }}>TERMINAL</div>
              <div className="term" id="term">
                {lines.map((l, i) => (<div className="row" key={i}>{l}</div>))}
              </div>
            </section>
          </main>

          <footer className="footer">
            <div>© {new Date().getFullYear()} Reject.App</div>
            <div>channel: <span className="glow">#diplomacy</span>  ·  contact: <span className="glow">@{WALLET}</span></div>
          </footer>
        </div>
      </div>

      {/* PAY modal */}
      {payOpen && (
        <Modal title="PAY RANSOM" onClose={() => setPayOpen(false)}>
          <div className="grid2">
            <div>
              <div className="badge" style={{ marginBottom: 8 }}>RECIPIENT</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={WALLET} />
                <button onClick={() => copy(WALLET)}>COPY</button>
              </div>
            </div>
            <div>
              <div className="badge" style={{ marginBottom: 8 }}>AMOUNT</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input readOnly value={amountMillions == null ? "" : amountText} placeholder="Use calculator first" />
                <button onClick={() => amountMillions != null && copy(amountText)}>COPY</button>
              </div>
            </div>
          </div>
          <p style={{ marginTop: 12, opacity: .85 }}>
            Send ISK in-game to <span className="glow">{WALLET}</span>.
          </p>
        </Modal>
      )}

      {/* NEGOTIATE modal (Discord webhook) */}
      {negOpen && (
        <NegotiateModal
          onClose={() => setNegOpen(false)}
          wallet={WALLET}
          amountText={amountText}
        />
      )}

      {/* CALCULATOR modal */}
      {calcOpen && (
        <CalcModal
          onClose={() => setCalcOpen(false)}
          onUseTotal={(m) => { setAmountMillions(m); setCalcOpen(false); }}
        />
      )}
    </div>
  );
}
