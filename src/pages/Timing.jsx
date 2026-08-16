import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, runnerStatus, RACE_NAME } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'
import ResetConfirmModal from '../components/ResetConfirmModal'

export default function Timing() {
  const [participants, setParticipants] = useState([])
  const [timingMap, setTimingMap]       = useState({}) // key: participant_id
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
        data.forEach(r => { if (r.participant_id) tMap[r.participant_id] = r })
        setTimingMap(tMap)
      }
    }, 10000)
    return () => clearInterval(poll)
  }, [])

  async function load() {
    const { data: pData } = await supabase.from('participants').select('*')
      .eq('checked_in', true).order('race_number')
    const { data: evData } = await supabase.from('race_events').select('*')
      .order('ts', { ascending: false })
    const { data: tData }  = await supabase.from('timing_records').select('*')

    setParticipants(pData || [])

    const tMap = {}
    if (tData) tData.forEach(r => { if (r.participant_id) tMap[r.participant_id] = r })
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
    } else {
      setRaceStart(null)
      setRaceEnded(false)
      setRaceEndTime(null)
    }
    setLoading(false)
    focusSearch()
  }

  function focusSearch() {
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  const STATUS_KEYWORDS = {
    'running':  'Running', 'run': 'Running',
    'finished': 'Finished', 'finish': 'Finished', 'done': 'Finished',
    'dnf': 'DNF',
  }

  function matchesSearch(p, q) {
    if (!q) return true
    const lower = q.toLowerCase().trim()
    const statusTarget = STATUS_KEYWORDS[lower]
    if (statusTarget) {
      return runnerStatus(timingMap[p.id], !!raceStart) === statusTarget
    }
    return String(p.race_number ?? '').startsWith(q) ||
      `${p.first_name} ${p.last_name}`.toLowerCase().includes(lower)
  }

  function findExactEntry(list, q) {
    if (!q) return null
    return list.find(p => String(p.race_number) === q) || null
  }

  const q = searchVal.trim()
  const displayList = q ? participants.filter(p => matchesSearch(p, q)) : participants
  const exactEntry = q ? findExactEntry(participants, q) : null

  async function startRace() {
    const ts = new Date().toISOString()
    const { error } = await supabase.from('race_events').insert({ event_type: 'start', ts })
    if (error) { alert('Error starting race: ' + error.message); return }

    const inserts = participants.map(p => ({ participant_id: p.id }))
    if (inserts.length > 0) {
      await supabase.from('timing_records').upsert(inserts, { onConflict: 'participant_id', ignoreDuplicates: true })
    }

    setRaceStart(ts)
    setConfirm(null)
    focusSearch()

    const { data } = await supabase.from('timing_records').select('*')
    const tMap = {}
    if (data) data.forEach(r => { if (r.participant_id) tMap[r.participant_id] = r })
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
    await supabase.from('timing_records').delete().not('id', 'is', null)
    await supabase.from('race_events').delete().not('id', 'is', null)
    setRaceStart(null)
    setRaceEnded(false)
    setRaceEndTime(null)
    setTimingMap({})
    setConfirm(null)
    focusSearch()
  }

  async function markFinished(p) {
    const ts = new Date().toISOString()
    const rec = timingMap[p.id]
    if (!rec) return
    const { error } = await supabase.from('timing_records').update({ finish_time: ts }).eq('id', rec.id)
    if (!error) setTimingMap(m => ({ ...m, [p.id]: { ...rec, finish_time: ts } }))
    setSearchVal('')
    focusSearch()
  }

  async function markDNF(p) {
    const rec = timingMap[p.id]
    if (!rec) return
    const { error } = await supabase.from('timing_records').update({ dnf: true }).eq('id', rec.id)
    if (!error) setTimingMap(m => ({ ...m, [p.id]: { ...rec, dnf: true } }))
    setSearchVal('')
    focusSearch()
    setConfirm(null)
  }

  async function goBack(p) {
    const rec = timingMap[p.id]
    if (!rec) return
    let update = {}
    if (rec.dnf) update = { dnf: false }
    else if (rec.finish_time) update = { finish_time: null }
    else return
    const { error } = await supabase.from('timing_records').update(update).eq('id', rec.id)
    if (!error) setTimingMap(m => ({ ...m, [p.id]: { ...rec, ...update } }))
    setSearchVal('')
    focusSearch()
    setConfirm(null)
  }

  function getWarnings() {
    return participants.filter(p => {
      const rec = timingMap[p.id]
      if (!rec) return !!raceStart
      return !rec.finish_time && !rec.dnf
    })
  }

  function entryLabel(p) {
    return `${p.first_name} ${p.last_name}`
  }

  if (loading) return <div className="text-muted">Loading...</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="page-title" style={{ marginBottom: 0 }}>{RACE_NAME} — Timing</div>
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
          placeholder="Number, name, or status (running, finished)..."
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && exactEntry && raceStart && !raceEnded) {
              const rec = timingMap[exactEntry.id]
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
        {displayList.map(p => {
          const rec = timingMap[p.id]
          const status = runnerStatus(rec, !!raceStart)
          const isHighlighted = exactEntry === p
          const isFinished = !!rec?.finish_time
          const isDNF = !!rec?.dnf
          const totalMs = diffMs(raceStart, rec?.finish_time)

          return (
            <div
              key={p.id}
              className={`participant-timing-row${isHighlighted ? ' highlighted' : ''}${isFinished ? ' finished' : ''}${isDNF ? ' dnf' : ''}`}
            >
              <div className="timing-row-header">
                <div className="race-num-badge">#{p.race_number ?? '—'}</div>
                <div className="participant-name">{p.first_name} {p.last_name}</div>
                <div className="participant-age">Age {p.age}</div>
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
                    <button className="btn btn-success btn-lg" onClick={() => markFinished(p)}>
                      Mark Finished
                    </button>
                  )}
                  {(isFinished || isDNF) && (
                    <button className="btn btn-ghost" onClick={() => setConfirm({ type: 'goback', entry: p })}>
                      Go Back
                    </button>
                  )}
                  {!isDNF && !isFinished && (
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ type: 'dnf', entry: p })}>
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
          message={`This records the official race start for all ${participants.length} checked-in runners. This cannot be undone.`}
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
              <strong>{getWarnings().length} runner{getWarnings().length === 1 ? '' : 's'} not finished:</strong>
              <div style={{ marginTop: 6 }}>
                {getWarnings().map((p) => <div key={p.id}>{entryLabel(p)}</div>)}
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
