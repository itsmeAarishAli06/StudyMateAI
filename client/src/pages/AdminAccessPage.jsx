import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import FeedbackToast from '../components/FeedbackToast.jsx'
import { getAdminPaymentRequests, reviewAdminFriendsPaymentRequest, reviewAdminPaymentRequest, revokeAdminStudyAccess } from '../lib/api.js'
import AdminStudentsPage from './AdminStudentsPage.jsx'

function AdminAccessPage({ token, onAccessChange }) {
  const [requests, setRequests] = useState([])
  const [references, setReferences] = useState({})
  const [notes, setNotes] = useState({})
  const [status, setStatus] = useState('loading')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeSection, setActiveSection] = useState('students')

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      setRequests(await getAdminPaymentRequests(token))
      setStatus('ready')
    } catch (loadError) {
      setError(loadError.message)
      setStatus('error')
    }
  }, [token])

  useEffect(() => {
    if (activeSection === 'requests') refresh()
  }, [activeSection, refresh])

  async function review(item, decision) {
    if (decision === 'approve' && !references[item.id]?.trim()) {
      setError(item.offer_type === 'friends'
        ? 'Check the bank or wallet transaction, then enter its reference. Approval activates Premium for all four listed accounts.'
        : 'Check the payment, then enter its transaction reference before granting access.')
      return
    }
    setBusyId(item.id)
    setError('')
    setNotice('')
    try {
      const reviewRequest = item.offer_type === 'friends' ? reviewAdminFriendsPaymentRequest : reviewAdminPaymentRequest
      await reviewRequest(item.id, {
        decision,
        transactionReference: references[item.id] || '',
        note: notes[item.id] || '',
      }, token)
      setNotice(decision === 'approve'
        ? item.offer_type === 'friends' ? `Friends Premium activated for all four accounts in request ${item.request_code}.` : `Premium access activated for ${item.user_email}.`
        : `Payment request from ${item.user_email} was declined.`)
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
      <div className="page-title-row"><div><h1>Admin workspace.</h1><p className="page-subtitle">Review student accounts, confirm payments, and manage Premium access.</p></div>{activeSection === 'requests' && <button className="quiet-button admin-refresh" type="button" onClick={refresh} disabled={status === 'loading'}><Icon name="refresh" size={15} />Refresh</button>}</div>
      <div className="admin-section-tabs" role="tablist" aria-label="Admin workspace sections">
        <button id="admin-students-tab" type="button" role="tab" aria-controls="admin-students-panel" aria-selected={activeSection === 'students'} className={activeSection === 'students' ? 'selected' : ''} onClick={() => setActiveSection('students')}><Icon name="history" size={16} />Students</button>
        <button id="admin-requests-tab" type="button" role="tab" aria-controls="admin-requests-panel" aria-selected={activeSection === 'requests'} className={activeSection === 'requests' ? 'selected' : ''} onClick={() => setActiveSection('requests')}><Icon name="check" size={16} />Payment requests</button>
      </div>
      {activeSection === 'students' && <div id="admin-students-panel" role="tabpanel" tabIndex={0} aria-labelledby="admin-students-tab"><AdminStudentsPage token={token} onAccessChange={onAccessChange} /></div>}
      {activeSection === 'requests' && <div id="admin-requests-panel" role="tabpanel" tabIndex={0} aria-labelledby="admin-requests-tab">
      <FeedbackToast type="error" title="Payment review needs attention" message={error} onDismiss={() => setError('')} />
      <FeedbackToast type="success" title="Payment request updated" message={notice} onDismiss={() => setNotice('')} />
      {status === 'loading' && <div className="history-loading-banner" role="status">Loading payment requests…</div>}
      {status === 'error' && <div className="history-empty"><h2>Could not load requests.</h2><button className="button button-secondary" type="button" onClick={refresh}>Try again</button></div>}
      {status === 'ready' && requests.length === 0 && <div className="history-empty"><span className="history-empty-icon"><Icon name="check" size={22} /></span><h2>No payment requests yet.</h2><p>New student requests will appear here.</p></div>}
      {status === 'ready' && requests.length > 0 && <section className="admin-request-list" aria-label="Payment requests">{requests.map((item) => (
        <article className="admin-request-card" key={item.id}>
          <div className="admin-request-top"><div><span className="aside-label">{item.request_code} · {item.offer_type === 'friends' ? 'FRIENDS · 4 ACCOUNTS' : ''} {item.plan_key === 'weekly' ? '7-DAY PLAN' : '30-DAY PLAN'}</span><h2>{item.user_email || item.user_id}</h2><p>Rs {item.amount_pkr} total · Requested {new Date(item.created_at).toLocaleString()}</p>{item.current_expires_at && <p>{Date.parse(item.current_expires_at) > Date.now() ? 'Current access ends' : 'Last access ended'} {new Date(item.current_expires_at).toLocaleString()}</p>}</div><span className={`admin-request-status ${item.status}`}>{item.status}</span></div>
          {item.offer_type === 'friends' && <div className="admin-friends-members"><strong>Accounts included · {item.members?.length || 0} of 4</strong><ul>{(item.members || []).map((member) => <li key={member.userId}><span>{member.email}</span>{member.name && <small>{member.name}</small>}</li>)}</ul><small>Approval activates the selected plan for all four accounts in one database transaction.</small></div>}
          {item.status === 'pending' ? <>
            <label className="admin-field">Verified transaction reference<input className="text-input" maxLength={120} value={references[item.id] || ''} onChange={(event) => { setReferences((current) => ({ ...current, [item.id]: event.target.value })); setError('') }} placeholder="Enter reference after checking payment" /></label>
            <label className="admin-field">Reason or message for student <span>(optional)</span><input className="text-input" maxLength={300} value={notes[item.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="For example, transaction could not be verified" /></label>
            <div className="admin-request-actions"><button className="button button-primary" type="button" disabled={Boolean(busyId)} onClick={() => review(item, 'approve')}>{busyId === item.id ? 'Saving…' : item.offer_type === 'friends' ? `Verify & activate all 4 · ${item.plan_key === 'weekly' ? '7' : '30'} days` : `Verify & grant ${item.plan_key === 'weekly' ? '7' : '30'} days`}</button><button className="button button-secondary" type="button" disabled={Boolean(busyId)} onClick={() => review(item, 'reject')}>Decline</button></div>
          </> : <div className="admin-reviewed-row"><span>{item.transaction_reference ? `Verified reference: ${item.transaction_reference}` : 'No transaction reference recorded'}</span>{item.status === 'approved' && item.offer_type !== 'friends' && <button className="quiet-button revoke-button" type="button" disabled={Boolean(busyId)} onClick={() => revoke(item)}>{busyId === item.id ? 'Revoking…' : 'Revoke active access'}</button>}{item.status === 'approved' && item.offer_type === 'friends' && <span>Manage individual member access from Students.</span>}</div>}
        </article>
      ))}</section>}
      <p className="admin-safety-note"><Icon name="lightbulb" size={15} /> A screenshot is not proof of payment. Confirm the transaction in your bank or wallet before approving.</p>
      </div>}
    </div>
  )
}

export default AdminAccessPage
