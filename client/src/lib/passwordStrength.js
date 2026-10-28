const commonPasswords = new Set([
  'password',
  'password1',
  'qwerty',
  'letmein',
  'welcome',
  'admin',
  '123456',
  '12345678',
])

/** A local, advisory estimate. The password is never sent anywhere by this helper. */
export function getPasswordStrength(password = '') {
  if (!password) {
    return {
      level: 'empty',
      label: 'Not set',
      barLevel: 0,
      hint: 'Aim for 8 or more characters and mix character types.',
    }
  }

  const normalized = password.toLowerCase()
  const common = commonPasswords.has(normalized)
    || normalized.startsWith('password')
    || /^(.)\1+$/.test(normalized)
    || /^(0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/.test(normalized)

  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z0-9]/.test(password)) score += 1

  if (common) score = Math.min(score, 1)
  const barLevel = score <= 1 ? 1 : score === 2 ? 2 : score <= 4 ? 3 : 4
  const level = ['empty', 'weak', 'fair', 'good', 'strong'][barLevel]
  const label = { weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong' }[level]

  let hint = 'Good mix of length and character types.'
  if (common) hint = 'Avoid common words, repeated characters, and easy patterns.'
  else if (password.length < 8) hint = 'Add a few more characters; aim for at least 8.'
  else if (!(/[a-z]/.test(password) && /[A-Z]/.test(password))) hint = 'Try mixing uppercase and lowercase letters.'
  else if (!/\d/.test(password)) hint = 'Add a number to make it harder to guess.'
  else if (!/[^a-zA-Z0-9]/.test(password)) hint = 'Add a symbol for an even stronger password.'

  return { level, label, barLevel, hint }
}
