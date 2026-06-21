import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, teamColorStyle, TEAM_COLORS, AGE_GROUPS, raceTypeLabel } from '../lib/utils'
import QRCode from 'qrcode'

const DEFAULT_CATEGORY_SET = { overall: true, men: true, women: true, team: false, age_group: false }
const DEFAULT_CLOCK_CATEGORIES = { trail: DEFAULT_CATEGORY_SET, kids_run: DEFAULT_CATEGORY_SET }

const RELEASE_FIELD = { trail: 'trail_results_released', kids_run: 'kids_run_results_released' }

function ResultsQRCode() {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    const url = `${window.location.origin}/results`
    QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: '#0f1117', light: '#f0f2ff' },
    }).then(setDataUrl).catch(() => {})
  }, [])

  if (!dataUrl) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
      padding: '20px 24px',
    }}>
      <img src={dataUrl} alt="Scan for full results" style={{ width: 160, height: 160, borderRadius: 8 }} />
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>
        Scan for full results
      </div>
    </div>
  )
}

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false)

  useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
  }

  return (
    <button
      onClick={toggle}
      style={{
        position: 'fixed', top: 20, right: 20, zIndex: 50,
        background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
        borderRadius: 8, padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
        opacity: 0.55, transition: 'opacity 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = 1}
      onMouseLeave={e => e.currentTarget.style.opacity = 0.55}
    >
      {isFs ? 'Exit Fullscreen' : 'Fullscreen'}
    </button>
  )
}

function FinisherToast({ finisher }) {
  if (!finisher) return null
  return (
    <div key={finisher.key} className="finisher-toast">
      <span style={{ color: 'var(--accent)', fontWeight: 900 }}>#{finisher.raceNumber}</span>
      {' '}{finisher.name} — <span style={{ color: 'var(--success)' }}>Finished!</span>
    </div>
  )
}

function CategoryList({ title, rows, isTeam = false }) {
  if (!rows || rows.length === 0) return null
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{
        fontSize: '0.85rem', fontWeight: 800, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
      }}>
        {title}
      </div>
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0, fontSize: '0.72rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32', color: '#111',
          }}>{i + 1}</div>
          {isTeam ? (
            <span style={teamColorStyle(r.teamColor)}>{r.name}</span>
          ) : (
            <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{r.name}</span>
          )}
          <span style={{ marginLeft: 'auto', fontFamily: 'monospace', color: 'var(--accent)', fontWeight: 700, fontSize: '0.85rem' }}>
            {formatDuration(r.totalMs)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Loads category standings only when needed (results released + at least one category toggled on)
function ClockResultsLoader({ raceType, categories, showCategories, children }) {
  const [catData, setCatData] = useState({ overall: [], men: [], women: [], team: [], ageGroups: [] })

  useEffect(() => {
    if (!showCategories) return
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [showCategories, raceType, JSON.stringify(categories)])

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
        name: `${r.participants?.first_name} ${r.participants?.last_name}`,
        gender: r.participants?.gender,
        ageGroup: r.participants?.age_group,
        totalMs: diffMs(raceStart, r.finish_time),
      })).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

    const top3Overall = indRows.slice(0, 3)
    const top3Ids = new Set(top3Overall.map(r => r.id))
    const top3Men   = indRows.filter(r => r.gender === 'male'   && !top3Ids.has(r.id)).slice(0, 3)
    const top3Women = indRows.filter(r => r.gender === 'female' && !top3Ids.has(r.id)).slice(0, 3)

    let teamRows = []
    if (categories.team) {
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
      teamRows = (teamT || []).map(r => ({
        id: r.id, teamColor: r.team_color,
        name: `${TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team'} Team`,
        totalMs: diffMs(raceStart, r.finish_time),
      })).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity)).slice(0, 3)
    }

    let ageGroups = []
    if (categories.age_group) {
      ageGroups = AGE_GROUPS
        .map(g => ({ group: g, rows: indRows.filter(r => r.ageGroup === g).slice(0, 3) }))
        .filter(g => g.rows.length > 0)
    }

    setCatData({ overall: top3Overall, men: top3Men, women: top3Women, team: teamRows, ageGroups })
  }

  return children(catData)
}

