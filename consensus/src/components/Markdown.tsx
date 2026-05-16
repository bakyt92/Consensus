"use client";

import { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    if (!source) return "";
    return marked.parse(source) as string;
  }, [source]);

  if (!source) {
    return (
      <p className="body" style={{ color: "var(--muted)" }}>
        The mediator is composing the opening statement…
      </p>
    );
  }
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderInline(text: string): string {
  // ** ** -> <strong>
  const escaped = escape(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
