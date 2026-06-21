import React from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'

import Landing        from './pages/Landing'
import OrganizerLogin from './pages/OrganizerLogin'
import PublicResults  from './pages/PublicResults'
import RaceClock      from './pages/RaceClock'

import RequireAuth     from './components/RequireAuth'
import Dashboard        from './pages/Dashboard'
import Registration     from './pages/Registration'
import ParticipantList  from './pages/ParticipantList'
import CheckIn           from './pages/CheckIn'
import Timing             from './pages/Timing'
import LiveResults        from './pages/LiveResults'
import FinalResults       from './pages/FinalResults'
import PrintResults       from './pages/PrintResults'
import EditTimes          from './pages/EditTimes'

function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate()

  function logout() {
    sessionStorage.removeItem('organizer_auth')
    navigate('/')
  }

  return (
    <aside className="sidebar" style={{ width: collapsed ? 48 : 220, transition: 'width 0.2s ease', overflow: 'hidden', flexShrink: 0 }}>
      <div className="sidebar-logo" style={{
        display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '20px 0 12px' : '20px 16px 12px',
      }}>
        {!collapsed && <span>5KTimer</span>}
        <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <nav>
          <div className="nav-section">Main</div>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app" end>Dashboard</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/participants">Participants</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/register">Registration</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/checkin">Check-In</NavLink>

          <div className="nav-section">5K Trail Race</div>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/timing/trail">Timing</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/live/trail">Live Results</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/final/trail">Final Results</NavLink>

          <div className="nav-section">1 Mile Kid's Run</div>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/timing/kids_run">Timing</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/live/kids_run">Live Results</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/final/kids_run">Final Results</NavLink>

          <div className="nav-section">Display</div>
          <a className="nav-link" href="/clock/trail" target="_blank" rel="noopener noreferrer">TV Clock — Trail</a>
          <a className="nav-link" href="/clock/kids_run" target="_blank" rel="noopener noreferrer">TV Clock — Kid's Run</a>

          <div className="nav-section">Results</div>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/print">Print (Both Races)</NavLink>
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/app/results/edit-times">Edit Times</NavLink>
        </nav>
      )}

      {!collapsed && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
          <button className="btn btn-ghost btn-sm w-full" onClick={logout}>Log Out</button>
        </div>
      )}
    </aside>
  )
}

function OrganizerLayout() {
  const [collapsed, setCollapsed] = React.useState(false)
  return (
    <div className="app-layout">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="register"                  element={<Registration />} />
          <Route path="register/:id"              element={<Registration />} />
          <Route path="participants"              element={<ParticipantList />} />
          <Route path="checkin"                   element={<CheckIn />} />
          <Route path="timing/:raceType"          element={<Timing />} />
          <Route path="results/live/:raceType"    element={<LiveResults />} />
          <Route path="results/final/:raceType"   element={<FinalResults />} />
          <Route path="results/print"             element={<PrintResults />} />
          <Route path="results/edit-times"        element={<EditTimes />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/"        element={<Landing />} />
      <Route path="/login"   element={<OrganizerLogin />} />
      <Route path="/results" element={<PublicResults />} />
      <Route path="/print"   element={<PrintResults />} />
      <Route path="/clock/:raceType" element={<RaceClock />} />

      <Route path="/app/*" element={
        <RequireAuth>
          <OrganizerLayout />
        </RequireAuth>
      } />
    </Routes>
  )
}
