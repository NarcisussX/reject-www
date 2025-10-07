import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
function copy(text: string) {
    navigator.clipboard.writeText(text)
}


type Structure = { kind: string; fitText: string; estimatedISK: number }


type Data = {
    jcode: string
    ransomISK: number
    totalStructuresISK: number
    structures: Structure[]
    pilot: string
}


export default function JCode() {
    const { jcode } = useParams()
    const [data, setData] = useState<Data | null>(null)
    const [missing, setMissing] = useState(false)
    const [negOpen, setNegOpen] = useState(false)


    useEffect(() => {
        fetch(`/api/lookup/${jcode}`).then(async (r) => {
            if (r.status === 404) { setMissing(true); return }
            const d = await r.json(); setData(d)
        }).catch(() => setMissing(true))
    }, [jcode])


    if (missing) return (
        <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center p-6">
            <div className="max-w-xl text-center">
                <h2 className="text-3xl">We aren't in your hole... yet!</h2>
                <p className="mt-4 text-green-300/80">No active eviction for {jcode}. Check back later.</p>
                <Link to="/" className="inline-block mt-6 px-4 py-2 bg-green-600 text-black font-bold rounded">Go Home</Link>
            </div>
        </div>
    )


    if (!data) return <div className="min-h-dvh bg-black text-green-400 font-mono grid place-items-center">Loading…</div>


    return (
        <div className="min-h-dvh bg-black text-green-400 font-mono p-6">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-2xl">{data.jcode} — Eviction Appraisal</h1>
                <div className="mt-4 grid md:grid-cols-2 gap-4">
                    {data.structures.map((s, i) => (
                        <div key={i} className="border border-green-500/40 rounded p-4 bg-black">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl">{s.kind}</h3>
                                <div className="text-green-300/90">~{s.estimatedISK.toLocaleString()} ISK</div>
                            </div>
                            <pre className="mt-3 whitespace-pre-wrap text-green-200/90 text-sm bg-black/20 p-3 rounded border border-green-500/20">{s.fitText}</pre>
                        </div>
                    ))}
                </div>


                <div className="mt-6 border border-green-500/40 rounded p-4 bg-black">
                    <div>Total Structure Value: <span className="font-bold">{data.totalStructuresISK.toLocaleString()} ISK</span></div>
                    <div className="mt-1">Ransom to withdraw: <span className="font-bold">{data.ransomISK.toLocaleString()} ISK</span></div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => { copy(data.pilot); copy(String(data.ransomISK)) }} className="px-4 py-2 bg-green-600 text-black font-bold rounded">Pay Ransom</button>
                        <button onClick={() => setNegOpen(true)} className="px-4 py-2 border border-green-500/50 rounded hover:bg-green-600/10">Negotiate</button>
                    </div>
                </div>


                {negOpen && <NegotiateModal jcode={data.jcode} onClose={() => setNegOpen(false)} />}
            </div>
        </div>
    )
}


function NegotiateModal({ jcode, onClose }: { jcode: string; onClose: () => void }) {
    const [ign, setIgn] = useState('')
    const [msg, setMsg] = useState('')
    const [ok, setOk] = useState(false)


    async function submit(e: React.FormEvent) {
        e.preventDefault()
        const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jcode, ign, message: msg }) })
        setOk(r.ok)
    }


    return (
        <div className="fixed inset-0 bg-black/80 grid place-items-center p-4">
            <div className="w-full max-w-lg bg-black border border-green-500/50 rounded p-4">
                <h3 className="text-xl">Negotiate — {jcode}</h3>
                {ok ? (
                    <div className="mt-4 text-green-300">Sent. We'll be in touch.</div>
                ) : (
                    <form onSubmit={submit} className="mt-3 space-y-3">
                        <input value={ign} onChange={e => setIgn(e.target.value)} placeholder="In‑game name" className="w-full bg-black border border-green-500/40 rounded px-3 py-2" />
                        <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Your message" rows={5} className="w-full bg-black border border-green-500/40 rounded px-3 py-2" />
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="px-3 py-2 border border-green-500/40 rounded">Close</button>
                            <button className="px-3 py-2 bg-green-600 text-black font-bold rounded">Send</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}