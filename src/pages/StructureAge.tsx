// pages/StructureAge.tsx
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
    const popRef = useRef<HTMLDivElement | null>(null);

    // Close on outside click / Esc
    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!popRef.current) return;
            if (!popRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, []);

    function parseUtcHHMM(raw: string) {
        const s = raw.trim();
        if (!s) return null;
        const d = s.replace(/\D/g, "");
        let h = 0, m = 0;
        if (/^\d{4}$/.test(d)) { h = +d.slice(0, 2); m = +d.slice(2, 4); }         // 1800
        else if (/^\d{3}$/.test(d)) { h = +d.slice(0, 1); m = +d.slice(1, 3); }     // 300
        else if (/^\d{1,2}:\d{2}$/.test(s)) { const [hh, mm] = s.split(":"); h = +hh; m = +mm; } // 03:00
        else return null;
        if (h < 0 || h > 23 || m < 0 || m > 59) return null;
        return { h, m };
    }
    const fmt = (d: Date, tz: string) =>
        new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

    const todayUTC = (() => {
        const now = new Date();
        return { y: now.getUTCFullYear(), m: now.getUTCMonth(), d: now.getUTCDate() };
    })();

    const parsed = parseUtcHHMM(utcInput);
    const base = parsed ? new Date(Date.UTC(todayUTC.y, todayUTC.m, todayUTC.d, parsed.h, parsed.m, 0)) : null;

    return (
        <div className="fixed z-40 top-6 right-4 sm:right-6">
            <button
                onClick={() => setOpen(v => !v)}
                className="px-3 py-1 rounded-full text-xs border border-green-500/40 bg-black/60 text-green-200 hover:bg-green-500/10"
                title="Convert a UTC time to US timezones"
            >
                UTC → PT/CT/ET
            </button>

            {open && (
                <div ref={popRef} className="mt-2 w-64 rounded-xl border border-green-500/30 bg-black/80 p-3 shadow-xl backdrop-blur-sm">
                    <div className="text-green-300 font-semibold text-sm mb-2">Reinforcement time helper</div>
                    <input
                        className="w-full bg-black/60 border border-green-500/30 rounded px-2 py-1 text-green-200 outline-none focus:border-green-400 text-sm"
                        placeholder="e.g. 300, 1800, or 03:00 (UTC)"
                        value={utcInput}
                        onChange={(e) => setUtcInput(e.target.value)}
                        autoFocus
                    />
                    {!utcInput && <div className="text-xs text-green-300/70 mt-1">Today’s offsets, auto-DST.</div>}
                    {utcInput && !parsed && (
                        <div className="text-red-400 text-xs mt-2">Enter 24h UTC like <code>300</code>, <code>1800</code>, or <code>03:00</code>.</div>
                    )}
                    {base && (
                        <div className="text-sm text-green-200/90 mt-2 space-y-1">
                            <div><span className="text-green-400/80">PT:</span> {fmt(base, "America/Los_Angeles")}</div>
                            <div><span className="text-green-400/80">CT:</span> {fmt(base, "America/Chicago")}</div>
                            <div><span className="text-green-400/80">ET:</span> {fmt(base, "America/New_York")}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


const ageDaysFromNow = (iso: string) =>
    Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

type AgeResp = {
    id: string; method: "exact" | "interpolate" | "extrapolate-head" | "extrapolate-tail";
    midISO: string; lowISO: string; highISO: string; daysWide: string;
};

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
            <ReinforcePopover />

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
