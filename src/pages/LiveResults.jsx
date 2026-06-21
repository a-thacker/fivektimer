import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, teamColorStyle, TEAM_COLORS, raceTypeLabel } from '../lib/utils'

export default function LiveResults() {
  const { raceType } = useParams()
  const validType = raceType === 'trail' || raceType === 'kids_run'

  const [results, setResults] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [raceEnd, setRaceEnd]     = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!validType) return
    load()
    const dataInterval  = setInterval(load, 10000)
    const clockInterval = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(dataInterval); clearInterval(clockInterval) }
  }, [raceType])

  async function load() {
    const { data: evData } = await supabase.from('race_events').select('event_type, ts')
      .eq('race_type', raceType).order('ts', { ascending: false })
    const startEv = (evData || []).find(e => e.event_type === 'start')
    const endEv   = (evData || []).find(e => e.event_type === 'end')
    setRaceStart(startEv?.ts || null)
    setRaceEnd(endEv?.ts || null)

    const { data: tData } = await supabase.from('timing_records').select('*')
      .eq('race_type', raceType).not('finish_time', 'is', null).eq('dnf', false)
    if (!tData) { setResults([]); return }

    const individualIds = tData.filter(r => r.participant_id && !r.team_color).map(r => r.participant_id)
    const teamColors    = tData.filter(r => r.team_color).map(r => r.team_color)

    let pMap = {}
    if (individualIds.length > 0) {
      const { data } = await supabase.from('participants').select('*').in('id', individualIds)
      if (data) data.forEach(p => { pMap[p.id] = p })
    }
    let teamMap = {}
    if (teamColors.length > 0) {
      const { data } = await supabase.from('participants').select('*').in('team_color', teamColors).eq('race_type', raceType)
      if (data) data.forEach(p => {
        if (!teamMap[p.team_color]) teamMap[p.team_color] = []
        teamMap[p.team_color].push(p)
      })
    }

    const rows = tData
      .filter(r => !(pMap[r.participant_id]?.exclude_from_results))
      .map(r => {
        const totalMs = diffMs(startEv?.ts, r.finish_time)
        if (r.team_color) {
          const members = teamMap[r.team_color] || []
          const colorLabel = TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team'
          return {
            id: r.id, isTeam: true, teamColor: r.team_color,
            name: `${colorLabel} Team`,
            memberNames: members.map(m => `${m.first_name} ${m.last_name}`).join(' / '),
            raceNumbers: members.map(m => `#${m.race_number}`).join(', '),
            gender: '—', age: '—', totalMs,
          }
        }
        const p = pMap[r.participant_id] || {}
        return {
          id: r.id, isTeam: false,
          name: `${p.first_name} ${p.last_name}`,
          raceNumber: p.race_number, gender: p.gender, age: p.age, ageGroup: p.age_group, totalMs,
        }
      }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

    setResults(rows)
    setLastUpdate(new Date())
  }

  if (!validType) {
    return <div className="alert alert-error">Invalid race. Choose Trail Race or Kid's Run live results from the sidebar.</div>
  }

  const raceEndTs = raceEnd ? new Date(raceEnd).getTime() : null
  const elapsedMs = raceStart ? (raceEndTs || now) - new Date(raceStart).getTime() : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">{raceTypeLabel(raceType)} — Live Results</div>
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
                    <td className="font-bold text-accent">{r.isTeam ? r.raceNumbers : r.raceNumber}</td>
                    <td>
                      {r.isTeam ? (
                        <div>
                          <span style={teamColorStyle(r.teamColor)}>{r.name}</span>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{r.memberNames}</div>
                        </div>
                      ) : <strong>{r.name}</strong>}
                    </td>
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
