import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Gate for the organizer app. Requires a real Supabase Auth session
// (the anon/public role can never reach these routes).
export default function RequireAuth({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'authed' | 'anon'

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(data.session ? 'authed' : 'anon')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setStatus(session ? 'authed' : 'anon')
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  if (status === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem',
      }}>
        Loading…
      </div>
    )
  }
  if (status === 'anon') return <Navigate to="/login" replace />
  return children
}
