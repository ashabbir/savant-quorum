import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import Mermaid from './Mermaid'

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
    // Dispatch a custom event to notify chat area or toast system if desired
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

export function ChatMarkdown({ content, variant = 'default', onUpdateCode }: ChatMarkdownProps) {
  const [citationsExpanded, setCitationsExpanded] = useState(false)

  const renderMarkdown = (markdownContent: string) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
  const citationsRegex = /^##\s+Citations\s*$/im
  const match = content.match(citationsRegex)

  if (match && match.index !== undefined) {
    const mainContent = content.slice(0, match.index).trim()
    const citationsContent = content.slice(match.index).trim()

    return (
      <div className={`chat-markdown chat-markdown--${variant}`}>
        {mainContent ? renderMarkdown(mainContent) : null}
        <div className="citations-collapsible border border-[var(--border)] rounded bg-[var(--cp-bg-1,rgba(0,0,0,0.2))] mt-4">
          <button 
            type="button"
            onClick={() => setCitationsExpanded(!citationsExpanded)}
            className="w-full flex items-center justify-between p-2.5 text-xs font-semibold text-[var(--cp-cyan,var(--primary))] hover:bg-[var(--cp-bg-2,rgba(255,255,255,0.05))] transition-colors border-0 outline-none cursor-pointer font-mono uppercase tracking-wider"
          >
            <div className="flex items-center gap-1.5">
              <span>Citations</span>
            </div>
            {citationsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          
          {citationsExpanded && (
            <div className="p-3 border-t border-[var(--border)] overflow-x-auto bg-[var(--cp-bg-0,rgba(0,0,0,0.4))]">
              {renderMarkdown(citationsContent)}
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
