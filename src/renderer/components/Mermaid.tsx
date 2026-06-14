import { useState, useEffect, useRef } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import mermaid from 'mermaid'
import { sanitizeMermaidCode } from '../utils/mermaidSanitizer'
import { Edit } from 'lucide-react'
import { MermaidEditorModal } from './MermaidEditorModal'

const Mermaid = ({ chart, onUpdate }: { chart: string; onUpdate?: (newChart: string) => void }) => {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false)
  const id = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`)

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: "'Share Tech Mono', monospace",
      themeVariables: {
        primaryColor: '#00f2ff',
        primaryTextColor: '#fff',
        primaryBorderColor: '#00f2ff',
        lineColor: '#ff00ff',
        secondaryColor: '#f4ea00',
        tertiaryColor: '#0a0a0a'
      }
    })

    const renderDiagram = async () => {
      if (!chart || !chart.trim()) {
        setError(true)
        setErrorMsg('Empty chart')
        return
      }

      const sanitizedChart = sanitizeMermaidCode(chart)

      try {
        setError(false)
        setErrorMsg('')
        // Check syntax first
        await mermaid.parse(sanitizedChart)
        
        const { svg: renderedSvg } = await mermaid.render(id.current, sanitizedChart)
        setSvg(renderedSvg)
      } catch (err: any) {
        console.error('Mermaid error:', err)
        setError(true)
        setErrorMsg(err.message || 'Syntax error')
      }
    }

    renderDiagram()
  }, [chart])

  if (error) {
    return (
      <div className="mermaid-container">
        {onUpdate && (
          <button 
            className="mermaid-edit-btn" 
            onClick={() => setIsEditorOpen(true)}
            title="Edit Mermaid Diagram"
          >
            <Edit size={12} />
          </button>
        )}
        <div className="flex flex-col gap-2 my-2">
          <div 
            style={{ 
              background: 'rgba(255,0,170,0.05)', 
              border: '1px solid rgba(255,0,170,0.2)',
              padding: '8px 12px',
              fontFamily: "'Share Tech Mono', monospace"
            }}
          >
            <div style={{ color: 'var(--cp-magenta)', fontSize: '10px', fontWeight: 'bold' }} className="mb-1">
              NEURAL_RENDER_FAILED: MERMAID_SYNTAX_ERROR
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
              {errorMsg}
            </div>
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus as any}
            language="mermaid"
            PreTag="div"
          >
            {chart}
          </SyntaxHighlighter>
        </div>
        {isEditorOpen && (
          <MermaidEditorModal
            open={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            initialCode={chart}
            onSave={(newCode) => onUpdate?.(newCode)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mermaid-container">
      {onUpdate && (
        <button 
          className="mermaid-edit-btn" 
          onClick={() => setIsEditorOpen(true)}
          title="Edit Mermaid Diagram"
        >
          <Edit size={12} />
        </button>
      )}
      <div 
        className="mermaid" 
        data-testid="mermaid-svg"
        dangerouslySetInnerHTML={{ __html: svg }} 
        style={{ width: '100%', overflow: 'auto', marginBottom: '1rem' }}
      />
      {isEditorOpen && (
        <MermaidEditorModal
          open={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          initialCode={chart}
          onSave={(newCode) => onUpdate?.(newCode)}
        />
      )}
    </div>
  )
}

export default Mermaid
