import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { RACE_NAME } from '../lib/utils'

// ─────────────────────────────────────────────────────────────
// PUBLIC self-registration page.
//
// This page is intentionally standalone: it does NOT link to the
// organizer app / timer, and it can only INSERT registrations. Reading
// the participant list is blocked at the database level (Row Level
// Security), so exposing this page + the anon key to the public does not
// expose anyone's personal data.
//
// Spam/abuse hardening on the client:
//   • honeypot field (bots fill it, humans never see it)
//   • minimum time-on-page before a submit is accepted
//   • strict client-side validation + length caps
// The database ALSO enforces safe values (waiver must be accepted, no
// privileged fields) via an RLS `with check` policy — the client checks
// are just a first line of defense.
//
// ⚖️  The waiver / privacy text below is a general-purpose template.
//     Have it reviewed by your own legal counsel before the event.
// ─────────────────────────────────────────────────────────────

const SUGGESTED_MIN_DONATION = '$10'

// Drop your real donation QR images in place of these placeholders.
// Put the image files in /public (e.g. /public/venmo-qr.png) and set
// `img` to the path (e.g. img: '/venmo-qr.png').
const DONATION_METHODS = [
  { label: 'Venmo',    handle: '@your-venmo',   img: null },
  { label: 'PayPal',   handle: 'your-paypal',   img: null },
  { label: 'Cash App', handle: '$your-cashapp', img: null },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_FILL_MS = 2500

const BLANK = {
  first_name: '',
  last_name: '',
  email: '',
  age: '',
  gender: '',
}

export default function PublicRegistration() {
  const [form, setForm] = useState(BLANK)
  const [company, setCompany] = useState('') // honeypot — must stay empty
  const [agree, setAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const mountedAt = useRef(Date.now())

  useEffect(() => { document.title = `${RACE_NAME} — Registration` }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function validate() {
    if (!form.first_name.trim() || !form.last_name.trim()) return 'Please enter your first and last name.'
    if (!EMAIL_RE.test(form.email.trim())) return 'Please enter a valid email address.'
    const age = Number(form.age)
    if (!form.age || Number.isNaN(age) || age < 1 || age > 120) return 'Please enter a valid age.'
    if (!form.gender) return 'Please select a gender.'
    if (!agree) return 'You must read and accept the waiver to register.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Bot traps: honeypot filled, or form submitted implausibly fast.
    if (company.trim() !== '' || Date.now() - mountedAt.current < MIN_FILL_MS) {
      setDone(true) // pretend success; drop silently
      return
    }

    const msg = validate()
    if (msg) { setError(msg); return }

    setSubmitting(true)
    // NOTE: no .select() here — the insert returns nothing, so the public
    // (anon) role never needs read access to the participants table.
    const { error: err } = await supabase.from('participants').insert({
      first_name: form.first_name.trim().slice(0, 80),
      last_name: form.last_name.trim().slice(0, 80),
      email: form.email.trim().toLowerCase().slice(0, 200),
      age: Number(form.age),
      gender: form.gender,
      waiver_accepted: true,
      waiver_accepted_at: new Date().toISOString(),
    })
    setSubmitting(false)

    if (err) {
      setError('Something went wrong submitting your registration. Please try again.')
      return
    }
    setDone(true)
  }

  const wrap = { minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '32px 16px 64px' }
  const inner = { width: '100%', maxWidth: 560, margin: '0 auto' }

  if (done) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <Header />
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>You're registered!</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.95rem', marginBottom: 24 }}>
              Thanks for signing up for the {RACE_NAME}. We'll see you on race day — check in at the
              registration table to pick up your bib number.
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => { setForm(BLANK); setAgree(false); setCompany(''); mountedAt.current = Date.now(); setDone(false) }}
            >
              Register another person
            </button>
          </div>
          <DonationSection />
          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={inner}>
        <Header />

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="card">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">First Name *</label>
                <input className="form-input" value={form.first_name} maxLength={80}
                  autoComplete="given-name"
                  onChange={e => set('first_name', e.target.value)} placeholder="Jane" />
              </div>
              <div className="form-group">
                <label className="form-label">Last Name *</label>
                <input className="form-input" value={form.last_name} maxLength={80}
                  autoComplete="family-name"
                  onChange={e => set('last_name', e.target.value)} placeholder="Smith" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email} maxLength={200}
                autoComplete="email" inputMode="email"
                onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Age *</label>
                <input className="form-input" type="number" min="1" max="120" value={form.age}
                  inputMode="numeric"
                  onChange={e => set('age', e.target.value)} placeholder="34" />
              </div>
              <div className="form-group">
                <label className="form-label">Gender *</label>
                <select className="form-select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {/* Honeypot: hidden from real users, catches bots. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Company
                <input tabIndex={-1} autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} />
              </label>
            </div>

            <WaiverBox />

            <label className="checkbox-label" style={{ alignItems: 'flex-start', marginTop: 14, marginBottom: 18 }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                I have read and agree to the <strong>Waiver &amp; Release of Liability</strong> and the
                collection of my information as described in the Privacy Notice above. If the participant
                is under 18, I confirm I am their parent or legal guardian and agree on their behalf.
              </span>
            </label>

            <button type="submit" className="btn btn-primary w-full"
              style={{ padding: '15px', fontSize: '1.05rem', justifyContent: 'center' }}
              disabled={submitting}>
              {submitting ? 'Submitting…' : 'Complete Registration'}
            </button>
          </form>
        </div>

        <DonationSection />
        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
        {RACE_NAME}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '0.95rem', marginTop: 4 }}>
        Runner Registration
      </div>
    </div>
  )
}

