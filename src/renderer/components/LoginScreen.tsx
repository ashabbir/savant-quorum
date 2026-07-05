import { useState, useEffect } from "react";
import { KeyRound, Shield, LogIn, AlertTriangle, Server } from "lucide-react";

interface LoginScreenProps {
  onLogin: (apiKey: string, serverUrl: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState("http://127.0.0.1:8090");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    window.system.getSettings().then((loadedSettings: any) => {
      const savedUrl = loadedSettings["server:config"]?.url;
      if (savedUrl) {
        setServerUrl(savedUrl);
      }
    }).catch(() => {});
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedKey = apiKey.trim();
    const trimmedUrl = serverUrl.trim();
    if (!trimmedKey) {
      setError("Quorum API key is required.");
      return;
    }
    if (!trimmedUrl) {
      setError("Server URL is required.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await onLogin(trimmedKey, trimmedUrl);
    } catch (e: any) {
      setError(e?.message || "Login failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-[var(--background)] flex items-center justify-center z-[1000] overflow-hidden">
      <form
        onSubmit={handleSubmit}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 0,
          boxShadow: "none",
        }}
        className="relative w-[min(420px,90vw)] p-5"
      >
        <div className="flex items-center gap-3 mb-5">
          <div
            style={{ border: "1px solid var(--border)", color: "var(--primary)" }}
            className="p-2.5"
          >
            <Shield size={24} />
          </div>
          <div>
            <h1
              style={{ color: "var(--primary)", fontFamily: "'Orbitron', sans-serif" }}
              className="text-lg uppercase tracking-[0.22em]"
            >
              Quorum
            </h1>
            <p
              style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
              className="text-xs opacity-50"
            >
              Authenticate with your Quorum API key
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label
              style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }}
              className="block text-[10px] mb-2 opacity-70 uppercase tracking-[0.18em]"
            >
              Server URL
            </label>
            <div
              style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 0 }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Server size={14} style={{ color: "var(--primary)", opacity: 0.7 }} />
              <input
                type="text"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:8090"
                style={{
                  background: "transparent",
                  color: "var(--foreground)",
                  fontFamily: "'Share Tech Mono', monospace",
                  outline: "none",
                  border: "none",
                }}
                className="flex-1 text-xs placeholder:opacity-30"
              />
            </div>
          </div>

          <div>
            <label
              style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }}
              className="block text-[10px] mb-2 opacity-70 uppercase tracking-[0.18em]"
            >
              Quorum API Key
            </label>
            <div
              style={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 0 }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <KeyRound size={14} style={{ color: "var(--primary)", opacity: 0.7 }} />
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoFocus
                placeholder="sk-..."
                style={{
                  background: "transparent",
                  color: "var(--foreground)",
                  fontFamily: "'Share Tech Mono', monospace",
                  outline: "none",
                  border: "none",
                }}
                className="flex-1 text-xs placeholder:opacity-30"
              />
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{ color: "var(--accent)", fontFamily: "'Share Tech Mono', monospace" }}
            className="flex items-center gap-2 mt-4 text-[11px]"
          >
            <AlertTriangle size={13} />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            fontFamily: "'Share Tech Mono', monospace",
            borderRadius: 0,
          }}
          className="mt-5 w-full px-4 py-2 text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <LogIn size={14} />
          {isSubmitting ? "AUTHENTICATING..." : "LOGIN"}
        </button>
      </form>
    </div>
  );
}
