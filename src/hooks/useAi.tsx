import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../services/api';

type AiState = { enabled: boolean; loading: boolean; reload: () => void };
const AiContext = createContext<AiState>({ enabled: false, loading: true, reload: () => {} });

export function AiProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    if (!userId) { setEnabled(false); setLoading(false); return; }
    setLoading(true);
    void api.aiStatus().then((state) => {
      if (active) setEnabled(Boolean((state as { enabled?: boolean }).enabled));
    }).catch(() => { if (active) setEnabled(false); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, tick]);
  return <AiContext.Provider value={{ enabled, loading, reload: () => setTick((value) => value + 1) }}>{children}</AiContext.Provider>;
}

export function useAi() { return useContext(AiContext); }
