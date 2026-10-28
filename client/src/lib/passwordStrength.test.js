import { describe, expect, it } from 'vitest'
import { getPasswordStrength } from './passwordStrength.js'

describe('getPasswordStrength', () => {
  it('returns a neutral state before a password is entered', () => {
    expect(getPasswordStrength()).toMatchObject({ level: 'empty', label: 'Not set', barLevel: 0 })
  })

  it('flags short and commonly guessed passwords as weak', () => {
    expect(getPasswordStrength('abc').level).toBe('weak')
    expect(getPasswordStrength('Password123!').level).toBe('weak')
  })

  it('returns increasing strength for mixed, longer passwords', () => {
    expect(getPasswordStrength('learning1').level).toBe('fair')
    expect(getPasswordStrength('Learning123').level).toBe('good')
    expect(getPasswordStrength('Learning123!')).toMatchObject({ level: 'strong', barLevel: 4 })
  })
})
