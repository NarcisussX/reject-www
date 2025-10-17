import { useEffect, useState } from "react";
/* eslint-disable  @typescript-eslint/no-explicit-any */
type Activity = { days: string[]; max: number } & Record<number, any>;
type Summary = {
    systemId: string;
    totalKills: number;
    daysCovered: number;
    mostRecentKillDaysAgo: number | null;
    activeCorporations: { id: string; name: string; lastSeenDaysAgo: number; activeDays: number }[];
};

export default function SystemIntel({ jcode }: { jcode?: string }) {
    const [activity, setActivity] = useState<Activity | null>(null);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let abort = false;
        (async () => {
            try {
                setErr(null); setActivity(null); setSummary(null);
                if (!jcode) return;

                const sys = await fetch(`/api/system-id/${encodeURIComponent(jcode)}`).then(r => r.json());
                if (!sys?.id) { setErr("Could not resolve system ID"); return; }
                if (abort) return;

                const [act, sum] = await Promise.all([
                    fetch(`/api/zkill-activity/${sys.id}`).then(r => r.json()),
                    fetch(`/api/killboard-summary/${sys.id}`).then(r => r.json()),
                ]);
                if (abort) return;
                setActivity(act); setSummary(sum);
            } catch (e: any) {
                if (!abort) setErr(e.message || "Failed to load system intel");
            }
        })();
        return () => { abort = true; };
    }, [jcode]);

    // Green heatmap
    const Heatmap = () => {
        if (!activity?.days) return <div className="text-green-300/60 text-sm">Loading activity…</div>;
        const days = activity.days;
        return (
            <table className="w-full text-xs text-green-200/80">
                <thead>
                    <tr className="text-green-300/80">
                        <th className="text-left pr-2 pb-1">Day/Hour</th>
                        {[...Array(24).keys()].map(h => (
                            <th key={h} className="font-mono text-[10px] px-[2px]">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {days.map((day: string, idx: number) => (
                        <tr key={day}>
                            <td className="text-left pr-2 py-[2px]">{day}</td>
                            {[...Array(24).keys()].map(h => {
                                const count = activity[idx]?.[h] || 0;
                                const max = Math.max(1, activity.max || 1);
                                const t = count / max; // 0..1
                                // green intensity
                                const bg = `rgba(16,185,129,${0.12 + t * 0.75})`;
                                return (
                                    <td
                                        key={h}
                                        style={{ backgroundColor: count ? bg : "rgba(0,0,0,0.35)", width: 18, height: 18 }}
                                        className="border border-green-500/10"
                                        title={`${count} kills`}
                                    />
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const topCorps =
        (summary?.activeCorporations || [])
            .sort((a, b) => (b.activeDays - a.activeDays) || (a.lastSeenDaysAgo - b.lastSeenDaysAgo))
            .slice(0, 12);

    if (!jcode) return null;
    if (err) return <div className="mt-8 text-red-400">{err}</div>;

    return (
        <div className="w-full">
            <div className="space-y-6">
                {/* Heatmap */}
                <div className="rounded-2xl border border-green-500/20 bg-black/60 p-3">
                    <div className="text-green-300 font-semibold mb-2">Killboard activity calendar</div>
                    <Heatmap />
                </div>

                {/* Kills / Recent Kill */}
                <div className="rounded-2xl border border-green-500/20 bg-black/60 p-3">
                    <div className="text-green-300 font-semibold mb-1">Kills / Recent Kill</div>
                    <div className="text-sm text-green-200/80">
                        {summary
                            ? `${summary.totalKills} kills in last ${summary.daysCovered} days, the last one was ${summary.mostRecentKillDaysAgo ?? "?"} days ago`
                            : "Loading…"}
                    </div>
                </div>

                {/* Recent corps */}
                <div className="rounded-2xl border border-green-500/20 bg-black/60 p-3">
                    <div className="text-green-300 font-semibold mb-2">Recent corps</div>
                    <div className="text-xs text-green-200/80 space-y-1">
                        {summary ? (
                            topCorps.map(c => (
                                <div key={c.id}>
                                    <a
                                        className="underline text-green-200 hover:text-green-100"
                                        href={`https://zkillboard.com/corporation/${c.id}/`}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {c.name}
                                    </a>{" "}
                                    (Active {c.activeDays}d, last seen {c.lastSeenDaysAgo}d ago)
                                </div>
                            ))
                        ) : (
                            "Loading…"
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}