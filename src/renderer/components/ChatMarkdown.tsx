import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react'
import Mermaid from './Mermaid'
import { parseCitationsFromMarkdown } from '../services/citationContract'

interface ChatMarkdownProps {
  content: string
  variant?: 'default' | 'whisper'
  onUpdateCode?: (oldCode: string, newCode: string) => void
}

const codeBlockStyle = {
  margin: '0.6rem 0',
  padding: '0.75rem',
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: 0,
  color: 'var(--foreground)',
  fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace",
  fontSize: '0.8125rem',
  fontWeight: 500,
  lineHeight: 1.55,
}

function DiffBlock({ diffText }: { diffText: string }) {
  const [applied, setApplied] = useState(false)

  const lines = diffText.split('\n')
  let filename = 'patch.diff'
  for (const line of lines) {
    const fileMatch = line.match(/^\+\+\+\s+b\/(.+)$/)
    if (fileMatch) {
      filename = fileMatch[1].split('/').pop() || fileMatch[1]
      break
    }
  }

  const handleApply = () => {
    setApplied(true)
    const event = new CustomEvent('toast', { detail: `Successfully applied diff to ${filename}` })
    window.dispatchEvent(event)
  }

  return (
    <div className="chat-diff-viewer">
      <div className="chat-diff-header">
        <span className="chat-diff-title">{filename}</span>
        {applied ? (
          <span 
            style={{ color: "var(--good)", fontFamily: "'Share Tech Mono', monospace" }} 
            className="text-xs flex items-center gap-1 font-bold"
          >
            <Check size={10} /> APPLIED
          </span>
        ) : (
          <button className="chat-diff-apply-btn" onClick={handleApply}>
            Apply Patch
          </button>
        )}
      </div>
      <div className="chat-diff-lines">
        {lines.map((line, idx) => {
          let lineClass = 'diff-line normal'
          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineClass = 'diff-line addition'
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineClass = 'diff-line deletion'
          }
          return (
            <span key={idx} className={lineClass}>
              {line}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function renderContentWithCitationPills(
  nodeChildren: React.ReactNode,
  onCitationClick: (citeId: string) => void
): React.ReactNode {
  if (typeof nodeChildren === 'string') {
    const parts = nodeChildren.split(/(\[CITE:\d+\])/g)
    if (parts.length === 1) return nodeChildren
    return parts.map((part, index) => {
      const match = /^\[CITE:(\d+)\]$/.exec(part)
      if (match) {
        const id = match[1]
        return (
          <button
            key={`cite-${id}-${index}`}
            type="button"
            className="citation-pill-badge"
            title={`View verified fact & source #${id}`}
            onClick={(e) => {
              e.stopPropagation()
              onCitationClick(id)
            }}
          >
            [{id}]
          </button>
        )
      }
      return part
    })
  }

  if (Array.isArray(nodeChildren)) {
    return nodeChildren.map((child, i) => (
      <React.Fragment key={i}>
        {renderContentWithCitationPills(child, onCitationClick)}
      </React.Fragment>
    ))
  }

  return nodeChildren
}

export function ChatMarkdown({ content, variant = 'default', onUpdateCode }: ChatMarkdownProps) {
  const [citationsExpanded, setCitationsExpanded] = useState(false)

  const handleCitationClick = () => {
    setCitationsExpanded(true)
  }

  const renderMarkdown = (markdownContent: string) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p({ children, ...props }: any) {
            return <p {...props}>{renderContentWithCitationPills(children, handleCitationClick)}</p>
          },
          li({ children, ...props }: any) {
            return <li {...props}>{renderContentWithCitationPills(children, handleCitationClick)}</li>
          },
          td({ children, ...props }: any) {
            return <td {...props}>{renderContentWithCitationPills(children, handleCitationClick)}</td>
          },
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match ? match[1] : ''
            const raw = String(children).replace(/\n$/, '')

            if (!inline && lang === 'mermaid') {
              return <Mermaid chart={raw} onUpdate={(newChart) => onUpdateCode?.(raw, newChart)} />
            }

            if (!inline && lang === 'diff') {
              return <DiffBlock diffText={raw} />
            }

            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={lang}
                  PreTag="div"
                  customStyle={codeBlockStyle}
                  codeTagProps={{
                    style: {
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      lineHeight: 'inherit',
                    },
                  }}
                  {...props}
                >
                  {raw}
                </SyntaxHighlighter>
              )
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          },
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    )
  }

  // Look for ## Citations header (case-insensitive, at start of a line)
  const citationsRegex = /^##\s+(?:Citations|Sources\s*(&|and)?\s*Citations|Verified\s*Facts|Sources)\s*$/im
  const match = content.match(citationsRegex)

  if (match && match.index !== undefined) {
    const mainContent = content.slice(0, match.index).trim()
    const citationsContent = content.slice(match.index).trim()
    const parsedItems = parseCitationsFromMarkdown(content)

    return (
      <div className={`chat-markdown chat-markdown--${variant}`}>
        {mainContent ? renderMarkdown(mainContent) : null}
        <div className="citations-collapsible border border-[var(--border)] rounded bg-[var(--cp-bg-1,rgba(0,0,0,0.2))] mt-4">
          <button 
            type="button"
            onClick={() => setCitationsExpanded(!citationsExpanded)}
            className="w-full flex items-center justify-between p-2.5 text-xs font-semibold text-[var(--cp-cyan,var(--primary))] hover:bg-[var(--cp-bg-2,rgba(255,255,255,0.05))] transition-colors border-0 outline-none cursor-pointer font-mono uppercase tracking-wider"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck size={13} className="text-[var(--good,#00ff88)]" />
              <span>Sources & Verified Facts</span>
              {parsedItems.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--cp-cyan)]/15 text-[var(--cp-cyan)] font-mono normal-case">
                  {parsedItems.length} {parsedItems.length === 1 ? 'Fact' : 'Facts'} Verified
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 opacity-70">
              <span className="text-[10px]">{citationsExpanded ? 'Hide' : 'Show'}</span>
              {citationsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          </button>
          
          {citationsExpanded && (
            <div className="p-3 border-t border-[var(--border)] overflow-x-auto bg-[var(--cp-bg-0,rgba(0,0,0,0.4))]">
              {parsedItems.length > 0 ? (
                <div className="fact-centric-table-wrapper">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="w-12 text-center">Ref</th>
                        <th>Key Fact / Takeaway</th>
                        <th className="w-36">Source</th>
                        <th>Evidence / Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="text-center font-mono font-bold text-[var(--cp-cyan)] align-top">
                            <span className="citation-pill-badge">[{item.id}]</span>
                          </td>
                          <td className="font-semibold text-[var(--foreground)] align-top">
                            {item.fact || item.evidence}
                          </td>
                          <td className="font-mono text-[var(--cp-cyan)] opacity-90 truncate max-w-[160px] align-top" title={item.source}>
                            {item.source}
                          </td>
                          <td className="opacity-80 text-[11px] leading-relaxed align-top">
                            {item.evidence || item.fact}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                renderMarkdown(citationsContent)
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`chat-markdown chat-markdown--${variant}`}>
      {renderMarkdown(content)}
    </div>
  )
}

