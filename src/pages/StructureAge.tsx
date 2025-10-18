// pages/StructureAge.tsx
/* eslint-disable  @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import SystemIntel from "./SystemIntel";

const fmtUTC = (iso: string) =>
    new Date(iso).toUTCString().replace(' GMT', ' UTC');

const extractFromPaste = (raw: string) => {
    const text = raw.trim();

    // structure id: digits after `//` in showinfo, or any 10+ digit token
    const idMatch =
        text.match(/\/\/(\d{10,})>/) || text.match(/\b(\d{10,})\b/);
    const structureId = idMatch ? idMatch[1] : null;

    // J-code: J + 6 digits (case-insensitive)
    const jMatch = text.match(/\bJ\d{6}\b/i);
    const jcode = jMatch ? jMatch[0].toUpperCase() : null;

    // corp name: inside the final (...) before </url> or end of line
    let corpName: string | null = null;
    const corpInUrl = text.match(/\(([^()]+)\)\s*<\/url>/);
    if (corpInUrl) corpName = corpInUrl[1].trim();
    else {
        const corpAtEnd = text.match(/\(([^()]+)\)\s*$/);
        if (corpAtEnd) corpName = corpAtEnd[1].trim();
    }

    return { structureId, jcode, corpName };
};

function humanizeDays(days: number) {
    const abs = Math.abs(days);
    if (abs < 14) return `${abs} day${abs === 1 ? "" : "s"}`;
    const years = Math.floor(abs / 365.25);
    const months = Math.floor((abs - years * 365.25) / 30.44);
    const remDays = Math.round(abs - years * 365.25 - months * 30.44);

    const parts: string[] = [];
    if (years) parts.push(`${years}y`);
    if (months) parts.push(`${months}m`);
    // include days for small ages so it feels precise
    if (!years && remDays && months < 3) parts.push(`${remDays}d`);
    return parts.join(" ");
}

function ReinforcePopover() {
    const [open, setOpen] = useState(false);
    const [utcInput, setUtcInput] = useState("");
    const [copied, setCopied] = useState(false);
    const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));

    // parse "300", "1800", "03:00"
    function parseUtcHHMM(raw: string) {
        const s = raw.trim();
        if (!s) return null;
        const d = s.replace(/\D/g, "");
        let h = 0, m = 0;
        if (/^\d{4}$/.test(d)) { h = +d.slice(0, 2); m = +d.slice(2, 4); }
        else if (/^\d{3}$/.test(d)) { h = +d.slice(0, 1); m = +d.slice(1, 3); }
        else if (/^\d{1,2}:\d{2}$/.test(s)) { const [hh, mm] = s.split(":"); h = +hh; m = +mm; }
        else return null;
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        return { h, m };
    }

    const fmt = (d: Date, tz: string, withZone = false) =>
        new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            ...(withZone ? { timeZoneName: "short" } : {})
        }).format(d);

    const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const todayUTC = { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() };

    const parsed = parseUtcHHMM(utcInput);
    const base = parsed ? new Date(Date.UTC(todayUTC.y, todayUTC.m, todayUTC.d, parsed.h, parsed.m, 0)) : null;
    const epoch = base ? Math.floor(base.getTime() / 1000) : null;

    async function copyDiscord() {
        if (!epoch) return;
        try {
            await navigator.clipboard.writeText(`<t:${epoch}:t>`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
        } catch { }
    }

    return (
        <div className="relative" ref={wrapRef}>
            <button
                onClick={() => setOpen(v => !v)}
                className="px-3 py-1 rounded-full text-xs border border-green-500/40 bg-black/60 text-green-200 hover:bg-green-500/10"
                title="Convert a UTC time to US timezones + make a Discord timecode"
            >
                UTC → PT/CT/ET
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-green-500/30 bg-black/80 p-3 shadow-xl backdrop-blur-sm">
                    <div className="text-green-300 font-semibold text-sm mb-2">Reinforcement time</div>

                    <input
                        className="w-full bg-black/60 border border-green-500/30 rounded px-2 py-1 text-green-200 outline-none focus:border-green-400 text-sm"
                        placeholder="e.g. 300, 1800, 03:00 (UTC)"
                        value={utcInput}
                        onChange={(e) => setUtcInput(e.target.value)}
                        autoFocus
                    />

                    {!utcInput && <div className="text-xs text-green-300/70 mt-1">Today’s date; auto-DST.</div>}

                    {utcInput && !parsed && (
                        <div className="text-red-400 text-xs mt-2">
                            Enter 24h UTC like <code>300</code>, <code>1800</code>, or <code>03:00</code>.
                        </div>
                    )}

                    {base && (
                        <div className="text-sm text-green-200/90 mt-2 space-y-1">
                            <div><span className="text-green-400/80">INPUT (UTC):</span> {String(parsed!.h).padStart(2, "0")}:{String(parsed!.m).padStart(2, "0")}</div>
                            <div><span className="text-green-400/80">Viewer ({localTZ}):</span> {fmt(base, localTZ, true)}</div>
                            <div><span className="text-green-400/80">Pacific:</span> {fmt(base, "America/Los_Angeles", true)} {/* e.g., PDT/PST */}</div>
                            <div><span className="text-green-400/80">Central:</span> {fmt(base, "America/Chicago", true)}</div>
                            <div><span className="text-green-400/80">Eastern:</span> {fmt(base, "America/New_York", true)}</div>

                            <button
                                onClick={copyDiscord}
                                className="mt-2 w-full text-xs border border-green-500/30 hover:border-green-400 rounded px-2 py-1 text-green-200 hover:bg-green-500/10"
                                title="Copy Discord timecode"
                            >
                                {copied ? "Copied!" : `Copy Discord timecode  <t:${epoch}:t>`}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


