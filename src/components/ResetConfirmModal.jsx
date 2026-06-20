import React, { useState } from 'react'

export default function ResetConfirmModal({ title, onConfirm, onCancel, finishedCount }) {
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toUpperCase() === 'RESET'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3 style={{ color: 'var(--danger)' }}>{title}</h3>
        <p>
          This will permanently delete all timing data and race events.
          {finishedCount > 0 && <strong> {finishedCount} participant(s) have already finished — this data will be lost.</strong>}
        </p>
        <p>This cannot be undone. Type <strong>RESET</strong> below to confirm.</p>
        <div className="form-group" style={{ marginBottom: 20 }}>
          <input
            className="form-input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder="Type RESET to confirm"
            autoFocus
            style={{ fontWeight: 700, letterSpacing: '0.1em' }}
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={!ready}
          >
            Delete All Timing Data
          </button>
        </div>
      </div>
    </div>
  )
}
