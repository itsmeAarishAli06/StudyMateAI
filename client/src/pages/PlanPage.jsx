import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import FeedbackToast from '../components/FeedbackToast.jsx'
import { cancelPaymentRequest, createFriendsPaymentRequest, createPaymentRequest, getStudyAccess } from '../lib/api.js'

const whatsappLocalNumber = '03172873743'
const whatsappCountryCode = '92'
const whatsappNumber = `${whatsappCountryCode}${whatsappLocalNumber.replace(/\D/g, '').replace(/^0/, '')}`
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i

function paymentMessage(paymentRequest, studentName, studentEmail) {
  const planName = paymentRequest.planKey === 'weekly' ? '7-day Premium' : '30-day Premium'
  if (paymentRequest.offerType === 'friends') return [
    'Hello StudyMate, I would like to purchase the Friends Premium plan.',
    `Plan: Friends Premium · ${paymentRequest.planKey === 'weekly' ? '7 days' : '30 days'} for 4 accounts`,
    `Purchaser: ${studentName} (${studentEmail})`,
    `Friend accounts: ${(paymentRequest.recipientEmails || []).filter((email) => email.toLowerCase() !== studentEmail.toLowerCase()).join(', ')}`,
    `Request ID: ${paymentRequest.requestCode}`,
    `Total amount: Rs ${paymentRequest.amountPkr} PKR`,
    'Please share the payment instructions. I will send the transaction reference after payment.',
  ].join('\n')
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

function PlanPage({ access, accessStatus, accessError = '', onRetryAccess, onNavigate, token, studentProfile = null, studentName = '', studentEmail = '', onAccessChange, usage, onToast }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [friendEmails, setFriendEmails] = useState(['', '', ''])
  const [friendsDuration, setFriendsDuration] = useState('weekly')
  const [accessDialogDismissed, setAccessDialogDismissed] = useState(false)
  const cleanStudentName = studentName.trim().replace(/\s+/g, ' ')
  const hasStudentName = cleanStudentName.length >= 2
  const hasCompleteProfile = Boolean(studentProfile?.complete)
  const expiryDate = access?.expiresAt ? new Date(access.expiresAt) : null
  const validExpiryDate = expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null
  const formattedExpiry = validExpiryDate?.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })
  const feedbackTitle = /friend|account email/i.test(error) ? 'Check the friend account emails' : /profile/i.test(error) ? 'Complete your student profile' : 'Your request needs attention'

  async function startRequest(planKey) {
    if (!hasCompleteProfile) {
      onToast?.('Complete your student profile first. Add your full name, class or grade, phone, and WhatsApp number. After saving, you will return here to continue.')
      onNavigate?.('profile', { returnToPlan: planKey })
      return
    }
    setBusy(planKey)
    setError('')
    setNotice('')
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
      if (requestError.code === 'PROFILE_INCOMPLETE') {
        onToast?.(requestError.message)
        onNavigate?.('profile', { returnToPlan: planKey })
        setBusy('')
        return
      }
      setError(requestError.message)
      setBusy('')
    }
  }

  async function startFriendsRequest() {
    if (!hasCompleteProfile) {
      onToast?.('Complete your student profile first. Add your full name, class or grade, phone, and WhatsApp number. After saving, you will return here to continue.')
      onNavigate?.('profile', { returnToPlan: 'friends' })
      return
    }
    const normalized = friendEmails.map((email) => email.trim().toLowerCase())
    if (normalized.some((email) => !emailPattern.test(email)) || new Set(normalized).size !== 3 || normalized.some((email) => email === studentEmail.trim().toLowerCase())) {
      setError('Enter three different, valid StudyMate account emails. Your own account is included automatically.')
      return
    }
    setBusy('friends')
    setError('')
    setNotice('')
    try {
      const paymentRequest = await createFriendsPaymentRequest(friendsDuration, normalized, token)
      onAccessChange((current) => ({ ...current, pendingRequest: paymentRequest }))
    } catch (requestError) {
      if (requestError.code === 'REQUEST_PENDING') {
        try {
          const latestAccess = await getStudyAccess(token)
          onAccessChange(latestAccess)
          setNotice('A payment request is already waiting. We loaded it below; continue with that request or cancel it before starting another.')
        } catch (refreshError) { setError(refreshError.message) }
      } else if (requestError.code === 'PROFILE_INCOMPLETE') {
        onToast?.(requestError.message)
        onNavigate?.('profile', { returnToPlan: 'friends' })
      } else setError(requestError.message)
    } finally { setBusy('') }
  }

  async function cancelRequest() {
    if (!access?.pendingRequest) return
    setBusy('cancel')
    setError('')
    setNotice('')
    try {
      await cancelPaymentRequest(access.pendingRequest.id, token)
      onAccessChange((current) => ({ ...current, pendingRequest: null }))
      setNotice('Request canceled. You can now choose an individual or Friends Premium plan.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  const pending = access?.pendingRequest
  const whatsappHref = pending && hasCompleteProfile && hasStudentName
    ? whatsappLink(pending, cleanStudentName, studentEmail)
    : ''
  const whatsappWebHref = pending && hasCompleteProfile && hasStudentName
    ? whatsappWebLink(pending, cleanStudentName, studentEmail)
    : ''

  return (
    <div className="page workspace-page plans-page">
      <div className="page-kicker"><span className="kicker-dot" /> SIMPLE PLANS, CLEAR ACCESS</div>
      <div className="page-title-row plan-title-row">
        <div><h1>Plan &amp; access.</h1><p className="page-subtitle">See what you can use and manage Premium activation in a few clear steps.</p></div>
        <span className={`plan-status-pill ${access?.premiumActive || access?.isAdmin ? 'is-premium' : ''}`}><span />{accessStatus === 'loading' ? 'Loading plan' : access?.isAdmin ? 'Admin account' : access?.premiumActive ? 'Premium active' : 'Free plan'}</span>
      </div>

      <FeedbackToast type="error" title={feedbackTitle} message={error} onDismiss={() => setError('')} />
      <FeedbackToast type="success" title="Request updated" message={notice} onDismiss={() => setNotice('')} />
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
          <h2 id="current-plan-title">{accessStatus === 'loading' ? 'Checking your access…' : access?.isAdmin ? 'StudyMate Admin' : access?.premiumActive ? `Premium · ${access.planKey === 'weekly' ? '7-day' : '30-day'} plan` : 'Free plan'}</h2>
          <p>{access?.isAdmin
            ? 'Admin access includes all Premium features and 30 daily AI requests with no expiry.'
            : access?.premiumActive
              ? 'Premium features are active on your account.'
              : access?.expiresAt && formattedExpiry
                ? `Your previous Premium access ended ${formattedExpiry}. You are now on the Free plan.`
                : 'You are on the Free plan. AI Tutor, Summarizer, Study Planner, and saved study history are available.'}</p>
          {access?.premiumActive && formattedExpiry && <div className="plan-expiry-highlight"><Icon name="clock" size={17} /><span><strong>Premium access ends</strong><time dateTime={validExpiryDate.toISOString()}>{formattedExpiry}</time></span></div>}
        </div>
        {usage && <div className="plan-usage"><strong>{usage.remaining}<small> / {usage.dailyLimit}</small></strong><span>AI requests left today</span></div>}
      </section>

      <section className="plan-feature-summary" aria-label="Plan feature comparison">
        <div><span className="plan-feature-check"><Icon name="check" size={14} /></span><span><strong>Free</strong><small>AI Tutor, Summarizer, Study Planner, and history · 10 AI requests daily</small></span></div>
        <div><span className="plan-feature-check premium-check"><Icon name="spark" size={14} /></span><span><strong>Premium</strong><small>Everything in Free, plus Quiz Maker and Exam Preparation · 30 AI requests daily</small></span></div>
      </section>

      {token && !hasCompleteProfile && <section className="payment-profile-required" role="status">
        <span><strong>Complete your student profile before requesting Premium</strong><small>Add your full name, class or grade, phone number, and WhatsApp number. This helps us identify your payment request and contact you. Tap a plan to open your profile; after saving, StudyMate will bring you back here.</small></span>
        <button className="button button-secondary" type="button" onClick={() => onNavigate?.('profile', { returnToPlan: pending?.planKey || '' })}>Complete profile</button>
      </section>}

      {pending ? (
        <section className="payment-pending-card" aria-labelledby="payment-pending-title">
          <div className="payment-pending-heading"><span className="pending-mark"><Icon name="clock" size={18} /></span><span><h2 id="payment-pending-title">Your request is ready</h2><p>{pending.offerType === 'friends' ? 'Friends Premium · 4 accounts' : 'Premium'} · Request <strong>{pending.requestCode}</strong> · {pending.planKey === 'weekly' ? '7 days' : '30 days'} · Rs {pending.amountPkr}</p></span></div>
          {pending.offerType === 'friends' && <div className="friends-pending-members"><strong>Accounts included</strong><span>{[studentEmail, ...(pending.recipientEmails || []).filter((email) => email.toLowerCase() !== studentEmail.toLowerCase())].join(' · ')}</span><small>All four accounts receive the selected duration after payment verification.</small></div>}
          <ol className="payment-steps"><li>Tap Open WhatsApp to message +92 317 2873743. The draft includes your request ID{pending.offerType === 'friends' ? ' and all four account emails' : ' and details'}.</li><li>Review the draft, then tap Send. We’ll reply with payment instructions.</li><li>After you pay, send the transaction reference. {pending.offerType === 'friends' ? 'We activate all four accounts together' : 'Your access starts'} after we verify it.</li></ol>
        <div className="payment-request-actions">{hasCompleteProfile && hasStudentName && <><a className="button button-primary" href={whatsappHref} target="_blank" rel="noopener noreferrer"><Icon name="send" size={15} /> Open WhatsApp</a><a className="quiet-button whatsapp-web-link" href={whatsappWebHref} target="_blank" rel="noopener noreferrer">Use WhatsApp Web</a></>}<button className="quiet-button" type="button" onClick={cancelRequest} disabled={busy === 'cancel'}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}</button></div>
        </section>
      ) : (
        <section className="plan-offers" aria-labelledby="plan-offers-title">
          <div className="section-heading"><div><h2 id="plan-offers-title">Choose Premium access</h2><p>Pay manually through WhatsApp. Your access begins after payment verification.</p></div></div>
          <div className="plan-offer-grid">
            <article className="plan-offer-card"><span className="offer-duration">7 DAYS</span><h3>Weekly</h3><p className="offer-price"><strong>Rs 200</strong><span>one time</span></p><ul><li><Icon name="check" size={14} /> 30 AI requests each day</li><li><Icon name="check" size={14} /> Quiz Maker and Exam Preparation</li><li><Icon name="check" size={14} /> Starts after payment approval</li></ul><button className="button button-secondary" type="button" disabled={Boolean(busy) || accessStatus === 'loading' || !token} onClick={() => startRequest('weekly')}>{busy === 'weekly' ? 'Preparing request…' : hasCompleteProfile ? 'Choose weekly' : 'Complete profile to choose'}</button></article>
            <article className="plan-offer-card is-featured"><span className="offer-ribbon">SAVE RS 250</span><span className="offer-duration">30 DAYS</span><h3>Monthly</h3><p className="offer-price"><strong>Rs 550</strong><span><s>Rs 800</s> reference price</span></p><ul><li><Icon name="check" size={14} /> 30 AI requests each day</li><li><Icon name="check" size={14} /> Quiz Maker and Exam Preparation</li><li><Icon name="check" size={14} /> Starts after payment approval</li></ul><button className="button button-primary" type="button" disabled={Boolean(busy) || accessStatus === 'loading' || !token} onClick={() => startRequest('monthly')}>{busy === 'monthly' ? 'Preparing request…' : hasCompleteProfile ? 'Choose monthly' : 'Complete profile to choose'}</button></article>
          </div>
          <section className="friends-plan-card" aria-labelledby="friends-plan-title">
            <div className="friends-plan-intro"><span className="friends-plan-icon"><Icon name="users" size={21} /></span><div><span className="offer-duration">GROUP OFFER · ONE PAYMENT</span><h3 id="friends-plan-title">Friends Premium</h3><p>Pay for 3 accounts and get Premium for 4 people, including you. Each friend must already have a confirmed StudyMate account.</p></div><span className="friends-save-badge">1 FREE</span></div>
            <div className="friends-plan-controls">
              <label className="admin-field">Choose duration<select className="text-input" value={friendsDuration} onChange={(event) => { setFriendsDuration(event.target.value); setError('') }}><option value="weekly">7 days - Rs 600 total</option><option value="monthly">30 days - Rs 1,650 total</option></select></label>
              <div className="friends-email-fields"><span className="friends-input-label">Enter the three friends' StudyMate login emails</span>{friendEmails.map((email, index) => <label className="admin-field" key={index}>Friend {index + 1} email<input className="text-input" type="email" autoComplete="off" maxLength={254} value={email} onChange={(event) => { setFriendEmails((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value)); setError('') }} placeholder="friend@example.com" /></label>)}<small>Your own account is included automatically. We only accept emails belonging to confirmed StudyMate accounts.</small></div>
              <div className="friends-plan-summary"><strong>4 accounts</strong><span>One verified payment · same selected plan duration · 30 AI requests daily per member</span><button className="button button-primary" type="button" disabled={Boolean(busy) || accessStatus === 'loading' || !token} onClick={startFriendsRequest}>{busy === 'friends' ? 'Preparing group request…' : hasCompleteProfile ? `Continue · Rs ${friendsDuration === 'weekly' ? '600' : '1,650'}` : 'Complete profile to continue'}</button></div>
            </div>
          </section>
          <p className="plan-payment-note"><Icon name="lightbulb" size={15} /> {token ? 'You’ll contact the StudyMate admin on WhatsApp. StudyMate will never ask for your password, login code, or card details.' : 'Sign in with a StudyMate account to create a payment request. StudyMate will never ask for your password, login code, or card details.'}</p>
        </section>
      )}
    </div>
  )
}

export default PlanPage
