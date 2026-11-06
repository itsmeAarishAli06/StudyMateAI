import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { getStudentProfile, updateStudentProfile } from '../lib/api.js'

function ProfilePage({ token, profile: initialProfile, onProfileUpdated }) {
  const [profile, setProfile] = useState(initialProfile || null)
  const [fullName, setFullName] = useState(initialProfile?.fullName || '')
  const [className, setClassName] = useState(initialProfile?.className || '')
  const [phone, setPhone] = useState(initialProfile?.phone || '')
  const [whatsappPhone, setWhatsappPhone] = useState(initialProfile?.whatsappPhone || '')
  const [whatsappSame, setWhatsappSame] = useState(Boolean(initialProfile?.phone && initialProfile.phone === initialProfile.whatsappPhone))
  const [status, setStatus] = useState(initialProfile ? 'ready' : 'loading')
  const [busy, setBusy] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    getStudentProfile(token).then((nextProfile) => {
      if (!active) return
      const next = nextProfile || { fullName: '', className: '', phone: '', whatsappPhone: '', complete: false }
      setProfile(next)
      setFullName(next.fullName)
      setClassName(next.className)
      setPhone(next.phone)
      setWhatsappPhone(next.whatsappPhone)
      setWhatsappSame(Boolean(next.phone && next.phone === next.whatsappPhone))
      setStatus('ready')
      onProfileUpdated?.(next)
    }).catch((loadError) => {
      if (!active) return
      setError(loadError.message || 'Could not load your profile.')
      setStatus('error')
    })
    return () => { active = false }
  }, [token, loadAttempt])

  async function save(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    const normalizedPhone = normalizePhone(phone)
    const normalizedWhatsapp = normalizePhone(whatsappSame ? phone : whatsappPhone)
    if (![normalizedPhone, normalizedWhatsapp].every((value) => /^\+[1-9]\d{7,14}$/.test(value))) {
      setError('Enter phone numbers in international format, for example +923001234567.')
      return
    }
    setBusy(true)
    try {
      const next = await updateStudentProfile({
        fullName: fullName.trim().replace(/\s+/g, ' '),
        className: className.trim().replace(/\s+/g, ' '),
        phone: normalizedPhone,
        whatsappPhone: normalizedWhatsapp,
      }, token)
      setProfile(next)
      setPhone(next.phone)
      setWhatsappPhone(next.whatsappPhone)
      setWhatsappSame(next.phone === next.whatsappPhone)
      onProfileUpdated?.(next)
      setNotice('Your student details have been saved.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page workspace-page profile-page">
      <div className="page-kicker"><span className="kicker-dot" /> YOUR ACCOUNT DETAILS</div>
      <div className="page-title-row"><div><h1>My profile.</h1><p className="page-subtitle">Keep your contact details current so StudyMate can identify your account and payment requests.</p></div></div>
      {status === 'loading' && <div className="history-loading-banner" role="status">Loading your profile…</div>}
      {error && <div className="plan-error" role="alert">{error}</div>}
      {notice && <div className="admin-success" role="status"><Icon name="check" size={15} />{notice}</div>}
      {status === 'error' && <button className="button button-secondary" type="button" onClick={() => { setError(''); setStatus('loading'); setLoadAttempt((attempt) => attempt + 1) }}>Retry loading profile</button>}
      {status === 'ready' && <form className="input-card student-profile-form" onSubmit={save}>
        <div className="profile-form-heading"><span className="profile-form-icon"><Icon name="briefcase" size={19} /></span><span><strong>Student information</strong><small>Only you and authorized StudyMate admins can view these contact details.</small></span></div>
        <label className="field-label" htmlFor="profile-full-name">Full name</label>
        <input id="profile-full-name" className="text-input" value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={100} autoComplete="name" required />
        <label className="field-label" htmlFor="profile-class">Class or grade</label>
        <input id="profile-class" className="text-input" value={className} onChange={(event) => setClassName(event.target.value)} maxLength={80} placeholder="e.g. Grade 10 or Year 1" required />
        <label className="field-label" htmlFor="profile-phone">Phone number</label>
        <input id="profile-phone" className="text-input" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={24} placeholder="+923001234567" required />
        <small className="profile-phone-hint">Enter the country code and number, for example +923001234567.</small>
        <label className="signup-same-number"><input type="checkbox" checked={whatsappSame} onChange={(event) => setWhatsappSame(event.target.checked)} /><span>Use this as my WhatsApp number too</span></label>
        {!whatsappSame && <><label className="field-label" htmlFor="profile-whatsapp">WhatsApp number</label><input id="profile-whatsapp" className="text-input" type="tel" value={whatsappPhone} onChange={(event) => setWhatsappPhone(event.target.value)} maxLength={24} placeholder="+923001234567" required /></>}
        <button className="button button-primary profile-save-button" type="submit" disabled={busy}>{busy ? <><span className="button-spinner" /> Saving…</> : <><Icon name="save" size={15} /> Save profile</>}</button>
      </form>}
      {profile?.updatedAt && <p className="profile-updated-note">Last updated {new Date(profile.updatedAt).toLocaleString()}</p>}
    </div>
  )
}

function normalizePhone(value) {
  return value.trim().replace(/[\s().-]/g, '')
}

export default ProfilePage
