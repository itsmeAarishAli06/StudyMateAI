import { useRef, useState } from 'react'
import Icon from './Icon.jsx'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 12_000
const MAX_PDF_PAGES = 80

function fileTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 80)
}

async function readPdf(file) {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
  try {
    const pdf = await loadingTask.promise
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`This PDF has ${pdf.numPages} pages. Please use a document with ${MAX_PDF_PAGES} pages or fewer.`)
    }

    const pages = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`)
        .join('')
      pages.push(pageText)
    }
    return pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  } finally {
    await loadingTask.destroy()
  }
}

function DocumentImport({ onImport, disabled = false }) {
  const inputRef = useRef(null)
  const [isReading, setIsReading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setMessage('')
    setError('')
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'txt', 'md'].includes(extension)) {
      setError('Choose a PDF, TXT, or Markdown file.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('This file is larger than 10 MB. Choose a smaller document.')
      return
    }

    setIsReading(true)
    try {
      const extractedText = extension === 'pdf' ? await readPdf(file) : await file.text()
      if (!extractedText.trim()) {
        setError(extension === 'pdf'
          ? 'No selectable text was found. Scanned image PDFs need OCR; paste the text or use a searchable PDF.'
          : 'This file does not contain any readable text.')
        return
      }
      const truncated = extractedText.length > MAX_TEXT_CHARS
      const text = extractedText.slice(0, MAX_TEXT_CHARS)
      onImport(text, fileTitle(file.name))
      setMessage(truncated
        ? `Imported the first ${MAX_TEXT_CHARS.toLocaleString()} characters from ${file.name}.`
        : `Imported ${file.name}. The file was read locally; extracted text is sent when you create a study result.`)
    } catch (readError) {
      setError(readError.message || 'Could not read this document. Try another file or paste the text.')
    } finally {
      setIsReading(false)
    }
  }

  return (
    <div className="document-importer">
      <input ref={inputRef} className="sr-only" type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={handleFile} disabled={disabled || isReading} />
      <button className="document-import-button" type="button" onClick={() => inputRef.current?.click()} disabled={disabled || isReading}>
        {isReading ? <><span className="document-spinner" /> Reading document…</> : <><Icon name="upload" size={15} /> Upload notes or PDF</>}
      </button>
      <span className="document-import-hint">PDF, TXT, or MD · up to 10 MB</span>
      {message && <span className="document-import-message" role="status">{message}</span>}
      {error && <span className="document-import-error" role="alert">{error}</span>}
    </div>
  )
}

export default DocumentImport
