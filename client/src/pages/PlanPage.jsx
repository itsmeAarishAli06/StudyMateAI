import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { cancelPaymentRequest, createPaymentRequest } from '../lib/api.js'

const whatsappLocalNumber = '03172873743'
const whatsappCountryCode = '92'
const whatsappNumber = `${whatsappCountryCode}${whatsappLocalNumber.replace(/\D/g, '').replace(/^0/, '')}`

function paymentMessage(paymentRequest) {
  const planName = paymentRequest.planKey === 'weekly' ? '7-day Premium' : '30-day Premium'
  return `Hello StudyMate, I want to activate the ${planName} plan (Rs ${paymentRequest.amountPkr}). My request code is ${paymentRequest.requestCode}. Please share the payment instructions.`
}

function whatsappLink(paymentRequest) {
  const message = encodeURIComponent(paymentMessage(paymentRequest))
  return `https://wa.me/${whatsappNumber}?text=${message}`
}

function PlanPage({ access, accessStatus, token, onAccessChange, usage }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function startRequest(planKey) {
    setBusy(planKey)
    setError('')
    try {
      const paymentRequest = await createPaymentRequest(planKey, token)
      onAccessChange((current) => ({ ...current, pendingRequest: paymentRequest }))
      // Use WhatsApp's official Click to Chat endpoint. If the browser does not
      // hand off automatically after the API call, the pending screen below
      // exposes the same URL as a normal user-clicked link.
      window.location.href = whatsappLink(paymentRequest)
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
  const whatsappHref = pending ? whatsappLink(pending) : ''

  return (
    <div className="page workspace-page plans-page">
      <div className="page-kicker"><span className="kicker-dot" /> SIMPLE PLANS, CLEAR ACCESS</div>
      <div className="page-title-row plan-title-row">
        <div><h1>Plan &amp; access.</h1><p className="page-subtitle">See what you can use and manage Premium activation in a few clear steps.</p></div>
        <span className={`plan-status-pill ${access?.premiumActive || access?.isAdmin ? 'is-premium' : ''}`}><span />{accessStatus === 'loading' ? 'Loading plan' : access?.isAdmin ? 'Admin account' : access?.premiumActive ? 'Premium active' : 'Free plan'}</span>
      </div>

      {error && <div className="plan-error" role="alert">{error}</div>}
      {accessStatus === 'error' && <div className="plan-info-card" role="alert"><Icon name="refresh" size={18} /><span>Your plan status could not be loaded. Refresh the page or try again shortly.</span></div>}
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

      {pending ? (
        <section className="payment-pending-card" aria-labelledby="payment-pending-title">
          <div className="payment-pending-heading"><span className="pending-mark"><Icon name="clock" size={18} /></span><span><h2 id="payment-pending-title">Your request is ready</h2><p>Request code <strong>{pending.requestCode}</strong> · {pending.planKey === 'weekly' ? '7 days' : '30 days'} · Rs {pending.amountPkr}</p></span></div>
          <ol className="payment-steps"><li>Open WhatsApp and send the drafted request.</li><li>We’ll reply with payment instructions.</li><li>After you pay, send the transaction reference. Access starts after we verify it.</li></ol>
          <div className="payment-request-actions"><a className="button button-primary" href={whatsappHref} target="_blank" rel="noopener noreferrer"><Icon name="send" size={15} /> Open WhatsApp</a><button className="quiet-button" type="button" onClick={cancelRequest} disabled={busy === 'cancel'}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel request'}</button></div>
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
