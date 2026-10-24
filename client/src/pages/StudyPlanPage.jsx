import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { authConfigured } from '../lib/auth.js'
import { createStudyPlan, deleteStudyPlan, getStudyPlans, updateStudyPlan } from '../lib/api.js'

const localStorageKey = 'studymate.studyPlans'
const maxPlanDays = 120
const maxExamDays = 90
const studyStages = ['Learn the key ideas', 'Recall without notes', 'Practice questions', 'Review weak spots']

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayKey() {
  return dateKey(new Date())
}

function addDaysToKey(key, days) {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

function dayDistance(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
}

function loadLocalPlans() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(localStorageKey) || '[]')
    return Array.isArray(saved) ? saved.filter((plan) => plan && typeof plan.id === 'string'
      && typeof plan.title === 'string' && typeof plan.examDate === 'string'
      && Number.isInteger(plan.dailyMinutes) && Array.isArray(plan.topics)
      && Array.isArray(plan.schedule) && plan.schedule.every((day) => day && typeof day.date === 'string'
        && Array.isArray(day.tasks) && day.tasks.every((task) => task && typeof task.title === 'string'
          && Number.isInteger(task.minutes) && typeof task.completed === 'boolean'))) : []
  } catch {
    return []
  }
}

function buildSchedule(examDate, dailyMinutes, topics, existingSchedule = []) {
  const today = todayKey()
  const daysUntilExam = dayDistance(today, examDate)
  if (daysUntilExam < 0 || daysUntilExam >= maxExamDays) throw new Error('Choose an exam date within the next 90 days.')

  const previousTasks = new Map()
  const previousDaysByDate = new Map(existingSchedule.map((day) => [day.date, day]))
  existingSchedule.forEach((day) => day.tasks.forEach((task) => previousTasks.set(`${day.date}|${task.title}`, task)))
  const historyLimit = Math.max(0, maxPlanDays - (daysUntilExam + 1))
  const previousDays = existingSchedule.filter((day) => day.date < today)
  const history = historyLimit ? previousDays.slice(-Math.min(30, historyLimit)) : []
  const schedule = [...history]

  for (let dayIndex = 0; dayIndex <= daysUntilExam; dayIndex += 1) {
    const date = addDaysToKey(today, dayIndex)
    const preservedTasks = (previousDaysByDate.get(date)?.tasks || []).filter((task) => task.customized)
    let minutesLeft = dailyMinutes - preservedTasks.reduce((sum, task) => sum + task.minutes, 0)
    if (minutesLeft < 0) throw new Error(`Some edited tasks on ${date} exceed the new daily time budget. Shorten or remove them, then update the plan.`)
    const availableSlots = 8 - preservedTasks.length
    if (minutesLeft > 0 && availableSlots < 1) throw new Error(`There are too many customized tasks on ${date} to fit the new plan.`)
    const sessionsPerDay = minutesLeft ? Math.min(Math.ceil(minutesLeft / 60), availableSlots) : 0
    const tasks = [...preservedTasks]
    for (let session = 0; session < sessionsPerDay && minutesLeft > 0; session += 1) {
      const sequence = dayIndex * Math.max(1, sessionsPerDay) + session
      const topic = topics[sequence % topics.length]
      const cycle = Math.floor(sequence / topics.length)
      const stage = dayIndex === daysUntilExam ? 'Final review' : studyStages[cycle % studyStages.length]
      const title = `${stage}: ${topic}`
      const evenShare = Math.ceil(minutesLeft / (sessionsPerDay - session) / 5) * 5
      const minutes = Math.min(240, minutesLeft, evenShare)
      const previous = previousTasks.get(`${date}|${title}`)
      tasks.push({ id: previous?.id || crypto.randomUUID(), title, minutes, completed: previous?.completed || false })
      minutesLeft -= minutes
    }
    schedule.push({ date, tasks })
  }
  if (schedule.length > maxPlanDays) throw new Error('This plan is too long. Please choose a closer exam date.')
  return schedule
}

function normalizeTopics(text) {
  return text.split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}

