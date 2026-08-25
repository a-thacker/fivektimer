import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
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
// ⚖️  The waiver text below is Southern Adventist University's official
//     "Release and Indemnity Agreement" (the transportation / self-drive
//     section is omitted as it does not apply to this on-campus race). A
//     drawn signature is captured and stored with each registration.
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
  student_id: '',
  phone: '',
  emergency_contact_name: '',
  allergies: '',
  guardian_name: '',
}

export default function PublicRegistration() {
  const [form, setForm] = useState(BLANK)
  const [company, setCompany] = useState('') // honeypot — must stay empty
  const [agree, setAgree] = useState(false)
  const [signed, setSigned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const mountedAt = useRef(Date.now())
  const sigRef = useRef(null)

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
    if (!form.phone.trim()) return 'Please enter a phone number.'
    if (!form.emergency_contact_name.trim()) return 'Please enter an emergency contact name.'
    if (Number(form.age) < 18 && !form.guardian_name.trim()) {
      return 'Participant is under 18 — please enter the parent or legal guardian’s name.'
    }
    if (!agree) return 'You must agree and consent to the waiver to register.'
    if (!signed || sigRef.current?.isEmpty?.()) return 'Please sign your name in the signature box below.'
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

    const signature = sigRef.current?.toDataURL?.() || null

    setSubmitting(true)
    // NOTE: no .select() here — the insert returns nothing, so the public
    // (anon) role never needs read access to the participants table.
    const { error: err } = await supabase.from('participants').insert({
      first_name: form.first_name.trim().slice(0, 80),
      last_name: form.last_name.trim().slice(0, 80),
      email: form.email.trim().toLowerCase().slice(0, 200),
      age: Number(form.age),
      gender: form.gender,
      student_id: form.student_id.trim().slice(0, 40) || null,
      phone: form.phone.trim().slice(0, 40),
      emergency_contact_name: form.emergency_contact_name.trim().slice(0, 120),
      allergies: form.allergies.trim().slice(0, 1000) || null,
      guardian_name: Number(form.age) < 18 ? form.guardian_name.trim().slice(0, 120) : null,
      waiver_accepted: true,
      waiver_accepted_at: new Date().toISOString(),
      signature,
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
              onClick={() => { setForm(BLANK); setAgree(false); setSigned(false); sigRef.current?.clear?.(); setCompany(''); mountedAt.current = Date.now(); setDone(false) }}
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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone *</label>
                <input className="form-input" type="tel" value={form.phone} maxLength={40}
                  autoComplete="tel" inputMode="tel"
                  onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div className="form-group">
                <label className="form-label">Student ID <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(if applicable)</span></label>
                <input className="form-input" value={form.student_id} maxLength={40}
                  onChange={e => set('student_id', e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Emergency Contact Name *</label>
              <input className="form-input" value={form.emergency_contact_name} maxLength={120}
                autoComplete="name"
                onChange={e => set('emergency_contact_name', e.target.value)} placeholder="Contact in case of emergency" />
            </div>

            <div className="form-group">
              <label className="form-label">
                Please list any allergies or past/present physical conditions that could limit your participation in any way
              </label>
              <textarea className="form-input" value={form.allergies} maxLength={1000} rows={3}
                style={{ resize: 'vertical' }}
                onChange={e => set('allergies', e.target.value)} placeholder="Leave blank if none" />
            </div>

            {Number(form.age) > 0 && Number(form.age) < 18 && (
              <div className="form-group">
                <label className="form-label">Name of Parent or Legal Guardian *</label>
                <input className="form-input" value={form.guardian_name} maxLength={120}
                  autoComplete="name"
                  onChange={e => set('guardian_name', e.target.value)} placeholder="Required for participants under 18" />
              </div>
            )}

            {/* Honeypot: hidden from real users, catches bots. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Company
                <input tabIndex={-1} autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} />
              </label>
            </div>

            <WaiverBox />

            <label className="checkbox-label" style={{ alignItems: 'flex-start', marginTop: 14, marginBottom: 16 }}>
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                I agree and voluntarily consent to be bound by its contents by signing below.
              </span>
            </label>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Signature *</span>
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  onClick={() => { sigRef.current?.clear?.(); setSigned(false) }}>
                  Clear
                </button>
              </label>
              <SignaturePad ref={sigRef} onChange={setSigned} />
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 6 }}>
                {Number(form.age) > 0 && Number(form.age) < 18
                  ? 'Participant is under 18 — the signature above must be that of the parent or legal guardian.'
                  : 'Sign above using your mouse, finger, or stylus.'}
              </div>
            </div>

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

// The waiver body is Southern Adventist University's official "Release and
// Indemnity Agreement" reproduced verbatim. The self-drive / transportation
// section of the original form is omitted because it does not apply to this
// on-campus race. Do not alter the wording of the remaining text.
function WaiverBox() {
  const p = { marginBottom: 10 }
  const strong = { ...p, fontWeight: 700, color: 'var(--text)' }
  const heading = { fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem', margin: '16px 0 8px' }
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '16px 18px', marginTop: 6, marginBottom: 4, maxHeight: 320, overflowY: 'auto',
      fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--muted)',
    }}>
      <div style={{ fontWeight: 800, color: 'var(--text)', textAlign: 'center', fontSize: '0.98rem', marginBottom: 8 }}>
        Release and Indemnity Agreement for Southern Adventist University
      </div>
      <p style={{ ...p, textAlign: 'center' }}>
        This form must be filled out prior to participating the requested activity.
      </p>
      <p style={{ ...p, textAlign: 'center' }}>
        As a student, employee, or volunteer of Southern Adventist University (“the University”), I
        desire to be allowed to accompany and participate in the following activity:
      </p>
      <p style={{ textAlign: 'center', color: 'var(--text)', fontWeight: 700, marginBottom: 14 }}>
        {RACE_NAME}
      </p>

      <p style={p}>
        Although one or more employees/students of the University may be in charge of the activity, the
        exposure for risks and harm may be greater than and different from those, which may be
        anticipated during activities on the University campus. I also recognize that it is not possible
        to closely supervise and control the activities of those participating in this activity. In
        consideration of the University permitting me to participate in the above-described activity, I
        hereby assume the risk of injuries to my person and property while engaged in the activity and
        release and discharge the University and its officers, directors, employees, and agents from any
        claims, cause of action, costs, obligations and financial responsibility resulting from or
        arising out of any incident, injury or accident occurring while I am attending or participating
        in any such activity, EXCLUDING INTENTIONAL ACTS OR ACTS OF GROSS NEGLIGENCE.
      </p>
      <p style={p}>
        If the University is held financially responsible to the undersigned for any such incident,
        injury, or accident, I hereby agree to indemnify and hold the University harmless from any such
        responsibility, including cost, damages, and attorney’s fees incurred by the University.
      </p>
      <p style={p}>
        I will cooperate with those in charge of the activity at all times and will follow the
        guidelines, if any, set forth for the activity.
      </p>
      <p style={p}>
        I agree to maintain health insurance coverage for myself during, and agree to notify a
        University representative supervising any such activity of any physical or medical limitations
        or conditions that will require special assistance or attention. I further authorize supervising
        University personnel to consent to emergency medical treatment on my behalf, and I hereby
        release the University and its representatives from liability for any such treatment, its result,
        or its cost
      </p>
      <p style={strong}>
        NO CHANGES TO THIS FORM SHALL BIND THE UNIVERSITY UNLESS APPROVED BY THE DIRECTOR OF RISK
        MANAGEMENT.
      </p>
      <p style={p}>
        I agree, for myself and my successors, that the above representations and agreements are
        contractually binding and are not mere recitals. I agree that my failure or refusal to sign
        other such agreements or releases shall in no way affect the validity of this agreement nor
        revoke or cancel any of the terms of this agreement. I agree not to bring any suit in violation
        of this agreement. I, or any of my successors, shall be liable for the expenses (including legal
        fees) incurred by the other party or parties in defending against any such claim or suit.
      </p>
      <p style={strong}>
        I affirm that I have read and fully understand this Waiver as set forth above and have had the
        opportunity to ask any questions that I might have regarding its contents and have done so.
      </p>

      <div style={heading}>Complete if Participant is a Minor</div>
      <p style={{ marginBottom: 0 }}>
        PARENT OR GUARDIAN of a minor: I, as parent or guardian of the above-named minor, hereby give my
        permission for my child or ward to participate in the above-named event, and further agree,
        individually and on behalf of my child or ward, to the terms of the above, specifically agreeing
        not to participate in any lawsuit against Southern Adventist University, its officers, directors,
        employees, and agents.
      </p>
    </div>
  )
}

// A draw-to-sign signature box (mouse / touch / stylus), like the signature
// field on the Formstack form. Exposes isEmpty(), clear() and toDataURL()
// to the parent via ref; calls onChange(true|false) as it gains/loses ink.
const SignaturePad = forwardRef(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const last = useRef(null)

  function init() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * ratio))
    canvas.height = Math.max(1, Math.round(rect.height * ratio))
    const ctx = canvas.getContext('2d')
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctxRef.current = ctx
  }

  function reset() {
    init()
    dirty.current = false
    onChange && onChange(false)
  }

  useEffect(() => {
    init()
    // Re-scale (and clear) if the layout width changes so ink stays crisp.
    let t
    function onResize() { clearTimeout(t); t = setTimeout(reset, 150) }
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    isEmpty: () => !dirty.current,
    clear: reset,
    toDataURL: () => (dirty.current ? canvasRef.current?.toDataURL('image/png') : null),
  }))

  function posOf(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function down(e) {
    e.preventDefault()
    drawing.current = true
    const pt = posOf(e)
    last.current = pt
    // Draw a dot so a simple tap leaves a visible mark.
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(pt.x, pt.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    if (!dirty.current) { dirty.current = true; onChange && onChange(true) }
    canvasRef.current.setPointerCapture?.(e.pointerId)
  }
  function moveTo(e) {
    if (!drawing.current) return
    e.preventDefault()
    const pt = posOf(e)
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    last.current = pt
  }
  function up(e) {
    if (!drawing.current) return
    drawing.current = false
    canvasRef.current.releasePointerCapture?.(e.pointerId)
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={down}
      onPointerMove={moveTo}
      onPointerUp={up}
      onPointerLeave={up}
      style={{
        width: '100%', height: 170, display: 'block',
        background: '#ffffff', border: '1px solid var(--border)', borderRadius: 12,
        touchAction: 'none', cursor: 'crosshair',
      }}
    />
  )
})

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
