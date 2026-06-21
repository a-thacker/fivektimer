import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, TEAM_COLORS, AGE_GROUPS, raceTypeLabel } from '../lib/utils'

function PrintTable({ title, rows }) {
  const cellStyle = { padding: '3px 6px', borderBottom: '1px solid #ddd' }
  const headStyle = { padding: '3px 6px', textAlign: 'left', borderBottom: '2px solid #000', fontSize: '10px', textTransform: 'uppercase' }
  return (
    <div style={{ marginBottom: 28, pageBreakInside: 'avoid' }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>{title}</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr>
            <th style={headStyle}>Rank</th><th style={headStyle}>#</th><th style={headStyle}>Name</th>
            <th style={headStyle}>Age</th><th style={headStyle}>Gender</th><th style={headStyle}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={cellStyle}>{i + 1}</td>
              <td style={{ ...cellStyle, fontWeight: 700 }}>{r.raceNumber}</td>
              <td style={{ ...cellStyle, fontWeight: 700 }}>{r.name}</td>
              <td style={cellStyle}>{r.age}</td>
              <td style={{ ...cellStyle, textTransform: 'capitalize' }}>{r.gender}</td>
              <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 700 }}>{formatDuration(r.totalMs)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ ...cellStyle, color: '#999' }}>No results.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

async function loadRaceResults(raceType) {
  const { data: ev } = await supabase.from('race_events').select('ts')
    .eq('race_type', raceType).eq('event_type', 'start').order('ts', { ascending: false }).limit(1)
  const raceStart = ev?.[0]?.ts || null

  const { data: indT } = await supabase.from('timing_records')
    .select('*, participants(*)').eq('race_type', raceType)
    .not('finish_time', 'is', null).eq('dnf', false).is('team_color', null)

  const indRows = (indT || [])
    .filter(r => !r.participants?.exclude_from_results)
    .map(r => ({
      id: r.id,
      raceNumber: r.participants?.race_number,
      name: `${r.participants?.first_name} ${r.participants?.last_name}`,
      age: r.participants?.age,
      ageGroup: r.participants?.age_group,
      gender: r.participants?.gender,
      totalMs: diffMs(raceStart, r.finish_time),
    })).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

  const { data: teamT } = await supabase.from('timing_records').select('*')
    .eq('race_type', raceType).not('finish_time', 'is', null).eq('dnf', false).not('team_color', 'is', null)

  const teamColors = (teamT || []).map(r => r.team_color)
  let tmMap = {}
  if (teamColors.length > 0) {
    const { data } = await supabase.from('participants').select('*').in('team_color', teamColors).eq('race_type', raceType)
    if (data) data.forEach(p => {
      if (!tmMap[p.team_color]) tmMap[p.team_color] = []
      tmMap[p.team_color].push(p)
    })
  }
  const teamRows = (teamT || []).map(r => {
    const members = tmMap[r.team_color] || []
    return {
      id: r.id,
      teamLabel: TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team',
      raceNumbers: members.map(m => `#${m.race_number}`).join(', '),
      memberNames: members.map(m => `${m.first_name} ${m.last_name}`).join(' / '),
      totalMs: diffMs(raceStart, r.finish_time),
    }
  }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

  return { ind: indRows, teams: teamRows }
}

function RaceSection({ raceType, data }) {
  const { ind, teams } = data
  const top3Ids = new Set(ind.slice(0, 3).map(r => r.id))

  return (
    <div style={{ marginBottom: 40, pageBreakBefore: raceType === 'kids_run' ? 'always' : 'auto' }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '0 0 16px', borderBottom: '3px solid #000', paddingBottom: 8 }}>
        {raceTypeLabel(raceType)}
      </h1>

      <PrintTable title="Overall Results" rows={ind} />
      <PrintTable title="Men's Results" rows={ind.filter(r => r.gender === 'male' && !top3Ids.has(r.id))} />
      <PrintTable title="Women's Results" rows={ind.filter(r => r.gender === 'female' && !top3Ids.has(r.id))} />

      {teams.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>Team Results</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr>
                {['Rank', '#', 'Team', 'Total'].map(h => (
                  <th key={h} style={{ padding: '3px 6px', textAlign: 'left', borderBottom: '2px solid #000', fontSize: '10px', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t, i) => (
                <tr key={t.id}>
                  <td style={{ padding: '3px 6px', borderBottom: '1px solid #ddd' }}>{i + 1}</td>
                  <td style={{ padding: '3px 6px', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{t.raceNumbers}</td>
                  <td style={{ padding: '3px 6px', borderBottom: '1px solid #ddd', fontWeight: 700 }}>{t.teamLabel} Team — {t.memberNames}</td>
                  <td style={{ padding: '3px 6px', borderBottom: '1px solid #ddd', fontFamily: 'monospace', fontWeight: 700 }}>{formatDuration(t.totalMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {AGE_GROUPS.map(group => {
        const rows = ind.filter(r => r.ageGroup === group)
        if (rows.length === 0) return null
        return <PrintTable key={group} title={`Age Group — ${group}`} rows={rows} />
      })}
    </div>
  )
}

export default function PrintResults() {
  const [trailData, setTrailData] = useState(null)
  const [kidsData, setKidsData]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [printDate] = useState(new Date().toLocaleDateString())

  useEffect(() => {
    Promise.all([loadRaceResults('trail'), loadRaceResults('kids_run')]).then(([trail, kids]) => {
      setTrailData(trail)
      setKidsData(kids)
      setLoading(false)
    })
  }, [])

  if (loading) return <div>Loading...</div>

  return (
    <div style={{ background: '#fff', color: '#000', padding: '24px', fontFamily: 'Arial, sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, borderBottom: '3px solid #000', paddingBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0 }}>Race Results</h1>
          <div style={{ color: '#666', fontSize: '0.85rem', marginTop: 4 }}>Official Results — {printDate}</div>
        </div>
        <button onClick={() => window.print()} className="no-print"
          style={{ padding: '8px 18px', background: '#000', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
          Print / Save PDF
        </button>
      </div>

      <RaceSection raceType="trail" data={trailData} />
      <RaceSection raceType="kids_run" data={kidsData} />

      <div style={{ marginTop: 40, borderTop: '1px solid #ccc', paddingTop: 12, fontSize: '10px', color: '#999', textAlign: 'center' }}>
        Generated by 5KTimer — {printDate}
      </div>
    </div>
  )
}