function PlanForm({ initialPlan, onCancel, onSubmit, isSaving }) {
  const [title, setTitle] = useState(initialPlan?.title || '')
  const [examDate, setExamDate] = useState(initialPlan?.examDate || addDaysToKey(todayKey(), 30))
  const [dailyMinutes, setDailyMinutes] = useState(initialPlan?.dailyMinutes || 90)
  const [topicsText, setTopicsText] = useState(initialPlan?.topics?.join('\n') || '')
  const [formError, setFormError] = useState('')

  function submit(event) {
    event.preventDefault()
    const topics = normalizeTopics(topicsText)
    if (!title.trim()) return setFormError('Give this plan a name, such as “Biology final”.')
    if (!examDate || dayDistance(todayKey(), examDate) < 0) return setFormError('Choose today or a future exam date.')
    if (dayDistance(todayKey(), examDate) >= maxExamDays) return setFormError('For a manageable plan, choose an exam date within 90 days.')
    if (!Number.isInteger(Number(dailyMinutes)) || dailyMinutes < 15 || dailyMinutes > 240) return setFormError('Set 15 to 240 minutes of study time per day.')
    if (!topics.length || topics.length > 30 || topics.some((topic) => topic.length > 120)) return setFormError('Add 1 to 30 topics, with each topic under 120 characters.')
    setFormError('')
    onSubmit({ title: title.trim(), examDate, dailyMinutes: Number(dailyMinutes), topics })
  }

  return (
    <form className="input-card study-plan-form" onSubmit={submit}>
      <div className="study-plan-form-heading"><span className="study-plan-form-icon"><Icon name="calendar" size={20} /></span><div><span className="result-overline">A PLAN THAT FITS YOUR LIFE</span><h2>{initialPlan ? 'Adjust your schedule' : 'Build your study schedule'}</h2><p>Choose a target, your daily time, and what you need to cover. You can edit every task later.</p></div></div>
      <label className="field-label" htmlFor="plan-title">Plan name</label>
      <input id="plan-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="e.g. Biology final preparation" required />
      <div className="study-plan-form-grid">
        <label><span className="field-label">Exam date</span><input className="text-input" type="date" min={todayKey()} max={addDaysToKey(todayKey(), maxExamDays - 1)} value={examDate} onChange={(event) => setExamDate(event.target.value)} required /></label>
        <label><span className="field-label">Time available each day</span><select className="text-input" value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value))}>{[15, 30, 45, 60, 90, 120, 150, 180, 210, 240].map((minutes) => <option value={minutes} key={minutes}>{minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes >= 120 ? 's' : ''}${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} minutes`}</option>)}</select></label>
      </div>
      <label className="field-label" htmlFor="plan-topics">Topics to study <span>One per line</span></label>
      <textarea id="plan-topics" className="notes-textarea study-plan-topics-input" value={topicsText} onChange={(event) => setTopicsText(event.target.value)} maxLength={3600} placeholder={'Cell structure\nPhotosynthesis\nCellular respiration'} required />
      <p className="study-plan-form-tip"><Icon name="lightbulb" size={14} /> We spread short learning, recall, practice, and review sessions across your available days.</p>
      {formError && <div className="form-error" role="alert"><Icon name="close" size={15} /> {formError}</div>}
      <div className="study-plan-form-actions"><button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? <><span className="button-spinner" /> Saving plan…</> : <><Icon name={initialPlan ? 'check' : 'spark'} size={15} /> {initialPlan ? 'Save schedule changes' : 'Create my study plan'} <Icon name="arrow" size={15} /></>}</button>{onCancel && <button className="button button-secondary" type="button" onClick={onCancel} disabled={isSaving}>Cancel</button>}</div>
    </form>
  )
}

function StudyPlanPage({ accessToken, onToast }) {
  const [plans, setPlans] = useState(() => authConfigured ? [] : loadLocalPlans())
  const [activePlanId, setActivePlanId] = useState('')
  const [isLoading, setIsLoading] = useState(authConfigured)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [showCreator, setShowCreator] = useState(false)
  const [editingSettings, setEditingSettings] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [addingTaskDate, setAddingTaskDate] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskMinutes, setTaskMinutes] = useState(25)

  useEffect(() => {
    if (!accessToken) {
      const localPlans = loadLocalPlans()
      setPlans(localPlans)
      setActivePlanId((current) => current || localPlans[0]?.id || '')
      setIsLoading(false)
      return undefined
    }
    let active = true
    setIsLoading(true)
    getStudyPlans(accessToken).then((nextPlans) => {
      if (!active) return
      setPlans(nextPlans)
      setActivePlanId((current) => nextPlans.some((plan) => plan.id === current) ? current : nextPlans[0]?.id || '')
      setLoadError('')
    }).catch((requestError) => {
      if (active) setLoadError(requestError.message || 'Your study plans could not be loaded.')
    }).finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [accessToken])

  useEffect(() => {
    if (authConfigured) return
    try { window.localStorage.setItem(localStorageKey, JSON.stringify(plans)) } catch { /* Current plans remain available in this tab. */ }
  }, [plans])

  const activePlan = plans.find((plan) => plan.id === activePlanId) || plans[0] || null
  const activePlanDays = activePlan?.schedule || []
  const totalTasks = activePlanDays.reduce((sum, day) => sum + day.tasks.length, 0)
  const completedTasks = activePlanDays.reduce((sum, day) => sum + day.tasks.filter((task) => task.completed).length, 0)
  const completion = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0
  const today = todayKey()
  const daysLeft = activePlan ? Math.max(0, dayDistance(today, activePlan.examDate)) : 0
  const futureDays = activePlanDays.filter((day) => day.date >= today)
  const visibleDays = futureDays.slice(0, 7)
  const laterDays = futureDays.slice(7)
  const pastDays = activePlanDays.filter((day) => day.date < today).slice().reverse()
  const usedMinutes = useMemo(() => (day) => day.tasks.reduce((sum, task) => sum + task.minutes, 0), [])

  async function persistNewPlan(values) {
    setIsSaving(true)
    setError('')
    try {
      const schedule = buildSchedule(values.examDate, values.dailyMinutes, values.topics)
      const plan = accessToken
        ? await createStudyPlan({ ...values, schedule }, accessToken)
        : { id: crypto.randomUUID(), ...values, schedule, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setPlans((current) => [plan, ...current])
      setActivePlanId(plan.id)
      setShowCreator(false)
      onToast('Your study plan is ready. You can change tasks any time.')
    } catch (saveError) {
      setError(saveError.message || 'Could not create your plan. Please try again.')
    } finally { setIsSaving(false) }
  }

  async function persistPlan(updatedPlan, successMessage = '') {
    const previousPlans = plans
    setPlans((current) => current.map((plan) => plan.id === updatedPlan.id ? updatedPlan : plan))
    setIsSaving(true)
    setError('')
    try {
      if (accessToken) {
        const savedPlan = await updateStudyPlan(updatedPlan.id, updatedPlan, accessToken)
        setPlans((current) => current.map((plan) => plan.id === savedPlan.id ? savedPlan : plan))
      }
      if (successMessage) onToast(successMessage)
      return true
    } catch (saveError) {
      setPlans(previousPlans)
      setError(saveError.message || 'Could not save that change. Please retry.')
      return false
    } finally { setIsSaving(false) }
  }

  async function saveSettings(values) {
    if (!activePlan) return
    try {
      const schedule = buildSchedule(values.examDate, values.dailyMinutes, values.topics, activePlan.schedule)
      const saved = await persistPlan({ ...activePlan, ...values, schedule }, 'Your schedule has been updated.')
      if (saved) setEditingSettings(false)
    } catch (scheduleError) { setError(scheduleError.message) }
  }

  async function toggleTask(dayDate, taskId) {
    const schedule = activePlan.schedule.map((day) => day.date !== dayDate ? day : { ...day, tasks: day.tasks.map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task) })
    await persistPlan({ ...activePlan, schedule })
  }

  async function removeTask(dayDate, taskId) {
    const schedule = activePlan.schedule.map((day) => day.date !== dayDate ? day : { ...day, tasks: day.tasks.filter((task) => task.id !== taskId) })
    setEditingTask(null)
    await persistPlan({ ...activePlan, schedule }, 'Study task removed.')
  }

  async function saveTaskEdit(event) {
    event.preventDefault()
    if (!editingTask || !taskTitle.trim()) return
    const sourceDay = activePlan.schedule.find((entry) => entry.date === editingTask.originalDate)
    const targetDay = activePlan.schedule.find((entry) => entry.date === editingTask.date)
    const minutes = Number(taskMinutes)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
      setError('A study task must be between 5 and 240 minutes.')
      return
    }
    if (!sourceDay || !targetDay) {
      setError('Choose a day that is included in this schedule.')
      return
    }
    const targetUsedMinutes = usedMinutes(targetDay) - (sourceDay.date === targetDay.date ? editingTask.originalMinutes : 0)
    if (targetUsedMinutes + minutes > activePlan.dailyMinutes) {
      setError(`This day has ${activePlan.dailyMinutes} minutes available. Reduce another task first.`)
      return
    }
    const schedule = activePlan.schedule.map((entry) => {
      if (entry.date === sourceDay.date && sourceDay.date === targetDay.date) return { ...entry, tasks: entry.tasks.map((task) => task.id === editingTask.taskId ? { ...task, title: taskTitle.trim(), minutes, customized: true } : task) }
      if (entry.date === sourceDay.date) return { ...entry, tasks: entry.tasks.filter((task) => task.id !== editingTask.taskId) }
      if (entry.date === targetDay.date) {
        const task = sourceDay.tasks.find((item) => item.id === editingTask.taskId)
        return { ...entry, tasks: [...entry.tasks, { ...task, title: taskTitle.trim(), minutes, customized: true }] }
      }
      return entry
    })
    const saved = await persistPlan({ ...activePlan, schedule }, 'Study task updated.')
    if (saved) setEditingTask(null)
  }

  async function addTask(event, dayDate) {
    event.preventDefault()
    if (!taskTitle.trim()) return
    const day = activePlan.schedule.find((entry) => entry.date === dayDate)
    if (!day || day.tasks.length >= 8) return setError('A day can have up to eight study tasks.')
    const minutes = Number(taskMinutes)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return setError('A study task must be between 5 and 240 minutes.')
    if (usedMinutes(day) + minutes > activePlan.dailyMinutes) return setError('That would exceed the daily time you set. Remove a task or adjust the available time first.')
    const newTask = { id: crypto.randomUUID(), title: taskTitle.trim(), minutes, completed: false, customized: true }
    const schedule = activePlan.schedule.map((entry) => entry.date !== dayDate ? entry : { ...entry, tasks: [...entry.tasks, newTask] })
    const saved = await persistPlan({ ...activePlan, schedule }, 'Study task added.')
    if (saved) { setAddingTaskDate(''); setTaskTitle('') }
  }

  async function removePlan() {
    if (!activePlan || !window.confirm(`Delete “${activePlan.title}” and all its schedule tasks?`)) return
    setIsSaving(true)
    setError('')
    try {
      if (accessToken) await deleteStudyPlan(activePlan.id, accessToken)
      const remaining = plans.filter((plan) => plan.id !== activePlan.id)
      setPlans(remaining)
      setActivePlanId(remaining[0]?.id || '')
      setShowCreator(remaining.length === 0)
      onToast('Study plan deleted.')
    } catch (deleteError) { setError(deleteError.message || 'Could not delete this plan.') }
    finally { setIsSaving(false) }
  }

  function renderDay(day, isPast = false) {
    const parsedDate = new Date(`${day.date}T12:00:00`)
    const remainingMinutes = Math.max(0, activePlan.dailyMinutes - usedMinutes(day))
    return (
      <article className={`plan-day-card ${day.date === today ? 'plan-day-today' : ''} ${isPast ? 'plan-day-past' : ''}`} key={day.date}>
        <div className="plan-day-heading"><div><span className="plan-day-weekday">{parsedDate.toLocaleDateString(undefined, { weekday: 'long' })}{day.date === today ? ' · TODAY' : ''}</span><strong>{parsedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</strong></div><span className="plan-day-time">{usedMinutes(day)} / {activePlan.dailyMinutes} min</span></div>
        <div className="plan-day-tasks">
          {day.tasks.map((task) => editingTask?.originalDate === day.date && editingTask.taskId === task.id ? (
            <form className="plan-task-edit" key={task.id} onSubmit={saveTaskEdit}>
              <input className="text-input" aria-label="Edit task name" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} autoFocus />
              <label><span className="sr-only">Task duration in minutes</span><input className="text-input" type="number" min="5" max={Math.min(240, activePlan.dailyMinutes)} value={taskMinutes} onChange={(event) => setTaskMinutes(Number(event.target.value))} /></label>
              <label><span className="sr-only">Move task to date</span><input className="text-input" type="date" min={editingTask.originalDate < today ? editingTask.originalDate : today} max={activePlan.examDate} value={editingTask.date} onChange={(event) => setEditingTask((current) => ({ ...current, date: event.target.value }))} /></label>
              <button className="button button-primary" type="submit" disabled={isSaving}>Save</button><button className="quiet-button" type="button" onClick={() => setEditingTask(null)}>Cancel</button>
            </form>
          ) : (
            <div className={`plan-task-row ${task.completed ? 'is-complete' : ''}`} key={task.id}>
              <label className="plan-task-check"><input type="checkbox" checked={task.completed} onChange={() => toggleTask(day.date, task.id)} disabled={isSaving} /><span className="plan-checkbox"><Icon name="check" size={13} /></span><span className="plan-task-title">{task.title}</span></label>
              <span className="plan-task-minutes">{task.minutes}m</span>
              <button className="plan-task-action" type="button" aria-label={`Edit ${task.title}`} disabled={isSaving} onClick={() => { setEditingTask({ date: day.date, originalDate: day.date, taskId: task.id, originalMinutes: task.minutes }); setTaskTitle(task.title); setTaskMinutes(task.minutes); setError('') }}><Icon name="edit" size={14} /></button>
              <button className="plan-task-action plan-task-delete" type="button" aria-label={`Remove ${task.title}`} disabled={isSaving} onClick={() => removeTask(day.date, task.id)}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          {!day.tasks.length && <p className="plan-rest-day">A free day. Add a study block if you want.</p>}
        </div>
        {addingTaskDate === day.date ? (
          <form className="plan-add-task-form" onSubmit={(event) => addTask(event, day.date)}>
            <input className="text-input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={160} placeholder="What do you want to study?" aria-label="New task name" autoFocus required />
            <label><span className="sr-only">Task duration in minutes</span><input className="text-input" type="number" min="5" max={Math.max(5, Math.min(120, remainingMinutes))} value={taskMinutes} onChange={(event) => setTaskMinutes(Number(event.target.value))} /></label>
            <button className="button button-primary" type="submit" disabled={isSaving || !remainingMinutes}>Add</button><button className="quiet-button" type="button" onClick={() => { setAddingTaskDate(''); setTaskTitle('') }}>Cancel</button>
          </form>
        ) : <button className="plan-add-task-button" type="button" onClick={() => { setAddingTaskDate(day.date); setTaskTitle(''); setTaskMinutes(Math.min(25, remainingMinutes || 25)); setError('') }} disabled={isSaving || day.tasks.length >= 8 || remainingMinutes < 5}><Icon name="plus" size={14} /> {remainingMinutes >= 5 ? 'Add a task' : 'Daily time allocated'}</button>}
        {isPast && <span className="plan-past-label">Past study day</span>}
      </article>
    )
  }

  return (
    <div className="page workspace-page study-planner-page">
      <div className="page-kicker"><span className="kicker-dot" /> YOUR PERSONAL STUDY PLAN</div>
      <div className="page-title-row study-planner-title-row"><div><h1>Make time for what matters.</h1><p className="page-subtitle">A realistic schedule you can shape, follow, and adjust as life happens.</p></div>{activePlan && !showCreator && <button className="button button-primary" type="button" onClick={() => { setShowCreator(true); setEditingSettings(false); setError('') }}><Icon name="plus" size={15} /> New study plan</button>}</div>

      {loadError && <div className="form-error" role="alert">{loadError}<button className="quiet-button" type="button" onClick={() => { setLoadError(''); setIsLoading(true); getStudyPlans(accessToken).then((next) => { setPlans(next); setActivePlanId(next[0]?.id || '') }).catch((requestError) => setLoadError(requestError.message)).finally(() => setIsLoading(false)) }}>Retry</button></div>}
      {error && <div className="form-error" role="alert"><Icon name="close" size={15} /> {error}<button className="quiet-button" type="button" onClick={() => setError('')}>Dismiss</button></div>}
      {isLoading ? <div className="plan-loading input-card" role="status"><span className="button-spinner" /><strong>Loading your study plans…</strong></div> : showCreator || !activePlan ? (
        <PlanForm key={activePlan ? `new-${activePlan.id}` : 'new-plan'} initialPlan={null} onCancel={activePlan ? () => setShowCreator(false) : undefined} onSubmit={persistNewPlan} isSaving={isSaving} />
      ) : editingSettings ? (
        <PlanForm key={`edit-${activePlan.id}`} initialPlan={activePlan} onCancel={() => setEditingSettings(false)} onSubmit={saveSettings} isSaving={isSaving} />
      ) : (
        <>
          {plans.length > 1 && <label className="plan-selector"><span className="field-label">Your plans</span><select className="text-input" value={activePlan.id} onChange={(event) => { setActivePlanId(event.target.value); setEditingTask(null); setAddingTaskDate(''); setError('') }}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label>}
          <section className="plan-overview-card">
            <div className="plan-overview-top"><div><span className="result-overline">YOUR EXAM COUNTDOWN</span><h2>{activePlan.title}</h2><p>Exam date: {new Date(`${activePlan.examDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div><div className="plan-overview-actions"><button className="button button-secondary" type="button" onClick={() => setEditingSettings(true)} disabled={isSaving}><Icon name="edit" size={15} /> Edit plan</button><button className="plan-delete-button" type="button" onClick={removePlan} disabled={isSaving} aria-label="Delete study plan"><Icon name="trash" size={16} /></button></div></div>
            <div className="plan-overview-stats"><div><strong>{daysLeft}</strong><span>{daysLeft === 1 ? 'day to exam' : 'days to exam'}</span></div><div><strong>{activePlan.dailyMinutes}<small> min</small></strong><span>daily time budget</span></div><div><strong>{completion}%</strong><span>{completedTasks} of {totalTasks} tasks done</span></div></div>
            <div className="plan-progress-track" role="progressbar" aria-label="Study plan completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={completion}><i style={{ width: `${completion}%` }} /></div>
            <div className="plan-topic-tags"><span>TOPICS</span>{activePlan.topics.map((topic) => <span className="plan-topic-tag" key={topic}>{topic}</span>)}</div>
          </section>

          <div className="plan-schedule-heading"><div><span className="result-overline">YOUR SCHEDULE</span><h2>One manageable session at a time.</h2><p>Check off completed tasks, edit the plan, or add your own study blocks.</p></div><span className="plan-schedule-count"><Icon name="calendar" size={15} /> {activePlan.schedule.length} days planned</span></div>
          {!futureDays.length ? <div className="plan-empty-future"><Icon name="check" size={18} /><strong>Your exam date has passed.</strong><span>Update the date in Edit plan to build a new schedule.</span></div> : <section className="plan-days-list" aria-label="Upcoming study schedule">{visibleDays.map((day) => renderDay(day))}</section>}
          {laterDays.length > 0 && <details className="plan-more-days"><summary>See the rest of your schedule ({laterDays.length} days)</summary><section className="plan-days-list">{laterDays.map((day) => renderDay(day))}</section></details>}
          {pastDays.length > 0 && <details className="plan-more-days plan-past-days"><summary>Earlier days ({pastDays.length})</summary><section className="plan-days-list">{pastDays.map((day) => renderDay(day, true))}</section></details>}
          <div className="study-plan-coach-note"><span className="study-plan-coach-icon"><Icon name="lightbulb" size={17} /></span><span><strong>Keep it sustainable.</strong><small>If a day gets busy, move a task or change your time budget. A useful plan is one you can actually follow.</small></span></div>
        </>
      )}
    </div>
  )
}

export default StudyPlanPage