/** ---------- helpers used by both popovers ---------- */
function useOutsideClose<T extends HTMLElement>(onClose: () => void) {
    const ref = useRef<T | null>(null);
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!ref.current) return;
            if (!ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [onClose]);
    return ref;
}

/** ---------- PRIME-TIME PICKER ---------- */
function PrimeTimePopover({ jcode }: { jcode?: string }) {
    const [open, setOpen] = useState(false);
    const [activity, setActivity] = useState<any | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));

    useEffect(() => {
        if (!open) return;
        let abort = false;
        (async () => {
            try {
                setErr(null); setActivity(null);
                if (!jcode) { setErr("Paste a J-code first"); return; }
                const sys = await fetch(`/api/system-id/${encodeURIComponent(jcode)}`).then(r => r.json());
                if (!sys?.id) { setErr("Could not resolve system ID"); return; }
                if (abort) return;
                const act = await fetch(`/api/zkill-activity/${sys.id}`).then(r => r.json());
                if (!abort) setActivity(act);
            } catch (e: any) {
                if (!abort) setErr(e.message || "Failed to load activity");
            }
        })();
        return () => { abort = true; };
    }, [open, jcode]);

    function suggestWindows() {
        if (!activity?.days) return [];
        const perHour = Array.from({ length: 24 }, (_, h) => {
            let sum = 0;
            for (let d = 0; d < activity.days.length; d++) sum += Number(activity[d]?.[h] || 0);
            return sum;
        });
        const bands = [];
        for (let start = 0; start < 24; start++) {
            const next = (start + 1) % 24;
            bands.push({ start, end: next, score: perHour[start] + perHour[next] });
        }
        bands.sort((a, b) => a.score - b.score);

        const picks: { day: string; start: number; end: number; score: number }[] = [];
        const dayNames: string[] = activity.days;
        const used = new Set<number>();
        for (const b of bands) {
            if ([b.start, b.end].some(h => used.has(h))) continue;
            let bestDay = 0, bestScore = Infinity;
            for (let d = 0; d < dayNames.length; d++) {
                const s = Number(activity[d]?.[b.start] || 0) + Number(activity[d]?.[b.end] || 0);
                if (s < bestScore) { bestScore = s; bestDay = d; }
            }
            picks.push({ day: dayNames[bestDay], start: b.start, end: (b.start + 2) % 24, score: b.score });
            used.add(b.start); used.add(b.end);
            if (picks.length >= 3) break;
        }
        return picks;
    }

    const picks = activity ? suggestWindows() : [];

    return (
        <div className="relative" ref={wrapRef}>
            <button
                onClick={() => setOpen(v => !v)}
                className="px-3 py-1 rounded-full text-xs border border-green-500/40 bg-black/60 text-green-200 hover:bg-green-500/10 disabled:opacity-40"
                disabled={!jcode}
                title={jcode ? "Suggest quiet 2h windows to bash" : "Paste a J-code first"}
            >
                Best TZ to hit
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-green-500/30 bg-black/80 p-3 shadow-xl backdrop-blur-sm">
                    <div className="text-green-300 font-semibold text-sm mb-2">Lowest Prime-time picker</div>
                    {!err && !activity && <div className="text-sm text-green-200/80">Loading activity…</div>}
                    {err && <div className="text-red-400 text-sm">{err}</div>}
                    {!!picks.length && (
                        <ul className="text-sm text-green-200/90 space-y-1">
                            {picks.map((p, i) => (
                                <li key={i}>
                                    <span className="text-green-400/80">{p.day}</span>{" "}
                                    {String(p.start).padStart(2, "0")}–{String(p.end).padStart(2, "0")} UTC
                                    <span className="text-green-500/60"> (low activity)</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="mt-2 text-xs text-green-300/70">
                        Based on zKill last-period heatmap. Uses the 3 lowest 2-hour bands across the week.
                    </div>
                </div>
            )}
        </div>
    );
}


/** ---------- DEFENDER TIMEZONE GUESS ---------- */
function DefenderTZPopover({ corpId, corpName }: { corpId?: number; corpName?: string }) {
    const [open, setOpen] = useState(false);
    const [activity, setActivity] = useState<any | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const wrapRef = useOutsideClose<HTMLDivElement>(() => setOpen(false));

    useEffect(() => {
        if (!open) return;
        let abort = false;
        (async () => {
            try {
                setErr(null); setActivity(null);
                if (!corpId) { setErr("Paste a corp first"); return; }
                const act = await fetch(`/api/zkill-corp-activity/${corpId}`).then(r => r.json());
                if (!abort) setActivity(act);
            } catch (e: any) { if (!abort) setErr(e.message || "Failed to load corp activity"); }
        })();
        return () => { abort = true; };
    }, [open, corpId]);

    function classifyTZ() {
        if (!activity?.days) return null;
        // Sum per hour across days
        const perHour = Array.from({ length: 24 }, (_, h) => {
            let sum = 0;
            for (let d = 0; d < activity.days.length; d++) sum += Number(activity[d]?.[h] || 0);
            return sum;
        });
        const total = perHour.reduce((a, b) => a + b, 0);
        if (!total) return null;

        // Circular mean hour
        const toRad = (h: number) => (2 * Math.PI * h) / 24;
        let X = 0, Y = 0;
        for (let h = 0; h < 24; h++) {
            X += perHour[h] * Math.cos(toRad(h));
            Y += perHour[h] * Math.sin(toRad(h));
        }
        let mean = Math.atan2(Y, X) * 24 / (2 * Math.PI);
        if (mean < 0) mean += 24;
        const peak = Math.round(mean) % 24;

        // Buckets in UTC (rough)
        const buckets = [
            { label: "Americas (US)", range: [23, 6] },  // 23–06
            { label: "EU", range: [17, 22] }, // 17–22
            { label: "RU/Eastern EU", range: [13, 17] }, // 13–17
            { label: "AU/NZ", range: [7, 12] },  // 07–12
        ];
        const inRange = (h: number, a: number, b: number) => a <= b ? (h >= a && h <= b) : (h >= a || h <= b);
        const score = (a: number, b: number) => {
            let s = 0;
            for (let h = 0; h < 24; h++) if (inRange(h, a, b)) s += perHour[h];
            return s;
        };
        const scored = buckets.map(b => ({ ...b, s: score(b.range[0], b.range[1]) }));
        scored.sort((x, y) => y.s - x.s);
        const top = scored[0];
        const conf = Math.round((top.s / total) * 100);

        return {
            label: top.label,
            peak,
            conf,
        };
    }

    const guess = activity ? classifyTZ() : null;

    return (
        <div className="relative" ref={wrapRef}>
            <button
                onClick={() => setOpen(v => !v)}
                className="px-3 py-1 rounded-full text-xs border border-green-500/40 bg-black/60 text-green-200 hover:bg-green-500/10 disabled:opacity-40"
                disabled={!corpId}
                title={corpId ? "Guess defender prime time from corp activity" : "Paste a corp first"}
            >
                Defender TZ
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-green-500/30 bg-black/80 p-3 shadow-xl backdrop-blur-sm">
                    <div className="text-green-300 font-semibold text-sm mb-2">Defender timezone guess</div>
                    {!err && !activity && <div className="text-sm text-green-200/80">Loading corp activity…</div>}
                    {err && <div className="text-red-400 text-sm">{err}</div>}
                    {guess && (
                        <div className="text-sm text-green-200/90">
                            <div><span className="text-green-400/80">Corp:</span> {corpName ?? corpId}</div>
                            <div><span className="text-green-400/80">Likely zone:</span> <b>{guess.label}</b></div>
                            <div><span className="text-green-400/80">Peak hour:</span> ~{String(guess.peak).padStart(2, "0")}:00 UTC</div>
                            <div className="text-green-500/70 text-xs mt-1">Confidence: ~{guess.conf}% (share of activity in that zone)</div>
                        </div>
                    )}
                    <div className="mt-2 text-xs text-green-300/70">
                        Based on last-period zKill activity.
                    </div>
                </div>
            )}
        </div>
    );
}

