import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, TEAM_COLORS, teamColorStyle } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'

function toInputVal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
function fromInputVal(val) {
  if (!val) return null
  return new Date(val).toISOString()
}

function TimingEditor({ entry, raceStart, onSaved }) {
  const rec = entry.timingRecord
  const [finishTime, setFinishTime] = useState(toInputVal(rec?.finish_time))
  const [dnf, setDnf] = useState(rec?.dnf ?? false)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const previewFinish = fromInputVal(finishTime)
  const totalMs = diffMs(raceStart, previewFinish)

  async function save() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('timing_records')
      .update({ finish_time: previewFinish, dnf }).eq('id', rec.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setConfirm(false)
    onSaved()
  }

  const labelStyle = { fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' }
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 10px', fontSize: '0.85rem', width: '100%' }

  return (
    <div style={{ padding: '16px 0 8px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!rec && (
        <div className="alert alert-warn" style={{ marginBottom: 12 }}>
          No timing record exists for this participant yet. They need to have been part of a started race.
        </div>
      )}
      {rec && (
        <>
          <div style={{ maxWidth: 260, marginBottom: 16 }}>
            <label style={labelStyle}>Finish Time</label>
            <input type="datetime-local" step="1" style={inputStyle} value={finishTime} onChange={e => setFinishTime(e.target.value)} />
            {totalMs != null && (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>Total: {formatDuration(totalMs)}</div>
            )}
          </div>
          <label className="checkbox-label" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={dnf} onChange={e => setDnf(e.target.checked)} />
            <span style={{ color: dnf ? 'var(--danger)' : 'var(--text)', fontWeight: 600 }}>Mark as DNF (Did Not Finish)</span>
          </label>
          <button className="btn btn-warning" onClick={() => setConfirm(true)}>Save Time Changes</button>
        </>
      )}
      {confirm && (
        <ConfirmModal
          title="Save time changes?"
          message={`This will overwrite the recorded time for ${entry.displayName}. The updated time will immediately affect all results.`}
          onConfirm={save}
          onCancel={() => setConfirm(false)}
          confirmLabel={saving ? 'Saving...' : 'Confirm Save'}
        />
      )}
    </div>
  )
}

export default function EditTimes() {
  const [entries, setEntries] = useState([])
  const [raceStart, setRaceStart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    const { data: ev } = await supabase.from('race_events').select('ts').eq('event_type', 'start').order('ts', { ascending: false }).limit(1)
    setRaceStart(ev?.[0]?.ts || null)

    const { data: pData } = await supabase.from('participants').select('*').order('race_number')
    const { data: tData } = await supabase.from('timing_records').select('*')

    const tByParticipant = {}
    const tByTeam = {}
    if (tData) tData.forEach(r => {
      if (r.participant_id) tByParticipant[r.participant_id] = r
      if (r.team_color)     tByTeam[r.team_color] = r
    })

    const built = []
    const seenTeams = new Set()
    ;(pData || []).forEach(p => {
      if (p.is_team && p.team_color) {
        if (seenTeams.has(p.team_color)) return
        seenTeams.add(p.team_color)
        const colorLabel = TEAM_COLORS.find(c => c.value === p.team_color)?.label || 'Team'
        built.push({
          id: p.team_color, displayName: `${colorLabel} Team`, raceNumber: p.race_number,
          isTeam: true, teamColor: p.team_color, timingRecord: tByTeam[p.team_color] || null,
        })
      } else {
        built.push({
          id: p.id, displayName: `${p.first_name} ${p.last_name}`, raceNumber: p.race_number,
          isTeam: false, timingRecord: tByParticipant[p.id] || null,
        })
      }
    })

    setEntries(built)
    setLoading(false)
  }

  const filtered = entries.filter(e => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return String(e.raceNumber).includes(q) || e.displayName.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="page-title">Edit Times</div>
      <div className="page-sub">Search for any participant and edit their recorded finish time. All changes require confirmation.</div>

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <span className="search-icon">🔍</span>
        <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Search by number or name..."
          value={search} onChange={e => setSearch(e.target.value)} autoFocus />
      </div>

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : (
        <div>
          {filtered.length === 0 && <div className="text-muted" style={{ padding: '24px 0' }}>No participants found.</div>}
          {filtered.map(entry => (
            <div key={entry.id} className="card" style={{ marginBottom: 10, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                <div style={{ color: 'var(--accent)', fontWeight: 900, fontSize: '1.1rem', minWidth: 36 }}>#{entry.raceNumber}</div>
                {entry.isTeam
                  ? <span style={teamColorStyle(entry.teamColor)}>{entry.displayName}</span>
                  : <div style={{ fontWeight: 700, fontSize: '1rem' }}>{entry.displayName}</div>
                }
                {entry.timingRecord?.finish_time && (
                  <span style={{ fontFamily: 'monospace', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 700 }}>
                    {formatDuration(diffMs(raceStart, entry.timingRecord.finish_time))}
                  </span>
                )}
                {entry.timingRecord?.dnf && <span className="badge badge-no">DNF</span>}
                {!entry.timingRecord && <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>No timing data</span>}
                <div style={{ flex: 1 }} />
                <div style={{ color: 'var(--muted)', fontSize: '1.1rem' }}>{expanded === entry.id ? '▲' : '▼'}</div>
              </div>
              {expanded === entry.id && (
                <TimingEditor entry={entry} raceStart={raceStart} onSaved={() => { setRefreshKey(k => k + 1); setExpanded(null) }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
