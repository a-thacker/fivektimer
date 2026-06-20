import React from 'react'
import { Navigate } from 'react-router-dom'

export default function RequireAuth({ children }) {
  const isAuth = sessionStorage.getItem('organizer_auth') === 'true'
  if (!isAuth) return <Navigate to="/login" replace />
  return children
}
