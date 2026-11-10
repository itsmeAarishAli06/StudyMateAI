import Icon from './Icon.jsx'

function FeedbackToast({ type = 'error', title, message, onDismiss }) {
  if (!message) return null
  const success = type === 'success'
  return (
    <div className={`feedback-toast ${success ? 'is-success' : 'is-error'}`} role={success ? 'status' : 'alert'}>
      <span className="feedback-toast-icon"><Icon name={success ? 'check' : 'alert'} size={18} /></span>
      <span className="feedback-toast-copy"><strong>{title || (success ? 'All set' : 'Please check this')}</strong><span>{message}</span></span>
      <button type="button" aria-label="Dismiss message" onClick={onDismiss}><Icon name="close" size={16} /></button>
    </div>
  )
}

export default FeedbackToast
