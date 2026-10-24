import { generateJson } from './ai.js'
import { AppError } from '../lib/errors.js'

const sampleQuiz = [
  { question: 'What is the best first step when studying a new topic?', options: ['Identify its main idea', 'Memorize every sentence', 'Skip unfamiliar terms', 'Read only the conclusion'], answer: 0, explanation: 'Finding the main idea gives the supporting details a structure.' },
  { question: 'Why should you connect supporting details to a main idea?', options: ['It makes notes longer', 'It helps explain how the ideas fit together', 'It avoids reviewing', 'It replaces practice'], answer: 1, explanation: 'Connecting details helps build a coherent understanding of the topic.' },
  { question: 'Which activity is a useful way to check understanding?', options: ['Reread without pausing', 'Explain the concept in your own words', 'Highlight every line', 'Skip practice questions'], answer: 1, explanation: 'Explaining a concept from memory reveals what you understand and what needs review.' },
  { question: 'What should a good summary preserve?', options: ['Every original sentence', 'The key ideas and their relationships', 'Only examples', 'Unrelated details'], answer: 1, explanation: 'A summary keeps the core information while leaving out less important detail.' },
  { question: 'What is retrieval practice?', options: ['Trying to recall information from memory', 'Copying notes word for word', 'Reading a heading repeatedly', 'Organizing files'], answer: 0, explanation: 'Retrieval practice strengthens learning by asking you to bring information to mind.' },
]

const photosynthesisQuiz = [
  { question: 'Which pigment captures light energy for photosynthesis?', options: ['Chlorophyll', 'Hemoglobin', 'Keratin', 'Melanin'], answer: 0, explanation: 'Chlorophyll absorbs light energy in chloroplasts.' },
  { question: 'Where do the light-dependent reactions take place?', options: ['Thylakoid membranes', 'Mitochondrial matrix', 'Cytoplasm', 'Nucleus'], answer: 0, explanation: 'The light-dependent reactions happen in the thylakoid membranes.' },
  { question: 'Which gas is released when water is split?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen sulfide'], answer: 0, explanation: 'Water splitting releases oxygen, electrons, and protons.' },
  { question: 'What do ATP and NADPH provide to the Calvin cycle?', options: ['Energy and reducing power', 'Carbon atoms', 'Chlorophyll', 'Oxygen'], answer: 0, explanation: 'ATP and NADPH carry energy and reducing power to the Calvin cycle.' },
  { question: 'What molecule supplies carbon to build sugars?', options: ['Carbon dioxide', 'Oxygen', 'Water', 'ATP'], answer: 0, explanation: 'The Calvin cycle fixes carbon from carbon dioxide into organic molecules.' },
]

const answerSchema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
}
const summarySchema = {
  type: 'object',
  properties: {
    lead: { type: 'string' },
    points: { type: 'array', items: { type: 'string' } },
    takeaway: { type: 'string' },
  },
  required: ['lead', 'points', 'takeaway'],
}
const quizSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation: { type: 'string' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['title', 'questions'],
}

function normalizeSummary(value) {
  if (!value || typeof value !== 'object' || typeof value.lead !== 'string' || !Array.isArray(value.points) || !value.points.length || typeof value.takeaway !== 'string') return null
  if (value.points.some((point) => typeof point !== 'string')) return null
  return { lead: value.lead, points: value.points.slice(0, 8), takeaway: value.takeaway }
}

function normalizeQuestions(value, count) {
  if (!Array.isArray(value) || value.length !== count) return null
  const valid = value.every((question) => question && typeof question.question === 'string'
    && Array.isArray(question.options) && question.options.length === 4
    && question.options.every((option) => typeof option === 'string')
    && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4
    && typeof question.explanation === 'string')
  return valid ? value : null
}

