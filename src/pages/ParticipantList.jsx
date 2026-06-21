import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { teamColorStyle, TEAM_COLORS, RACE_TYPES, raceTypeLabel } from '../lib/utils'

const SORT_OPTIONS = [
  { value: 'race_number_asc',   label: 'Number (Low to High)' },
  { value: 'race_number_desc',  label: 'Number (High to Low)' },
  { value: 'last_name_asc',     label: 'Name (A to Z)' },
  { value: 'last_name_desc',    label: 'Name (Z to A)' },
  { value: 'registration_asc',  label: 'Registered (Oldest)' },
  { value: 'registration_desc', label: 'Registered (Newest)' },
  { value: 'age_asc',           label: 'Age (Youngest)' },
  { value: 'age_desc',          label: 'Age (Oldest)' },
]

function sortParticipants(list, sortKey) {
  const s = [...list]
  switch (sortKey) {
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

const BADGE = ({ val, yes = 'Yes', no = 'No' }) => (
  <span className={`badge badge-${val ? 'yes' : 'no'}`}>{val ? yes : no}</span>
)

export default function ParticipantList() {
  const navigate = useNavigate()
  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterRace, setFilterRace] = useState('all')
  const [filterCI, setFilterCI] = useState('all')
  const [filterPaid, setFilterPaid] = useState('all')
  const [filterBib, setFilterBib] = useState('all')
  const [filterGender, setFilterGender] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [sortKey, setSortKey] = useState('race_number_asc')

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase.from('participants').select('*')
    if (error) { console.error(error); return }
    setParticipants(data)
    setLoading(false)
  }

  function applyFilters(list) {
    return list.filter(p => {
      if (filterRace   !== 'all' && p.race_type !== filterRace) return false
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

  const filtered = sortParticipants(applyFilters(participants), sortKey)
  const activeFilters = [filterRace, filterCI, filterPaid, filterBib, filterGender, filterType].filter(f => f !== 'all').length

  function resetFilters() {
    setFilterRace('all'); setFilterCI('all'); setFilterPaid('all'); setFilterBib('all')
    setFilterGender('all'); setFilterType('all'); setSearch(''); setSortKey('race_number_asc')
  }

  const sel = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: '0.82rem', cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">Participants</div>
        <button className="btn btn-primary" onClick={() => navigate('/app/register')}>+ New</button>
      </div>
      <div className="page-sub">{participants.length} total · {filtered.length} shown</div>

      <div className="search-bar" style={{ marginBottom: 10 }}>
        <span className="search-icon">🔍</span>
        <input className="form-input" style={{ paddingLeft: 36 }}
          placeholder="Search by number or name..." value={search}
          onChange={e => setSearch(e.target.value)} autoFocus />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select style={sel} value={filterRace} onChange={e => setFilterRace(e.target.value)}>
          <option value="all">All Races</option>
          {RACE_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
        </select>
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
        {(activeFilters > 0 || search) && (
          <button onClick={resetFilters} style={{ ...sel, color: 'var(--danger)', borderColor: 'var(--danger)', background: 'transparent', fontWeight: 700 }}>
            Clear ({activeFilters + (search ? 1 : 0)})
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Name</th><th>Race</th><th>Age</th><th>Age Group</th><th>Gender</th>
                  <th>Team</th><th>Size</th><th>Registered</th><th>Paid</th><th>Checked In</th><th>Bib</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={13} className="text-muted" style={{ padding: 20, textAlign: 'center' }}>
                    No participants match the current filters.
                  </td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="font-bold text-accent">{p.race_number}</td>
                    <td>
                      <div className="font-bold">{p.first_name} {p.last_name}</div>
                      {p.exclude_from_results && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger)', fontWeight: 700, marginTop: 2 }}>
                          Excluded from results
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontWeight: 600 }}>{raceTypeLabel(p.race_type)}</td>
                    <td>{p.age}</td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{p.age_group || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{p.gender}</td>
                    <td>
                      {p.is_team && p.team_color
                        ? <span style={teamColorStyle(p.team_color)}>{TEAM_COLORS.find(c => c.value === p.team_color)?.label || 'Team'}</span>
                        : <span className="text-muted text-sm">—</span>
                      }
                    </td>
                    <td>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: p.tshirt_size ? 'var(--text)' : 'var(--muted)' }}>
                        {p.tshirt_size || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {p.registration_date ? new Date(p.registration_date).toLocaleDateString() : '—'}
                    </td>
                    <td><BADGE val={p.paid} /></td>
                    <td><BADGE val={p.checked_in} yes="In" no="No" /></td>
                    <td><BADGE val={p.received_bib} yes="Got It" no="No" /></td>
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
