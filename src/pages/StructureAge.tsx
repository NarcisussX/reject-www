// pages/StructureAge.tsx
import { useState } from "react";

const fmtUTC = (iso: string) =>
    new Date(iso).toUTCString().replace(' GMT', ' UTC');

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

const ageDaysFromNow = (iso: string) =>
    Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

type AgeResp = {
    id: string;
    method: "exact" | "interpolate" | "extrapolate-head" | "extrapolate-tail";
    midISO: string;
    lowISO: string;
    highISO: string;
    daysWide: string;
};
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

export default function StructureAge() {
    const [id, setId] = useState("");
    const [data, setData] = useState<AgeResp | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null); setData(null); setLoading(true);
        try {
            const r = await fetch(`/api/age/${encodeURIComponent(id.trim())}`);
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setData(j);
        } catch (e: any) {
            setErr(e.message || "Request failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative z-10 mx-auto max-w-xl px-4 py-10">
            <h1 className="text-2xl font-bold mb-4 text-green-300">Structure Age Estimate</h1>

            <form onSubmit={onSubmit} className="flex gap-2 mb-6">
                <input
                    className="flex-1 bg-black/60 border border-green-500/30 rounded px-3 py-2 text-green-200 outline-none focus:border-green-400"
                    placeholder="Enter structure ID"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                />
                <button className="px-4 py-2 border border-green-500/50 rounded hover:bg-green-500/10">
                    {loading ? "…" : "Estimate"}
                </button>
            </form>

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

                </div>
            )}
            <InfoBox />
        </div>
    );
}
