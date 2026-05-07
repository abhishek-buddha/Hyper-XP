import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DEMO = {
  document_type: "Process Operations — Batch ETC-4/00425",
  upload_id: null,
  validation_summary: { total: 15, passed: 8, failed: 2, warnings: 2 },
  sheets: [
    {
      name: "Process Operations",
      columns: ["Op No.", "Operation", "Parameters", "Remarks"],
      rows: [
        { "Op No.": {value:"1",confidence:"high"}, "Operation": {value:"Inspect and clean reactor vessel",confidence:"high"}, "Parameters": {value:null,confidence:"high"}, "Remarks": {value:"Inspected. Vessel clean and dry.",confidence:"high"}, "_row_validation": {status:"pass",reason:"Inspection confirmed in remarks"} },
        { "Op No.": {value:"2",confidence:"high"}, "Operation": {value:"Add purified water NMT 200 L",confidence:"high"}, "Parameters": {value:"≤ 200 L",confidence:"high"}, "Remarks": {value:"182 L added",confidence:"high"}, "_row_validation": {status:"pass",reason:"182 L is within NMT 200 L"} },
        { "Op No.": {value:"3",confidence:"high"}, "Operation": {value:"Add ETC-3 (AR No. 24-A09), 45.0 kg ± 0.5 kg",confidence:"high"}, "Parameters": {value:"44.5–45.5 kg",confidence:"high"}, "Remarks": {value:"45.0 kg",confidence:"high"}, "_row_validation": {status:"pass",reason:"45.0 kg within ±0.5 kg tolerance"} },
        { "Op No.": {value:"4",confidence:"high"}, "Operation": {value:"Heat to 60°C ± 2°C, maintain 30 min",confidence:"high"}, "Parameters": {value:"58–62°C / 30 min",confidence:"high"}, "Remarks": {value:"61.5°C, 30 min",confidence:"high"}, "_row_validation": {status:"pass",reason:"61.5°C within 58–62°C range, duration met"} },
        { "Op No.": {value:"5",confidence:"high"}, "Operation": {value:"Stir at 120–150 rpm throughout heating",confidence:"high"}, "Parameters": {value:"120–150 rpm",confidence:"high"}, "Remarks": {value:"125 rpm maintained",confidence:"high"}, "_row_validation": {status:"pass",reason:"125 rpm within 120–150 rpm"} },
        { "Op No.": {value:"6",confidence:"high"}, "Operation": {value:"Check pH: 5.5–6.5. Adjust if outside limits.",confidence:"high"}, "Parameters": {value:"5.5–6.5",confidence:"high"}, "Remarks": {value:"5.3",confidence:"high"}, "_row_validation": {status:"fail",reason:"pH 5.3 is below lower limit of 5.5"} },
        { "Op No.": {value:"7",confidence:"high"}, "Operation": {value:"Filter through 0.2 μm membrane filter",confidence:"high"}, "Parameters": {value:"0.2 μm filter",confidence:"high"}, "Remarks": {value:null,confidence:"high"}, "_row_validation": {status:"warning",reason:"Remarks blank — filtration not confirmed"} },
        { "Op No.": {value:"8",confidence:"high"}, "Operation": {value:"Cool bulk to 25°C ± 3°C before transfer",confidence:"high"}, "Parameters": {value:"22–28°C",confidence:"high"}, "Remarks": {value:"24°C",confidence:"high"}, "_row_validation": {status:"pass",reason:"24°C within 22–28°C range"} },
        { "Op No.": {value:"9",confidence:"high"}, "Operation": {value:"Transfer under N₂ pressure NMT 4.0 bar",confidence:"high"}, "Parameters": {value:"≤ 4.0 bar",confidence:"high"}, "Remarks": {value:"4.1 bar",confidence:"high"}, "_row_validation": {status:"fail",reason:"4.1 bar exceeds NMT 4.0 bar limit"} },
        { "Op No.": {value:"10",confidence:"high"}, "Operation": {value:"Visual clarity check: clear and colourless",confidence:"high"}, "Parameters": {value:"Clear & colourless",confidence:"high"}, "Remarks": {value:"Clear and colourless",confidence:"high"}, "_row_validation": {status:"pass",reason:"Clarity confirmed in remarks"} },
        { "Op No.": {value:"11",confidence:"high"}, "Operation": {value:"Calculate yield NLT 85%",confidence:"high"}, "Parameters": {value:"≥ 85%",confidence:"high"}, "Remarks": {value:"87%",confidence:"high"}, "_row_validation": {status:"pass",reason:"87% meets NLT 85% requirement"} },
        { "Op No.": {value:"12",confidence:"high"}, "Operation": {value:"Collect QC samples (3 × 10 mL) and submit",confidence:"high"}, "Parameters": {value:"3 × 10 mL",confidence:"high"}, "Remarks": {value:"Sample collected, QC pending",confidence:"high"}, "_row_validation": {status:"warning",reason:"QC result not yet recorded"} },
      ]
    },
    {
      name: "Raw Materials",
      columns: ["S.No", "Material Name", "Batch No.", "Qty (kg)", "AR No."],
      rows: [
        { "S.No": {value:"1",confidence:"high"}, "Material Name": {value:"ETC-3",confidence:"high"}, "Batch No.": {value:"24-A09",confidence:"high"}, "Qty (kg)": {value:"45.0",confidence:"high"}, "AR No.": {value:"AR-2024-1142",confidence:"high"}, "_row_validation": {status:"na",reason:"Reference row only"} },
        { "S.No": {value:"2",confidence:"high"}, "Material Name": {value:"Purified Water (USP)",confidence:"high"}, "Batch No.": {value:null,confidence:"high"}, "Qty (kg)": {value:"182.0",confidence:"high"}, "AR No.": {value:"—",confidence:"high"}, "_row_validation": {status:"na",reason:"No verifiable requirement"} },
        { "S.No": {value:"3",confidence:"high"}, "Material Name": {value:"0.2 μm Filter Membrane",confidence:"high"}, "Batch No.": {value:"FM-0924-B",confidence:"high"}, "Qty (kg)": {value:null,confidence:"high"}, "AR No.": {value:"AR-2024-1189",confidence:"high"}, "_row_validation": {status:"na",reason:"No numeric requirement to verify"} },
      ]
    }
  ]
}

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
  const tdClass = ''

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

