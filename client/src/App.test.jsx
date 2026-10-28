import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App, { AuthScreen } from './App.jsx'
import { createQuiz, createSummary, getHealth, sendChatMessage } from './lib/api.js'

vi.mock('./lib/api.js', () => ({
  createStudyItem: vi.fn(),
  createQuiz: vi.fn(),
  createSummary: vi.fn(),
  getHealth: vi.fn(),
  getStudyItems: vi.fn(),
  sendChatMessage: vi.fn(),
}))

vi.mock('./lib/auth.js', () => ({
  authConfigured: false,
  getSession: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}))

const summaryResult = {
  lead: 'Cellular respiration turns glucose into usable energy.',
  points: ['Glycolysis starts in the cytoplasm.', 'The Krebs cycle transfers high-energy electrons.'],
  takeaway: 'Oxygen helps cells make much more ATP.',
}

const mockQuiz = {
  title: 'Photosynthesis quick check',
  questions: [
    { question: 'Which pigment captures light?', options: ['Chlorophyll', 'Melanin'], answer: 0, explanation: 'Chlorophyll absorbs light energy.' },
    { question: 'Which gas is released?', options: ['Oxygen', 'Nitrogen'], answer: 0, explanation: 'Water splitting releases oxygen.' },
  ],
}

function navigateTo(label) {
  fireEvent.click(screen.getAllByRole('button', { name: label })[0])
}

