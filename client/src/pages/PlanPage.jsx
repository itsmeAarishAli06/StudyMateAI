import { useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { cancelPaymentRequest, createPaymentRequest, getStudyAccess } from '../lib/api.js'

const whatsappLocalNumber = '03172873743'
const whatsappCountryCode = '92'
const whatsappNumber = `${whatsappCountryCode}${whatsappLocalNumber.replace(/\D/g, '').replace(/^0/, '')}`

function paymentMessage(paymentRequest, studentName, studentEmail) {
  const planName = paymentRequest.planKey === 'weekly' ? '7-day Premium' : '30-day Premium'
  return [
    'Hello StudyMate, I would like to purchase Premium access.',
    `Student name: ${studentName}`,
    `StudyMate account email: ${studentEmail}`,
    `Request ID: ${paymentRequest.requestCode}`,
    `Plan: ${planName}`,
    `Amount: Rs ${paymentRequest.amountPkr} PKR`,
    'Please share the payment instructions.',
  ].join('\n')
}

function whatsappLink(paymentRequest, studentName, studentEmail) {
  const message = encodeURIComponent(paymentMessage(paymentRequest, studentName, studentEmail))
  return `https://wa.me/${whatsappNumber}?text=${message}`
}

function whatsappWebLink(paymentRequest, studentName, studentEmail) {
  const message = encodeURIComponent(paymentMessage(paymentRequest, studentName, studentEmail))
  return `https://web.whatsapp.com/send?phone=${whatsappNumber}&text=${message}`
}

function PlanPage({ access, accessStatus, accessError = '', onRetryAccess, token, studentName: initialStudentName = '', studentEmail = '', onAccessChange, onToast, usage }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [accessDialogDismissed, setAccessDialogDismissed] = useState(false)
  const [studentName, setStudentName] = useState(initialStudentName)
  const nameInputRef = useRef(null)

  function requireStudentName() {
    setNameError('Your full name is required to continue.')
    onToast?.('Please enter your full name so the admin can identify your payment request.')
    nameInputRef.current?.focus()
  }

  async function startRequest(planKey) {
    const cleanStudentName = studentName.trim().replace(/\s+/g, ' ')
    if (!cleanStudentName) {
      requireStudentName()
      return
    }
    setNameError('')
    setBusy(planKey)
    setError('')
    try {
      let paymentRequest
      try {
        paymentRequest = await createPaymentRequest(planKey, token)
      } catch (requestError) {
        if (requestError.code !== 'REQUEST_PENDING') throw requestError
        const latestAccess = await getStudyAccess(token)
        paymentRequest = latestAccess.pendingRequest
        if (!paymentRequest) throw requestError
        onAccessChange(latestAccess)
      }
      if (paymentRequest) {
        onAccessChange((current) => ({ ...current, pendingRequest: paymentRequest }))
      }
      // Keep this step on the site. The student then clicks a real WhatsApp
      // anchor after the async request finishes; browsers can block app handoff
      // when it is triggered by JavaScript after awaiting a network request.
      setBusy('')
    } catch (requestError) {
      setError(requestError.message)
      setBusy('')
    }
  }

  async function cancelRequest() {
    if (!access?.pendingRequest) return
    setBusy('cancel')
    setError('')
    try {
      await cancelPaymentRequest(access.pendingRequest.id, token)
      onAccessChange((current) => ({ ...current, pendingRequest: null }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  const pending = access?.pendingRequest
  const cleanStudentName = studentName.trim().replace(/\s+/g, ' ')
  const whatsappHref = pending && cleanStudentName
    ? whatsappLink(pending, cleanStudentName, studentEmail)
    : ''
  const whatsappWebHref = pending && cleanStudentName
    ? whatsappWebLink(pending, cleanStudentName, studentEmail)
    : ''

  return (
    <div className="page workspace-page plans-page">
      <div className="page-kicker"><span className="kicker-dot" /> SIMPLE PLANS, CLEAR ACCESS</div>
      <div className="page-title-row plan-title-row">
        <div><h1>Plan &amp; access.</h1><p className="page-subtitle">See what you can use and manage Premium activation in a few clear steps.</p></div>
        <span className={`plan-status-pill ${access?.premiumActive || access?.isAdmin ? 'is-premium' : ''}`}><span />{accessStatus === 'loading' ? 'Loading plan' : access?.isAdmin ? 'Admin account' : access?.premiumActive ? 'Premium active' : 'Free plan'}</span>
      </div>

      {error && <div className="plan-error" role="alert">{error}</div>}
      {accessStatus === 'error' && !accessDialogDismissed && <div className="access-error-backdrop">
        <section className="access-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="access-error-title" aria-describedby="access-error-description">
          <button className="access-error-close" type="button" aria-label="Close message" onClick={() => setAccessDialogDismissed(true)}><Icon name="close" size={18} /></button>
          <span className="access-error-icon"><Icon name="alert" size={22} /></span>
          <p className="access-error-eyebrow">PLAN STATUS</p>
          <h2 id="access-error-title">We couldn’t load your plan information</h2>
          <p id="access-error-description">{accessError || 'StudyMate could not load your plan details. Please retry.'}</p>
          <button className="button button-primary access-error-retry" type="button" onClick={() => { setAccessDialogDismissed(false); onRetryAccess?.() }}><Icon name="refresh" size={16} /> Try again</button>
        </section>
      </div>}
      {access?.latestRequest?.status === 'rejected' && <div className="plan-request-result" role="status"><strong>Your last payment request was declined.</strong><span>{access.latestRequest.reviewNote || 'Please message us on WhatsApp if you need help.'}</span><small>Request code: {access.latestRequest.requestCode}</small></div>}

      <section className="plan-current-card" aria-labelledby="current-plan-title">
        <div className="plan-current-icon"><Icon name={access?.premiumActive ? 'spark' : 'book'} size={20} /></div>
        <div className="plan-current-copy">
          <span className="aside-label">YOUR CURRENT PLAN</span>
          <h2 id="current-plan-title">{accessStatus === 'loading' ? 'Checking your access…' : access?.isAdmin ? 'StudyMate Admin' : access?.premiumActive ? `StudyMate Premium · ${access.planKey === 'weekly' ? '7 days' : '30 days'}` : 'StudyMate Free'}</h2>
          <p>{access?.isAdmin
            ? 'Your administrator account includes premium tools and 30 daily AI requests.'
            : access?.premiumActive && access.expiresAt
            ? `Premium features are available until ${new Date(access.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
            : access?.expiresAt
              ? `Premium access ended on ${new Date(access.expiresAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. You are now using the Free plan.`
              : 'AI Tutor, Summarizer, Study Planner, and saved study history remain available on Free.'}</p>
        </div>
        {usage && <div className="plan-usage"><strong>{usage.remaining}<small> / {usage.dailyLimit}</small></strong><span>AI requests left today</span></div>}
      </section>

      <section className="plan-feature-summary" aria-label="Plan feature comparison">
        <div><span className="plan-feature-check"><Icon name="check" size={14} /></span><span><strong>Free</strong><small>AI Tutor, Summarizer, Study Planner, and history · 10 AI requests daily</small></span></div>
        <div><span className="plan-feature-check premium-check"><Icon name="spark" size={14} /></span><span><strong>Premium</strong><small>Everything in Free, plus Quiz Maker and Exam Preparation · 30 AI requests daily</small></span></div>
      </section>

      <section className="payment-student-details" aria-label="Payment request contact details">
        <label className="field-label" htmlFor="payment-student-name">Your full name</label>
        <input ref={nameInputRef} id="payment-student-name" className="text-input" type="text" autoComplete="name" maxLength={80} value={studentName} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'payment-student-name-error payment-student-name-help' : 'payment-student-name-help'} onChange={(event) => { setStudentName(event.target.value); setError(''); setNameError('') }} placeholder="Enter the name you want us to use" />
        {nameError && <span id="payment-student-name-error" className="payment-name-error" role="alert"><Icon name="alert" size={15} />{nameError}</span>}
        <small id="payment-student-name-help">This name and your account email will be included in the WhatsApp draft sent to +92 317 2873743.</small>
      </section>

      {pending ? (
        <section className="payment-pending-card" aria-labelledby="payment-pending-title">
          <div className="payment-pending-heading"><span className="pending-mark"><Icon name="clock" size={18} /></span><span><h2 id="payment-pending-title">Your request is ready</h2><p>Request code <strong>{pending.requestCode}</strong> · {pending.planKey === 'weekly' ? '7 days' : '30 days'} · Rs {pending.amountPkr}</p></span></div>
          <ol className="payment-steps"><li>Tap Open WhatsApp to message +92 317 2873743 with your details and request ID.</li><li>Review the draft, then tap Send. We’ll reply with payment instructions.</li><li>After you pay, send the transaction reference. Access starts after we verify it.</li></ol>
        <div className="payment-request-actions"><a className={`button button-primary${!whatsappHref ? ' is-disabled' : ''}`} href={whatsappHref || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsappHref} onClick={(event) => { if (!whatsappHref) { event.preventDefault(); requireStudentName() } }}><Icon name="send" size={15} /> Open WhatsApp</a><a className="quiet-button whatsapp-web-link" href={whatsappWebHref || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!whatsappWebHref} onClick={(event) => { if (!whatsappWebHref) { event.preventDefault(); requireStudentName() } }}>Use WhatsApp Web</a><button className="quiet-button" type="button" onClick={cancelRequest} disabled={busy === 'cancel'}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}</button></div>
        </section>
      ) : (
        <section className="plan-offers" aria-labelledby="plan-offers-title">
          <div className="section-heading"><div><h2 id="plan-offers-title">Choose Premium access</h2><p>Pay manually through WhatsApp. Your access begins after payment verification.</p></div></div>
          <div className="plan-offer-grid">
            <article className="plan-offer-card"><span className="offer-duration">7 DAYS</span><h3>Weekly</h3><p className="offer-price"><strong>Rs 200</strong><span>one time</span></p><ul><li><Icon name="check" size={14} /> 30 AI requests each day</li><li><Icon name="check" size={14} /> Quiz Maker and Exam Preparation</li><li><Icon name="check" size={14} /> Starts after payment approval</li></ul><button className="button button-secondary" type="button" disabled={Boolean(busy) || accessStatus === 'loading' || !token} onClick={() => startRequest('weekly')}>{busy === 'weekly' ? 'Opening WhatsApp…' : 'Choose weekly'}</button></article>
            <article className="plan-offer-card is-featured"><span className="offer-ribbon">SAVE RS 250</span><span className="offer-duration">30 DAYS</span><h3>Monthly</h3><p className="offer-price"><strong>Rs 550</strong><span><s>Rs 800</s> reference price</span></p><ul><li><Icon name="check" size={14} /> 30 AI requests each day</li><li><Icon name="check" size={14} /> Quiz Maker and Exam Preparation</li><li><Icon name="check" size={14} /> Starts after payment approval</li></ul><button className="button button-primary" type="button" disabled={Boolean(busy) || accessStatus === 'loading' || !token} onClick={() => startRequest('monthly')}>{busy === 'monthly' ? 'Opening WhatsApp…' : 'Choose monthly'}</button></article>
          </div>
          <p className="plan-payment-note"><Icon name="lightbulb" size={15} /> {token ? 'You’ll contact the StudyMate admin on WhatsApp. StudyMate will never ask for your password, login code, or card details.' : 'Sign in with a StudyMate account to create a payment request. StudyMate will never ask for your password, login code, or card details.'}</p>
        </section>
      )}
    </div>
  )
}

export default PlanPage
