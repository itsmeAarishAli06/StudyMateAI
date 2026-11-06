import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { getAdminStudents, revokeAdminStudyAccess } from '../lib/api.js'

const pageSize = 30

function formatDate(value) {
  if (!value) return 'Not yet'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function AdminStudentsPage({ token, onAccessChange }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [students, setStudents] = useState([])
  const [counts, setCounts] = useState({ all: 0, premium: 0, free: 0, admins: 0 })
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyUserId, setBusyUserId] = useState('')

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const result = await getAdminStudents({ status: statusFilter, search, limit: pageSize, offset: page * pageSize }, token)
      setStudents(result.students || [])
      setCounts(result.counts || { all: 0, premium: 0, free: 0, admins: 0 })
      setTotal(result.total || 0)
      setStatus('ready')
    } catch (loadError) {
      setError(loadError.message || 'Could not load registered students.')
      setStatus('error')
    }
  }, [page, search, statusFilter, token])

  useEffect(() => { refresh() }, [refresh])

  async function revoke(student) {
    if (!window.confirm(`Remove Premium access for ${student.email}? Their study history will remain unchanged.`)) return
    setBusyUserId(student.user_id)
    setError('')
    setNotice('')
    try {
      const result = await revokeAdminStudyAccess(student.user_id, 'Revoked by admin from student directory', token)
      setNotice(result.revoked ? `Premium access removed for ${student.email}.` : `No active Premium access was found for ${student.email}.`)
      await refresh()
      onAccessChange?.()
    } catch (revokeError) {
      setError(revokeError.message || 'Could not remove Premium access.')
    } finally {
      setBusyUserId('')
    }
  }

  function submitSearch(event) {
    event.preventDefault()
    setPage(0)
    setSearch(searchInput.trim())
  }

  const filters = [
    { key: 'all', label: 'All accounts', count: counts.all },
    { key: 'premium', label: 'Active Premium', count: counts.premium },
    { key: 'free', label: 'Free / expired', count: counts.free },
  ]

  return (
    <section className="admin-students-panel" aria-label="Registered students">
      <div className="admin-students-toolbar">
        <div className="admin-student-filters" role="group" aria-label="Filter students">
          {filters.map((filter) => <button key={filter.key} type="button" aria-pressed={statusFilter === filter.key} className={statusFilter === filter.key ? 'selected' : ''} onClick={() => { setStatusFilter(filter.key); setPage(0) }}>
            {filter.label}<span>{filter.count}</span>
          </button>)}
        </div>
        <form className="admin-student-search" onSubmit={submitSearch}>
          <Icon name="search" size={16} />
          <label className="sr-only" htmlFor="admin-student-search-input">Search students</label>
          <input id="admin-student-search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} maxLength={100} placeholder="Search name, email, class, or phone" />
          <button type="submit">Search</button>
        </form>
      </div>
      {notice && <div className="admin-success" role="status"><Icon name="check" size={15} />{notice}</div>}
      {error && <div className="plan-error" role="alert">{error}</div>}
      {status === 'loading' && <div className="history-loading-banner" role="status">Loading student directory…</div>}
      {status === 'error' && <div className="history-empty"><h2>Could not load students.</h2><button className="button button-secondary" type="button" onClick={refresh}>Try again</button></div>}
      {status === 'ready' && students.length === 0 && <div className="history-empty"><span className="history-empty-icon"><Icon name="search" size={21} /></span><h2>No students found.</h2><p>Try another filter or search term.</p></div>}
      {status === 'ready' && students.length > 0 && <>
        <div className="admin-student-list">
          {students.map((student) => {
            const isPremium = student.account_status === 'premium'
            const isAdmin = student.account_status === 'admin'
            return <article className="admin-student-card" key={student.user_id}>
              <div className="admin-student-card-heading">
                <span className="admin-student-avatar">{(student.full_name || student.email || 'S').slice(0, 1).toUpperCase()}</span>
                <div className="admin-student-identity"><h2>{student.full_name || 'Profile incomplete'}</h2><a href={`mailto:${student.email}`}>{student.email}</a></div>
                <span className={`admin-request-status ${isAdmin ? 'admin' : isPremium ? 'approved' : 'free'}`}>{isAdmin ? 'Admin access' : isPremium ? 'Premium active' : 'Free plan'}</span>
              </div>
              <div className="admin-student-details">
                <div><span>Class / grade</span><strong>{student.class_name || 'Not provided'}</strong></div>
                <div><span>Phone</span>{student.phone_e164 ? <a href={`tel:${student.phone_e164}`}>{student.phone_e164}</a> : <strong>Not provided</strong>}</div>
                <div><span>WhatsApp</span>{student.whatsapp_phone_e164 ? <a href={`https://wa.me/${student.whatsapp_phone_e164.replace('+', '')}`} target="_blank" rel="noopener noreferrer">{student.whatsapp_phone_e164}<Icon name="external" size={13} /></a> : <strong>Not provided</strong>}</div>
                <div><span>Joined</span><strong>{formatDate(student.created_at)}</strong></div>
                <div><span>Last active</span><strong>{formatDate(student.last_sign_in_at)}</strong></div>
                <div><span>Plan</span><strong>{isAdmin ? 'Lifetime admin access' : isPremium ? `${student.plan_key === 'weekly' ? '7-day' : '30-day'} Premium` : 'Free / expired'}</strong></div>
                <div><span>Access expires</span><strong>{isAdmin ? 'No expiry' : student.expires_at ? formatDate(student.expires_at) : '—'}</strong></div>
              </div>
              <div className="admin-student-card-footer">
                <span className={student.full_name && student.class_name && student.phone_e164 && student.whatsapp_phone_e164 ? 'profile-complete' : 'profile-incomplete'}>
                  <Icon name={student.full_name && student.class_name && student.phone_e164 && student.whatsapp_phone_e164 ? 'check' : 'alert'} size={14} />
                  {student.full_name && student.class_name && student.phone_e164 && student.whatsapp_phone_e164 ? 'Profile complete' : 'Profile details incomplete'}
                </span>
                {isPremium && <button className="quiet-button revoke-button" type="button" disabled={Boolean(busyUserId)} onClick={() => revoke(student)}>{busyUserId === student.user_id ? 'Removing access…' : 'Remove Premium access'}</button>}
              </div>
            </article>
          })}
        </div>
        <div className="admin-students-pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span><div><button className="button button-secondary" type="button" disabled={page === 0 || status === 'loading'} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><button className="button button-secondary" type="button" disabled={(page + 1) * pageSize >= total || status === 'loading'} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
      </>}
      <p className="admin-safety-note"><Icon name="briefcase" size={15} /> Contact details are visible only to StudyMate administrators. Active Premium status is based on the entitlement expiry date.</p>
    </section>
  )
}

export default AdminStudentsPage
