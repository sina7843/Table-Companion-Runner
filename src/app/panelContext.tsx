import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface PanelContent {
  eyebrow?: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  body: ReactNode;
}

interface PanelApi {
  content: PanelContent | null;
  /** Opens the context panel, replacing whatever it was showing. */
  show: (content: PanelContent) => void;
  close: () => void;
}

const PanelCtx = createContext<PanelApi | null>(null);

/**
 * Makes the contextual right-side panel available to every screen under a shell, so a
 * monster row in combat, a character in the party table and a spell in the library all
 * open the same panel instead of each inventing their own drawer.
 */
export function ContextPanelProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<PanelContent | null>(null);

  const show = useCallback((next: PanelContent) => setContent(next), []);
  const close = useCallback(() => setContent(null), []);

  const value = useMemo<PanelApi>(() => ({ content, show, close }), [content, show, close]);

  return <PanelCtx.Provider value={value}>{children}</PanelCtx.Provider>;
}

export function useContextPanel(): PanelApi {
  const api = useContext(PanelCtx);
  if (!api)
    throw new Error('useContextPanel must be used inside a shell with ContextPanelProvider');
  return api;
}
