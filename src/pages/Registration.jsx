import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ConfirmModal from '../components/ConfirmModal'

const BLANK = {
  first_name: '',
  last_name: '',
  email: '',
  age: '',
  gender: 'male',
  race_number: '',
  paid: false,
  received_bib: false,
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
      email: data.email ?? '',
      age: data.age ?? '',
      gender: data.gender ?? 'male',
      race_number: data.race_number ?? '',
      paid: data.paid,
      received_bib: data.received_bib,
      exclude_from_results: data.exclude_from_results ?? false,
    })
  }

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function getNextRaceNumber() {
    const { data } = await supabase
      .from('participants').select('race_number')
      .not('race_number', 'is', null)
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

    setSaving(true)

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() ? form.email.trim().toLowerCase() : null,
      age: Number(form.age),
      gender: form.gender,
      paid: form.paid,
      received_bib: form.received_bib,
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
      const race_number = await getNextRaceNumber()
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

          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Age *</label>
              <input className="form-input" type="number" min="1" max="120"
                value={form.age} onChange={e => set('age', e.target.value)} placeholder="34" />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

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
          </div>

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