describe('StudyMate MVP screens', () => {
  beforeEach(() => {
    window.localStorage.clear()
    getHealth.mockResolvedValue({ status: 'ok', aiProvider: 'gemini' })
    sendChatMessage.mockResolvedValue('Mitochondria help cells make ATP from food.')
    createSummary.mockResolvedValue({ title: 'Untitled study summary', sourceText: 'sample notes', content: summaryResult })
    createQuiz.mockResolvedValue(mockQuiz)
  })

  it('shows the overview, guest profile menu, and navigation actions', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: /Good morning, learner/ })).toBeInTheDocument()
    expect(screen.queryByText(/AI READY|GEMINI CONFIGURED/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open guest profile menu' }))
    expect(screen.getByRole('region', { name: 'Account and daily usage' })).toHaveTextContent('Guest workspace')
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ask your AI tutor/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Summarize your notes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Practice with a quiz/ })).toBeInTheDocument()
    expect(screen.getByText('Your study history will show up here')).toBeInTheDocument()
    expect(screen.getByText(/StudyMate AI uses artificial intelligence to generate educational content/)).toBeInTheDocument()
  })

  it('shows the tutor empty state, loading response, and recoverable error', async () => {
    const user = userEvent.setup()
    render(<App />)
    navigateTo('AI tutor')

    expect(screen.getByRole('heading', { name: 'Hey, what are you working on?' })).toBeInTheDocument()
    let resolveChat
    sendChatMessage.mockImplementationOnce(() => new Promise((resolve) => { resolveChat = resolve }))
    await user.click(screen.getByRole('button', { name: 'Explain cellular respiration in simple terms' }))
    expect(screen.getByText('StudyMate is thinking')).toBeInTheDocument()
    resolveChat('Mitochondria help cells make ATP from food.')
    expect(await screen.findByText('Mitochondria help cells make ATP from food.')).toBeInTheDocument()
    expect(screen.getByText(/AI-generated response. Verify important facts/)).toBeInTheDocument()

    sendChatMessage.mockRejectedValueOnce(new Error('Gemini is temporarily unavailable.'))
    await user.type(screen.getByLabelText('Your question'), 'Explain mitochondria')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByText('Gemini is temporarily unavailable.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.getByRole('heading', { name: 'Hey, what are you working on?' })).toBeInTheDocument()
  })

  it('summarizes notes, validates empty input, and saves the result', async () => {
    const user = userEvent.setup()
    render(<App />)
    navigateTo('Summarizer')

    expect(screen.getByText('Your clear version starts here.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Create my summary/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Paste your notes first')

    await user.click(screen.getByRole('button', { name: 'Use sample notes' }))
    await user.type(screen.getByLabelText(/Give it a name/), 'Respiration revision')
    let resolveSummary
    createSummary.mockImplementationOnce(() => new Promise((resolve) => { resolveSummary = resolve }))
    await user.click(screen.getByRole('button', { name: /Create my summary/ }))
    expect(screen.getByText('Finding the big picture...')).toBeInTheDocument()
    resolveSummary({ title: 'Respiration revision', sourceText: 'sample notes', content: summaryResult })
    expect(await screen.findByText(summaryResult.lead)).toBeInTheDocument()
    expect(screen.getByText(/AI-generated study material may contain errors/)).toBeInTheDocument()
    expect(createSummary).toHaveBeenCalledWith(expect.stringContaining('Cellular respiration'), 'Respiration revision', undefined)
    await user.click(screen.getByRole('button', { name: /Save summary/ }))
    expect(await screen.findByText('Summary saved to your study history')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Saved to history/ })).toBeDisabled()
    createSummary.mockRejectedValueOnce(new Error('The AI service is temporarily unavailable.'))
    await user.click(screen.getByRole('button', { name: /Create my summary/ }))
    expect(await screen.findByText('The AI service is temporarily unavailable.')).toBeInTheDocument()
    navigateTo('Study history')
    expect(screen.getByText('Respiration revision')).toBeInTheDocument()
  })

  it('generates a quiz, checks answers, shows explanations, and saves it', async () => {
    const user = userEvent.setup()
    render(<App />)
    navigateTo('Quiz maker')

    expect(screen.getByRole('heading', { name: 'What are we practicing?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Build my quiz/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Add a topic')
    await user.type(screen.getByLabelText('Topic or subject'), 'Photosynthesis')
    createQuiz.mockRejectedValueOnce(new Error('The AI service is temporarily unavailable.'))
    await user.click(screen.getByRole('button', { name: /Build my quiz/ }))
    expect(await screen.findByText('The AI service is temporarily unavailable.')).toBeInTheDocument()
    let resolveQuiz
    createQuiz.mockImplementationOnce(() => new Promise((resolve) => { resolveQuiz = resolve }))
    await user.click(screen.getByRole('button', { name: /Build my quiz/ }))
    expect(screen.getByText('Putting your practice set together...')).toBeInTheDocument()
    resolveQuiz(mockQuiz)
    expect(await screen.findByText('Which pigment captures light?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Check my answers' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an answer for every question')
    const questions = screen.getAllByRole('article')
    await user.click(within(questions[0]).getByRole('button', { name: /Chlorophyll/ }))
    await user.click(within(questions[1]).getByRole('button', { name: /Oxygen/ }))
    await user.click(screen.getByRole('button', { name: 'Check my answers' }))
    expect(await screen.findByText('Perfect score. You have this down.')).toBeInTheDocument()
    expect(screen.getAllByText(/Chlorophyll absorbs light energy/).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Save this quiz/ }))
    expect(await screen.findByText('Quiz saved to your study history')).toBeInTheDocument()

    navigateTo('Study history')
    expect(screen.getByText('Photosynthesis quick check')).toBeInTheDocument()
    navigateTo('Quiz maker')
    await user.click(screen.getByRole('tab', { name: 'Study material' }))
    await user.type(screen.getByLabelText('Paste study material'), 'Photosynthesis uses light energy to make glucose.')
    await user.click(screen.getByRole('button', { name: /Build my quiz/ }))
    expect(await screen.findByText('Which pigment captures light?')).toBeInTheDocument()
    expect(screen.getByText(/AI-generated questions, answers, and explanations may occasionally contain errors/)).toBeInTheDocument()
    expect(createQuiz).toHaveBeenLastCalledWith({ notes: 'Photosynthesis uses light energy to make glucose.', sourceType: 'notes', questionCount: 5, difficulty: 'challenging' }, undefined)
  })

  it('filters history and provides a no-results empty state', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('studymate.savedItems', JSON.stringify([
      { id: 'summary-fixture', type: 'summary', title: 'Cellular respiration overview', preview: 'Glucose releases energy.', dateLabel: 'Today', sourceText: 'Notes', content: summaryResult },
      { id: 'quiz-fixture', type: 'quiz', title: 'Cell biology: energy and organelles', preview: '5 questions about ATP.', dateLabel: 'Yesterday', score: '4 / 5', questions: [{ question: 'Where does glycolysis take place?', options: ['Cytoplasm', 'Nucleus', 'Golgi apparatus', 'Lysosome'], answer: 0, explanation: 'It takes place in the cytoplasm.' }] },
      { id: 'photosynthesis-fixture', type: 'summary', title: 'Photosynthesis: light reactions', preview: 'Light reactions make ATP and NADPH.', dateLabel: 'Earlier', content: summaryResult },
    ]))
    render(<App />)
    navigateTo('Study history')

    expect(screen.getByRole('heading', { name: 'Study history.' })).toBeInTheDocument()
    expect(screen.getByText('Photosynthesis: light reactions')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Quizzes/ }))
    expect(screen.getByText('Cell biology: energy and organelles')).toBeInTheDocument()
    expect(screen.queryByText('Photosynthesis: light reactions')).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Search saved items' }), 'no matching topic')
    expect(screen.getByRole('heading', { name: 'No matches just yet.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Cell biology: energy and organelles')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /All items/ }))
    await user.click(screen.getAllByRole('button', { name: /Read summary/ })[0])
    expect(screen.getByRole('heading', { name: 'Cellular respiration overview' })).toBeInTheDocument()
    navigateTo('Study history')
    await user.click(screen.getAllByRole('button', { name: /Open quiz/ })[0])
    expect(screen.getByRole('heading', { name: /Cell biology: energy and organelles/ })).toBeInTheDocument()
    expect(screen.getByText('Where does glycolysis take place?')).toBeInTheDocument()
  })
})

describe('StudyMate password recovery screens', () => {
  it('lets a user request a reset link without revealing whether the email is registered', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue('If an account exists for this email, a password reset link will be sent shortly.')
    render(<AuthScreen onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }))
    expect(screen.getByRole('heading', { name: 'Reset your password.' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email address'), 'learner@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(onSubmit).toHaveBeenCalledWith('forgot', 'learner@example.com', '')
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists for this email')
  })

  it('requires matching new passwords and confirms a successful password update', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue('Your password has been updated.')
    const onRecoveryComplete = vi.fn()
    render(<AuthScreen initialMode="reset" email="learner@example.com" onSubmit={onSubmit} onRecoveryComplete={onRecoveryComplete} />)

    await user.type(screen.getByLabelText('New password'), 'new-study-password')
    await user.type(screen.getByLabelText('Confirm new password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Your passwords do not match. Check both fields and try again.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Confirm new password'))
    await user.type(screen.getByLabelText('Confirm new password'), 'new-study-password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))
    expect(onSubmit).toHaveBeenCalledWith('reset', 'learner@example.com', 'new-study-password')
    expect(await screen.findByText('Password updated')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to StudyMate' }))
    expect(onRecoveryComplete).toHaveBeenCalledOnce()
  })
})
