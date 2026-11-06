import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { getAdminPaymentRequests, reviewAdminPaymentRequest, revokeAdminStudyAccess } from '../lib/api.js'

function AdminAccessPage({ token, onAccessChange }) {
  const [requests, setRequests] = useState([])
  const [references, setReferences] = useState({})
  const [notes, setNotes] = useState({})
  const [status, setStatus] = useState('loading')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      setRequests(await getAdminPaymentRequests(token))
      setStatus('ready')
    } catch (loadError) {
      setError(loadError.message)
      setStatus('error')
    }
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  async function review(item, decision) {
    if (decision === 'approve' && !references[item.id]?.trim()) {
      setError('Enter and verify the payment transaction reference before approving.')
      return
    }
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      await reviewAdminPaymentRequest(item.id, {
        decision,
        transactionReference: references[item.id] || '',
        note: notes[item.id] || '',
      }, token)
      setNotice(decision === 'approve' ? `Premium access activated for ${item.user_email}.` : `Payment request from ${item.user_email} was declined.`)
      await refresh()
      onAccessChange()
    } catch (reviewError) {
      setError(reviewError.message)
    } finally {
      setBusyId('')
    }
  }

  async function revoke(item) {
    if (!window.confirm(`Revoke the current Premium access for ${item.user_email}?`)) return
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      const result = await revokeAdminStudyAccess(item.user_id, 'Revoked by admin', token)
      setNotice(result.revoked ? `Premium access revoked for ${item.user_email}.` : `No active Premium access was found for ${item.user_email}.`)
      onAccessChange()
    } catch (revokeError) {
      setError(revokeError.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page workspace-page admin-access-page">
      <div className="page-kicker"><span className="kicker-dot" /> PRIVATE ADMIN WORKSPACE</div>
      <div className="page-title-row"><div><h1>Payment requests.</h1><p className="page-subtitle">Verify each payment in your payment account before granting access.</p></div><button className="quiet-button admin-refresh" type="button" onClick={refresh} disabled={status === 'loading'}><Icon name="refresh" size={15} />Refresh</button></div>
      {error && <div className="plan-error" role="alert">{error}</div>}
      {notice && <div className="admin-success" role="status"><Icon name="check" size={15} />{notice}</div>}
      {status === 'loading' && <div className="history-loading-banner" role="status">Loading payment requests…</div>}
      {status === 'error' && <div className="history-empty"><h2>Could not load requests.</h2><button className="button button-secondary" type="button" onClick={refresh}>Try again</button></div>}
      {status === 'ready' && requests.length === 0 && <div className="history-empty"><span className="history-empty-icon"><Icon name="check" size={22} /></span><h2>No payment requests yet.</h2><p>New student requests will appear here.</p></div>}
      {status === 'ready' && requests.length > 0 && <section className="admin-request-list" aria-label="Payment requests">{requests.map((item) => (
        <article className="admin-request-card" key={item.id}>
          <div className="admin-request-top"><div><span className="aside-label">{item.request_code} · {item.plan_key === 'weekly' ? '7-DAY PLAN' : '30-DAY PLAN'}</span><h2>{item.user_email || item.user_id}</h2><p>Rs {item.amount_pkr} · Requested {new Date(item.created_at).toLocaleString()}</p>{item.current_expires_at && <p>{Date.parse(item.current_expires_at) > Date.now() ? 'Current access ends' : 'Last access ended'} {new Date(item.current_expires_at).toLocaleString()}</p>}</div><span className={`admin-request-status ${item.status}`}>{item.status}</span></div>
          {item.status === 'pending' ? <>
            <label className="admin-field">Verified transaction reference<input className="text-input" maxLength={120} value={references[item.id] || ''} onChange={(event) => setReferences((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Enter reference after checking payment" /></label>
            <label className="admin-field">Reason or message for student <span>(optional)</span><input className="text-input" maxLength={300} value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="For example, transaction could not be verified" /></label>
            <div className="admin-request-actions"><button className="button button-primary" type="button" disabled={Boolean(busyId)} onClick={() => review(item, 'approve')}>{busyId === item.id ? 'Saving…' : `Verify & grant ${item.plan_key === 'weekly' ? '7' : '30'} days`}</button><button className="button button-secondary" type="button" disabled={Boolean(busyId)} onClick={() => review(item, 'reject')}>Decline</button></div>
          </> : <div className="admin-reviewed-row"><span>{item.transaction_reference ? `Verified reference: ${item.transaction_reference}` : 'No transaction reference recorded'}</span>{item.status === 'approved' && <button className="quiet-button revoke-button" type="button" disabled={Boolean(busyId)} onClick={() => revoke(item)}>{busyId === item.id ? 'Revoking…' : 'Revoke active access'}</button>}</div>}
        </article>
      ))}</section>}
      <p className="admin-safety-note"><Icon name="lightbulb" size={15} /> A screenshot is not proof of payment. Confirm the transaction in your bank or wallet before approving.</p>
    </div>
  )
}

export default AdminAccessPage
