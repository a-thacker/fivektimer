import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, teamColorStyle, TEAM_COLORS, AGE_GROUPS, RACE_TYPES, raceTypeLabel } from '../lib/utils'

const TABS = [
  { key: 'live',  label: 'Live'  },
  { key: 'final', label: 'Final' },
]

const RELEASE_FIELD = { trail: 'trail_results_released', kids_run: 'kids_run_results_released' }

function ordinal(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

async function fetchSettings() {
  const { data } = await supabase.from('app_settings').select('*').eq('id', 1).single()
  return data || { trail_results_released: false, kids_run_results_released: false }
}

async function fetchLive(raceType) {
  const { data: evData } = await supabase.from('race_events').select('event_type, ts')
    .eq('race_type', raceType).order('ts', { ascending: false })
  const startEv = (evData || []).find(e => e.event_type === 'start')
  const endEv   = (evData || []).find(e => e.event_type === 'end')
  const startTs = startEv?.ts || null

  const { data: tData } = await supabase.from('timing_records').select('*')
    .eq('race_type', raceType).not('finish_time', 'is', null).eq('dnf', false)
  if (!tData) return { rows: [], raceStart: startTs, raceEnd: endEv?.ts || null }

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
      const totalMs = diffMs(startTs, r.finish_time)
      if (r.team_color) {
        const members = teamMap[r.team_color] || []
        const colorLabel = TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team'
        return {
          id: r.id, isTeam: true, teamColor: r.team_color,
          name: `${colorLabel} Team`,
          subName: members.map(m => m.first_name).join(' / '),
          raceNumbers: members.map(m => `#${m.race_number}`).join(' '),
          gender: null, age: null, totalMs,
        }
      }
      const p = pMap[r.participant_id] || {}
      return {
        id: r.id, isTeam: false,
        name: `${p.first_name} ${p.last_name}`,
        raceNumber: p.race_number, gender: p.gender, age: p.age, ageGroup: p.age_group, totalMs,
      }
    }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

  return { rows, raceStart: startTs, raceEnd: endEv?.ts || null }
}

function computePlacements(row, allInd, allTeams) {
  const badges = []
  if (!row.totalMs) return badges
  if (row.isTeam) {
    const rank = allTeams.findIndex(r => r.id === row.id) + 1
    if (rank >= 1 && rank <= 3) badges.push(`${ordinal(rank)} Team`)
    return badges
  }
  const top3Ids = new Set(allInd.slice(0, 3).map(r => r.id))
  const overallRank = allInd.findIndex(r => r.id === row.id) + 1
  if (overallRank >= 1 && overallRank <= 3) badges.push(`${ordinal(overallRank)} Overall`)
  const genderList = allInd.filter(r => r.gender === row.gender && !top3Ids.has(r.id))
  const genderRank = genderList.findIndex(r => r.id === row.id) + 1
  const gLabel = row.gender === 'male' ? 'Men' : row.gender === 'female' ? 'Women' : row.gender
  if (genderRank >= 1 && genderRank <= 3) badges.push(`${ordinal(genderRank)} ${gLabel}`)
  return badges
}

