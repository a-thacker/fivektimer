import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function OrganizerLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const correct = import.meta.env.VITE_ORGANIZER_PASSWORD
    if (!correct) {
      setError('Organizer password is not configured. Add VITE_ORGANIZER_PASSWORD to your environment variables.')
      setLoading(false)
      return
    }

    await new Promise(r => setTimeout(r, 300))

    if (password === correct) {
      sessionStorage.setItem('organizer_auth', 'true')
      navigate('/app')
    } else {
      setError('Incorrect password.')
      setPassword('')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 24 }}>
          Back
        </button>

        <div style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 6 }}>Organizer Login</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.92rem', marginBottom: 28 }}>
          Enter your organizer password to access timing and management.
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" autoFocus
              style={{ fontSize: '1.1rem', padding: '14px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full"
            style={{ padding: '14px', fontSize: '1rem', justifyContent: 'center', marginTop: 8 }}
            disabled={loading || !password}>
            {loading ? 'Checking...' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