export default function RaceClock() {
  const { raceType } = useParams()
  const validType = raceType === 'trail' || raceType === 'kids_run'

  const [raceStart, setRaceStart] = useState(null)
  const [raceEnd, setRaceEnd]     = useState(null)
  const [status, setStatus]       = useState('loading')
  const [now, setNow]             = useState(Date.now())
  const [finisherCount, setFinisherCount] = useState(0)
  const [finisher, setFinisher]   = useState(null)
  const [settings, setSettings]   = useState(null)
  const [categories, setCategories] = useState({})

  const lastSeenFinishIds = useRef(new Set())
  const toastTimer = useRef(null)

  const accent = 'var(--run-color)'

  useEffect(() => {
    if (!validType) return
    load()
    const dataInterval  = setInterval(load, 4000)
    const clockInterval = setInterval(() => setNow(Date.now()), 100)
    return () => { clearInterval(dataInterval); clearInterval(clockInterval); clearTimeout(toastTimer.current) }
  }, [raceType])

  async function load() {
    const { data: evData } = await supabase.from('race_events').select('event_type, ts')
      .eq('race_type', raceType).order('ts', { ascending: false })
    const startEv = (evData || []).find(e => e.event_type === 'start')
    const endEv   = (evData || []).find(e => e.event_type === 'end')

    setRaceStart(startEv?.ts || null)
    setRaceEnd(endEv?.ts || null)
    setStatus(endEv ? 'ended' : startEv ? 'running' : 'waiting')

    const { data: settingsData, error: settingsError } = await supabase.from('app_settings').select('*').eq('id', 1).single()
    if (settingsError) {
      console.error('Failed to load app_settings:', settingsError.message)
    }
    if (settingsData) {
      setSettings(settingsData)
      const allCats = settingsData.clock_display_categories || DEFAULT_CLOCK_CATEGORIES
      setCategories(allCats[raceType] || DEFAULT_CATEGORY_SET)
    }

    const { data: tData } = await supabase.from('timing_records')
      .select('*, participants(*)')
      .eq('race_type', raceType)
      .not('finish_time', 'is', null)
      .eq('dnf', false)
      .order('finish_time', { ascending: true })

    const visible = (tData || []).filter(r => !r.participants?.exclude_from_results)
    setFinisherCount(visible.length)

    if (visible.length > 0) {
      const latest = visible[visible.length - 1]
      if (!lastSeenFinishIds.current.has(latest.id)) {
        const isFirstLoad = lastSeenFinishIds.current.size === 0 && visible.length > 1
        lastSeenFinishIds.current.add(latest.id)
        if (!isFirstLoad) {
          const name = latest.team_color
            ? `${TEAM_COLORS.find(c => c.value === latest.team_color)?.label || 'Team'} Team`
            : `${latest.participants?.first_name || ''} ${latest.participants?.last_name || ''}`.trim()
          const raceNumber = latest.participants?.race_number ?? '—'
          clearTimeout(toastTimer.current)
          setFinisher({ key: latest.id, name, raceNumber })
          toastTimer.current = setTimeout(() => setFinisher(null), 2800)
        }
      }
    }
  }

  if (!validType) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.5rem', fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        Invalid race. Use /clock/trail or /clock/kids_run
      </div>
    )
  }

  const raceEndTs = raceEnd ? new Date(raceEnd).getTime() : null
  const elapsedMs = raceStart ? (raceEndTs || now) - new Date(raceStart).getTime() : 0

  const released = settings?.[RELEASE_FIELD[raceType]]
  const showCategories = released && categories && Object.values(categories).some(Boolean)

  return (
    <ClockResultsLoader raceType={raceType} categories={categories} showCategories={showCategories}>
      {(catData) => (
        <div style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: showCategories ? 'flex-start' : 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '40px 40px 100px',
          position: 'relative',
        }}>
          <FullscreenButton />

          <div style={{
            fontSize: 'clamp(1.5rem, 4vw, 3rem)', fontWeight: 900, color: accent,
            letterSpacing: '0.04em', marginTop: showCategories ? '20px' : 0, marginBottom: '24px', textTransform: 'uppercase',
          }}>
            {raceTypeLabel(raceType)}
          </div>

          {status === 'waiting' && (
            <div style={{ color: 'var(--muted)', fontSize: 'clamp(2rem, 6vw, 4.5rem)', fontWeight: 700 }}>
              Waiting for Start
            </div>
          )}

          {(status === 'running' || status === 'ended') && (
            <>
              <div style={{
                fontFamily: 'monospace', fontWeight: 900,
                fontSize: showCategories ? 'clamp(3rem, 9vw, 7rem)' : 'clamp(5rem, 18vw, 16rem)',
                color: status === 'ended' ? 'var(--muted)' : 'var(--text)',
                lineHeight: 1, letterSpacing: '0.02em',
                textShadow: status === 'running' ? `0 0 60px ${accent}55` : 'none',
              }}>
                {formatDuration(elapsedMs)}
              </div>

              {status === 'ended' && (
                <div style={{
                  marginTop: '16px', fontSize: 'clamp(1.2rem, 3vw, 2.2rem)', fontWeight: 800,
                  color: 'var(--danger)', letterSpacing: '0.06em',
                }}>
                  RACE ENDED
                </div>
              )}

              <div style={{ marginTop: '24px', fontSize: 'clamp(1rem, 2.5vw, 1.8rem)', color: accent, fontWeight: 700 }}>
                {finisherCount} finished
              </div>
            </>
          )}

          {showCategories && (
            <div style={{
              marginTop: 40, display: 'flex', gap: 48, flexWrap: 'wrap',
              justifyContent: 'center', alignItems: 'flex-start', width: '100%', maxWidth: 1100,
            }}>
              {categories.overall && <CategoryList title="Top 3 Overall" rows={catData.overall} />}
              {categories.men     && <CategoryList title="Top 3 Men"     rows={catData.men} />}
              {categories.women   && <CategoryList title="Top 3 Women"   rows={catData.women} />}
              {categories.team    && <CategoryList title="Top 3 Teams"   rows={catData.team} isTeam />}
              {categories.age_group && catData.ageGroups.map(g => (
                <CategoryList key={g.group} title={`Age Group — ${g.group}`} rows={g.rows} />
              ))}
              {status === 'ended' && <ResultsQRCode />}
            </div>
          )}

          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 40,
          }}>
            <FinisherToast finisher={finisher} />
          </div>

          <div style={{
            position: 'fixed', bottom: 16, left: 0, right: 0,
            textAlign: 'center', color: 'var(--border)', fontSize: '0.9rem', fontWeight: 600,
          }}>
            5KTimer
          </div>

          <style>{`
            .finisher-toast {
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 14px;
              padding: 16px 32px;
              margin-bottom: 90px;
              font-size: clamp(1.1rem, 2.4vw, 1.6rem);
              font-weight: 700;
              color: var(--text);
              box-shadow: 0 8px 40px rgba(0,0,0,0.5);
              animation: slideUpToast 2.8s ease forwards;
            }
            @keyframes slideUpToast {
              0%   { transform: translateY(120%); opacity: 0; }
              10%  { transform: translateY(0);     opacity: 1; }
              85%  { transform: translateY(0);     opacity: 1; }
              100% { transform: translateY(40%);   opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </ClockResultsLoader>
  )
}
