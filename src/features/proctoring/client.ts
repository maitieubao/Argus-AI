"use client";

import { useEffect, useRef } from "react";

type ProctoringEventType =
  | "VISIBILITY_HIDDEN"
  | "VISIBILITY_VISIBLE"
  | "WINDOW_BLUR"
  | "WINDOW_FOCUS"
  | "FULLSCREEN_EXIT"
  | "FULLSCREEN_ENTER"
  | "CAMERA_STATUS"
  | "CAMERA_TRACK_ENDED"
  | "CAMERA_ERROR"
  | "CAMERA_SNAPSHOT";

type OutEvent = {
  type: ProctoringEventType;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

const DEDUPE_WINDOW_MS = 800;
const BATCH_INTERVAL_MS = 2500;
const MAX_BATCH = 20;
const MAX_SNAPSHOTS = 3;

function nowIso() {
  return new Date().toISOString();
}

async function postEvents(attemptId: string, events: OutEvent[], keepalive = false) {
  if (!events.length) return;
  try {
    await fetch(`/api/attempts/${attemptId}/proctoring/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive,
      cache: "no-store",
    });
  } catch {
    // best-effort: ignore network errors
  }
}

export function captureCameraSnapshot(video: HTMLVideoElement | null): Record<string, unknown> | null {
  try {
    if (!video) return null;
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (!w || !h) return null;
    const targetW = 240;
    const scale = targetW / w;
    const targetH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.45);
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > 180_000) return null;
    return { dataUrl, mimeType: "image/jpeg", width: targetW, height: targetH, capturedAt: nowIso() };
  } catch {
    return null;
  }
}

export function useProctoringEvents(params: {
  attemptId: string;
  active: boolean;
  camera?: { enabled: boolean; getVideoEl?: () => HTMLVideoElement | null };
}) {
  const { attemptId, active, camera } = params;
  const queueRef = useRef<OutEvent[]>([]);
  const lastSigRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const snapshotsRef = useRef<number>(0);
  const activeRef = useRef(active);
  const flushedOnEndRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    flushedOnEndRef.current = false;
    queueRef.current = [];
    lastSigRef.current = "";
    lastTimeRef.current = 0;
    snapshotsRef.current = 0;

    if (!active) return;

    const enqueue = (event: OutEvent) => {
      if (!activeRef.current) return;
      const sig = `${event.type}:${JSON.stringify(event.metadata || {})}`;
      const t = Date.now();
      if (sig === lastSigRef.current && t - lastTimeRef.current < DEDUPE_WINDOW_MS) return;
      lastSigRef.current = sig;
      lastTimeRef.current = t;
      queueRef.current.push(event);
      if (queueRef.current.length >= MAX_BATCH) {
        flush(false);
      }
    };

    const flush = (keepalive: boolean) => {
      if (queueRef.current.length === 0) return;
      const batch = queueRef.current.splice(0, MAX_BATCH);
      void postEvents(attemptId, batch, keepalive);
    };

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      enqueue({
        type: hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE",
        occurredAt: nowIso(),
        metadata: { visibilityState: document.visibilityState },
      });
      if (hidden) {
        // best-effort evidence snapshot on a notable signal (sparse)
        maybeSnapshot("visibility_hidden");
      }
    };

    const onBlur = () => {
      enqueue({ type: "WINDOW_BLUR", occurredAt: nowIso(), metadata: {} });
    };
    const onFocus = () => {
      enqueue({ type: "WINDOW_FOCUS", occurredAt: nowIso(), metadata: {} });
    };

    const onFullscreen = () => {
      const isFs = !!document.fullscreenElement;
      enqueue({
        type: isFs ? "FULLSCREEN_ENTER" : "FULLSCREEN_EXIT",
        occurredAt: nowIso(),
        metadata: { fullscreen: isFs },
      });
      if (!isFs) {
        maybeSnapshot("fullscreen_exit");
      }
    };

    const maybeSnapshot = (reason: string) => {
      if (!camera?.enabled) return;
      if (snapshotsRef.current >= MAX_SNAPSHOTS) return;
      const video = camera.getVideoEl ? camera.getVideoEl() : null;
      const meta = captureCameraSnapshot(video);
      if (!meta) return;
      snapshotsRef.current += 1;
      enqueue({
        type: "CAMERA_SNAPSHOT",
        occurredAt: nowIso(),
        metadata: { ...meta, reason, source: "client_best_effort" },
      });
    };

    // Initial camera status signal (best-effort, metadata-level; consent handled by exam flow)
    if (camera?.enabled) {
      enqueue({
        type: "CAMERA_STATUS",
        occurredAt: nowIso(),
        metadata: { status: "monitoring_enabled", note: "Camera monitoring enabled when available." },
      });
      // Try an early snapshot (sparse)
      setTimeout(() => maybeSnapshot("session_start"), 1500);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);

    const interval = setInterval(() => flush(false), BATCH_INTERVAL_MS);
    const onPageHide = () => {
      flush(true);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (!flushedOnEndRef.current) {
        flushedOnEndRef.current = true;
        flush(true);
      }
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onPageHide);
    };
    // intentionally depend on stable primitives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, active, camera?.enabled]);
}
