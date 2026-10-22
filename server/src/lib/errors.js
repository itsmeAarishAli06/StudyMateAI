export class AppError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function validateText(value, field, { min = 1, max, label = field } = {}) {
  if (typeof value !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} must be a string.`)
  }

  const text = value.trim()
  if (text.length < min) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} must contain at least ${min} character${min === 1 ? '' : 's'}.`)
  }
  if (max && text.length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} must be ${max.toLocaleString()} characters or fewer.`)
  }
  return text
}
