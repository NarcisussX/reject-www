// src/pages/Watchlist.tsx
import { useEffect, useMemo, useState } from "react";

const AUTH_KEY = "reject.admin.auth";

type Item = { jcode: string; systemId: number; addedAt: string };

export default function Watchlist() {
    const [authB64, setAuthB64] = useState<string | null>(() => sessionStorage.getItem(AUTH_KEY));
    const [list, setList] = useState<Item[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const authedFetch = useMemo(() => {
        return async (path: string, init?: RequestInit) => {
            const headers = new Headers(init?.headers || {});
            if (authB64) headers.set("Authorization", "Basic " + authB64);
            const res = await fetch(`/api${path}`, { ...init, headers });
            return res;
        };
    }, [authB64]);

    useEffect(() => { if (authB64) refresh(); }, [authB64]);

    async function refresh() {
        setLoading(true);
        try {
            const r = await fetch(`/api/watchlist`);
            setList(await r.json());
        } finally { setLoading(false); }
    }

    async function add() {
        setErr("");
        const J = input.trim().toUpperCase();
        if (!/^J\d{6}$/.test(J)) { setErr("Enter a J-code like J123456"); return; }
        const r = await authedFetch(`/api/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jcode: J }),
        });
        if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            setErr(j?.error || `HTTP ${r.status}`);
            return;
        }
        setInput("");
        refresh();
    }

    async function del(jcode: string) {
        if (!confirm(`Remove ${jcode} from watchlist?`)) return;
        const r = await authedFetch(`/api/watchlist/${jcode}`, { method: "DELETE" });
        if (r.ok) refresh();
    }

    if (!authB64) return <Login onAuthed={setAuthB64} />;

    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono p-6">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-2xl mb-4">Admin — Watchlist</h1>

                <div className="flex gap-2 mb-2">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="J113057"
                        className="bg-black border border-green-500/40 rounded px-3 py-2"
                    />
                    <button onClick={add} className="px-3 py-2 bg-green-600 text-black font-bold rounded">
                        Save
                    </button>
                    <button onClick={refresh} className="px-3 py-2 border border-green-500/40 rounded hover:bg-green-600/10">
                        Refresh
                    </button>
                </div>
                {err && <div className="text-red-300 mb-2">{err}</div>}

                <div className="mt-4 border border-green-500/20 rounded overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-green-900/20">
                            <tr><th className="px-3 py-2">J-code</th><th className="px-3 py-2">System ID</th><th className="px-3 py-2">Added</th><th /></tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td className="px-3 py-3" colSpan={4}>Loading…</td></tr>
                            ) : list.length === 0 ? (
                                <tr><td className="px-3 py-3" colSpan={4}>No systems yet.</td></tr>
                            ) : (
                                list.map((it) => (
                                    <tr key={it.jcode} className="border-t border-green-500/10">
                                        <td className="px-3 py-2">{it.jcode}</td>
                                        <td className="px-3 py-2">{it.systemId}</td>
                                        <td className="px-3 py-2">{new Date(it.addedAt).toLocaleString()}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button onClick={() => del(it.jcode)} className="px-2 py-1 border border-red-500/40 text-red-300 rounded hover:bg-red-600/10">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Login({ onAuthed }: { onAuthed: (b64: string) => void }) {
    const [u, setU] = useState(""), [p, setP] = useState(""), [err, setErr] = useState("");
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr("");
        const b64 = btoa(`${u}:${p}`);
        const r = await fetch("/api/admin/systems", { headers: { Authorization: "Basic " + b64 } });
        if (r.status === 401 || r.status === 403) { setErr("Invalid credentials"); return; }
        sessionStorage.setItem(AUTH_KEY, b64); onAuthed(b64);
    }
    return (
        <div className="min-h-dvh grid place-items-center p-6">
            <form onSubmit={submit} className="w-full max-w-sm border border-green-500/40 rounded p-4 bg-black text-green-400">
                <h1 className="text-xl mb-3">Admin login</h1>
                <input value={u} onChange={e => setU(e.target.value)} placeholder="User" className="w-full bg-black border border-green-500/40 rounded px-3 py-2 mb-2" />
                <input value={p} onChange={e => setP(e.target.value)} placeholder="Password" type="password" className="w-full bg-black border border-green-500/40 rounded px-3 py-2" />
                {err && <div className="mt-2 text-red-300">{err}</div>}
                <div className="mt-3 text-right"><button className="px-3 py-2 bg-green-600 text-black font-bold rounded">Enter</button></div>
            </form>
        </div>
    );
}
