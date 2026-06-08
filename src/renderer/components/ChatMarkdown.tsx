import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Mermaid from './Mermaid'

interface ChatMarkdownProps {
  content: string
  variant?: 'default' | 'whisper'
}

const codeBlockStyle = {
  margin: '0.6rem 0',
  padding: '0.75rem',
  background: 'rgba(5, 10, 18, 0.82)',
  border: '1px solid rgba(0, 229, 255, 0.18)',
  borderRadius: 0,
  color: 'var(--foreground)',
  fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace",
  fontSize: '0.8125rem',
  fontWeight: 500,
  lineHeight: 1.55,
}

export function ChatMarkdown({ content, variant = 'default' }: ChatMarkdownProps) {
  return (
    <div className={`chat-markdown chat-markdown--${variant}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const lang = match ? match[1] : ''
            const raw = String(children).replace(/\n$/, '')

            if (!inline && lang === 'mermaid') {
              return <Mermaid chart={raw} />
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
        {content}
      </ReactMarkdown>
    </div>
  )
}