function WaiverBox() {
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '14px 16px', marginTop: 6, marginBottom: 4, maxHeight: 220, overflowY: 'auto',
      fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--muted)',
    }}>
      <div style={{ fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem', marginBottom: 8 }}>
        Waiver &amp; Release of Liability
      </div>
      <p style={{ marginBottom: 10 }}>
        I understand that participating in the {RACE_NAME} (the “Event”) is a potentially hazardous
        activity and that I should not enter and participate unless I am medically able and properly
        trained. I assume all risks associated with participating, including but not limited to falls,
        contact with other participants, the effects of the weather, traffic, and course conditions.
      </p>
      <p style={{ marginBottom: 10 }}>
        In consideration of being permitted to participate, I, for myself and anyone entitled to act on
        my behalf, waive and release the Event organizers, sponsors, volunteers, and all associated
        parties from any and all claims or liabilities of any kind arising out of my participation,
        even though that liability may arise out of negligence or carelessness on the part of the
        persons named in this waiver.
      </p>
      <p style={{ marginBottom: 10 }}>
        I grant permission for the free use of my name, voice, and images in any broadcast, photograph,
        or other recording of this Event for any legitimate purpose.
      </p>
      <div style={{ fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem', margin: '14px 0 8px' }}>
        Privacy Notice
      </div>
      <p style={{ marginBottom: 0 }}>
        We collect your name, email, age, and gender solely to administer the Event (registration,
        check-in, timing, results, and race-related communication). Your information is stored securely,
        is never sold, and is not shared except as required to run the Event. You may request deletion of
        your information by contacting the organizers.
      </p>
    </div>
  )
}

function DonationSection() {
  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>Support the Race</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 4 }}>
          Suggested minimum donation of <strong style={{ color: 'var(--accent)' }}>{SUGGESTED_MIN_DONATION}</strong> —
          but any amount is welcome and appreciated. Scan a code below to give.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
        {DONATION_METHODS.map(m => (
          <div key={m.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
            padding: '16px', width: 150, textAlign: 'center',
          }}>
            {m.img ? (
              <img src={m.img} alt={`${m.label} donation QR code`} style={{ width: 118, height: 118, borderRadius: 8, display: 'block', margin: '0 auto' }} />
            ) : (
              <div style={{
                width: 118, height: 118, margin: '0 auto', borderRadius: 8,
                border: '2px dashed var(--border)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--muted)', fontSize: '0.72rem', padding: 8,
              }}>
                QR code<br />coming soon
              </div>
            )}
            <div style={{ fontWeight: 700, marginTop: 10 }}>{m.label}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 2 }}>{m.handle}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--border)', fontSize: '0.8rem', fontWeight: 600, marginTop: 40 }}>
      {RACE_NAME}
    </div>
  )
}
