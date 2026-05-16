"use client";

import { Download } from "@/src/components/Icon";

export function EndActions({ code }: { code: string }) {
  return (
    <div className="row" style={{ ["--gap" as never]: "10px" }}>
      <a
        href={`/api/room/${encodeURIComponent(code)}/minutes`}
        className="btn btn-primary btn-sm"
        download={`consensus-${code}-minutes.md`}
      >
        <Download /> Download .md
      </a>
    </div>
  );
}
