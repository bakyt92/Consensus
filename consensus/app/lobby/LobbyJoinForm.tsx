"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@/src/components/Icon";

export function LobbyJoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();

  function join() {
    const c = code.trim().toUpperCase();
    if (c.length < 4) return;
    startTransition(() => {
      router.push(`/room/${encodeURIComponent(c)}`);
    });
  }

  return (
    <div style={{ display: "flex", gap: 10 }}>
      <input
        className="input mono"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          fontWeight: 600,
        }}
        placeholder="XXX-NNNN"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={12}
        onKeyDown={(e) => {
          if (e.key === "Enter") join();
        }}
      />
      <button
        className="btn btn-ink"
        disabled={code.length < 4 || isPending}
        onClick={join}
      >
        Join <ArrowRight />
      </button>
    </div>
  );
}