function IntelToolbar({ jcode, corpId, corpName }: { jcode?: string; corpId?: number; corpName?: string }) {
    return (
        <div className="fixed z-40 top-26 right-4 sm:right-6 flex gap-2">
            <ReinforcePopover />
            <PrimeTimePopover jcode={jcode} />
            <DefenderTZPopover corpId={corpId} corpName={corpName} />
        </div>
    );
}

const ageDaysFromNow = (iso: string) =>
    Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

type AgeResp = {
    id: string; method: "exact" | "interpolate" | "extrapolate-head" | "extrapolate-tail";
    midISO: string; lowISO: string; highISO: string; daysWide: string;
};

const AUTH_KEY = "reject.admin.auth";

function AdminLogin({ onAuthed }: { onAuthed: (b64: string) => void }) {
    const [u, setU] = useState(""); const [p, setP] = useState(""); const [err, setErr] = useState("");
    async function submit(e: React.FormEvent) {
        e.preventDefault(); setErr("");
        const b64 = btoa(`${u}:${p}`);
        const r = await fetch("/api/admin/systems", { headers: { Authorization: "Basic " + b64 } });
        if (r.status === 401 || r.status === 403) { setErr("Invalid credentials"); return; }
        sessionStorage.setItem(AUTH_KEY, b64); onAuthed(b64);
    }
    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center p-6">
            <form onSubmit={submit} className="w-full max-w-sm border border-green-500/40 rounded p-4 bg-black">
                <h1 className="text-xl mb-3">Admin login</h1>
                <input value={u} onChange={e => setU(e.target.value)} placeholder="User"
                    className="w-full bg-black border border-green-500/40 rounded px-3 py-2 mb-2" />
                <input value={p} onChange={e => setP(e.target.value)} placeholder="Password" type="password"
                    className="w-full bg-black border border-green-500/40 rounded px-3 py-2" />
                {err && <div className="mt-2 text-red-300">{err}</div>}
                <div className="mt-3 flex justify-end">
                    <button className="px-3 py-2 bg-green-600 text-black font-bold rounded">Enter</button>
                </div>
            </form>
        </div>
    );
}

