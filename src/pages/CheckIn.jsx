import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { teamColorStyle, TEAM_COLORS } from '../lib/utils'

const SORT_OPTIONS = [
  { value: 'race_number_asc',   label: 'Number (Low → High)' },
  { value: 'race_number_desc',  label: 'Number (High → Low)' },
  { value: 'last_name_asc',     label: 'Name (A → Z)' },
  { value: 'last_name_desc',    label: 'Name (Z → A)' },
  { value: 'registration_asc',  label: 'Registered (Oldest)' },
  { value: 'registration_desc', label: 'Registered (Newest)' },
  { value: 'age_asc',           label: 'Age (Youngest)' },
  { value: 'age_desc',          label: 'Age (Oldest)' },
]

function sortList(list, key) {
  const s = [...list]
  switch (key) {
    case 'race_number_asc':   return s.sort((a,b) => a.race_number - b.race_number)
    case 'race_number_desc':  return s.sort((a,b) => b.race_number - a.race_number)
    case 'last_name_asc':     return s.sort((a,b) => a.last_name.localeCompare(b.last_name))
    case 'last_name_desc':    return s.sort((a,b) => b.last_name.localeCompare(a.last_name))
    case 'registration_asc':  return s.sort((a,b) => new Date(a.registration_date) - new Date(b.registration_date))
    case 'registration_desc': return s.sort((a,b) => new Date(b.registration_date) - new Date(a.registration_date))
    case 'age_asc':           return s.sort((a,b) => (a.age ?? 0) - (b.age ?? 0))
    case 'age_desc':          return s.sort((a,b) => (b.age ?? 0) - (a.age ?? 0))
    default:                  return s
  }
}

