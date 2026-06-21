import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDuration, diffMs, teamColorStyle, TEAM_COLORS, AGE_GROUPS, raceTypeLabel } from '../lib/utils'

function Section({ title, children }) {
  return (
    <div>
      <div className="results-section-title">{title}</div>
      {children}
    </div>
  )
}

const DEFAULT_CATEGORY_SET = { overall: true, men: true, women: true, team: false, age_group: false }
const DEFAULT_CLOCK_CATEGORIES = { trail: DEFAULT_CATEGORY_SET, kids_run: DEFAULT_CATEGORY_SET }

function ClockCategoryControls({ raceType, settings, setSettings }) {
  const [saving, setSaving] = useState(false)
  const allCategories = settings.clock_display_categories || DEFAULT_CLOCK_CATEGORIES
  const categories = allCategories[raceType] || DEFAULT_CATEGORY_SET

  async function toggle(key) {
    setSaving(true)
    const nextForRace = { ...categories, [key]: !categories[key] }
    const next = { ...allCategories, [raceType]: nextForRace }
    const { error } = await supabase.from('app_settings').update({ clock_display_categories: next }).eq('id', 1)
    if (!error) setSettings(s => ({ ...s, clock_display_categories: next }))
    setSaving(false)
  }

  const OPTIONS = [
    { key: 'overall',   label: 'Top 3 Overall' },
    { key: 'men',       label: 'Top 3 Men' },
    { key: 'women',     label: 'Top 3 Women' },
    { key: 'team',      label: 'Top 3 Teams' },
    { key: 'age_group', label: 'Age Group Winners' },
  ]

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-title">TV Clock — Category Display</div>
      <p className="text-muted text-sm" style={{ marginTop: -4, marginBottom: 12 }}>
        Choose which categories appear on the {raceTypeLabel(raceType)} clock display once results are released. The running clock always shows regardless of these settings.
      </p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {OPTIONS.map(opt => (
          <label key={opt.key} className="checkbox-label" style={{ opacity: saving ? 0.6 : 1 }}>
            <input type="checkbox" checked={!!categories[opt.key]} disabled={saving} onChange={() => toggle(opt.key)} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}

function ResultsTable({ rows }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rank</th><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>Total</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 800 }}>{i + 1}</td>
                <td className="font-bold text-accent">#{r.raceNumber}</td>
                <td className="font-bold">{r.name}</td>
                <td>{r.age}</td>
                <td style={{ textTransform: 'capitalize' }}>{r.gender}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>{formatDuration(r.totalMs)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-muted" style={{ padding: 16 }}>No results yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamsTable({ rows }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 0 }}>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Rank</th><th>#(s)</th><th>Team</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 800 }}>{i + 1}</td>
                <td className="font-bold text-accent" style={{ fontSize: '0.82rem' }}>{r.raceNumbers}</td>
                <td>
                  <span style={teamColorStyle(r.teamColor)}>{r.teamLabel}</span>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{r.memberNames}</div>
                </td>
                <td style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>{formatDuration(r.totalMs)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="text-muted" style={{ padding: 16 }}>No team results yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

async function loadResults(raceType) {
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
  let teamMembersMap = {}
  if (teamColors.length > 0) {
    const { data } = await supabase.from('participants').select('*').in('team_color', teamColors).eq('race_type', raceType)
    if (data) data.forEach(p => {
      if (!teamMembersMap[p.team_color]) teamMembersMap[p.team_color] = []
      teamMembersMap[p.team_color].push(p)
    })
  }

  const teamRows = (teamT || []).map(r => {
    const members = teamMembersMap[r.team_color] || []
    return {
      id: r.id, teamColor: r.team_color,
      teamLabel: TEAM_COLORS.find(c => c.value === r.team_color)?.label || 'Team',
      raceNumbers: members.map(m => `#${m.race_number}`).join(', '),
      memberNames: members.map(m => `${m.first_name} ${m.last_name}`).join(' / '),
      totalMs: diffMs(raceStart, r.finish_time),
    }
  }).sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))

  return { indRows, teamRows }
}

const RELEASE_FIELD = { trail: 'trail_results_released', kids_run: 'kids_run_results_released' }

export default function FinalResults() {
  const { raceType } = useParams()
  const validType = raceType === 'trail' || raceType === 'kids_run'

  const [ind, setInd] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({ trail_results_released: false, kids_run_results_released: false, clock_display_categories: DEFAULT_CLOCK_CATEGORIES })
  const [saving, setSaving] = useState(false)
  const [raceEnded, setRaceEnded] = useState(false)
  const [showAgeGroups, setShowAgeGroups] = useState(false)

  useEffect(() => {
    if (!validType) return
    setLoading(true)
    loadResults(raceType).then(({ indRows, teamRows }) => { setInd(indRows); setTeams(teamRows); setLoading(false) })
    loadSettings()
    loadRaceStatus()
  }, [raceType])

  async function loadRaceStatus() {
    const { data } = await supabase.from('race_events').select('event_type').eq('race_type', raceType)
    setRaceEnded((data || []).some(e => e.event_type === 'end'))
  }

  async function loadSettings() {
    const { data } = await supabase.from('app_settings').select('*').eq('id', 1).single()
    if (data) setSettings(data)
  }

  async function toggleRelease() {
    setSaving(true)
    const field = RELEASE_FIELD[raceType]
    const newVal = !settings[field]
    const { error } = await supabase.from('app_settings').update({ [field]: newVal }).eq('id', 1)
    if (!error) setSettings(s => ({ ...s, [field]: newVal }))
    setSaving(false)
  }

  if (!validType) {
    return <div className="alert alert-error">Invalid race. Choose Trail Race or Kid's Run final results from the sidebar.</div>
  }

  if (loading) return <div className="text-muted">Loading...</div>

  const released = settings[RELEASE_FIELD[raceType]]
  const top3Overall = ind.slice(0, 3)
  const top3OverallIds = new Set(top3Overall.map(r => r.id))
  const top3Men   = ind.filter(r => r.gender === 'male'   && !top3OverallIds.has(r.id)).slice(0, 3)
  const top3Women = ind.filter(r => r.gender === 'female' && !top3OverallIds.has(r.id)).slice(0, 3)

  return (
    <div>
      <div className="page-title">{raceTypeLabel(raceType)} — Final Results</div>
      <div className="page-sub">Official race results. Use the release button to make results visible to participants.</div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title">Participant Visibility</div>
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{raceTypeLabel(raceType)} Results</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: 8 }}>
            {released
              ? 'Visible to participants on the public results page.'
              : 'Hidden from participants. Release when ready to announce.'}
          </div>
          {!raceEnded && !released && (
            <div className="alert alert-warn" style={{ marginBottom: 8, fontSize: '0.78rem', padding: '6px 10px' }}>
              Race has not ended yet. End the race before releasing results.
            </div>
          )}
          <button
            className={`btn btn-sm ${released ? 'btn-danger' : 'btn-success'}`}
            onClick={toggleRelease}
            disabled={saving || (!raceEnded && !released)}
          >
            {saving ? 'Saving...' : released ? 'Hide Results' : 'Release Results'}
          </button>
        </div>
      </div>

      <ClockCategoryControls raceType={raceType} settings={settings} setSettings={setSettings} />

      <Section title="Top 3 Overall">
        <ResultsTable rows={top3Overall} />
      </Section>
      <Section title="Top 3 Men">
        <ResultsTable rows={top3Men} />
      </Section>
      <Section title="Top 3 Women">
        <ResultsTable rows={top3Women} />
      </Section>

      {teams.length > 0 && (
        <Section title="Team Results">
          <TeamsTable rows={teams} />
        </Section>
      )}

      <div style={{ marginTop: 28 }}>
        <button className="btn btn-ghost" onClick={() => setShowAgeGroups(s => !s)}>
          {showAgeGroups ? 'Hide' : 'Show'} Age Group Results
        </button>
      </div>

      {showAgeGroups && AGE_GROUPS.map(group => {
        const rows = ind.filter(r => r.ageGroup === group).slice(0, 3)
        if (rows.length === 0) return null
        return (
          <Section key={group} title={`Age Group — ${group}`}>
            <ResultsTable rows={rows} />
          </Section>
        )
      })}
    </div>
  )
}
