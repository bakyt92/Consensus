"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "recording" | "uploading" | "error";

export type UseVoiceCaptureOptions = {
  code: string;
  onTranscript?: (text: string, stubbed: boolean) => void;
  onError?: (msg: string) => void;
};

export function useVoiceCapture(opts: UseVoiceCaptureOptions) {
  const [status, setStatus] = useState<Status>("idle");
  const [supported, setSupported] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setSupported(false);
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!supported || status === "recording" || status === "uploading") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stopTicker();
        void upload(opts.code, chunksRef.current, rec.mimeType || mime || "audio/webm")
          .then((res) => {
            setStatus("idle");
            setElapsedMs(0);
            if (res.ok) {
              opts.onTranscript?.(res.text, res.stubbed);
            } else {
              opts.onError?.(res.error);
            }
          })
          .catch((err) => {
            setStatus("error");
            opts.onError?.(err instanceof Error ? err.message : "Upload failed.");
          })
          .finally(() => {
            stopStream();
          });
      };
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      stopTicker();
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      setStatus("recording");
    } catch (err) {
      setStatus("error");
      stopStream();
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Could not access microphone.";
      opts.onError?.(msg);
    }
  }, [supported, status, opts, stopStream]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    stopTicker();
    setStatus("uploading");
    rec.stop();
    recorderRef.current = null;
  }, [stopTicker]);

  const toggle = useCallback(() => {
    if (status === "recording") {
      stop();
    } else if (status === "idle" || status === "error") {
      void start();
    }
  }, [status, start, stop]);

  useEffect(
    () => () => {
      stopTicker();
      stopStream();
    },
    [stopStream, stopTicker],
  );

  return {
    start,
    stop,
    toggle,
    status,
    supported,
    elapsedMs,
    isRecording: status === "recording",
    isUploading: status === "uploading",
  };
}

function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

type UploadResult =
  | { ok: true; text: string; stubbed: boolean }
  | { ok: false; error: string };

async function upload(
  code: string,
  chunks: Blob[],
  mime: string,
): Promise<UploadResult> {
  if (chunks.length === 0) return { ok: false, error: "No audio captured." };
  const blob = new Blob(chunks, { type: mime });
  const res = await fetch(`/api/room/${encodeURIComponent(code)}/voice`, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: blob,
  });
  if (!res.ok) {
    let msg = `Voice upload failed (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {}
    return { ok: false, error: msg };
  }
  const j = (await res.json()) as {
    ok: boolean;
    text?: string;
    stubbed?: boolean;
    error?: string;
  };
  if (!j.ok) return { ok: false, error: j.error ?? "Upload rejected." };
  return { ok: true, text: j.text ?? "", stubbed: Boolean(j.stubbed) };
}
