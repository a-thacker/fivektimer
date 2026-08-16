import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { RACE_NAME } from '../lib/utils'

export default function OrganizerLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // If already signed in, skip straight to the app.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/app', { replace: true })
    })
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setLoading(false)
    if (err) {
      setError('Incorrect email or password.')
      setPassword('')
      return
    }
    navigate('/app', { replace: true })
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
          Sign in to manage {RACE_NAME} timing and registration.
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="username" autoFocus
              style={{ fontSize: '1.05rem', padding: '14px' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" autoComplete="current-password"
              style={{ fontSize: '1.05rem', padding: '14px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full"
            style={{ padding: '14px', fontSize: '1rem', justifyContent: 'center', marginTop: 8 }}
            disabled={loading || !email || !password}>
            {loading ? 'Signing in…' : 'Log In'}
          </button>
        </form>
      </div>
    </div>
  )
}
