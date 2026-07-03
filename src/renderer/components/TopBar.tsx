import savantIcon from "../imports/icon.png";

export function TopBar() {
  return (
    <header
      style={{
        background: "var(--background)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "none",
      }}
      className="flex items-center justify-between px-3 h-10 shrink-0"
    >
      {/* left spacer */}
      <div className="w-24" />

      {/* center: icon + name */}
      <div className="flex items-center gap-2">
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
          }}
          className="w-6 h-6 flex items-center justify-center overflow-hidden"
        >
          <img
            src={savantIcon}
            alt="Quorum"
            className="w-full h-full object-contain"
          />
        </div>
        <span
          style={{
            fontFamily: "'Orbitron', monospace",
            color: "var(--primary)",
            letterSpacing: "0.22em",
          }}
          className="text-base font-bold uppercase tracking-[0.22em]"
        >
          Quorum
        </span>
      </div>

      {/* right spacer */}
      <div className="w-24" />
    </header>
  );
}
