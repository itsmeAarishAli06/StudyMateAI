import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExamPreparationPage from './ExamPreparationPage.jsx'
import { createExamAttempt } from '../lib/api.js'

vi.mock('../lib/api.js', () => ({
  createExamAttempt: vi.fn(),
  getExamAttempts: vi.fn(),
  submitExamAttempt: vi.fn(),
}))

const questions = [
  { topic: 'Biology', question: 'Which gas do plants release?', options: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'], answer: 1, explanation: 'Photosynthesis releases oxygen.' },
  { topic: 'Chemistry', question: 'What is the symbol for water?', options: ['H2O', 'CO2', 'O2', 'NaCl'], answer: 0, explanation: 'A water molecule contains two hydrogen atoms and one oxygen atom.' },
  { topic: 'Biology', question: 'Where does photosynthesis happen?', options: ['Chloroplast', 'Nucleus', 'Ribosome', 'Cell wall'], answer: 0, explanation: 'Chloroplasts contain the machinery for photosynthesis.' },
  { topic: 'Chemistry', question: 'Which particle has a negative charge?', options: ['Proton', 'Neutron', 'Electron', 'Nucleus'], answer: 2, explanation: 'Electrons carry a negative electric charge.' },
  { topic: 'Biology', question: 'What molecule stores genetic information?', options: ['DNA', 'ATP', 'Glucose', 'Water'], answer: 0, explanation: 'DNA stores hereditary information in cells.' },
]

describe('Exam Preparation answer review', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.confirm = vi.fn(() => true)
    createExamAttempt.mockReset().mockResolvedValue({
      id: null,
      title: 'Science exam',
      examDate: '2026-11-28',
      topics: ['Biology', 'Chemistry'],
      questionCount: questions.length,
      durationMinutes: 60,
      questions,
      localQuestions: questions,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    })
  })

  it('clearly distinguishes a correct choice, an incorrect choice, and its correction after submission', async () => {
    const user = userEvent.setup()
    render(<ExamPreparationPage onNavigate={vi.fn()} onPracticeTopic={vi.fn()} onToast={vi.fn()} />)

    await user.type(screen.getByLabelText('Exam name'), 'Science exam')
    await user.type(screen.getByLabelText(/Syllabus topics/), 'Biology\nChemistry')
    expect(screen.getByLabelText('Time limit')).toHaveValue('10')
    await user.selectOptions(screen.getByLabelText('Time limit'), '3')
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'challenging')
    await user.click(screen.getByRole('button', { name: /Generate timed mock exam/ }))

    expect(createExamAttempt).toHaveBeenCalledWith(expect.objectContaining({ durationMinutes: 3, difficulty: 'challenging' }), undefined)

    const firstQuestion = await screen.findByText(questions[0].question)
    const firstCard = firstQuestion.closest('article')
    await user.click(within(firstCard).getByRole('button', { name: /^B Oxygen$/ }))
    const secondQuestion = screen.getByText(questions[1].question)
    await user.click(within(secondQuestion.closest('article')).getByRole('button', { name: /^B CO2$/ }))

    await user.click(screen.getByRole('button', { name: /Submit exam/ }))

    expect(await screen.findByText(/Answer review/)).toBeInTheDocument()
    expect(document.querySelector('.exam-review-option.option-correct')).toHaveTextContent('Correct answer')
    expect(document.querySelector('.exam-review-option.option-incorrect')).toHaveTextContent('Your choice')
    expect(document.querySelector('.exam-review-your-answer')).toHaveTextContent('Your answer: CO2')
    expect(document.querySelectorAll('.answer-explanation')[1]).toHaveTextContent('Why: A water molecule contains two hydrogen atoms')
  })

  it('keeps the 30-second and 10-second warnings and auto-submits when time expires', () => {
    vi.useFakeTimers()
    const now = new Date('2026-10-28T12:00:00.000Z').getTime()
    vi.setSystemTime(now)
    const savedAttempt = {
      id: 'local-expiring-attempt',
      localOnly: true,
      title: 'Expiring science exam',
      examDate: '2026-11-28',
      topics: ['Biology', 'Chemistry'],
      questionCount: questions.length,
      durationMinutes: 60,
      questions,
      localQuestions: questions,
      status: 'in_progress',
      startedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 25_000).toISOString(),
    }
    window.localStorage.setItem('studymate.examAttempts', JSON.stringify([savedAttempt]))
    render(<ExamPreparationPage onNavigate={vi.fn()} onPracticeTopic={vi.fn()} onToast={vi.fn()} />)

    expect(screen.getByText(/30 seconds remaining/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(16_000))
    expect(screen.getByText(/10 seconds remaining/)).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByText('MOCK EXAM RESULTS')).toBeInTheDocument()
    expect(screen.getByText('Expiring science exam')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
