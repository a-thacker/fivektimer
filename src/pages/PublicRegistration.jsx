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
// ⚖️  The agreement box below combines two documents the runner must accept:
//     (1) Southern Adventist University's official "Release and Indemnity
//     Agreement" (the transportation / self-drive section is omitted as it
//     does not apply to this on-campus race) and (2) an Individual Release
//     Form (photo / media release). One consent checkbox + one drawn
//     signature cover both, and are captured/stored with each registration.
// ─────────────────────────────────────────────────────────────

// The race benefits Jalen's Kids Foundation, a 501(c)(3). Donations go
// straight to their giving page (an embedded form on their home page).
const FOUNDATION_NAME = "Jalen's Kids Foundation"
const FOUNDATION_URL = 'https://www.jalenskidsfoundation.org/'
const CRISIS_LINE = 'If you or someone you know is struggling, call or text 988, the Suicide and Crisis Lifeline.'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_FILL_MS = 2500

// Data-type helpers. Names accept letters (incl. accented), spaces, and the
// punctuation real names use ('.-). Phones must contain 10–15 digits. Student
// IDs are numeric.
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ'.\- ]+$/
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/
const NAME_STRIP = /[^A-Za-zÀ-ÖØ-öø-ÿ'.\- ]/g
const PHONE_STRIP = /[^\d ()+.\-]/g
const isName = (s) => NAME_RE.test(s) && HAS_LETTER.test(s)
const isPhone = (s) => { const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 15 }
const isStudentId = (s) => /^\d{3,15}$/.test(s)

const BLANK = {
  first_name: '',
  last_name: '',
  email: '',
  age: '',
  gender: '',
  student_id: '',
  phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  allergies: '',
  guardian_name: '',
}

export default function PublicRegistration() {
  const [form, setForm] = useState(BLANK)
  const [company, setCompany] = useState('') // honeypot — must stay empty
  const [agree, setAgree] = useState(false)
  const [signed, setSigned] = useState(false)
  const [scrolledWaiver, setScrolledWaiver] = useState(false)
  const [attempted, setAttempted] = useState(false) // has the form been submitted at least once
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('') // submission-level error only (network); field errors highlight inline
  const [done, setDone] = useState(false)
  const [showIntro, setShowIntro] = useState(true) // "meaning of the race" modal, auto-opens on load
  const [showAllergies, setShowAllergies] = useState(false) // optional medical-notes disclosure
  const mountedAt = useRef(Date.now())
  const sigRef = useRef(null)

  useEffect(() => { document.title = `${RACE_NAME} Registration` }, [])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }
  const onName = (field, v) => set(field, v.replace(NAME_STRIP, ''))
  const onPhone = (field, v) => set(field, v.replace(PHONE_STRIP, ''))
  const onDigits = (field, v) => set(field, v.replace(/\D/g, ''))

  const age = Number(form.age)
  const isMinor = form.age !== '' && !Number.isNaN(age) && age >= 1 && age < 18

  // Compute per-field validation messages from the current form state. Because
  // this runs every render, a field's red highlight clears the moment it
  // becomes valid.
  function computeErrors() {
    const e = {}
    const fn = form.first_name.trim()
    if (!fn) e.first_name = 'Enter your first name.'
    else if (!isName(fn)) e.first_name = 'Use letters only.'
    const ln = form.last_name.trim()
    if (!ln) e.last_name = 'Enter your last name.'
    else if (!isName(ln)) e.last_name = 'Use letters only.'
    const em = form.email.trim()
    if (!em) e.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(em)) e.email = 'Enter a valid email address.'
    if (!form.age) e.age = 'Enter your age.'
    else if (Number.isNaN(age) || age < 1 || age > 120) e.age = 'Enter an age from 1–120.'
    if (!form.gender) e.gender = 'Select a gender.'
    const ph = form.phone.trim()
    if (!ph) e.phone = 'Enter a phone number.'
    else if (!isPhone(ph)) e.phone = 'Enter a valid phone number.'
    const ec = form.emergency_contact_name.trim()
    if (!ec) e.emergency_contact_name = 'Enter an emergency contact name.'
    else if (!isName(ec)) e.emergency_contact_name = 'Use letters only.'
    const ecp = form.emergency_contact_phone.trim()
    if (!ecp) e.emergency_contact_phone = 'Enter an emergency contact number.'
    else if (!isPhone(ecp)) e.emergency_contact_phone = 'Enter a valid phone number.'
    const sid = form.student_id.trim()
    if (sid && !isStudentId(sid)) e.student_id = 'Use numbers only.'
    if (isMinor) {
      const gn = form.guardian_name.trim()
      if (!gn) e.guardian_name = 'Enter the parent or legal guardian’s name.'
      else if (!isName(gn)) e.guardian_name = 'Use letters only.'
    }
    if (!agree) e.agree = 'You must agree and consent to continue.'
    if (!signed) e.signature = 'Please sign in the box below.'
    return e
  }

  const errors = computeErrors()
  const showErr = (name) => attempted && !!errors[name]
  const inputCls = (base, name) => base + (showErr(name) ? ' input-error' : '')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setAttempted(true)

    // Bot traps: honeypot filled, or form submitted implausibly fast.
    if (company.trim() !== '' || Date.now() - mountedAt.current < MIN_FILL_MS) {
      setDone(true) // pretend success; drop silently
      return
    }

    if (Object.keys(errors).length) {
      // Highlight is handled inline; nudge the user to the first problem.
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 60)
      return
    }

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
      emergency_contact_phone: form.emergency_contact_phone.trim().slice(0, 40),
      allergies: form.allergies.trim().slice(0, 1000) || null,
      guardian_name: isMinor ? form.guardian_name.trim().slice(0, 120) : null,
      waiver_accepted: true,
      waiver_accepted_at: new Date().toISOString(),
      photo_release_accepted: true,
      signature,
    })
    setSubmitting(false)

    if (err) {
      // Surface the real cause so schema/permission problems are diagnosable
      // (e.g. a missing column shows up here) instead of a blank "try again".
      console.error('Registration insert failed:', err)
      const detail = err.message || err.hint || err.details || ''
      setError(`We couldn't submit your registration.${detail ? ` (${detail})` : ' Please try again.'}`)
      return
    }
    setDone(true)
  }

  function resetForm() {
    setForm(BLANK); setAgree(false); setSigned(false); setScrolledWaiver(false)
    setAttempted(false); setError(''); sigRef.current?.clear?.(); setCompany('')
    setShowAllergies(false); mountedAt.current = Date.now(); setDone(false)
  }

  // Solid brand brown for the top ~260px (so the logo art blends), then a
  // gentle darkening toward the bottom to give the page some depth.
  const wrap = {
    minHeight: '100vh', color: 'var(--text)', padding: '32px 16px 64px',
    background: 'linear-gradient(180deg, #392d1c 0, #392d1c 260px, #30261a 100%)',
  }
  const inner = { width: '100%', maxWidth: 560, margin: '0 auto' }

  if (done) {
    return (
      <div style={wrap}>
        <div style={inner}>
          <Header />
          <FoundationDonate />
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>You're registered!</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.95rem', marginBottom: 24 }}>
              Thanks for signing up for {RACE_NAME}. We'll see you on race day. Check in at the
              registration table to pick up your bib number.
            </div>
            <button className="btn btn-ghost" onClick={resetForm}>
              Register another person
            </button>
          </div>
          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <IntroModal open={showIntro} onClose={() => setShowIntro(false)} />
      <div style={inner}>
        <Header />
        <FoundationDonate />

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="card">
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group" data-error={showErr('first_name') || undefined}>
                <label className="form-label">First Name<span className="req">*</span></label>
                <input className={inputCls('form-input', 'first_name')} value={form.first_name} maxLength={80}
                  autoComplete="given-name" inputMode="text"
                  onChange={e => onName('first_name', e.target.value)} placeholder="Jane" />
                {showErr('first_name') && <div className="field-error">{errors.first_name}</div>}
              </div>
              <div className="form-group" data-error={showErr('last_name') || undefined}>
                <label className="form-label">Last Name<span className="req">*</span></label>
                <input className={inputCls('form-input', 'last_name')} value={form.last_name} maxLength={80}
                  autoComplete="family-name" inputMode="text"
                  onChange={e => onName('last_name', e.target.value)} placeholder="Smith" />
                {showErr('last_name') && <div className="field-error">{errors.last_name}</div>}
              </div>
            </div>

            <div className="form-group" data-error={showErr('email') || undefined}>
              <label className="form-label">Email<span className="req">*</span></label>
              <input className={inputCls('form-input', 'email')} type="email" value={form.email} maxLength={200}
                autoComplete="email" inputMode="email"
                onChange={e => set('email', e.target.value)} placeholder="jane@example.com" />
              {showErr('email') && <div className="field-error">{errors.email}</div>}
            </div>

            <div className="form-row">
              <div className="form-group" data-error={showErr('age') || undefined}>
                <label className="form-label">Age<span className="req">*</span></label>
                <input className={inputCls('form-input', 'age')} type="number" min="1" max="120" value={form.age}
                  inputMode="numeric" maxLength={3}
                  onChange={e => onDigits('age', e.target.value)} placeholder="34" />
                {showErr('age') && <div className="field-error">{errors.age}</div>}
              </div>
              <div className="form-group" data-error={showErr('gender') || undefined}>
                <label className="form-label">Gender<span className="req">*</span></label>
                <select className={inputCls('form-select', 'gender')} value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
                {showErr('gender') && <div className="field-error">{errors.gender}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" data-error={showErr('phone') || undefined}>
                <label className="form-label">Phone<span className="req">*</span></label>
                <input className={inputCls('form-input', 'phone')} type="tel" value={form.phone} maxLength={40}
                  autoComplete="tel" inputMode="tel"
                  onChange={e => onPhone('phone', e.target.value)} placeholder="(555) 123-4567" />
                {showErr('phone') && <div className="field-error">{errors.phone}</div>}
              </div>
              <div className="form-group" data-error={showErr('student_id') || undefined}>
                <label className="form-label">Student ID</label>
                <input className={inputCls('form-input', 'student_id')} value={form.student_id} maxLength={40}
                  inputMode="numeric"
                  onChange={e => onDigits('student_id', e.target.value)} placeholder="Optional" />
                {showErr('student_id') && <div className="field-error">{errors.student_id}</div>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" data-error={showErr('emergency_contact_name') || undefined}>
                <label className="form-label">Emergency Contact Name<span className="req">*</span></label>
                <input className={inputCls('form-input', 'emergency_contact_name')} value={form.emergency_contact_name} maxLength={120}
                  autoComplete="name" inputMode="text"
                  onChange={e => onName('emergency_contact_name', e.target.value)} placeholder="Full name" />
                {showErr('emergency_contact_name') && <div className="field-error">{errors.emergency_contact_name}</div>}
              </div>
              <div className="form-group" data-error={showErr('emergency_contact_phone') || undefined}>
                <label className="form-label">Emergency Contact Number<span className="req">*</span></label>
                <input className={inputCls('form-input', 'emergency_contact_phone')} type="tel" value={form.emergency_contact_phone} maxLength={40}
                  inputMode="tel"
                  onChange={e => onPhone('emergency_contact_phone', e.target.value)} placeholder="(555) 123-4567" />
                {showErr('emergency_contact_phone') && <div className="field-error">{errors.emergency_contact_phone}</div>}
              </div>
            </div>

            {/* Parent/guardian name only appears when the age says it's needed. */}
            {isMinor && (
              <div className="form-group" data-error={showErr('guardian_name') || undefined}>
                <label className="form-label">Name of Parent or Legal Guardian<span className="req">*</span></label>
                <input className={inputCls('form-input', 'guardian_name')} value={form.guardian_name} maxLength={120}
                  autoComplete="name" inputMode="text"
                  onChange={e => onName('guardian_name', e.target.value)}
                  placeholder="Parent or guardian's full name" />
                {showErr('guardian_name') && <div className="field-error">{errors.guardian_name}</div>}
              </div>
            )}

            {/* Optional medical notes are tucked away to reduce clutter. */}
            {!showAllergies ? (
              <button type="button" className="mtm-disclosure" onClick={() => setShowAllergies(true)}>
                + Add allergies or medical notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
              </button>
            ) : (
              <div className="form-group">
                <label className="form-label">Allergies or medical conditions</label>
                <textarea className="form-input" value={form.allergies} maxLength={1000} rows={3} autoFocus
                  style={{ resize: 'vertical' }}
                  onChange={e => set('allergies', e.target.value)}
                  placeholder="Anything that could affect your participation" />
              </div>
            )}

            {/* Honeypot: hidden from real users, catches bots. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label>Company
                <input tabIndex={-1} autoComplete="off" value={company} onChange={e => setCompany(e.target.value)} />
              </label>
            </div>

            <WaiverBox onReachBottom={() => setScrolledWaiver(true)} />

            {/* The consent checkbox only appears once the reader has scrolled
                to the bottom of the agreement. */}
            {!scrolledWaiver ? (
              <div data-error={(attempted && !agree) || undefined}
                style={{
                  marginTop: 12, textAlign: 'center', fontWeight: 600, fontSize: '0.85rem',
                  color: attempted && !agree ? 'var(--danger)' : 'var(--muted)',
                }}>
                ↓ Please scroll to the bottom of the agreement to continue
              </div>
            ) : (
              <div data-error={showErr('agree') || undefined}>
                <label className="checkbox-label" style={{ alignItems: 'flex-start', marginTop: 14 }}>
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                  <span style={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                    I agree and voluntarily consent to be bound by its contents by signing below.<span className="req">*</span>
                  </span>
                </label>
                {showErr('agree') && <div className="field-error">{errors.agree}</div>}
              </div>
            )}

            <div className="form-group" data-error={showErr('signature') || undefined} style={{ marginTop: 18, marginBottom: 18 }}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Signature<span className="req">*</span></span>
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                  onClick={() => { sigRef.current?.clear?.(); setSigned(false) }}>
                  Clear
                </button>
              </label>
              <SignaturePad ref={sigRef} onChange={setSigned} error={showErr('signature')} />
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginTop: 6 }}>
                {isMinor
                  ? 'Participant is under 18, so the signature above must be that of the parent or legal guardian.'
                  : 'Sign above using your mouse, finger, or stylus.'}
              </div>
              {showErr('signature') && <div className="field-error">{errors.signature}</div>}
            </div>

            <button type="submit" className="btn btn-primary w-full"
              style={{ padding: '15px', fontSize: '1.05rem', justifyContent: 'center' }}
              disabled={submitting}>
              {submitting ? 'Submitting…' : 'Complete Registration'}
            </button>
          </form>
        </div>

        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 18 }}>
      <img src="/mtm-logo.png" alt="Miles that Matter"
        style={{ width: '100%', maxWidth: 260, height: 'auto', display: 'block', margin: '0 auto' }} />
      <div style={{
        color: 'var(--text)', fontSize: '1.85rem', fontWeight: 900, lineHeight: 1.05, marginTop: 6,
        letterSpacing: '-0.01em',
      }}>
        The <span style={{ color: 'var(--accent2)' }}>Mango Tree</span> Run
      </div>
      <div className="mtm-tagline">
        Presented by Student Missions Club, benefiting {FOUNDATION_NAME}
      </div>
    </div>
  )
}