const ANALYSIS_STEPS = [
  { label: "Detecting table structure",    status: "pass" },
  { label: "Extracting column headers",    status: "pass" },
  { label: "Parsing operation rows",       status: "pass" },
  { label: "Reading parameter values",     status: "pass" },
  { label: "Validating numeric limits",    status: "fail" },
  { label: "Checking NMT / NLT conditions",status: "warn" },
  { label: "Verifying remarks data",       status: "pass" },
  { label: "Computing row validations",    status: "pass" },
]

function AnalysisProgress() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    if (visible >= ANALYSIS_STEPS.length) return
    const t = setTimeout(() => setVisible(v => v + 1), 550)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <div className="analysis-wrap">
      <div className="analysis-list">
        {ANALYSIS_STEPS.slice(0, visible).map((s, i) => (
          <div key={i} className="analysis-step" style={{ animationDelay: `${i * 0.04}s` }}>
            <span className={`step-dot dot-${s.status}`} />
            <span className="step-label">{s.label}</span>
            <span className={`step-icon icon-${s.status}`}>
              {s.status === 'pass' ? '✓' : s.status === 'fail' ? '✗' : '⚠'}
            </span>
          </div>
        ))}
        {visible < ANALYSIS_STEPS.length && (
          <div className="analysis-step step-pending">
            <span className="mini-spinner" />
            <span className="step-label" style={{ color: 'var(--ink-3)' }}>Analysing…</span>
          </div>
        )}
      </div>
    </div>
  )
}

