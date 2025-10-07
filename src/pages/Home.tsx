import { useState } from 'react'
import { useNavigate } from 'react-router-dom'


export default function Home() {
    const [j, setJ] = useState('')
    const nav = useNavigate()


    function submit(e: React.FormEvent) {
        e.preventDefault()
        const J = j.trim().toUpperCase()
        if (!/^J\d{6}$/.test(J)) return alert('Enter a valid J-code like J123456')
        nav(`/j/${J}`)
    }


    return (
        <div className="min-h-dvh bg-black text-green-400">
            <div className="max-w-3xl mx-auto px-4 py-16">
                <pre className="text-green-500/80 text-sm mb-6">REJECTED APPLICATIONS INC.</pre>
                <h1 className="font-mono text-4xl md:text-5xl tracking-tight">Asset Relocation Specialists</h1>
                <p className="mt-4 text-green-300/90 max-w-prose font-mono">
                    We relocate your assets. No motivation required beyond ISK. Buy us off with a ransom and we disappear.
                </p>


                <form onSubmit={submit} className="mt-10 font-mono">
                    <label className="block text-green-300/80 mb-2">Are we reffing your structures? Camping your hole?</label>
                    <div className="flex gap-2">
                        <input
                            value={j}
                            onChange={(e) => setJ(e.target.value)}
                            placeholder="Enter your J-code (e.g., J123456)"
                            className="w-full bg-black border border-green-500/40 rounded px-3 py-3 text-green-200 placeholder-green-700 focus:outline-none focus:border-green-400 shadow-[0_0_20px_rgba(0,255,0,0.08)]"
                        />
                        <button type="submit" className="px-4 py-3 bg-green-600 text-black font-bold rounded hover:bg-green-500">
                            Lookup
                        </button>
                    </div>
                </form>


                <div className="mt-10 text-green-500/80 text-sm font-mono">
                    <p>— Enter your J‑code to view your personalized eviction ransom appraisal and next steps.</p>
                </div>
            </div>
        </div>
    )
}