// Prominent, always-visible donate call-to-action for the 501(c)(3): the
// most accessible path to the foundation's payment options.
function FoundationDonate() {
  return (
    <div style={{ marginBottom: 24 }}>
      <a href={FOUNDATION_URL} target="_blank" rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: 'var(--accent2)', color: '#2e2214', fontWeight: 800, fontSize: '1.05rem',
          padding: '15px 18px', borderRadius: 12, textDecoration: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
        }}>
        <span aria-hidden="true" style={{ fontSize: '1.15rem' }}>❤</span>
        Donate to {FOUNDATION_NAME}
      </a>
      <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
        A registered <strong style={{ color: 'var(--text)' }}>501(c)(3)</strong> nonprofit. Your gift
        supports mental health awareness and suicide prevention.
      </div>
    </div>
  )
}

// "Meaning of the race" modal — opens automatically on load, mobile-first,
// dismissible (X, backdrop, Esc, or the Continue button).
function IntroModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [open, onClose])

  if (!open) return null
  const para = { color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12, fontSize: '0.92rem' }
  const em = { color: 'var(--text)' }
  return (
    <div className="mtm-modal-overlay" role="dialog" aria-modal="true" aria-label={`About ${RACE_NAME}`}
      onClick={onClose}>
      <div className="mtm-modal-sheet" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" style={{
          position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%',
          border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)',
          fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer', zIndex: 1,
        }}>×</button>

        <img src="/jalen.jpg" alt="Jalen Tamaleaa"
          style={{
            width: '100%', maxWidth: 188, height: 'auto', borderRadius: 14, display: 'block',
            margin: '0 auto 12px', border: '1px solid var(--border)',
          }} />

        <h2 style={{ textAlign: 'center', fontSize: '1.35rem', fontWeight: 900, marginBottom: 8 }}>
          The <span style={{ color: 'var(--accent2)' }}>Mango Tree</span> Run
        </h2>

        <p style={{
          textAlign: 'center', color: 'var(--text)', fontStyle: 'italic', fontSize: '0.98rem',
          lineHeight: 1.45, marginBottom: 4,
        }}>
          “If I never see you again on this earth, look for me under the biggest mango tree in heaven.”
        </p>
        <div style={{ textAlign: 'center', color: 'var(--accent2)', fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>
          Jalen Tamaleaa
        </div>

        <p style={{ ...para, marginBottom: 14 }}>
          We run for Jalen, a teacher and camp counselor who loved kids and lost his life to suicide at 23.
          Every runner supports <strong style={em}>{FOUNDATION_NAME}</strong> and its work to prevent suicide
          and bring hope to those struggling with depression.
        </p>

        <div style={{
          background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 12px', fontSize: '0.83rem', color: 'var(--text)', marginBottom: 14, lineHeight: 1.45,
        }}>
          {CRISIS_LINE}
        </div>

        <a href={FOUNDATION_URL} target="_blank" rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center', background: 'var(--accent2)', color: '#2e2214',
            fontWeight: 800, padding: '13px', borderRadius: 12, textDecoration: 'none', marginBottom: 10,
          }}>
          ❤ Donate / Learn more
        </a>
        <button onClick={onClose} className="btn btn-primary w-full" style={{ justifyContent: 'center', padding: '13px' }}>
          Sign me up
        </button>
      </div>
    </div>
  )
}