export async function answerQuestion(message, history = []) {
  const prompt = `You are StudyMate, a friendly and accurate study tutor. Explain clearly at an appropriate student level. If the question is ambiguous, say what you assume. Answer in plain text in 2-5 concise paragraphs. Use the conversation context when relevant. Return JSON with one string field: answer.\nConversation: ${JSON.stringify(history.slice(-10))}\nStudent: ${message}`
  const generated = await generateJson(prompt, answerSchema)
  if (generated) {
    if (typeof generated.answer !== 'string' || !generated.answer.trim()) throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI service returned an invalid response. Please try again.')
    return generated.answer.trim()
  }

  const normalized = message.toLowerCase()
  if (normalized.includes('mitochond')) return 'Mitochondria help cells turn energy stored in food into ATP, a form cells can use. They break down fuel molecules and use oxygen during aerobic respiration. Think of them as energy conversion stations inside the cell.'
  if (normalized.includes('photosynth')) return 'Photosynthesis lets plants use light energy to make sugar. Chlorophyll captures sunlight, and the plant uses that energy to combine carbon dioxide and water into glucose. Oxygen is released as a byproduct.'
  if (normalized.includes('mitosis') || normalized.includes('meiosis')) return 'Mitosis makes two genetically similar body cells for growth and repair. Meiosis makes reproductive cells with half the usual number of chromosomes. A useful shortcut: mitosis maintains; meiosis mixes and halves.'
  return `A useful way to approach ${message.replace(/[?.!]+$/, '')} is to identify the main idea, then connect each detail to what it helps explain. Try describing the idea in your own words; if you share a specific passage or class level, I can make the explanation more focused.`
}

export async function summarizeNotes(notes) {
  const generated = await generateJson(`Create a concise study guide from the supplied notes. Do not add unsupported facts. Return lead, 3-6 concise points, and one takeaway. Notes:\n${notes}`, summarySchema)
  if (generated) {
    const summary = normalizeSummary(generated)
    if (!summary) throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI service returned an invalid response. Please try again.')
    return summary
  }

  const sentences = notes.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
  return {
    lead: sentences.slice(0, 2).join(' ') || 'Your notes introduce a core idea and explain how its parts fit together.',
    points: sentences.slice(2, 6).length ? sentences.slice(2, 6) : ['Identify the main concept.', 'Connect supporting details to the main idea.'],
    takeaway: sentences.at(-1) || 'Review the key concept and connect it to its supporting details.',
  }
}

export async function createQuiz(source, questionCount, sourceType = 'topic', difficulty = 'standard') {
  const topic = sourceType === 'topic' ? source : 'Study material'
  const difficultyGuide = {
    easy: 'Use foundational recall and clear, direct wording. Avoid trick questions.',
    standard: 'Use a balanced mix of recall and understanding questions.',
    challenging: 'Use deeper application, comparison, and reasoning while keeping every answer supported by the source.',
  }[difficulty] || 'Use a balanced mix of recall and understanding questions.'
  const generated = await generateJson(`Create exactly ${questionCount} multiple-choice study questions based only on this ${sourceType === 'topic' ? 'topic' : 'study material'}. Difficulty: ${difficulty}. ${difficultyGuide} Each question must have exactly 4 options, a zero-based answer index, and an explanation. Topic: ${topic}\nMaterial:\n${sourceType === 'notes' ? source : '(No notes supplied)'}`, quizSchema)
  let questions
  let title
  if (generated) {
    questions = normalizeQuestions(generated.questions, questionCount)
    title = typeof generated.title === 'string' ? generated.title.trim() : ''
    if (!questions || !title) throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI service returned an invalid response. Please try again.')
  } else {
    const bank = /photosynthesis|chloroplast|light reaction/i.test(source) ? photosynthesisQuiz : sampleQuiz
    questions = bank.slice(0, questionCount)
    title = `${topic.length > 55 ? 'Study material' : topic} quick check`
  }
  return { title: title.slice(0, 120), questions, difficulty }
}
