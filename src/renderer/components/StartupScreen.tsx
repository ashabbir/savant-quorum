import React from 'react';
import { Shield, Activity, Zap } from 'lucide-react';

interface StartupScreenProps {
  progress: string;
  subtext?: string;
}

const StartupScreen: React.FC<StartupScreenProps> = ({ progress, subtext }) => {
  return (
    <div className="fixed inset-0 bg-[var(--background)] flex items-center justify-center z-[1000] overflow-hidden">
      <div className="relative flex flex-col items-center max-w-md w-full px-8">
        <div className="mb-10 flex flex-col items-center">
          <div className="relative mb-5">
            <div className="relative border border-[var(--border)] p-5 bg-[var(--card)]" style={{ borderRadius: 0 }}>
               <Shield size={42} className="text-[var(--primary)]" />
               <Activity size={20} className="absolute -bottom-2 -right-2 text-[var(--accent)] bg-[var(--card)]" />
            </div>
          </div>
          <h1 
            style={{ fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.22em' }}
            className="text-xl font-black text-[var(--primary)]"
          >
            QUORUM
          </h1>
          <div 
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            className="text-[10px] text-[var(--primary)] opacity-40 mt-2 tracking-[0.18em]"
          >
            SYSTEM_BOOT_v{APP_VERSION}
          </div>
        </div>
        
        <div className="w-full space-y-4">
          <div className="h-1 w-full bg-[var(--secondary)] border border-[var(--border)] relative overflow-hidden" style={{ borderRadius: 0 }}>
            <div className="absolute inset-y-0 left-0 bg-[var(--primary)] animate-[loading_2s_infinite_ease-in-out]" style={{ width: '30%' }} />
          </div>
          
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Zap size={10} className="text-[var(--primary)] animate-pulse" />
              <span 
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
                className="text-[10px] text-[var(--primary)] tracking-widest uppercase"
              >
                {progress}
              </span>
            </div>
            {subtext && (
               <div 
                 style={{ fontFamily: "'Rajdhani', sans-serif" }}
                 className="text-[10px] text-[var(--foreground)] opacity-40 italic"
               >
                 {subtext}
               </div>
            )}
          </div>
        </div>

        <div 
          style={{ fontFamily: "'Share Tech Mono', monospace" }}
          className="mt-14 w-full space-y-1 opacity-20 text-[9px]"
        >
          <div className="flex gap-2">
             <span className="text-[var(--primary)]">{'>'}</span>
             <span>INITIALIZING_SECURE_KERNEL...</span>
          </div>
          <div className="flex gap-2">
             <span className="text-[var(--primary)]">{'>'}</span>
             <span>ESTABLISHING_NEURAL_LINK...</span>
          </div>
          <div className="flex gap-2">
             <span className="text-[var(--primary)]">{'>'}</span>
             <span>AUTHENTICATING_QUORUM_HEURISTICS...</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { left: -30%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default StartupScreen;
