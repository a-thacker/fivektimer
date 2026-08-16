import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, RACE_NAME } from '../lib/utils'

export default function LiveResults() {
  const [results, setResults] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [raceEnd, setRaceEnd]     = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    load()
    const dataInterval  = setInterval(load, 10000)
    const clockInterval = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(dataInterval); clearInterval(clockInterval) }
  }, [])

  async function load() {
    const { data: evData } = await supabase.from('race_events').select('event_type, ts')
      .order('ts', { ascending: false })
    const startEv = (evData || []).find(e => e.event_type === 'start')
    const endEv   = (evData || []).find(e => e.event_type === 'end')
    setRaceStart(startEv?.ts || null)
    setRaceEnd(endEv?.ts || null)

    const { data: tData } = await supabase.from('timing_records')
      .select('*, participants(*)').not('finish_time', 'is', null).eq('dnf', false)
    if (!tData) { setResults([]); return }

    const rows = tData
      .filter(r => r.participants && !r.participants.exclude_from_results)
      .map(r => {
        const p = r.participants || {}
        return {
          id: r.id,
          name: `${p.first_name} ${p.last_name}`,
          raceNumber: p.race_number, gender: p.gender, age: p.age, ageGroup: p.age_group,
          totalMs: diffMs(startEv?.ts, r.finish_time),
        }
      }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

    setResults(rows)
    setLastUpdate(new Date())
  }

  const raceEndTs = raceEnd ? new Date(raceEnd).getTime() : null
  const elapsedMs = raceStart ? (raceEndTs || now) - new Date(raceStart).getTime() : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">{RACE_NAME} — Live Results</div>
        {elapsedMs != null && (
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.3rem', color: 'var(--accent)' }}>
            {formatDuration(elapsedMs)}
          </div>
        )}
      </div>
      <div className="page-sub">
        {raceStart ? `Race started ${new Date(raceStart).toLocaleTimeString()}` : 'Race not started yet.'}
        {lastUpdate && ` · Updated ${lastUpdate.toLocaleTimeString()}`}
      </div>

      {results.length === 0 ? (
        <div className="alert alert-info">No finishers yet.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th><th>#</th><th>Name</th><th>Age</th><th>Group</th><th>Gender</th><th>Total Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 800, color: 'var(--accent)' }}>{i + 1}</td>
                    <td className="font-bold text-accent">{r.raceNumber ?? '—'}</td>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.age}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{r.ageGroup || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{r.gender}</td>
                    <td style={{ color: 'var(--accent)', fontWeight: 800, fontFamily: 'monospace' }}>{formatDuration(r.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