function UploadZone({ onFileAndExtract, onLoadDemo }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = e => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.pdf')) onFileAndExtract(f)
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
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) onFileAndExtract(e.target.files[0]) }}
        />
        <div className="drop-content">
          <div className="drop-crosshair">
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <circle cx="26" cy="26" r="13" stroke="currentColor" strokeWidth="1.25" strokeDasharray="3.5 3.5" />
              <line x1="26" y1="4"  x2="26" y2="15" stroke="currentColor" strokeWidth="1.25" />
              <line x1="26" y1="37" x2="26" y2="48" stroke="currentColor" strokeWidth="1.25" />
              <line x1="4"  y1="26" x2="15" y2="26" stroke="currentColor" strokeWidth="1.25" />
              <line x1="37" y1="26" x2="48" y2="26" stroke="currentColor" strokeWidth="1.25" />
              <circle cx="26" cy="26" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <p className="drop-label">Drop document here</p>
          <p className="drop-hint">PDF · Batch Records, Lab Reports, Specifications</p>
          <button
            className="demo-link"
            onClick={e => { e.stopPropagation(); onLoadDemo() }}
            type="button"
          >Load demo data →</button>
        </div>
      </div>
    </div>
  )
}

function DataPane({ result, onCellChange, onSave, saving, onReport }) {
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => { setActiveSheet(0) }, [result])

  if (!result) return null

  // Only show operation/process sheets — hide shift signatories, parameter records, etc.
  const sheets = [...result.sheets]
    .filter(s => !/(shift|signator|parameter record)/i.test(s.name))
    .sort((a, b) => {
      const priority = s => /(operation|process)/i.test(s.name) ? 0 : 1
      return priority(a) - priority(b)
    })
  const summary = result.validation_summary
  const rawSheet = sheets[activeSheet]
  const sheet = {
    ...rawSheet,
    columns: /(operation|process)/i.test(rawSheet.name)
      ? [
          ...rawSheet.columns.filter(c => /^operation(_\d+)?$/i.test(c)),
          ...rawSheet.columns.filter(c => !/^operation(_\d+)?$/i.test(c)),
        ]
      : rawSheet.columns,
  }

  return (
    <div className="data-pane">
      {(() => {
        const totalRows = sheets.reduce((n, s) => n + s.rows.length, 0)
        const naRows = totalRows - (summary?.total || 0)
        return (
          <div className="val-bar">
            <span className="val-label">QC Completed</span>
            <span className="val-divider" />
            <span className="val-total">{totalRows} rows</span>
            <span className="val-divider" />
            {summary?.passed > 0 && (
              <span className="val-pass"><span className="val-dot pass-dot" />{summary.passed} passed</span>
            )}
            {summary?.failed > 0 && (
              <span className="val-fail"><span className="val-dot fail-dot" />{summary.failed} failed</span>
            )}
            {summary?.warnings > 0 && (
              <span className="val-warn"><span className="val-dot warn-dot" />{summary.warnings} {summary.warnings === 1 ? 'warning' : 'warnings'}</span>
            )}
            {naRows > 0 && (
              <span className="val-na"><span className="val-dot na-dot" />{naRows} n/a</span>
            )}
            <span className="pane-save-wrap">
              <button className="btn-report" onClick={onReport}>↓ Report</button>
              <button className="btn-save" onClick={onSave} disabled={saving}>
                {saving ? 'Saving…' : '↓ Excel'}
              </button>
            </span>
          </div>
        )
      })()}

      {sheets.length > 1 && (
        <div className="sheet-tabs">
          {sheets.map((s, i) => (
            <button
              key={i}
              className={`tab${i === activeSheet ? ' active' : ''}`}
              onClick={() => setActiveSheet(i)}
            >
              {s.name}
              <span className="tab-count">{s.rows.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>{sheet.columns.map((col, ci) => <th key={`${col}-${ci}`}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => {
              const vr = row._row_validation
              const rowClass = vr?.status === 'fail' ? 'row-fail' : vr?.status === 'warning' ? 'row-warn' : vr?.status === 'pass' ? 'row-pass' : ''
              return (
                <tr key={ri} className={rowClass} title={vr?.reason || ''}>
                  {sheet.columns.map((col, ci) => (
                    <EditableCell
                      key={`${col}-${ci}`}
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
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [history, setHistory] = useState([])
  const [activeHistoryId, setActiveHistoryId] = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const [showUpload, setShowUpload] = useState(true)

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [pdfUrl])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/history`)
      if (res.ok) setHistory(await res.json())
    } catch { }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const handleLoadDemo = useCallback(() => {
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }
    setResult(DEMO)
    setStatus('done')
    setShowUpload(false)
    setActiveHistoryId(null)
    setUploadId(null)
    setError(null)
  }, [pdfUrl])

  const handleFileAndExtract = useCallback(async f => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl)
    const url = URL.createObjectURL(f)
    setPdfUrl(url)
    setError(null)
    setStatus('loading')
    setShowUpload(false)

    const form = new FormData()
    form.append('file', f)
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
      loadHistory()
    } catch (e) {
      setError(e.message)
      setStatus('idle')
      setShowUpload(true)
    }
  }, [pdfUrl, loadHistory])

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

  const handleReport = useCallback(async () => {
    if (!result) return
    try {
      const res = await fetch(`${API}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: result.document_type,
          sheets: result.sheets,
          validation_summary: result.validation_summary,
        }),
      })
      if (!res.ok) throw new Error('Report generation failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'qc-report.xlsx'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      console.error('Report error:', e)
    }
  }, [result])

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
      if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }
      setResult({
        document_type: entry.document_type,
        sheets: entry.sheets,
        validation_summary: entry.validation_summary,
        excel_url: entry.excel_url,
      })
      setUploadId(entry.id)
      setActiveHistoryId(id)
      setStatus('done')
      setShowUpload(false)
      setError(null)
    } catch { }
  }, [pdfUrl])

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
    } catch { }
  }, [activeHistoryId])

  const handleNewUpload = () => {
    if (pdfUrl) { URL.revokeObjectURL(pdfUrl); setPdfUrl(null) }
    setError(null)
    setShowUpload(true)
    setStatus(s => s === 'loading' ? 'loading' : 'idle')
    setResult(null)
    setActiveHistoryId(null)
    setUploadId(null)
  }

  const mainContent = () => {
    if (showUpload) {
      return (
        <UploadZone
          onFileAndExtract={handleFileAndExtract}
          onLoadDemo={handleLoadDemo}
        />
      )
    }

    if (status === 'loading') {
      return (
        <div className="work-pane">
          {pdfUrl && (
            <div className="pdf-half">
              <iframe src={pdfUrl} title="Document preview" />
            </div>
          )}
          <div className="data-half centered">
            <p className="loading-text">Analysing document…</p>
            <AnalysisProgress />
          </div>
        </div>
      )
    }

    if (status === 'done' && result) {
      return (
        <div className={`work-pane${pdfUrl ? '' : ' no-pdf'}`}>
          {pdfUrl && (
            <div className="pdf-half">
              <iframe src={pdfUrl} title="Document preview" />
            </div>
          )}
          <div className="data-half">
            <DataPane
              result={result}
              onCellChange={handleCellChange}
              onSave={handleSave}
              saving={saving}
              onReport={handleReport}
            />
          </div>
        </div>
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
            <div className="brand-row">
              <span className="brand-name">HYPER<span className="brand-xp">XP</span></span>
              <span className="status-led" title="System online" />
            </div>
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
                <span className="tvs-pass">✓ {result.validation_summary.passed}</span>
                {result.validation_summary.failed > 0 && <span className="tvs-fail"> ✗ {result.validation_summary.failed}</span>}
                {result.validation_summary.warnings > 0 && <span className="tvs-warn"> ⚠ {result.validation_summary.warnings}</span>}
              </span>
            )}
          </header>

          <div className="content">
            <div className="content-inner" key={showUpload ? 'upload' : String(activeHistoryId ?? 'data')}>
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
    --bg:         #EEF1F8;
    --surface:    #FFFFFF;
    --sidebar-bg: #E4EAF4;
    --border:     rgba(15,30,70,0.10);
    --border-lt:  rgba(15,30,70,0.06);
    --ink-1:      #091526;
    --ink-2:      #324060;
    --ink-3:      #5E76A0;
    --accent:     #047857;
    --accent-lt:  rgba(4,120,87,0.08);
    --fail:       #B91C1C;
    --fail-lt:    rgba(185,28,28,0.07);
    --warn:       #B45309;
    --warn-lt:    rgba(180,83,9,0.08);
    --pass:       #047857;
    --radius:     8px;
  }

  @keyframes pulse-led {
    0%, 100% { box-shadow: 0 0 0 2px rgba(4,120,87,0.18), 0 0 8px rgba(4,120,87,0.5); opacity: 1; }
    50%       { box-shadow: 0 0 0 3px rgba(4,120,87,0.08), 0 0 3px rgba(4,120,87,0.2); opacity: 0.7; }
  }
  @keyframes scan-line {
    0%   { top: 0;    opacity: 0.9; }
    100% { top: 100%; opacity: 0;   }
  }
  @keyframes spin-ring {
    to { transform: rotate(360deg); }
  }

  body {
    background: var(--bg);
    color: var(--ink-1);
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    font-size: 15px;
    height: 100vh;
    overflow: hidden;
  }

  .layout { display: flex; height: 100vh; }

  /* ── Sidebar ── */
  .sidebar {
    width: 256px;
    min-width: 256px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .brand {
    padding: 22px 20px 18px;
    border-bottom: 1px solid var(--border);
  }
  .brand-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand-name {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 700;
    font-style: normal;
    font-size: 20px;
    letter-spacing: 0.13em;
    color: var(--ink-1);
    line-height: 1;
  }
  .brand-xp { color: var(--accent); }
  .status-led {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse-led 3s ease-in-out infinite;
    flex-shrink: 0;
  }
  .brand-tag {
    display: block;
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-top: 4px;
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
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    padding: 0 18px 8px;
    text-transform: uppercase;
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px;
  }
  .history-list::-webkit-scrollbar { width: 3px; }
  .history-list::-webkit-scrollbar-track { background: transparent; }
  .history-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .history-empty { color: var(--ink-3); font-size: 12px; padding: 20px 12px; text-align: center; line-height: 1.5; }

  .history-entry {
    padding: 10px 11px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s;
    margin-bottom: 1px;
    border-left: 3px solid transparent;
  }
  .history-entry:hover { background: rgba(15,30,70,0.05); }
  .history-entry.active { background: rgba(4,120,87,0.07); border-left-color: var(--accent); }

  .entry-header { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .entry-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 160px; color: var(--ink-1);
  }
  .entry-delete {
    background: none; border: none; color: var(--ink-3);
    cursor: pointer; font-size: 16px; line-height: 1;
    padding: 0 2px; flex-shrink: 0; transition: color 0.1s;
  }
  .entry-delete:hover { color: var(--fail); }
  .entry-type { font-size: 12px; color: var(--ink-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; }
  .entry-time { font-size: 12px; color: var(--ink-3); }

  .val-badge { display: flex; gap: 5px; font-size: 11px; font-family: 'IBM Plex Mono', monospace; }
  .badge-pass { color: var(--pass); }
  .badge-fail { color: var(--fail); }
  .badge-warn { color: var(--warn); }

  .btn-new-upload {
    margin: 12px;
    padding: 10px;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--ink-2);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
    letter-spacing: 0.01em;
  }
  .btn-new-upload:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-lt); }

  /* ── Main ── */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

  .topbar {
    height: 54px; min-height: 54px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    gap: 16px;
  }
  .topbar-title { font-size: 14px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  .topbar-vs { font-family: 'IBM Plex Mono', monospace; font-size: 13px; flex-shrink: 0; display: flex; gap: 10px; }
  .tvs-pass { color: var(--pass); }
  .tvs-fail { color: var(--fail); }
  .tvs-warn { color: var(--warn); }

  .content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-image: radial-gradient(circle, rgba(15,30,70,0.09) 1px, transparent 1px);
    background-size: 28px 28px;
  }
  .content-inner { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  /* ── Upload Zone ── */
  .upload-area {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 48px 40px; min-height: 100%;
  }

  .drop-zone {
    position: relative;
    width: 100%; max-width: 440px; min-height: 268px;
    background: var(--surface);
    border-radius: 4px;
    padding: 48px 40px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.15s;
    text-align: center;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(15,30,70,0.07), 0 4px 16px rgba(15,30,70,0.04);
  }
  .drop-zone:hover { background: #fafbff; }
  .drop-zone.drag-over { background: rgba(4,120,87,0.03); }

  .corner {
    position: absolute;
    width: 20px; height: 20px;
    transition: border-color 0.15s;
  }
  .corner.tl { top: 0; left: 0; border-top: 2px solid var(--ink-3); border-left: 2px solid var(--ink-3); }
  .corner.tr { top: 0; right: 0; border-top: 2px solid var(--ink-3); border-right: 2px solid var(--ink-3); }
  .corner.bl { bottom: 0; left: 0; border-bottom: 2px solid var(--ink-3); border-left: 2px solid var(--ink-3); }
  .corner.br { bottom: 0; right: 0; border-bottom: 2px solid var(--ink-3); border-right: 2px solid var(--ink-3); }
  .drop-zone:hover .corner,
  .drop-zone.drag-over .corner { border-color: var(--accent); }

  .drop-zone.drag-over::after {
    content: '';
    position: absolute;
    left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent 5%, var(--accent) 50%, transparent 95%);
    animation: scan-line 1.4s ease-in-out infinite;
    pointer-events: none;
  }

  .drop-crosshair { color: var(--ink-3); margin-bottom: 20px; transition: color 0.15s; }
  .drop-zone:hover .drop-crosshair,
  .drop-zone.drag-over .drop-crosshair { color: var(--accent); }

  .drop-content { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .drop-label { color: var(--ink-1); font-size: 15px; font-weight: 500; }
  .drop-hint { color: var(--ink-3); font-size: 12px; line-height: 1.4; max-width: 300px; }

  .demo-link {
    margin-top: 8px;
    background: none; border: none;
    color: var(--accent);
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    cursor: pointer; padding: 4px 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(4,120,87,0.35);
    transition: text-decoration-color 0.12s;
  }
  .demo-link:hover { text-decoration-color: var(--accent); }

  /* ── Work Pane (PDF + Data split) ── */
  .work-pane {
    display: flex;
    flex: 1;
    overflow: hidden;
    height: 100%;
  }
  .work-pane.no-pdf .data-half { width: 100%; max-width: 100%; }

  .pdf-half {
    flex: 1;
    min-width: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
    overflow: hidden;
  }
  .pdf-half iframe {
    width: 100%; height: 100%;
    border: none; display: block;
  }

  .data-half {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface);
  }
  .data-half.centered {
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px;
  }

  /* ── Loading / Analysis ── */
  .loading-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes mini-spin { to { transform: rotate(360deg); } }

  .analysis-wrap { width: 100%; max-width: 300px; }
  .analysis-list { display: flex; flex-direction: column; gap: 10px; }

  .analysis-step {
    display: flex; align-items: center; gap: 10px;
    font-size: 12.5px;
    font-family: 'IBM Plex Mono', monospace;
    animation: fade-up 0.2s ease both;
  }
  .step-dot {
    width: 7px; height: 7px;
    border-radius: 50%; flex-shrink: 0;
  }
  .dot-pass { background: var(--pass); }
  .dot-fail { background: var(--fail); }
  .dot-warn { background: var(--warn); }
  .step-label { flex: 1; color: var(--ink-2); }
  .step-icon { font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .icon-pass { color: var(--pass); }
  .icon-fail { color: var(--fail); }
  .icon-warn { color: var(--warn); }

  .mini-spinner {
    width: 7px; height: 7px; flex-shrink: 0;
    border: 1.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: mini-spin 0.7s linear infinite;
  }

  /* ── Data Pane ── */
  .data-pane { display: flex; flex-direction: column; height: 100%; }

  .val-bar {
    display: flex; align-items: center; gap: 14px;
    padding: 9px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-family: 'IBM Plex Mono', monospace;
    flex-shrink: 0;
  }
  .val-label {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 11px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--ink-3);
  }
  .val-divider { width: 1px; height: 14px; background: var(--border); flex-shrink: 0; }
  .val-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
  .pass-dot { background: var(--pass); }
  .fail-dot { background: var(--fail); }
  .warn-dot { background: var(--warn); }
  .val-total { font-size: 12px; color: var(--ink-2); font-weight: 600; font-family: 'IBM Plex Mono', monospace; }
  .val-pass { color: var(--pass); display: flex; align-items: center; }
  .val-fail { color: var(--fail); display: flex; align-items: center; }
  .val-warn { color: var(--warn); display: flex; align-items: center; }
  .val-na { color: var(--ink-3); display: flex; align-items: center; font-size: 12px; }
  .na-dot { background: var(--ink-3); }
  .pane-save-wrap { margin-left: auto; display: flex; gap: 8px; align-items: center; }

  .btn-report {
    padding: 6px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink-3);
    font-size: 12px; font-weight: 500;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
    white-space: nowrap;
  }
  .btn-report:hover { border-color: var(--ink-2); color: var(--ink-1); background: rgba(15,30,70,0.04); }

  .sheet-tabs {
    display: flex; padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow-x: auto; flex-shrink: 0;
  }
  .tab {
    background: none; border: none;
    padding: 10px 16px;
    color: var(--ink-3); font-size: 13px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
    font-family: 'IBM Plex Sans', sans-serif;
    display: inline-flex; align-items: center; gap: 7px;
  }
  .tab:hover { color: var(--ink-1); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-count {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px; font-weight: 600;
    background: var(--border);
    color: var(--ink-3);
    padding: 1px 5px; border-radius: 3px;
    letter-spacing: 0;
    transition: background 0.12s, color 0.12s;
  }
  .tab.active .tab-count { background: rgba(4,120,87,0.12); color: var(--accent); }

  .table-wrap { flex: 1; overflow: auto; background: var(--surface); }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }

  th {
    position: sticky; top: 0;
    background: var(--surface);
    color: var(--ink-3);
    font-weight: 600; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.07em;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    text-align: left; z-index: 1; white-space: nowrap;
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-lt);
    cursor: pointer; min-width: 80px; vertical-align: top;
    transition: background 0.07s;
  }
  tr:hover td { background: rgba(15,30,70,0.025); }

  .row-pass td                { background: rgba(4,120,87,0.09); }
  .row-pass td:first-child    { border-left: 4px solid var(--pass); }
  .row-pass:hover td          { background: rgba(4,120,87,0.15); }

  .row-fail td                { background: rgba(185,28,28,0.09); }
  .row-fail td:first-child    { border-left: 4px solid var(--fail); }
  .row-fail:hover td          { background: rgba(185,28,28,0.15); }

  .row-warn td                { background: rgba(180,83,9,0.09); }
  .row-warn td:first-child    { border-left: 4px solid var(--warn); }
  .row-warn:hover td          { background: rgba(180,83,9,0.15); }

  .null-cell { color: var(--ink-3); font-style: italic; font-size: 13px; }

  .cell-input {
    width: 100%;
    background: white;
    border: 1px solid var(--accent);
    border-radius: 3px;
    padding: 4px 8px;
    color: var(--ink-1);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 14px;
    outline: none;
    box-shadow: 0 0 0 3px rgba(4,120,87,0.12);
  }

  .btn-save {
    padding: 6px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--ink-2);
    font-size: 12px; font-weight: 500;
    cursor: pointer;
    font-family: 'IBM Plex Sans', sans-serif;
    transition: border-color 0.12s, color 0.12s, background 0.12s;
    white-space: nowrap;
  }
  .btn-save:not(:disabled):hover { border-color: var(--accent); color: var(--accent); background: var(--accent-lt); }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-msg {
    color: var(--fail);
    background: var(--fail-lt);
    border: 1px solid rgba(185,28,28,0.15);
    border-radius: var(--radius);
    padding: 12px 24px;
    margin: 16px 24px;
    font-size: 13px;
    flex-shrink: 0;
  }
`
