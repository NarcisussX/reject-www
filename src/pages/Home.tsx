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
    <div className="bg-black text-green-400 font-mono">
      <div className="mx-auto max-w-4xl px-4 md:px-6 py-8 md:py-12">

        <h1 className="glow text-5xl md:text-7xl leading-tight">
          Asset Relocation<br/>Specialists
        </h1>

        <p className="mt-6 text-green-300/90 max-w-prose">
          We relocate your assets so you don't have to! Ransoms always honored, check below if you qualify.
        </p>

        <form onSubmit={submit} className="panel panel-solid mt-8">
          <label className="block text-green-300/80 mb-2">
            Are we reffing your structures? Camping your hole?
          </label>
          <div className="flex gap-2">
            <input
              value={j}
              onChange={(e) => setJ(e.target.value)}
              placeholder="Enter your J-code (e.g., J123456)"
            />
            <button type="submit">Lookup</button>
          </div>
          <div className="mt-4 text-green-500/80 text-sm">
            — Enter your J-code to view your personalized eviction ransom appraisal and next steps.
          </div>
        </form>
      </div>
    </div>
  )
}