export default function CheckIn() {
  const navigate = useNavigate()
  const searchRef = useRef()
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)
  const [raceStarted, setRaceStarted] = useState(false)

  const [search, setSearch] = useState('')
  const [filterCI, setFilterCI] = useState('all')
  const [filterPaid, setFilterPaid] = useState('all')
  const [filterBib, setFilterBib] = useState('all')
  const [filterGender, setFilterGender] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [sortKey, setSortKey] = useState('race_number_asc')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { load(); checkRaceStarted() }, [])

  async function load() {
    const { data } = await supabase.from('participants').select('*')
    setParticipants(data || [])
    setLoading(false)
  }

  async function checkRaceStarted() {
    const { data } = await supabase.from('race_events').select('event_type').eq('event_type', 'start')
    setRaceStarted((data || []).length > 0)
  }

  function applyFilters(list) {
    return list.filter(p => {
      if (filterCI     !== 'all' && String(p.checked_in) !== filterCI) return false
      if (filterPaid   !== 'all' && String(p.paid) !== filterPaid) return false
      if (filterBib    !== 'all' && String(p.received_bib) !== filterBib) return false
      if (filterGender !== 'all' && p.gender !== filterGender) return false
      if (filterType === 'team'       && !p.is_team) return false
      if (filterType === 'individual' &&  p.is_team) return false
      const q = search.toLowerCase().trim()
      if (!q) return true
      return String(p.race_number).includes(q) || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)
    })
  }

  const filtered = sortList(applyFilters(participants), sortKey)
  const activeFilters = [filterCI, filterPaid, filterBib, filterGender, filterType].filter(f => f !== 'all').length

  function resetFilters() {
    setFilterCI('all'); setFilterPaid('all'); setFilterBib('all')
    setFilterGender('all'); setFilterType('all'); setSortKey('race_number_asc')
  }

  async function toggle(p, field) {
    const newVal = !p[field]
    const { error } = await supabase.from('participants').update({ [field]: newVal }).eq('id', p.id)
    if (!error) setParticipants(ps => ps.map(x => x.id === p.id ? { ...x, [field]: newVal } : x))
  }

  const sel = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: '0.82rem', cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">Check-In</div>
        <button className="btn btn-primary" disabled={raceStarted} onClick={() => navigate('/app/register')}>
          + Day-of Registration
        </button>
      </div>
      <div className="page-sub">{participants.length} registered · {filtered.length} shown</div>

      {raceStarted && <div className="alert alert-warn">Race has started — registration is locked.</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <span className="search-icon">🔍</span>
          <input ref={searchRef} className="form-input" style={{ paddingLeft: 36 }}
            placeholder="Search by number or name..." value={search}
            onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <button className="btn btn-ghost" style={{ position: 'relative' }} onClick={() => setShowFilters(f => !f)}>
          Filters {activeFilters > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6, background: 'var(--accent)', color: '#0f1117',
              borderRadius: '50%', width: 18, height: 18, fontSize: '0.65rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{activeFilters}</span>
          )}
        </button>
      </div>

      {showFilters && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <select style={sel} value={filterCI} onChange={e => setFilterCI(e.target.value)}>
            <option value="all">All Check-In</option>
            <option value="true">Checked In</option>
            <option value="false">Not Checked In</option>
          </select>
          <select style={sel} value={filterPaid} onChange={e => setFilterPaid(e.target.value)}>
            <option value="all">All Payment</option>
            <option value="true">Paid</option>
            <option value="false">Unpaid</option>
          </select>
          <select style={sel} value={filterBib} onChange={e => setFilterBib(e.target.value)}>
            <option value="all">All Bibs</option>
            <option value="true">Got Bib</option>
            <option value="false">No Bib</option>
          </select>
          <select style={sel} value={filterGender} onChange={e => setFilterGender(e.target.value)}>
            <option value="all">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
          <select style={sel} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">Teams + Individuals</option>
            <option value="team">Teams Only</option>
            <option value="individual">Individuals Only</option>
          </select>
          <select style={{ ...sel, minWidth: 170 }} value={sortKey} onChange={e => setSortKey(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {activeFilters > 0 && (
            <button onClick={resetFilters} style={{ ...sel, color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent', fontWeight: 700 }}>
              Clear All
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Age</th><th>Team</th><th>Size</th>
                  <th>Check In</th><th>Paid</th><th>Bib</th><th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-muted" style={{ padding: 20, textAlign: 'center' }}>
                    No participants match the current filters.
                  </td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id} style={p.checked_in ? { opacity: 0.7 } : {}}>
                    <td className="font-bold text-accent" style={{ fontSize: '1.1rem' }}>{p.race_number}</td>
                    <td>
                      <div className="font-bold" style={{ fontSize: '1rem' }}>{p.first_name} {p.last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{p.gender}</div>
                    </td>
                    <td>{p.age}</td>
                    <td>
                      {p.is_team && p.team_color
                        ? <span style={teamColorStyle(p.team_color)}>{TEAM_COLORS.find(c => c.value === p.team_color)?.label || 'Team'}</span>
                        : '—'
                      }
                    </td>
                    <td>
                      <span style={{ background: 'var(--surface2)', borderRadius: 6, padding: '3px 8px', fontSize: '0.82rem', fontWeight: 700, color: p.tshirt_size ? 'var(--text)' : 'var(--muted)' }}>
                        {p.tshirt_size || '—'}
                      </span>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${p.checked_in ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(p, 'checked_in')} style={{ minWidth: 90 }}>
                        {p.checked_in ? 'Checked In' : 'Check In'}
                      </button>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${p.paid ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(p, 'paid')} style={{ minWidth: 80 }}>
                        {p.paid ? 'Paid' : 'Mark Paid'}
                      </button>
                    </td>
                    <td>
                      <button className={`btn btn-sm ${p.received_bib ? 'btn-success' : 'btn-ghost'}`} onClick={() => toggle(p, 'received_bib')} style={{ minWidth: 80 }}>
                        {p.received_bib ? 'Got It' : 'Give Bib'}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/app/register/${p.id}`)}>Edit</button>
                    </td>
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
