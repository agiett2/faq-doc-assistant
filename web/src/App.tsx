import { useState } from 'react'

type Source = { id: number; file: string; page: number; text: string }
type Extraction = { id: number; status: string; issues: string[]; data: Record<string, unknown> }

export default function App() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [extraction, setExtraction] = useState<Extraction | null>(null)

  async function upload(file: File, url: string) {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(url, { method: 'POST', body: form })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  async function ask() {
    setAnswer('')
    setSources([])
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      // Read the SSE stream chunk by chunk
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? '' // keep any half-received event for next time
        for (const evt of events) {
          const type = evt.match(/^event: (.*)$/m)?.[1] ?? 'message'
          const data = evt.match(/^data: (.*)$/m)?.[1] ?? ''
          if (type === 'sources') setSources(JSON.parse(data))
          if (type === 'message') setAnswer(a => a + JSON.parse(data))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', fontFamily: 'system-ui', display: 'grid', gap: '2rem', textAlign: 'left' }}>
      <section>
        <h2>1. Upload FAQ documents</h2>
        <input type="file" accept="application/pdf" onChange={async e => {
          const file = e.target.files?.[0]
          if (!file) return
          setStatus('Indexing…')
          const r = await upload(file, '/api/documents')
          setStatus(`Indexed ${file.name}: ${r.chunks} chunks`)
        }} />
        <p>{status}</p>
      </section>

      <section>
        <h2>2. Ask a question</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ flex: 1 }} value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask() }}
            placeholder="e.g. How long do I have to return an item?" />
          <button onClick={ask} disabled={busy || !question}>Ask</button>
        </div>
        <p style={{ whiteSpace: 'pre-wrap' }}>{answer}</p>
        {sources.length > 0 && (
          <details>
            <summary>Sources</summary>
            <ol>
              {sources.map(s => (
                <li key={s.id}><b>{s.file}, p.{s.page}</b>: {s.text.slice(0, 200)}…</li>
              ))}
            </ol>
          </details>
        )}
      </section>

      <section>
        <h2>3. Extract an invoice</h2>
        <input type="file" accept="application/pdf" onChange={async e => {
          const file = e.target.files?.[0]
          if (file) setExtraction(await upload(file, '/api/extract'))
        }} />
        {extraction && (
          <div>
            <p>Status: <b style={{ color: extraction.status === 'auto_approved' ? 'green' : 'darkorange' }}>
              {extraction.status}</b></p>
            {extraction.issues.length > 0 && (
              <ul>{extraction.issues.map(i => <li key={i}>{i}</li>)}</ul>
            )}
            <pre>{JSON.stringify(extraction.data, null, 2)}</pre>
          </div>
        )}
      </section>
    </main>
  )
}