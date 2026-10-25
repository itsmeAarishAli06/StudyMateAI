function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function getCurrentStreak(items, now = new Date()) {
  const activeDays = new Set()
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.createdAt) continue
    const date = new Date(item.createdAt)
    if (!Number.isNaN(date.getTime())) activeDays.add(localDayKey(date))
  }

  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  if (!activeDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)

  let streak = 0
  while (activeDays.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
