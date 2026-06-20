import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data, error } = await supabase.from('participants').select('checked_in, paid')
    if (error) { console.error(error); return }

    const { data: timing } = await supabase.from('timing_records').select('finish_time, dnf')
    const finished = (timing || []).filter(t => t.finish_time && !t.dnf).length

    setStats({
      total: data.length,
      checkedIn: data.filter(p => p.checked_in).length,
      paid: data.filter(p => p.paid).length,
      finished,
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="text-muted">Loading...</div>

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-sub">Race day overview</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Registered</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--success)' }}>{stats.checkedIn}</div>
          <div className="stat-label">Checked In</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--success)' }}>{stats.paid}</div>
          <div className="stat-label">Paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: (stats.total - stats.paid) > 0 ? 'var(--danger)' : 'var(--muted)' }}>
            {stats.total - stats.paid}
          </div>
          <div className="stat-label">Unpaid</div>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 10 }}>
        Race Progress
      </div>
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <div className="stat-card">
          <div className="stat-number" style={{ color: 'var(--accent)' }}>{stats.finished}</div>
          <div className="stat-label">Finished</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link to="/app/checkin" className="btn btn-primary btn-lg">Go to Check-In</Link>
        <Link to="/app/timing" className="btn btn-ghost btn-lg">Race Timing</Link>
      </div>
    </div>
  )
}
