"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RoomMessage = {
  id: string;
  role: "system" | "user" | "mediator" | "research";
  text: string;
  filtered: boolean;
  userId: string | null;
  username: string | null;
  sentAt: string;
  seq: number;
};

export type Participant = {
  userId: string;
  username: string;
  role: "admin" | "participant";
};

export type RoomChannelState = {
  messages: RoomMessage[];
  summary: string;
  consensus: { status: "PENDING" | "STALLED" | "REACHED"; percent: number };
  status: "PENDING" | "OPEN" | "LOCKED" | "STOPPING" | "CLOSED";
  participants: Participant[];
  connected: boolean;
};

export function useRoomChannel(code: string): RoomChannelState {
  const router = useRouter();
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [consensus, setConsensus] = useState<RoomChannelState["consensus"]>({
    status: "PENDING",
    percent: 0,
  });
  const [status, setStatus] = useState<RoomChannelState["status"]>("PENDING");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retry = 0;

    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${window.location.host}/api/ws?room=${encodeURIComponent(code)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!cancelled) {
          retry += 1;
          const wait = Math.min(8000, 500 * 2 ** retry);
          setTimeout(connect, wait);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onmessage = (e) => {
        let ev: unknown;
        try {
          ev = JSON.parse(typeof e.data === "string" ? e.data : "");
        } catch {
          return;
        }
        if (!ev || typeof ev !== "object") return;
        const obj = ev as { type: string } & Record<string, unknown>;
        switch (obj.type) {
          case "message": {
            const m = obj.message as RoomMessage;
            setMessages((prev) => {
              const existing = prev.findIndex((x) => x.id === m.id);
              if (existing >= 0) {
                const copy = prev.slice();
                copy[existing] = m;
                return copy;
              }
              return [...prev, m].sort((a, b) => a.seq - b.seq);
            });
            break;
          }
          case "summary":
            setSummary(String(obj.markdown ?? ""));
            break;
          case "consensus":
            setConsensus({
              status: obj.status as "PENDING" | "STALLED" | "REACHED",
              percent: Number(obj.percent ?? 0),
            });
            break;
          case "status":
            setStatus(obj.status as RoomChannelState["status"]);
            break;
          case "participants":
            setParticipants(obj.participants as Participant[]);
            break;
          case "closed": {
            const dest = String(obj.redirectTo ?? "/lobby");
            router.push(dest);
            break;
          }
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [code, router]);

  return { messages, summary, consensus, status, participants, connected };
}
