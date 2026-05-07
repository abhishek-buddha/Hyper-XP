import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const sec = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function ValidationBadge({ summary }) {
  if (!summary) return null
  return (
    <span className="val-badge">
      {summary.passed > 0 && <span className="badge-pass">✓{summary.passed}</span>}
      {summary.failed > 0 && <span className="badge-fail">✗{summary.failed}</span>}
      {summary.warnings > 0 && <span className="badge-warn">⚠{summary.warnings}</span>}
    </span>
  )
}

function HistoryEntry({ entry, isActive, onSelect, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const label = entry.batch_no || entry.filename
  const summary = entry.validation_summary

  return (
    <div
      className={`history-entry${isActive ? ' active' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(entry.id)}
    >
      <div className="entry-header">
        <span className="entry-label">{label}</span>
        {hovered && (
          <button
            className="entry-delete"
            onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
            title="Delete"
          >×</button>
        )}
      </div>
      <div className="entry-type">{entry.document_type}</div>
      <div className="entry-meta">
        <span className="entry-time">{timeAgo(entry.created_at)}</span>
        <ValidationBadge summary={summary} />
      </div>
    </div>
  )
}

function EditableCell({ value, confidence, onChange }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const tdClass = value == null ? 'cell-null' : confidence === 'low' ? 'cell-low' : ''

  const startEdit = () => { setDraft(value != null ? String(value) : ''); setEditing(true) }
  const commit = () => { setEditing(false); onChange(draft) }

  return (
    <td className={tdClass} onClick={!editing ? startEdit : undefined} title="Click to edit">
      {editing ? (
        <input
          className="cell-input"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        />
      ) : (
        <span className={value == null ? 'null-cell' : ''}>
          {value != null ? String(value) : '—'}
        </span>
      )}
    </td>
  )
}

function UploadZone({ file, loading, onFileSelect, onExtract }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = e => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.pdf')) onFileSelect(f)
  }

  return (
    <div className="upload-area">
      <div
        className={`drop-zone${drag ? ' drag-over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) onFileSelect(e.target.files[0]) }}
        />
        <div className="drop-icon">⬆</div>
        {file ? (
          <div className="file-chip">{file.name}</div>
        ) : (
          <>
            <p className="drop-label">Drop PDF here or click to browse</p>
            <p className="drop-hint">Pharmaceutical batch records, lab reports, specifications</p>
          </>
        )}
      </div>
      {file && (
        <button className="btn-extract" onClick={onExtract} disabled={loading}>
          {loading ? 'Extracting…' : 'Extract Data'}
        </button>
      )}
    </div>
  )
}

function DataPane({ result, onCellChange, onSave, saving }) {
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => { setActiveSheet(0) }, [result])

  if (!result) return null

  const summary = result.validation_summary
  const sheet = result.sheets[activeSheet]

  return (
    <div className="data-pane">
      {summary && (summary.total > 0) && (
        <div className="val-bar">
          {summary.passed > 0 && <span className="val-pass">✓ {summary.passed} passed</span>}
          {summary.failed > 0 && <span className="val-fail">✗ {summary.failed} failed</span>}
          {summary.warnings > 0 && <span className="val-warn">⚠ {summary.warnings} warnings</span>}
        </div>
      )}

      {result.sheets.length > 1 && (
        <div className="sheet-tabs">
          {result.sheets.map((s, i) => (
            <button
              key={i}
              className={`tab${i === activeSheet ? ' active' : ''}`}
              onClick={() => setActiveSheet(i)}
            >{s.name}</button>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>{sheet.columns.map(col => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => {
              const vr = row._row_validation
              const rowClass = vr?.status === 'fail' ? 'row-fail' : vr?.status === 'warning' ? 'row-warn' : ''
              return (
                <tr key={ri} className={rowClass} title={vr?.reason || ''}>
                  {sheet.columns.map(col => (
                    <EditableCell
                      key={col}
                      value={row[col]?.value ?? null}
                      confidence={row[col]?.confidence ?? 'high'}
                      onChange={v => onCellChange(activeSheet, ri, col, v)}
                    />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="pane-actions">
        <button className="btn-save" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : '↓ Download Excel'}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [history, setHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const [showUpload, setShowUpload] = useState(true)

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/history`)
      if (res.ok) setHistory(await res.json())
    } catch { /* network error — history stays empty */ }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleFileSelect = useCallback(f => {
    setFile(f)
    setError(null)
  }, [])

  const handleExtract = useCallback(async () => {
    if (!file) return
    setStatus('loading')
    setError(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${API}/extract`, { method: 'POST', body: form })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Extraction failed')
      }
      const data = await res.json()
      setResult(data)
      setUploadId(data.upload_id)
      setActiveHistoryId(data.upload_id)
      setStatus('done')
      setShowUpload(false)
      loadHistory()
    } catch (e) {
      setError(e.message)
      setStatus('idle')
    }
  }, [file, loadHistory])

  const handleCellChange = useCallback((sheetIdx, rowIdx, col, value) => {
    setResult(prev => ({
      ...prev,
      sheets: prev.sheets.map((s, si) =>
        si !== sheetIdx ? s : {
          ...s,
          rows: s.rows.map((r, ri) =>
            ri !== rowIdx ? r : { ...r, [col]: { ...r[col], value } }
          )
        }
      )
    }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!result) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`${API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: result.document_type,
          sheets: result.sheets,
          upload_id: uploadId,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      const a = document.createElement('a')
      a.href = `${API}${data.excel_url}`
      a.download = ''
      a.click()
      if (uploadId) loadHistory()
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }, [result, uploadId, loadHistory])

  const handleSelectHistory = useCallback(async id => {
    try {
      const res = await fetch(`${API}/history/${id}`)
      if (!res.ok) return
      const entry = await res.json()
      const sheets = entry.sheets
      setResult({
        document_type: entry.document_type,
        sheets,
        validation_summary: entry.validation_summary,
        excel_url: entry.excel_url,
      })
      setUploadId(entry.id)
      setActiveHistoryId(id)
      setStatus('done')
      setShowUpload(false)
      setFile(null)
      setError(null)
    } catch { /* ignore */ }
  }, [])

  const handleDeleteHistory = useCallback(async id => {
    try {
      const res = await fetch(`${API}/history/${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setHistory(prev => prev.filter(e => e.id !== id))
      if (activeHistoryId === id) {
        setResult(null)
        setStatus('idle')
        setActiveHistoryId(null)
        setUploadId(null)
        setShowUpload(true)
      }
    } catch { /* ignore */ }
  }, [activeHistoryId])

  const handleNewUpload = () => {
    setFile(null)
    setError(null)
    setShowUpload(true)
    setStatus(s => s === 'loading' ? 'loading' : 'idle')
    setResult(null)
    setActiveHistoryId(null)
    setUploadId(null)
  }

  const mainContent = () => {
    if (showUpload || status === 'idle') {
      return (
        <UploadZone
          file={file}
          loading={status === 'loading'}
          onFileSelect={handleFileSelect}
          onExtract={handleExtract}
        />
      )
    }
    if (status === 'loading') {
      return <div className="loading-state">Extracting document…</div>
    }
    if (status === 'done' && result) {
      return (
        <DataPane
          result={result}
          onCellChange={handleCellChange}
          onSave={handleSave}
          saving={saving}
        />
      )
    }
    return null
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-name">HyperXP</span>
            <span className="brand-tag">Document Intelligence</span>
          </div>

          <div className="sidebar-section">
            <span className="section-label">Records</span>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="history-empty">No uploads yet</p>
              ) : (
                history.map(entry => (
                  <HistoryEntry
                    key={entry.id}
                    entry={entry}
                    isActive={entry.id === activeHistoryId}
                    onSelect={handleSelectHistory}
                    onDelete={handleDeleteHistory}
                  />
                ))
              )}
            </div>
          </div>

          <button className="btn-new-upload" onClick={handleNewUpload}>+ New Upload</button>
        </aside>

        <div className="main">
          <header className="topbar">
            <span className="topbar-title">
              {result ? result.document_type : 'Upload a document to begin'}
            </span>
            {status === 'done' && result?.validation_summary?.total > 0 && (
              <span className="topbar-vs">
                <span className="tvs-pass">✓{result.validation_summary.passed}</span>
                {result.validation_summary.failed > 0 && <span className="tvs-fail"> ✗{result.validation_summary.failed}</span>}
                {result.validation_summary.warnings > 0 && <span className="tvs-warn"> ⚠{result.validation_summary.warnings}</span>}
              </span>
            )}
          </header>

          <div className="content">
            <div key={showUpload ? 'upload' : String(activeHistoryId ?? 'data')}>
              {mainContent()}
            </div>
            {error && <p className="error-msg">{error}</p>}
            {saveError && <p className="error-msg">{saveError}</p>}
          </div>
        </div>
      </div>
    </>
  )
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #060E1F;
    --surface:    #0D1B35;
    --sidebar-bg: #040B17;
    --border:     rgba(255,255,255,0.07);
    --border-lt:  rgba(255,255,255,0.04);
    --ink-1:      #E8EDF5;
    --ink-2:      #8896AD;
    --ink-3:      #4B5A72;
    --accent:     #10B981;
    --accent-lt:  rgba(16,185,129,0.12);
    --fail:       #EF4444;
    --fail-lt:    rgba(239,68,68,0.12);
    --warn:       #F59E0B;
    --warn-lt:    rgba(245,158,11,0.10);
    --pass:       #10B981;
  }

  body {
    background: var(--bg);
    color: var(--ink-1);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 14px;
    height: 100vh;
    overflow: hidden;
  }

  .layout { display: flex; height: 100vh; }

  /* ── Sidebar ── */
  .sidebar {
    width: 260px;
    min-width: 260px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .brand {
    padding: 24px 20px 20px;
    border-bottom: 1px solid var(--border);
  }
  .brand-name {
    display: block;
    font-family: 'Instrument Serif', serif;
    font-style: italic;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .brand-tag {
    display: block;
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 3px;
  }

  .sidebar-section {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px 0 0;
  }
  .section-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    padding: 0 20px 8px;
    text-transform: uppercase;
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
  }
  .history-list::-webkit-scrollbar { width: 4px; }
  .history-list::-webkit-scrollbar-track { background: transparent; }
  .history-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .history-empty { color: var(--ink-3); font-size: 12px; padding: 16px 12px; text-align: center; }

  .history-entry {
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
    margin-bottom: 2px;
    border-left: 3px solid transparent;
  }
  .history-entry:hover { background: rgba(255,255,255,0.04); }
  .history-entry.active { background: var(--accent-lt); border-left-color: var(--accent); }

  .entry-header { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .entry-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .entry-delete {
    background: none; border: none; color: var(--ink-3); cursor: pointer;
    font-size: 16px; line-height: 1; padding: 0 2px; flex-shrink: 0;
  }
  .entry-delete:hover { color: var(--fail); }
  .entry-type { font-size: 11px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; }
  .entry-time { font-size: 11px; color: var(--ink-3); }

  .val-badge { display: flex; gap: 5px; font-size: 10px; font-family: 'IBM Plex Mono', monospace; }
  .badge-pass { color: var(--pass); }
  .badge-fail { color: var(--fail); }
  .badge-warn { color: var(--warn); }

  .btn-new-upload {
    margin: 12px;
    padding: 10px;
    background: var(--accent-lt);
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--accent);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s;
  }
  .btn-new-upload:hover { background: rgba(16,185,129,0.22); }

  /* ── Main ── */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .topbar {
    height: 56px;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    gap: 16px;
  }
  .topbar-title { font-size: 13px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .topbar-vs { font-family: 'IBM Plex Mono', monospace; font-size: 12px; flex-shrink: 0; }
  .tvs-pass { color: var(--pass); }
  .tvs-fail { color: var(--fail); }
  .tvs-warn { color: var(--warn); }

  .content { flex: 1; overflow: auto; display: flex; flex-direction: column; }

  /* ── Upload Zone ── */
  .upload-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    gap: 20px;
  }
  .drop-zone {
    width: 100%;
    max-width: 480px;
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 48px 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    text-align: center;
  }
  .drop-zone:hover, .drop-zone.drag-over { border-color: var(--accent); background: var(--accent-lt); }
  .drop-icon { font-size: 32px; color: var(--ink-3); }
  .drop-label { color: var(--ink-1); font-size: 15px; }
  .drop-hint { color: var(--ink-3); font-size: 12px; }
  .file-chip {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--accent);
  }

  .btn-extract {
    padding: 12px 32px;
    background: var(--accent);
    border: none;
    border-radius: 6px;
    color: #fff;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-extract:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-extract:not(:disabled):hover { opacity: 0.88; }

  .loading-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-2);
    font-size: 14px;
  }

  /* ── Data Pane ── */
  .data-pane { display: flex; flex-direction: column; height: 100%; }

  .val-bar {
    display: flex;
    gap: 20px;
    padding: 10px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    font-family: 'IBM Plex Mono', monospace;
  }
  .val-pass { color: var(--pass); }
  .val-fail { color: var(--fail); }
  .val-warn { color: var(--warn); }

  .sheet-tabs {
    display: flex;
    gap: 2px;
    padding: 0 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .tab {
    background: none;
    border: none;
    padding: 10px 16px;
    color: var(--ink-2);
    font-size: 13px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
  }
  .tab:hover { color: var(--ink-1); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .table-wrap { flex: 1; overflow: auto; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }

  th {
    position: sticky;
    top: 0;
    background: var(--surface);
    color: var(--ink-2);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    z-index: 1;
    white-space: nowrap;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-lt);
    cursor: pointer;
    min-width: 80px;
    vertical-align: top;
  }
  tr:hover td { background: rgba(255,255,255,0.02); }

  .row-fail { border-left: 3px solid var(--fail); }
  .row-fail td { background: var(--fail-lt); }
  .row-fail:hover td { background: rgba(239,68,68,0.18); }

  .row-warn { border-left: 3px solid var(--warn); }
  .row-warn td { background: var(--warn-lt); }
  .row-warn:hover td { background: rgba(245,158,11,0.16); }

  .cell-null { background: rgba(239,68,68,0.15) !important; }
  .cell-low  { background: rgba(245,158,11,0.15) !important; }
  .null-cell { color: var(--ink-3); font-style: italic; }

  .cell-input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 3px 6px;
    color: var(--ink-1);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    outline: none;
  }

  .pane-actions {
    padding: 12px 24px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    background: var(--surface);
  }
  .btn-save {
    padding: 8px 20px;
    background: transparent;
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s;
  }
  .btn-save:not(:disabled):hover { background: var(--accent-lt); }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-msg {
    color: var(--fail);
    background: var(--fail-lt);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 6px;
    padding: 12px 24px;
    margin: 16px 24px;
    font-size: 13px;
  }
`