// The waiver body is Southern Adventist University's official "Release and
// Indemnity Agreement" reproduced verbatim. The self-drive / transportation
// section of the original form is omitted because it does not apply to this
// on-campus race. Do not alter the wording of the remaining text.
//
// `onReachBottom` fires once the reader scrolls to the end (or immediately if
// the text is short enough not to scroll) so the parent can reveal the
// consent checkbox.
function WaiverBox({ onReachBottom }) {
  const boxRef = useRef(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const check = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 6) onReachBottom?.()
    }
    check() // if the content isn't tall enough to scroll, unlock right away
    el.addEventListener('scroll', check, { passive: true })
    return () => el.removeEventListener('scroll', check)
  }, [onReachBottom])

  const p = { marginBottom: 10 }
  const strong = { ...p, fontWeight: 700, color: 'var(--text)' }
  const heading = { fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.75rem', margin: '16px 0 8px' }
  return (
    <div ref={boxRef} style={{
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
      <p style={p}>
        PARENT OR GUARDIAN of a minor: I, as parent or guardian of the above-named minor, hereby give my
        permission for my child or ward to participate in the above-named event, and further agree,
        individually and on behalf of my child or ward, to the terms of the above, specifically agreeing
        not to participate in any lawsuit against Southern Adventist University, its officers, directors,
        employees, and agents.
      </p>

      <div style={{ borderTop: '1px solid var(--border)', margin: '18px 0 0' }} />
      <div style={{ fontWeight: 800, color: 'var(--text)', textAlign: 'center', fontSize: '0.98rem', margin: '14px 0 8px' }}>
        Individual Release Form
      </div>
      <p style={p}>
        I, the undersigned person, for good and valuable consideration, the receipt and sufficiency of
        which is hereby acknowledged, has granted permission to Southern Adventist University and your
        successors, assignees and licensees to use my name, image and likeness as such name and/or
        likeness appears in photography shot in connection with the motion picture tentatively entitled
        “{RACE_NAME}” (“Picture”) and in connection with advertising, publicizing, exhibiting and
        exploiting the Picture, in whole or in part, by any and all means, media, devices, processes and
        technology now or hereafter known or devised in perpetuity throughout the universe. I hereby
        acknowledge that you have no obligation to utilize my name and/or likeness in the Picture or in
        any other motion picture.
      </p>
      <p style={p}>
        Your exercise of such rights shall not violate or infringe any rights of any third party.
      </p>
      <p style={p}>
        I understand that you have been induced to proceed with the production, distribution and
        exploitation of the Picture in reliance upon this agreement.
      </p>
      <p style={p}>
        I hereby release you, your successors, assignees and licensees from any and all claims and
        demands arising out of or in connection with such use, including, without limitation, any and all
        claims for invasion of privacy, infringement of my right of publicity, defamation (including libel
        and slander), false light and any other personal and/or property rights.
      </p>
      <p style={{ ...strong, marginBottom: 0 }}>
        ACCEPTED AND AGREED, by checking the box and signing below (as the interviewee or, if the
        participant is a minor, as parent/legal guardian).
      </p>
    </div>
  )
}

// A draw-to-sign signature box (mouse / touch / stylus), like the signature
// field on the Formstack form. Exposes isEmpty(), clear() and toDataURL()
// to the parent via ref; calls onChange(true|false) as it gains/loses ink.
//
// Listeners are attached natively (not via React props) so the touch handlers
// can be non-passive and call preventDefault() — without that, mobile browsers
// scroll the page instead of drawing.
const SignaturePad = forwardRef(function SignaturePad({ onChange, error }, ref) {
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

  useImperativeHandle(ref, () => ({
    isEmpty: () => !dirty.current,
    clear: reset,
    toDataURL: () => (dirty.current ? canvasRef.current?.toDataURL('image/png') : null),
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    init()

    const posOf = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    }
    const startAt = (x, y) => {
      drawing.current = true
      last.current = { x, y }
      const ctx = ctxRef.current
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y); ctx.stroke() // dot for a tap
      if (!dirty.current) { dirty.current = true; onChange && onChange(true) }
    }
    const moveAt = (x, y) => {
      if (!drawing.current) return
      const ctx = ctxRef.current
      ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(x, y); ctx.stroke()
      last.current = { x, y }
    }
    const end = () => { drawing.current = false }

    const onMouseDown = (e) => { const p = posOf(e.clientX, e.clientY); startAt(p.x, p.y) }
    const onMouseMove = (e) => { const p = posOf(e.clientX, e.clientY); moveAt(p.x, p.y) }
    const onMouseUp = () => end()

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      const t = e.touches[0]; const p = posOf(t.clientX, t.clientY); startAt(p.x, p.y)
    }
    const onTouchMove = (e) => {
      if (!drawing.current) return
      e.preventDefault()
      const t = e.touches[0]; const p = posOf(t.clientX, t.clientY); moveAt(p.x, p.y)
    }
    const onTouchEnd = (e) => { e.preventDefault(); end() }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false })

    // Re-scale (and clear) if the layout width or orientation changes.
    let t
    const onResize = () => { clearTimeout(t); t = setTimeout(reset, 150) }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%', height: 170, display: 'block',
        background: '#ffffff', borderRadius: 12,
        border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none', cursor: 'crosshair',
      }}
    />
  )
})

function Footer() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--border)', fontSize: '0.8rem', fontWeight: 600, marginTop: 40 }}>
      {RACE_NAME}
    </div>
  )
}
