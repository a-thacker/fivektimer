import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { TEAM_COLORS, RACE_TYPES } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'

const TSHIRT_SIZES = ['YS', 'YM', 'YL', 'YXL', 'S', 'M', 'L', 'XL']

const BLANK = {
  first_name: '',
  last_name: '',
  age: '',
  race_type: 'trail',
  gender: 'male',
  race_number: '',
  paid: false,
  received_bib: false,
  tshirt_size: '',
  is_team: false,
  team_color: '',
  team_role: '',
  exclude_from_results: false,
}

export default function Registration() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { if (isEdit) loadParticipant() }, [id])

  async function loadParticipant() {
    const { data, error } = await supabase.from('participants').select('*').eq('id', id).single()
    if (error) { setError('Participant not found'); return }
    setForm({
      first_name: data.first_name,
      last_name: data.last_name,
      age: data.age ?? '',
      race_type: data.race_type,
      gender: data.gender ?? 'male',
      race_number: data.race_number ?? '',
      paid: data.paid,
      received_bib: data.received_bib,
      tshirt_size: data.tshirt_size ?? '',
      is_team: data.is_team,
      team_color: data.team_color ?? '',
      team_role: data.team_role ?? '',
      exclude_from_results: data.exclude_from_results ?? false,
    })
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function getNextRaceNumber(race_type, is_team, team_color) {
    if (is_team && team_color) {
      const { data: existing } = await supabase
        .from('participants').select('race_number')
        .eq('race_type', race_type).eq('team_color', team_color).limit(1)
      if (existing && existing.length > 0) return existing[0].race_number
    }
    const { data } = await supabase
      .from('participants').select('race_number')
      .eq('race_type', race_type)
      .order('race_number', { ascending: false }).limit(1)
    return data && data.length > 0 ? data[0].race_number + 1 : 1
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.')
      return
    }
    if (!form.age || isNaN(Number(form.age))) {
      setError('A valid age is required.')
      return
    }
    if (isEdit && (!form.race_number || isNaN(Number(form.race_number)))) {
      setError('A valid race number is required.')
      return
    }
    if (form.is_team && !form.team_color) {
      setError('Please select a team color.')
      return
    }

    setSaving(true)

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      age: Number(form.age),
      race_type: form.race_type,
      gender: form.gender,
      paid: form.paid,
      received_bib: form.received_bib,
      tshirt_size: form.tshirt_size || null,
      is_team: form.is_team,
      team_color: form.is_team ? form.team_color : null,
      team_role:  form.is_team ? (form.team_role || null) : null,
      exclude_from_results: form.exclude_from_results,
    }

    if (isEdit) {
      const { error: err } = await supabase.from('participants').update({
        ...payload, race_number: Number(form.race_number),
      }).eq('id', id)
      setSaving(false)
      if (err) { setError(err.message); return }
      setSuccess('Participant updated.')
    } else {
      const race_number = await getNextRaceNumber(form.race_type, form.is_team, form.team_color)
      const { error: err } = await supabase.from('participants').insert({
        ...payload, race_number,
        registration_date: new Date().toISOString().slice(0, 10),
      })
      setSaving(false)
      if (err) { setError(err.message); return }
      setSuccess(`Registered! Race #${race_number} assigned.`)
      setForm(BLANK)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('timing_records').delete().eq('participant_id', id)
    const { error: err } = await supabase.from('participants').delete().eq('id', id)
    setDeleting(false)
    if (err) { setError(err.message); setConfirmDelete(false); return }
    navigate('/app/participants')
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">{isEdit ? 'Edit Participant' : 'New Registration'}</div>
        {isEdit && (
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            Delete Participant
          </button>
        )}
      </div>
      <div className="page-sub">
        {isEdit ? 'Update participant information.' : 'Register a new participant. Race number assigned automatically.'}
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-ok">{success}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input className="form-input" value={form.first_name}
                onChange={e => set('first_name', e.target.value)} placeholder="Jane" />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input className="form-input" value={form.last_name}
                onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Race *</label>
              <select className="form-select" value={form.race_type}
                onChange={e => set('race_type', e.target.value)} disabled={isEdit}>
                {RACE_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
              </select>
              {isEdit && <p className="text-muted text-sm" style={{ marginTop: 4 }}>Cannot change after registration.</p>}
            </div>
            <div className="form-group">
              <label className="form-label">Age *</label>
              <input className="form-input" type="number" min="1" max="120"
                value={form.age} onChange={e => set('age', e.target.value)} placeholder="34" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Race Number {isEdit ? '(editable)' : '(auto-assigned)'}
              </label>
              {isEdit ? (
                <input className="form-input" type="number" min="1"
                  value={form.race_number} onChange={e => set('race_number', e.target.value)} />
              ) : (
                <input className="form-input" value="Will be assigned on save" disabled style={{ opacity: 0.5 }} />
              )}
            </div>
            <div className="form-group">
              <label className="form-label">T-Shirt Size</label>
              <select className="form-select" value={form.tshirt_size} onChange={e => set('tshirt_size', e.target.value)}>
                <option value="">— Select size —</option>
                {TSHIRT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.paid} onChange={e => set('paid', e.target.checked)} />
              Paid
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.received_bib}
                onChange={e => set('received_bib', e.target.checked)} />
              Received Bib
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.is_team}
                onChange={e => set('is_team', e.target.checked)} />
              Team Entry
            </label>
          </div>

          {form.is_team && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                Team Details
              </div>

              <div className="form-group">
                <label className="form-label">Team Color *</label>
                <select className="form-select" value={form.team_color} onChange={e => set('team_color', e.target.value)}>
                  <option value="">Select color...</option>
                  {TEAM_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {form.team_color && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 4, background: form.team_color, border: '2px solid var(--border)' }} />
                    <span>{TEAM_COLORS.find(c => c.value === form.team_color)?.label} Team</span>
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Role / Note (optional)</label>
                <input className="form-input" value={form.team_role}
                  onChange={e => set('team_role', e.target.value)} placeholder="e.g. Captain, Leg 1" />
                <p className="text-muted text-sm" style={{ marginTop: 6 }}>
                  All members of the same team color share one race number and one finish time.
                </p>
              </div>
            </div>
          )}

          {isEdit && (
            <div style={{
              background: form.exclude_from_results ? '#ff475718' : 'var(--surface2)',
              border: `1px solid ${form.exclude_from_results ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16,
            }}>
              <label className="checkbox-label">
                <input type="checkbox" checked={form.exclude_from_results}
                  onChange={e => set('exclude_from_results', e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 700, color: form.exclude_from_results ? 'var(--danger)' : 'var(--text)' }}>
                    Exclude from final results
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                    This racer will not appear in any results pages or rankings.
                  </div>
                </div>
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Register Participant'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/app/participants')}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {confirmDelete && (
        <ConfirmModal
          title={`Delete ${form.first_name} ${form.last_name}?`}
          message="This permanently removes the participant and any timing data for them. This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          confirmLabel={deleting ? 'Deleting...' : 'Delete Participant'}
          danger
        />
      )}
    </div>
  )
}