// ── Result card download ──
function downloadResultCard(row, raceType, placements = []) {
  const canvas = document.createElement('canvas')
  const placementH = placements.length > 0 ? 36 : 0
  const W = 800, H = 280 + placementH
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const accent = '#00d4ff'

  ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 6, H)

  ctx.fillStyle = accent
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText('5KTimer', 32, 44)
  ctx.fillStyle = '#8892b0'
  ctx.font = '15px system-ui, sans-serif'
  ctx.fillText(raceTypeLabel(raceType), 32, 68)

  ctx.fillStyle = '#2e3250'; ctx.fillRect(32, 82, W - 64, 1)

  if (placements.length > 0) {
    const medalColors = { '1st': '#FFD700', '2nd': '#C0C0C0', '3rd': '#CD7F32' }
    let bx = W - 32
    placements.slice().reverse().forEach(p => {
      const rank = p.split(' ')[0]
      const bg = medalColors[rank] || '#2e3250'
      const tw = ctx.measureText(p).width + 20
      bx -= tw + 8
      ctx.fillStyle = bg
      ctx.beginPath(); ctx.roundRect(bx, 20, tw + 8, 26, 6); ctx.fill()
      ctx.fillStyle = '#111'
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillText(p, bx + 10, 37)
    })
  }

  ctx.fillStyle = '#f0f2ff'
  ctx.font = 'bold 32px system-ui, sans-serif'
  ctx.fillText(row.name, 32, 124)
  if (row.isTeam && row.subName) {
    ctx.fillStyle = '#8892b0'
    ctx.font = '16px system-ui, sans-serif'
    ctx.fillText(row.subName, 32, 150)
  }

  ctx.fillStyle = accent
  ctx.font = 'bold 18px system-ui, sans-serif'
  const numLabel = row.isTeam ? row.raceNumbers : `#${row.raceNumber}`
  ctx.fillText(numLabel, 32, row.isTeam && row.subName ? 178 : 158)

  const timeY = row.isTeam ? 240 : 220
  ctx.fillStyle = accent
  ctx.font = 'bold 52px monospace'
  ctx.fillText(formatDuration(row.totalMs), 32, timeY)
  ctx.fillStyle = '#8892b0'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText('Total Time', 32, timeY + 22)

  ctx.fillStyle = '#8892b0'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`5ktimer.app · ${new Date().toLocaleDateString()}`, 32, H - 16)

  const link = document.createElement('a')
  const safeName = row.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  link.download = `5KTimer_${safeName}_result.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

// ── Components ──

function RankBadge({ rank }) {
  const colors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: colors[rank] || 'var(--surface2)', color: rank <= 3 ? '#111' : 'var(--muted)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.82rem',
    }}>{rank}</div>
  )
}

function SaveButton({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
      borderRadius: 8, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
    }}>Save Card</button>
  )
}

function ResultCard({ rank, row, raceType, placements = [] }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {rank != null && <RankBadge rank={rank} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {row.isTeam ? (
            <>
              <span style={teamColorStyle(row.teamColor)}>{row.name}</span>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 3 }}>{row.raceNumbers} · {row.subName}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{row.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
                #{row.raceNumber}{row.age ? ` · Age ${row.age}` : ''}{row.gender ? ` · ${row.gender}` : ''}
              </div>
            </>
          )}
          {placements.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
              {placements.map(p => (
                <span key={p} style={{
                  background: p.startsWith('1st') ? '#FFD70033' : p.startsWith('2nd') ? '#C0C0C033' : '#CD7F3233',
                  color: p.startsWith('1st') ? '#FFD700' : p.startsWith('2nd') ? '#C0C0C0' : '#CD7F32',
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                }}>{p}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.05rem', color: 'var(--accent)', flexShrink: 0 }}>
          {formatDuration(row.totalMs)}
        </div>
        <SaveButton onClick={() => downloadResultCard(row, raceType, placements)} />
      </div>
    </div>
  )
}

function EmptyState({ message }) {
  return <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)', fontSize: '0.95rem' }}>{message}</div>
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', padding: '20px 0 8px' }}>
      {children}
    </div>
  )
}

// ── Tabs ──

function LiveTab({ raceType }) {
  const [rows, setRows] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [raceEnd, setRaceEnd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setLoading(true)
    refresh()
    const data = setInterval(refresh, 10000)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(data); clearInterval(clock) }
  }, [raceType])

  async function refresh() {
    const { rows, raceStart, raceEnd } = await fetchLive(raceType)
    setRows(rows); setRaceStart(raceStart); setRaceEnd(raceEnd)
    setLoading(false); setLastUpdate(new Date())
  }

  const raceEndTs = raceEnd ? new Date(raceEnd).getTime() : null
  const elapsedMs = raceStart ? (raceEndTs || now) - new Date(raceStart).getTime() : null

  if (loading) return <EmptyState message="Loading..." />

  const indAll = rows.filter(r => !r.isTeam)
  const teamAll = rows.filter(r => r.isTeam)

  return (
    <div>
      {elapsedMs != null && (
        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '2rem', color: 'var(--accent)' }}>
            {formatDuration(elapsedMs)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Race time · started {new Date(raceStart).toLocaleTimeString()}
          </div>
        </div>
      )}
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 12, textAlign: 'right' }}>
        {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : ''}
      </div>
      {rows.length === 0
        ? <EmptyState message={raceStart ? "No finishers yet. Check back soon!" : "Race hasn't started yet."} />
        : rows.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={computePlacements(row, indAll, teamAll)} />)
      }
    </div>
  )
}

function FinalTab({ raceType, settings }) {
  const [ind, setInd] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    async function load() {
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
          age: r.participants?.age, ageGroup: r.participants?.age_group, gender: r.participants?.gender,
          totalMs: diffMs(raceStart, r.finish_time),
        })).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))
      setInd(indRows)

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
          id: r.id, teamColor: r.team_color,
          teamLabel: TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team',
          subName: members.map(m => m.first_name).join(' / '),
          raceNumbers: members.map(m => `#${m.race_number}`).join(' '),
          name: `${TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team'} Team`,
          totalMs: diffMs(raceStart, r.finish_time),
          isTeam: true,
        }
      }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))
      setTeams(teamRows)
      setLoading(false)
    }
    load()
  }, [raceType])

  const released = settings[RELEASE_FIELD[raceType]]

  if (!released) {
    return <EmptyState message="Final results will be announced shortly. Stay tuned!" />
  }
  if (loading) return <EmptyState message="Loading..." />

  const top3Overall = ind.slice(0, 3)
  const top3Ids = new Set(top3Overall.map(r => r.id))
  const top3Men = ind.filter(r => r.gender === 'male' && !top3Ids.has(r.id)).slice(0, 3)
  const top3Women = ind.filter(r => r.gender === 'female' && !top3Ids.has(r.id)).slice(0, 3)

  return (
    <div>
      {top3Overall.length > 0 && (
        <>
          <SectionLabel>Top 3 Overall</SectionLabel>
          {top3Overall.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={computePlacements(row, ind, teams)} />)}
        </>
      )}
      {top3Men.length > 0 && (
        <>
          <SectionLabel>Top 3 Men</SectionLabel>
          {top3Men.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={computePlacements(row, ind, teams)} />)}
        </>
      )}
      {top3Women.length > 0 && (
        <>
          <SectionLabel>Top 3 Women</SectionLabel>
          {top3Women.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={computePlacements(row, ind, teams)} />)}
        </>
      )}
      {teams.length > 0 && (
        <>
          <SectionLabel>Teams</SectionLabel>
          {teams.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={computePlacements(row, ind, teams)} />)}
        </>
      )}
      {AGE_GROUPS.map(group => {
        const rows = ind.filter(r => r.ageGroup === group).slice(0, 3)
        if (rows.length === 0) return null
        return (
          <div key={group}>
            <SectionLabel>Age Group — {group}</SectionLabel>
            {rows.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} raceType={raceType} placements={[]} />)}
          </div>
        )
      })}
      {top3Overall.length === 0 && teams.length === 0 && (
        <EmptyState message="Final results not yet available." />
      )}
    </div>
  )
}

// ── Main ──

export default function PublicResults() {
  const [raceType, setRaceType] = useState('trail')
  const [tab, setTab] = useState('live')
  const [settings, setSettings] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchSettings().then(setSettings)
    const t = setInterval(() => fetchSettings().then(setSettings), 15000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '16px 20px 0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--accent)' }}>5KTimer</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Live Race Results</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
      </div>

      {/* Race switcher */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
        {RACE_TYPES.map(rt => (
          <button
            key={rt.value}
            onClick={() => setRaceType(rt.value)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${raceType === rt.value ? 'var(--accent)' : 'var(--border)'}`,
              background: raceType === rt.value ? 'var(--accent)' : 'var(--surface)',
              color: raceType === rt.value ? '#0f1117' : 'var(--text)',
            }}
          >
            {rt.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
        {tab === 'live'  && <LiveTab raceType={raceType} />}
        {tab === 'final' && settings && <FinalTab raceType={raceType} settings={settings} />}
        {tab === 'final' && !settings && <EmptyState message="Loading..." />}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600, background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', zIndex: 200,
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '14px 8px', border: 'none', cursor: 'pointer', background: 'transparent',
            fontSize: '0.82rem', fontWeight: 700,
            color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
            borderTop: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>
    </div>
  )
}