export default function StructureAge() {
    const [input, setInput] = useState("");
    const [data, setData] = useState<AgeResp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // parsed bits from paste
    const [parsedJ, setParsedJ] = useState<string | undefined>();
    const [parsedCorp, setParsedCorp] = useState<string | undefined>();
    const [corpId, setCorpId] = useState<number | undefined>();
    const [corpResolving, setCorpResolving] = useState(false);
    const [authB64, setAuthB64] = useState<string | null>(() => sessionStorage.getItem(AUTH_KEY));
    if (!authB64) return <AdminLogin onAuthed={setAuthB64} />;

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null); setData(null);

        const { structureId, jcode, corpName } = extractFromPaste(input);
        setParsedJ(jcode ?? undefined);
        setParsedCorp(corpName ?? undefined);

        if (!structureId) { setErr("Could not find a structure ID in the input."); return; }

        // resolve corp id (best-effort; non-blocking)
        setCorpId(undefined);
        if (corpName) {
            setCorpResolving(true);
            try {
                const r = await fetch(`/api/corp-id?name=${encodeURIComponent(corpName)}`);
                if (r.ok) {
                    const j = await r.json();
                    if (j?.id) setCorpId(j.id);
                }
            } catch { /* empty */ }
            setCorpResolving(false);
        }

        // call age endpoint
        setLoading(true);
        try {
            const r = await fetch(`/api/age/${encodeURIComponent(structureId)}`);
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setData(j);
        } catch (e: any) {
            setErr(e.message || "Request failed");
        } finally {
            setLoading(false);
        }
    }

    function InfoBox() {
        return (
            <details className="mt-8 bg-black/50 border border-green-500/20 rounded-lg p-4 open:shadow-[0_0_0_1px_rgba(16,185,129,0.2)]">
                <summary className="cursor-pointer text-green-300 font-semibold select-none">
                    How this estimate works (click to expand)
                </summary>

                <div className="mt-3 text-sm leading-6 text-green-200/90 space-y-3">
                    <p>
                        <b>Data source</b>: a cleaned, monotone index of ESI Public Structure ID dates
                        (structure <i>ID → date</i>). Cleaning enforces non-decreasing dates by ID and can create
                        plateaus (many IDs sharing the same day).
                    </p>

                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            <b>Nearest neighbors</b>: I binary-search the two IDs that bracket your input{" "}
                            <code>S</code>, i.e. <code>L ≤ S ≤ H</code>.
                        </li>
                        <li>
                            <b>Exact hit</b>: if <code>S</code> exists in the index, I return that day with a{" "}
                            <b>±3&nbsp;day</b> band (<code>method = "exact"</code>).
                        </li>
                        <li>
                            <b>Interpolation</b>: otherwise I linearly interpolate between the neighbors’ dates:
                            <br />
                            <code>α = (S − L) / (H − L)</code>,{" "}
                            <code>t = t<sub>L</sub> + α · (t<sub>H</sub> − t<sub>L</sub>)</code>{" "}
                            (<code>method = "interpolate"</code>).
                        </li>
                        <li>
                            <b>Uncertainty window</b>: I pad around <code>t</code> using the local gap so dense
                            regions get tight windows and sparse/plateau regions get looser ones:
                            <br />
                            <code>pad = clamp(0.25 × |t<sub>H</sub> − t<sub>L</sub>|, 2d, 7d)</code>
                            <br />
                            Final range: <code>[t − pad, t + pad]</code>.
                        </li>
                        <li>
                            <b>Edges</b>: if I only have one neighbor, I extrapolate from the closest two points
                            and use a <b>±7&nbsp;day</b> window
                            (<code>method = "extrapolate-head/tail"</code>).
                        </li>
                    </ol>

                    <p>
                        <b>Why results can differ from memory</b>: “First seen” reflects when a structure became
                        publicly visible and was observed by the crawler. If a structure was anchored{" "}
                        <i>private</i> and flipped to public later, the source date is later than the true
                        anchor. Cleaning also flattens obvious inconsistencies, and times are normalized to
                        00:00:00 <b>UTC</b>.
                    </p>

                    <p className="text-green-300/90">
                        <b>Disclaimer</b>: This tool produces <i>estimates</i> only. It’s not an official anchor
                        time and may be off—especially for late-public structures, sparse regions of the index, or
                        data not yet covered by the source.
                    </p>
                </div>
            </details>
        );
    }

    return (
        <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
            <h1 className="text-2xl font-bold mb-4 text-green-300">Structure Age Estimate</h1>
            <IntelToolbar jcode={parsedJ} corpId={corpId} corpName={parsedCorp} />
            <form onSubmit={onSubmit} className="flex gap-2 mb-3">
                <textarea
                    className="flex-1 min-h-[70px] bg-black/60 border border-green-500/30 rounded px-3 py-2 text-green-200 outline-none focus:border-green-400"
                    placeholder="Paste EVE chat line or enter a structure ID…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <button className="px-4 py-2 h-fit self-start border border-green-500/50 rounded hover:bg-green-500/10">
                    {loading ? "…" : "Estimate"}
                </button>
            </form>
            {(parsedJ || parsedCorp) && (
                <div className="mb-6 text-green-200 text-base sm:text-lg">
                    {parsedJ && (
                        <>
                            <span className="text-green-400/80">System:</span>{" "}
                            <a
                                className="underline font-semibold"
                                href={`https://anoik.is/systems/${parsedJ}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {parsedJ}
                            </a>
                        </>
                    )}

                    {parsedJ && parsedCorp && (
                        <br />
                    )}

                    {parsedCorp && (
                        <>
                            <span className="text-green-400/80">Corp:</span>{" "}
                            <span className="font-medium">{parsedCorp}</span>
                            {corpResolving && (
                                <span className="ml-2 text-green-400/70 text-sm">(resolving…)</span>
                            )}
                            {!corpResolving && corpId && (
                                <>
                                    {" "}
                                    (
                                    <a
                                        className="underline"
                                        href={`https://zkillboard.com/corporation/${corpId}/`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        zKill
                                    </a>
                                    )
                                </>
                            )}
                        </>
                    )}
                </div>
            )}



            {err && <p className="text-red-400">{err}</p>}

            {data && (
                <div className="space-y-2 text-green-200">
                    <p><span className="text-green-400/80">Estimate:</span> between <b>{fmtUTC(data.lowISO)}</b> and <b>{fmtUTC(data.highISO)}</b></p>
                    <p><span className="text-green-400/80">Midpoint:</span> {fmtUTC(data.midISO)} <span className="text-green-500/70">({data.method})</span></p>
                    <p><span className="text-green-400/80">Window width:</span> {data.daysWide} days</p>
                    {data && (
                        (() => {
                            const midAgeDays = ageDaysFromNow(data.midISO);
                            const ageText =
                                midAgeDays >= 0
                                    ? `≈ ${humanizeDays(midAgeDays)} old`
                                    : `anchors in ≈ ${humanizeDays(-midAgeDays)}`;

                            return (
                                <p className="text-green-200">
                                    <span className="text-green-400/80">Estimated age:</span> {ageText}
                                </p>
                            );
                        })()
                    )}
                    {parsedJ && <SystemIntel jcode={parsedJ} />}

                </div>
            )}
            <InfoBox />
        </div>
    );
}
