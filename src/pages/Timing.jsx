import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, teamColorStyle, TEAM_COLORS, runnerStatus } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'
import ResetConfirmModal from '../components/ResetConfirmModal'

export default function Timing() {
  const [participants, setParticipants] = useState([])
  const [timingMap, setTimingMap]       = useState({}) // key: participant_id OR "team:COLOR"
  const [raceStart, setRaceStart]       = useState(null)
  const [raceEnded, setRaceEnded]       = useState(false)
  const [raceEndTime, setRaceEndTime]   = useState(null)
  const [loading, setLoading]           = useState(true)
  const [searchVal, setSearchVal]       = useState('')
  const [confirm, setConfirm]           = useState(null)
  const [now, setNow]                   = useState(Date.now())
  const searchRef = useRef()

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    load()
    // Poll every 10s for sync with a second operator device (e.g. entrance + exit)
    const poll = setInterval(async () => {
      const { data } = await supabase.from('timing_records').select('*')
      if (data) {
        const tMap = {}
        data.forEach(r => {
          if (r.team_color) tMap[`team:${r.team_color}`] = r
          else if (r.participant_id) tMap[r.participant_id] = r
        })
        setTimingMap(tMap)
      }
    }, 10000)
    return () => clearInterval(poll)
  }, [])

  async function load() {
    const { data: pData } = await supabase.from('participants').select('*').eq('checked_in', true).order('race_number')
    const { data: evData } = await supabase.from('race_events').select('*').order('ts', { ascending: false })
    const { data: tData }  = await supabase.from('timing_records').select('*')

    setParticipants(pData || [])

    const tMap = {}
    if (tData) tData.forEach(r => {
      if (r.team_color) tMap[`team:${r.team_color}`] = r
      else if (r.participant_id) tMap[r.participant_id] = r
    })
    setTimingMap(tMap)

    if (evData && evData.length > 0) {
      const latest = evData[0]
      if (latest.event_type === 'end') {
        const startEv = evData.find(e => e.event_type === 'start')
        setRaceStart(startEv ? startEv.ts : null)
        setRaceEnded(true)
        setRaceEndTime(latest.ts)
      } else if (latest.event_type === 'start') {
        setRaceStart(latest.ts)
        setRaceEnded(false)
      }
    }
    setLoading(false)
    focusSearch()
  }

  function focusSearch() {
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  // Group: individuals stay solo, team members group by color
  function buildEntries(list) {
    const entries = []
    const teamMap = {}
    list.forEach(p => {
      if (p.is_team && p.team_color) {
        if (!teamMap[p.team_color]) {
          teamMap[p.team_color] = { type: 'team', color: p.team_color, members: [] }
          entries.push(teamMap[p.team_color])
        }
        teamMap[p.team_color].members.push(p)
      } else {
        entries.push({ type: 'individual', participant: p })
      }
    })
    return entries
  }

  const STATUS_KEYWORDS = {
    'running':  'Running', 'run': 'Running',
    'finished': 'Finished', 'finish': 'Finished', 'done': 'Finished',
    'dnf': 'DNF',
  }

  function matchesSearch(entry, q) {
    if (!q) return true
    const lower = q.toLowerCase().trim()
    const statusTarget = STATUS_KEYWORDS[lower]
    if (statusTarget) {
      const rec = recForEntry(entry)
      return runnerStatus(rec, !!raceStart) === statusTarget
    }
    if (entry.type === 'individual') {
      const p = entry.participant
      return String(p.race_number).startsWith(q) || `${p.first_name} ${p.last_name}`.toLowerCase().includes(lower)
    }
    const colorLabel = TEAM_COLORS.find(c => c.value === entry.color)?.label || ''
    if (colorLabel.toLowerCase().includes(lower)) return true
    return entry.members.some(p =>
      String(p.race_number).startsWith(q) || `${p.first_name} ${p.last_name}`.toLowerCase().includes(lower)
    )
  }

  function findExactEntry(entries, q) {
    if (!q) return null
    return entries.find(entry => {
      if (entry.type === 'individual') return String(entry.participant.race_number) === q
      return entry.members.some(p => String(p.race_number) === q)
    })
  }

  const q = searchVal.trim()
  const allEntries = buildEntries(participants)
  const displayEntries = q ? allEntries.filter(e => matchesSearch(e, q)) : allEntries
  const exactEntry = q ? findExactEntry(allEntries, q) : null

  function recForEntry(entry) {
    if (entry.type === 'individual') return timingMap[entry.participant.id]
    return timingMap[`team:${entry.color}`]
  }

  async function startRace() {
    const ts = new Date().toISOString()
    const { error } = await supabase.from('race_events').insert({ event_type: 'start', ts })
    if (error) { alert('Error starting race: ' + error.message); return }

    const inserts = []
    allEntries.forEach(entry => {
      if (entry.type === 'individual') inserts.push({ participant_id: entry.participant.id })
      else inserts.push({ team_color: entry.color })
    })
    if (inserts.length > 0) {
      await supabase.from('timing_records').upsert(inserts, { ignoreDuplicates: true })
    }

    setRaceStart(ts)
    setConfirm(null)
    focusSearch()

    const { data } = await supabase.from('timing_records').select('*')
    const tMap = {}
    if (data) data.forEach(r => {
      if (r.team_color) tMap[`team:${r.team_color}`] = r
      else if (r.participant_id) tMap[r.participant_id] = r
    })
    setTimingMap(tMap)
  }

  async function endRace() {
    const ts = new Date().toISOString()
    await supabase.from('race_events').insert({ event_type: 'end', ts })
    setRaceEnded(true)
    setRaceEndTime(ts)
    setConfirm(null)
    focusSearch()
  }

  async function resetRace() {
    await supabase.from('timing_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('race_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setRaceStart(null)
    setRaceEnded(false)
    setRaceEndTime(null)
    setTimingMap({})
    setConfirm(null)
    focusSearch()
  }

  async function markFinished(entry) {
    const ts = new Date().toISOString()
    const rec = recForEntry(entry)
    if (!rec) return
    const { error } = await supabase.from('timing_records').update({ finish_time: ts }).eq('id', rec.id)
    if (!error) {
      const key = entry.type === 'individual' ? entry.participant.id : `team:${entry.color}`
      setTimingMap(m => ({ ...m, [key]: { ...rec, finish_time: ts } }))
    }
    setSearchVal('')
    focusSearch()
  }

  async function markDNF(entry) {
    const rec = recForEntry(entry)
    if (!rec) return
    const { error } = await supabase.from('timing_records').update({ dnf: true }).eq('id', rec.id)
    if (!error) {
      const key = entry.type === 'individual' ? entry.participant.id : `team:${entry.color}`
      setTimingMap(m => ({ ...m, [key]: { ...rec, dnf: true } }))
    }
    setSearchVal('')
    focusSearch()
    setConfirm(null)
  }

  async function goBack(entry) {
    const rec = recForEntry(entry)
    if (!rec) return
    let update = {}
    if (rec.dnf) update = { dnf: false }
    else if (rec.finish_time) update = { finish_time: null }
    else return
    const { error } = await supabase.from('timing_records').update(update).eq('id', rec.id)
    if (!error) {
      const key = entry.type === 'individual' ? entry.participant.id : `team:${entry.color}`
      setTimingMap(m => ({ ...m, [key]: { ...rec, ...update } }))
    }
    setSearchVal('')
    focusSearch()
    setConfirm(null)
  }

  function getWarnings() {
    return allEntries.filter(entry => {
      const rec = recForEntry(entry)
      if (!rec) return !!raceStart
      return !rec.finish_time && !rec.dnf
    })
  }

  function teamColorLabel(color) {
    return TEAM_COLORS.find(c => c.value === color)?.label || 'Team'
  }

  function entryLabel(entry) {
    if (entry.type === 'individual') return `${entry.participant.first_name} ${entry.participant.last_name}`
    return `${teamColorLabel(entry.color)} Team`
  }

  if (loading) return <div className="text-muted">Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>Race Timing</div>
        <div style={{ flex: 1 }} />
        <div style={{
          padding: '6px 14px', borderRadius: '999px', fontWeight: 700, fontSize: '0.85rem',
          background: raceStart ? (raceEnded ? 'var(--danger)' : 'var(--success)') : 'var(--surface2)',
          color: raceStart ? '#0f1117' : 'var(--muted)'
        }}>
          {!raceStart ? 'Waiting for Start' : raceEnded ? 'Race Ended' : 'Race Running'}
        </div>
        {raceStart && (
          <div style={{ color: 'var(--accent)', fontWeight: 700, fontFamily: 'monospace', fontSize: '1.1rem' }}>
            {formatDuration((raceEnded && raceEndTime ? new Date(raceEndTime) : now) - new Date(raceStart).getTime())}
          </div>
        )}
      </div>

      <div className="race-controls">
        {!raceStart && (
          <button className="btn btn-success btn-lg" onClick={() => setConfirm('start')}>Start Race</button>
        )}
        {raceStart && !raceEnded && (
          <button className="btn btn-danger" onClick={() => setConfirm('end')}>End Race</button>
        )}
        <button className="btn btn-ghost" onClick={() => setConfirm('reset')}>Reset Race</button>
      </div>

      <div className="timing-search">
        <input
          ref={searchRef}
          className="form-input"
          placeholder="Number, name, team color, or status (running, finished)..."
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && exactEntry && raceStart && !raceEnded) {
              const rec = recForEntry(exactEntry)
              if (!rec?.finish_time && !rec?.dnf) markFinished(exactEntry)
            }
          }}
        />
        {raceStart && (
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 6 }}>
            Press Enter to mark finish for exact number match
          </div>
        )}
      </div>

      {!raceStart && (
        <div className="alert alert-warn">Race has not started. Press "Start Race" to begin timing.</div>
      )}

      <div>
        {displayEntries.map(entry => {
          const rec = recForEntry(entry)
          const status = runnerStatus(rec, !!raceStart)
          const isHighlighted = exactEntry === entry
          const isFinished = !!rec?.finish_time
          const isDNF = !!rec?.dnf
          const isTeam = entry.type === 'team'
          const totalMs = diffMs(raceStart, rec?.finish_time)

          return (
            <div
              key={isTeam ? `team-${entry.color}` : entry.participant.id}
              className={`participant-timing-row${isHighlighted ? ' highlighted' : ''}${isFinished ? ' finished' : ''}${isDNF ? ' dnf' : ''}`}
            >
              <div className="timing-row-header">
                {isTeam ? (
                  <>
                    <span style={{ ...teamColorStyle(entry.color), flexShrink: 0, fontSize: '0.95rem' }}>
                      {teamColorLabel(entry.color)}
                    </span>
                    <div style={{ flex: 1, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      {entry.members.map(p => (
                        <span key={p.id} style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '1rem' }}>#{p.race_number}</span>
                          <strong>{p.first_name} {p.last_name}</strong>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="race-num-badge">#{entry.participant.race_number}</div>
                    <div className="participant-name">{entry.participant.first_name} {entry.participant.last_name}</div>
                    <div className="participant-age">Age {entry.participant.age}</div>
                  </>
                )}
                <div style={{
                  padding: '3px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
                  background: isDNF ? 'var(--danger)' : isFinished ? 'var(--success)' : raceStart ? '#00d4ff22' : 'var(--surface2)',
                  color: isDNF ? '#fff' : isFinished ? '#0f1117' : raceStart ? 'var(--accent)' : 'var(--muted)'
                }}>
                  {status}
                </div>
              </div>

              <div className="progress-dots" style={{ marginBottom: 10 }}>
                <span className={`dot ${raceStart ? 'done' : ''}`}>{raceStart ? 'v' : 'o'} Start</span>
                <span style={{ color: 'var(--border)' }}>-</span>
                <span className={`dot ${isFinished ? 'done' : ''}`}>{isFinished ? 'v' : 'o'} Finish</span>
                {isFinished && totalMs != null && (
                  <span style={{ marginLeft: 12, color: 'var(--accent)', fontWeight: 800, fontSize: '0.95rem' }}>
                    Time: {formatDuration(totalMs)}
                  </span>
                )}
              </div>

              {raceStart && !raceEnded && (
                <div className="timing-actions">
                  {!isFinished && !isDNF && (
                    <button className="btn btn-success btn-lg" onClick={() => markFinished(entry)}>
                      Mark Finished
                    </button>
                  )}
                  {(isFinished || isDNF) && (
                    <button className="btn btn-ghost" onClick={() => setConfirm({ type: 'goback', entry })}>
                      Go Back
                    </button>
                  )}
                  {!isDNF && !isFinished && (
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ type: 'dnf', entry })}>
                      DNF
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {confirm === 'start' && (
        <ConfirmModal
          title="Start Race?"
          message={`This records the official race start for all ${allEntries.length} entries. This cannot be undone.`}
          onConfirm={startRace}
          onCancel={() => setConfirm(null)}
          confirmLabel="Start Race"
        />
      )}
      {confirm === 'end' && (
        <ConfirmModal
          title="End Race?"
          onConfirm={endRace}
          onCancel={() => setConfirm(null)}
          confirmLabel="End Race"
          danger
        >
          {getWarnings().length > 0 && (
            <div className="alert alert-warn" style={{ marginBottom: 12 }}>
              <strong>{getWarnings().length} entr{getWarnings().length === 1 ? 'y' : 'ies'} not finished:</strong>
              <div style={{ marginTop: 6 }}>
                {getWarnings().map((entry, i) => <div key={i}>{entryLabel(entry)}</div>)}
              </div>
            </div>
          )}
          <p>Are you sure you want to end the race?</p>
        </ConfirmModal>
      )}
      {confirm === 'reset' && (
        <ResetConfirmModal
          title="Reset Race?"
          finishedCount={Object.values(timingMap).filter(r => r.finish_time).length}
          onConfirm={resetRace}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'goback' && (
        <ConfirmModal
          title="Undo Last Action?"
          message={`Remove the most recent timing entry for ${entryLabel(confirm.entry)}?`}
          onConfirm={() => goBack(confirm.entry)}
          onCancel={() => setConfirm(null)}
          confirmLabel="Go Back"
        />
      )}
      {confirm?.type === 'dnf' && (
        <ConfirmModal
          title="Mark as DNF?"
          message={`Mark ${entryLabel(confirm.entry)} as Did Not Finish?`}
          onConfirm={() => markDNF(confirm.entry)}
          onCancel={() => setConfirm(null)}
          confirmLabel="Mark DNF"
          danger
        />
      )}
    </div>
  )
}
