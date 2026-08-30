import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, AGE_GROUPS, RACE_NAME } from '../lib/utils'

const TABS = [
  { key: 'live',  label: 'Live'  },
  { key: 'final', label: 'Final' },
]

function ordinal(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

// Public read helpers — these call SECURITY DEFINER functions that only
// return non-personal race data (no emails, finishers only).
async function fetchRaceState() {
  const { data } = await supabase.rpc('get_race_state')
  return data || { start_ts: null, end_ts: null, results_released: false, clock_display_categories: {} }
}

async function fetchFinishers(startTs) {
  const { data } = await supabase.rpc('get_finishers')
  return (data || [])
    .map(r => ({
      id: r.timing_id,
      name: `${r.first_name} ${r.last_name}`,
      raceNumber: r.race_number,
      gender: r.gender,
      age: r.age,
      ageGroup: r.age_group,
      totalMs: diffMs(startTs, r.finish_time),
    }))
    .sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))
}

function computePlacements(row, allInd) {
  const badges = []
  if (!row.totalMs) return badges
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
function downloadResultCard(row, placements = []) {
  const canvas = document.createElement('canvas')
  const placementH = placements.length > 0 ? 36 : 0
  const W = 800, H = 280 + placementH
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  const accent = '#e6ae30'

  ctx.fillStyle = '#2e2214'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 6, H)

  ctx.fillStyle = accent
  ctx.font = 'bold 22px system-ui, sans-serif'
  ctx.fillText(RACE_NAME, 32, 44)
  ctx.fillStyle = '#c9b99c'
  ctx.font = '15px system-ui, sans-serif'
  ctx.fillText('Race Result', 32, 68)

  ctx.fillStyle = '#5c4a2e'; ctx.fillRect(32, 82, W - 64, 1)

  if (placements.length > 0) {
    const medalColors = { '1st': '#FFD700', '2nd': '#C0C0C0', '3rd': '#CD7F32' }
    let bx = W - 32
    placements.slice().reverse().forEach(p => {
      const rank = p.split(' ')[0]
      const bg = medalColors[rank] || '#5c4a2e'
      const tw = ctx.measureText(p).width + 20
      bx -= tw + 8
      ctx.fillStyle = bg
      ctx.beginPath(); ctx.roundRect(bx, 20, tw + 8, 26, 6); ctx.fill()
      ctx.fillStyle = '#111'
      ctx.font = 'bold 13px system-ui, sans-serif'
      ctx.fillText(p, bx + 10, 37)
    })
  }

  ctx.fillStyle = '#f6eede'
  ctx.font = 'bold 32px system-ui, sans-serif'
  ctx.fillText(row.name, 32, 124)

  ctx.fillStyle = accent
  ctx.font = 'bold 18px system-ui, sans-serif'
  ctx.fillText(`#${row.raceNumber ?? '—'}`, 32, 158)

  ctx.fillStyle = accent
  ctx.font = 'bold 52px monospace'
  ctx.fillText(formatDuration(row.totalMs), 32, 220)
  ctx.fillStyle = '#c9b99c'
  ctx.font = '14px system-ui, sans-serif'
  ctx.fillText('Total Time', 32, 242)

  ctx.fillStyle = '#c9b99c'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(new Date().toLocaleDateString(), 32, H - 16)

  const link = document.createElement('a')
  const safeName = row.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
  link.download = `${safeName}_result.png`
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

function ResultCard({ rank, row, placements = [] }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {rank != null && <RankBadge rank={rank} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{row.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>
            #{row.raceNumber ?? '—'}{row.age ? ` · Age ${row.age}` : ''}{row.gender ? ` · ${row.gender}` : ''}
          </div>
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
        <SaveButton onClick={() => downloadResultCard(row, placements)} />
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

function LiveTab() {
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
  }, [])

  async function refresh() {
    const state = await fetchRaceState()
    const rows = await fetchFinishers(state.start_ts)
    setRaceStart(state.start_ts); setRaceEnd(state.end_ts)
    setRows(rows)
    setLoading(false); setLastUpdate(new Date())
  }

  const raceEndTs = raceEnd ? new Date(raceEnd).getTime() : null
  const elapsedMs = raceStart ? (raceEndTs || now) - new Date(raceStart).getTime() : null

  if (loading) return <EmptyState message="Loading..." />

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
        : rows.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} placements={computePlacements(row, rows)} />)
      }
    </div>
  )
}

function FinalTab({ released }) {
  const [ind, setInd] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    async function load() {
      const state = await fetchRaceState()
      const rows = await fetchFinishers(state.start_ts)
      setInd(rows)
      setLoading(false)
    }
    load()
  }, [])

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
          {top3Overall.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} placements={computePlacements(row, ind)} />)}
        </>
      )}
      {top3Men.length > 0 && (
        <>
          <SectionLabel>Top 3 Men</SectionLabel>
          {top3Men.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} placements={computePlacements(row, ind)} />)}
        </>
      )}
      {top3Women.length > 0 && (
        <>
          <SectionLabel>Top 3 Women</SectionLabel>
          {top3Women.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} placements={computePlacements(row, ind)} />)}
        </>
      )}
      {AGE_GROUPS.map(group => {
        const rows = ind.filter(r => r.ageGroup === group).slice(0, 3)
        if (rows.length === 0) return null
        return (
          <div key={group}>
            <SectionLabel>Age Group — {group}</SectionLabel>
            {rows.map((row, i) => <ResultCard key={row.id} rank={i + 1} row={row} placements={[]} />)}
          </div>
        )
      })}
      {top3Overall.length === 0 && (
        <EmptyState message="Final results not yet available." />
      )}
    </div>
  )
}

// ── Main ──

export default function PublicResults() {
  const [tab, setTab] = useState('live')
  const [released, setReleased] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchRaceState().then(s => setReleased(!!s.results_released))
    const t = setInterval(() => fetchRaceState().then(s => setReleased(!!s.results_released)), 15000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '16px 20px 0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--accent)' }}>{RACE_NAME}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Live Race Results</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>Home</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 100px' }}>
        {tab === 'live'  && <LiveTab />}
        {tab === 'final' && <FinalTab released={released} />}
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
