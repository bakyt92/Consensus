import type { ReactNode } from "react";
import { Brandmark, Wordmark } from "./Brand";

export function EntryShell({
  side,
  children,
}: {
  side: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="entry-shell">
      <div className="entry-side">
        <div>
          <div className="brand" style={{ gap: 14, marginBottom: 56 }}>
            <Brandmark onNavy />
            <div>
              <Wordmark onNavy />
              <div className="label on-navy" style={{ marginTop: 4 }}>
                A protocol for getting to yes.
              </div>
            </div>
          </div>
          {side}
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="label on-navy">EST. MMXXVI · STRUCTURED FACILITATION</div>
        </div>
      </div>
      <div className="entry-main">{children}</div>
    </div>
  );
}
