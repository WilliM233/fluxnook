"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

export const TICK_FAILED = "Couldn't change that. Try again.";

const Line = createContext<{
  failed: boolean;
  report: (failed: boolean) => void;
}>({ failed: false, report: () => {} });

/** The Issues section's one line, shared by every box on the run (A8). */
export function TickLineProvider({ children }: { children: ReactNode }) {
  const [failed, report] = useState(false);
  const line = useMemo(() => ({ failed, report }), [failed]);
  return <Line.Provider value={line}>{children}</Line.Provider>;
}

/** A box says how its answer went; the next good answer clears the line. */
export const useTickReport = () => useContext(Line).report;

/** Under the heading, where "62 added" sits. */
export function TickLine() {
  const { failed } = useContext(Line);
  if (!failed) return null;
  return (
    <span role="alert" className="basis-full text-sm text-destructive">
      {TICK_FAILED}
    </span>
  );
}
