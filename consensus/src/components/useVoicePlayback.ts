"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { RoomMessage } from "./useRoomChannel";

const STORAGE_KEY = "consensus:tts-enabled";

export type UseVoicePlaybackOptions = {
  code: string;
  messages: RoomMessage[];
  // While true, current playback is paused and new mediator messages are
  // marked seen without being played. Used to silence the mediator while
  // the user's mic is recording.
  suspended?: boolean;
};

export function useVoicePlayback({
  code,
  messages,
  suspended = false,
}: UseVoicePlaybackOptions) {
  const [enabled, setEnabled] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Hydrate persisted preference + seed seen set so we don't blast historic
  // mediator messages through the speakers on first connect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setEnabled(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (seenRef.current.size > 0) return;
    for (const m of messages) {
      if (m.role === "mediator") seenRef.current.add(m.id);
    }
  }, [messages]);

  useEffect(() => {
    if (!enabled) return;
    const next = messages.filter(
      (m) => m.role === "mediator" && !seenRef.current.has(m.id),
    );
    if (next.length === 0) return;
    for (const m of next) seenRef.current.add(m.id);

    // While suspended, swallow the queue — mark messages seen but don't speak.
    if (suspended) return;

    queueRef.current = queueRef.current.then(async () => {
      for (const m of next) {
        if (!m.text.trim()) continue;
        await playOne(code, m.text, audioRef, setSpeaking);
      }
    });
  }, [enabled, messages, code, suspended]);

  // Stop in-flight playback the moment we become suspended (mic recording).
  useEffect(() => {
    if (!suspended) return;
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, [suspended]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        }
      } catch {}
      if (!next) {
        audioRef.current?.pause();
        audioRef.current = null;
        setSpeaking(false);
      }
      return next;
    });
  }, []);

  return { enabled, speaking, toggle };
}

async function playOne(
  code: string,
  text: string,
  audioRef: RefObject<HTMLAudioElement | null>,
  setSpeaking: (v: boolean) => void,
) {
  let res: Response;
  try {
    res = await fetch(`/api/room/${encodeURIComponent(code)}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    return;
  }
  if (res.status === 204 || !res.ok) return;
  const blob = await res.blob();
  if (blob.size === 0) return;
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      setSpeaking(true);
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } finally {
    setSpeaking(false);
    URL.revokeObjectURL(url);
    audioRef.current = null;
  }
}
