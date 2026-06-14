import { useState, useEffect, useRef } from 'react';
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import mermaid from 'mermaid';
import { sanitizeMermaidCode } from '../utils/mermaidSanitizer';

interface MermaidEditorModalProps {
  open: boolean;
  onClose: () => void;
  initialCode: string;
  onSave: (newCode: string) => void;
}

export function MermaidEditorModal({ open, onClose, initialCode, onSave }: MermaidEditorModalProps) {
  const [code, setCode] = useState(initialCode);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const id = useRef(`mermaid-editor-${Math.random().toString(36).substring(2, 11)}`);

  // Reset code when modal opens with new initialCode
  useEffect(() => {
    if (open) {
      setCode(initialCode);
      setError(false);
      setErrorMsg('');
      setSvg('');
    }
  }, [open, initialCode]);

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
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(async () => {
      if (!code || !code.trim()) {
        setError(true);
        setErrorMsg('Empty chart');
        setSvg('');
        return;
      }

      const sanitizedChart = sanitizeMermaidCode(code);

      try {
        setError(false);
        setErrorMsg('');
        // Check syntax first
        await mermaid.parse(sanitizedChart);
        
        // Render diagram
        const { svg: renderedSvg } = await mermaid.render(id.current, sanitizedChart);
        setSvg(renderedSvg);
      } catch (err: any) {
        console.error('Mermaid editor render error:', err);
        setError(true);
        setErrorMsg(err.message || 'Syntax error');
      }
    }, 250); // Debounce of 250ms

    return () => clearTimeout(timer);
  }, [code, open]);

  const handleSave = () => {
    onSave(code);
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ background: "rgba(0, 0, 0, 0.75)" }}
          className="fixed inset-0 z-[100]"
        />
        <Dialog.Content
          style={{
            background: "var(--cp-bg-2)",
            border: "1px solid var(--cp-border)",
            boxShadow: "0 0 25px rgba(0, 229, 255, 0.25)",
            maxHeight: "85vh",
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[95vw] max-w-6xl p-6 flex flex-col rounded-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              <Dialog.Title
                style={{
                  color: "var(--cp-cyan)",
                  fontFamily: "'Orbitron', sans-serif",
                  letterSpacing: "0.05em",
                }}
                className="text-lg font-semibold flex items-center gap-2"
              >
                // INTERACTIVE_MERMAID_EDITOR
              </Dialog.Title>
              <Dialog.Description
                style={{
                  color: "var(--foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="text-xs opacity-60 mt-1"
              >
                Edit the diagram description in real time. The preview will automatically compile.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                style={{ color: "var(--cp-cyan)" }}
                className="opacity-60 hover:opacity-100 transition-opacity p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Side-by-side Editor Panel */}
          <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden mb-6">
            {/* Editor (Left Pane) */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[30vh] md:min-h-0">
              <div 
                style={{ 
                  fontFamily: "'Share Tech Mono', monospace", 
                  color: "var(--cp-cyan)",
                  borderBottom: "none"
                }} 
                className="text-xs uppercase px-3 py-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)]"
              >
                diagram_source.mermaid
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{
                  background: "rgba(5, 10, 18, 0.85)",
                  border: "1px solid var(--cp-border)",
                  color: "var(--foreground)",
                  fontFamily: "'JetBrains Mono', 'Share Tech Mono', monospace",
                  fontSize: "0.85rem",
                  lineHeight: "1.5",
                }}
                className="flex-1 w-full p-4 resize-none focus:outline-none focus:border-[var(--cp-cyan)] overflow-auto"
                placeholder="graph TD..."
                spellCheck={false}
              />
            </div>

            {/* Preview (Right Pane) */}
            <div className="flex-1 flex flex-col min-w-0 min-h-[30vh] md:min-h-0">
              <div 
                style={{ 
                  fontFamily: "'Share Tech Mono', monospace", 
                  color: "var(--cp-magenta)",
                  borderBottom: "none"
                }} 
                className="text-xs uppercase px-3 py-1 bg-[var(--cp-bg-3)] border border-[var(--cp-border)]"
              >
                neural_compile_preview
              </div>
              <div
                style={{
                  background: "rgba(5, 10, 18, 0.95)",
                  border: "1px solid var(--cp-border)",
                }}
                className="flex-1 overflow-auto p-4 flex items-center justify-center relative min-h-0"
              >
                {error ? (
                  <div 
                    style={{ 
                      background: 'rgba(255,0,170,0.05)', 
                      border: '1px solid rgba(255,0,170,0.2)',
                      padding: '12px 16px',
                      fontFamily: "'Share Tech Mono', monospace",
                      width: '100%',
                      maxHeight: '100%',
                      overflow: 'auto'
                    }}
                    className="self-start"
                  >
                    <div style={{ color: 'var(--cp-magenta)', fontSize: '11px', fontWeight: 'bold' }} className="mb-2">
                      NEURAL_RENDER_FAILED: MERMAID_SYNTAX_ERROR
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
                      {errorMsg}
                    </div>
                  </div>
                ) : (
                  <div 
                    className="mermaid-preview-container w-full h-full flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: svg }} 
                    style={{ overflow: 'auto' }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid var(--cp-border)",
                color: "var(--foreground)",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              className="px-4 py-2 text-xs hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              disabled={error || !code.trim()}
              style={{
                background: "var(--cp-cyan)",
                border: "1px solid var(--cp-cyan)",
                color: "#080b12",
                fontFamily: "'Share Tech Mono', monospace",
                fontWeight: "bold",
                opacity: error || !code.trim() ? 0.5 : 1,
                cursor: error || !code.trim() ? "not-allowed" : "pointer"
              }}
              className="px-4 py-2 text-xs hover:bg-[rgba(0,229,255,0.8)] transition-colors"
            >
              SAVE CHANGES
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
