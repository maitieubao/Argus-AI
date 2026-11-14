"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BehaviorAnalysisEngine,
  type FrameVisionObservation,
  type LiveCandidateMonitoringSnapshot,
} from "./behavior-engine";
import type { ProctoringEventType } from "./domain";
import { computeVideoFrameStats, type DetectedFaceInput, type DetectedHandInput } from "./vision-analyzers";

export type DemoPostureMode =
  | "AUTO_WEBCAM"
  | "FACE_MISSING"
  | "MULTIPLE_FACES"
  | "CAMERA_OBSTRUCTED"
  | "LOOKING_AWAY"
  | "HEAD_TURNED"
  | "HANDS_MISSING"
  | "PHONE_DETECTED";

type OutEvent = {
  type: ProctoringEventType;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

const DEDUPE_WINDOW_MS = 800;
const BATCH_INTERVAL_MS = 2500;
const VISION_SAMPLE_INTERVAL_MS = 500; // 2 Hz non-blocking vision loop
const TELEMETRY_HEARTBEAT_MS = 4000;
const MAX_BATCH = 20;
const MAX_SNAPSHOTS = 12;

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

function buildObservationForMode(
  mode: DemoPostureMode,
  timestampMs: number,
  video: HTMLVideoElement | null,
): FrameVisionObservation {
  const realStats = computeVideoFrameStats(video);
  const normalFace: DetectedFaceInput = {
    boundingBox: { xMin: 0.3, yMin: 0.2, xMax: 0.7, yMax: 0.8 },
    confidence: 0.95,
    eulerAngles: { yaw: 0, pitch: 0, roll: 0 },
    irisGazeOffset: { horizontal: 0, vertical: 0 },
  };
  const bothHands: DetectedHandInput[] = [
    { handedness: "LEFT", confidence: 0.9, landmarks: [{ x: 0.25, y: 0.75 }] },
    { handedness: "RIGHT", confidence: 0.9, landmarks: [{ x: 0.75, y: 0.75 }] },
  ];

  switch (mode) {
    case "FACE_MISSING":
      return { timestampMs, faces: [], hands: bothHands, frameStats: realStats };
    case "MULTIPLE_FACES":
      return {
        timestampMs,
        faces: [normalFace, { ...normalFace, confidence: 0.91 }],
        hands: bothHands,
        frameStats: realStats,
      };
    case "CAMERA_OBSTRUCTED":
      return {
        timestampMs,
        faces: [],
        hands: [],
        frameStats: { meanBrightness: 4, brightnessStdDev: 1.5 },
      };
    case "LOOKING_AWAY":
      return {
        timestampMs,
        faces: [{ ...normalFace, irisGazeOffset: { horizontal: -0.45, vertical: 0 } }],
        hands: bothHands,
        frameStats: realStats,
      };
    case "HEAD_TURNED":
      return {
        timestampMs,
        faces: [{ ...normalFace, eulerAngles: { yaw: 38, pitch: 0, roll: 0 } }],
        hands: bothHands,
        frameStats: realStats,
      };
    case "HANDS_MISSING":
      return {
        timestampMs,
        faces: [normalFace],
        hands: [bothHands[0]],
        frameStats: realStats,
      };
    case "PHONE_DETECTED":
      return {
        timestampMs,
        faces: [normalFace],
        hands: bothHands,
        objects: [
          {
            label: "cell phone",
            confidence: 0.92,
            boundingBox: { xMin: 0.1, yMin: 0.5, xMax: 0.3, yMax: 0.9 },
          },
        ],
        frameStats: realStats,
      };
    case "AUTO_WEBCAM":
    default: {
      // Check if physical webcam lens is covered (dark & flat luminance)
      const isCovered =
        realStats !== undefined && realStats.meanBrightness < 18 && realStats.brightnessStdDev < 8;
      return {
        timestampMs,
        faces: isCovered ? [] : [normalFace],
        hands: isCovered ? [] : bothHands,
        frameStats: realStats,
      };
    }
  }
}

export function useProctoringEvents(params: {
  attemptId: string;
  examId?: string;
  candidateName?: string;
  active: boolean;
  camera?: { enabled: boolean; getVideoEl?: () => HTMLVideoElement | null };
}) {
  const { attemptId, examId = "exam", candidateName = "Candidate", active, camera } = params;
  const queueRef = useRef<OutEvent[]>([]);
  const lastSigRef = useRef<string>("");
  const lastTimeRef = useRef<number>(0);
  const snapshotsRef = useRef<number>(0);
  const activeRef = useRef(active);
  const flushedOnEndRef = useRef(false);

  const engineRef = useRef<BehaviorAnalysisEngine | null>(null);
  const postureModeRef = useRef<DemoPostureMode>("AUTO_WEBCAM");
  const virtualClockOffsetRef = useRef<number>(0);
  const lastHeartbeatRef = useRef<number>(0);
  const inFlightVisionRef = useRef<boolean>(false);

  const [postureMode, setPostureModeState] = useState<DemoPostureMode>("AUTO_WEBCAM");
  const [liveSnapshot, setLiveSnapshot] = useState<LiveCandidateMonitoringSnapshot | null>(null);
  const [lastDetectedBanner, setLastDetectedBanner] = useState<string | null>(null);

  const setPostureMode = useCallback((mode: DemoPostureMode) => {
    postureModeRef.current = mode;
    setPostureModeState(mode);
  }, []);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const flushNow = useCallback(
    (keepalive = false) => {
      if (queueRef.current.length === 0) return;
      const batch = queueRef.current.splice(0, MAX_BATCH);
      void postEvents(attemptId, batch, keepalive);
    },
    [attemptId],
  );

  const runVisionTick = useCallback(
    (advanceVirtualMs = 0) => {
      if (!activeRef.current || !engineRef.current || inFlightVisionRef.current) return;
      inFlightVisionRef.current = true;
      try {
        if (advanceVirtualMs > 0) {
          virtualClockOffsetRef.current += advanceVirtualMs;
        }
        const nowMs = Date.now() + virtualClockOffsetRef.current;
        const video = camera?.getVideoEl ? camera.getVideoEl() : null;
        const snapMeta = captureCameraSnapshot(video);
        const snapDataUrl =
          snapMeta && typeof snapMeta.dataUrl === "string" ? snapMeta.dataUrl : null;

        const obs = buildObservationForMode(postureModeRef.current, nowMs, video);
        obs.evidenceSnapshotRef = snapDataUrl;

        const { newlyDetected, liveSnapshot: latest } = engineRef.current.processFrame(obs);
        const metrics = engineRef.current.getSessionMetrics();
        setLiveSnapshot(latest);

        if (newlyDetected.length > 0) {
          for (const ev of newlyDetected) {
            setLastDetectedBanner(`${ev.eventType} (${(ev.durationMs / 1000).toFixed(1)}s)`);
            queueRef.current.push({
              type: ev.eventType as ProctoringEventType,
              occurredAt: ev.startTimestamp,
              metadata: {
                ...ev.metadata,
                durationMs: ev.durationMs,
                confidence: ev.confidence,
                severity: ev.severity,
                startTimestamp: ev.startTimestamp,
                endTimestamp: ev.endTimestamp,
                faceVisible: latest.faceVisible,
                faceCount: latest.faceCount,
                cameraObstructed: latest.cameraObstructed,
                eyeGazeDirection: latest.eyeGazeDirection,
                headOrientation: latest.headOrientation,
                yaw: latest.headPose.yaw,
                pitch: latest.headPose.pitch,
                roll: latest.headPose.roll,
                leftHandVisible: latest.leftHandVisible,
                rightHandVisible: latest.rightHandVisible,
                totalMonitoringDurationMs: metrics.totalMonitoringDurationMs,
                bothHandsVisibleDurationMs: metrics.bothHandsVisibleDurationMs,
                ...(snapMeta ?? {}),
                source: "ai_proctor_engine",
              },
            });
          }
          flushNow(false);
        } else if (nowMs - lastHeartbeatRef.current >= TELEMETRY_HEARTBEAT_MS) {
          lastHeartbeatRef.current = nowMs;
          queueRef.current.push({
            type: "CAMERA_STATUS",
            occurredAt: new Date(nowMs).toISOString(),
            metadata: {
              status: "ai_telemetry",
              faceVisible: latest.faceVisible,
              faceCount: latest.faceCount,
              cameraObstructed: latest.cameraObstructed,
              eyeGazeDirection: latest.eyeGazeDirection,
              headOrientation: latest.headOrientation,
              yaw: latest.headPose.yaw,
              pitch: latest.headPose.pitch,
              roll: latest.headPose.roll,
              leftHandVisible: latest.leftHandVisible,
              rightHandVisible: latest.rightHandVisible,
              totalMonitoringDurationMs: metrics.totalMonitoringDurationMs,
              bothHandsVisibleDurationMs: metrics.bothHandsVisibleDurationMs,
              source: "ai_proctor_heartbeat",
            },
          });
        }
      } finally {
        inFlightVisionRef.current = false;
      }
    },
    [camera, flushNow],
  );

  useEffect(() => {
    flushedOnEndRef.current = false;
    queueRef.current = [];
    lastSigRef.current = "";
    lastTimeRef.current = 0;
    snapshotsRef.current = 0;
    virtualClockOffsetRef.current = 0;

    if (!active) {
      engineRef.current = null;
      return;
    }

    engineRef.current = new BehaviorAnalysisEngine({
      examSessionId: attemptId,
      examId,
      candidateId: candidateName,
    });

    const enqueue = (event: OutEvent) => {
      if (!activeRef.current) return;
      const sig = `${event.type}:${JSON.stringify(event.metadata || {})}`;
      const t = Date.now();
      if (sig === lastSigRef.current && t - lastTimeRef.current < DEDUPE_WINDOW_MS) return;
      lastSigRef.current = sig;
      lastTimeRef.current = t;
      queueRef.current.push(event);
      if (queueRef.current.length >= MAX_BATCH) {
        flushNow(false);
      }
    };

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      enqueue({
        type: hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE",
        occurredAt: nowIso(),
        metadata: { visibilityState: document.visibilityState },
      });
      if (hidden) {
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

    if (camera?.enabled) {
      enqueue({
        type: "CAMERA_STATUS",
        occurredAt: nowIso(),
        metadata: { status: "monitoring_enabled", note: "AI Proctor camera monitoring enabled." },
      });
      setTimeout(() => maybeSnapshot("session_start"), 1500);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreen);

    const flushInterval = setInterval(() => flushNow(false), BATCH_INTERVAL_MS);
    const visionInterval = setInterval(() => runVisionTick(0), VISION_SAMPLE_INTERVAL_MS);

    const onPageHide = () => {
      flushNow(true);
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (!flushedOnEndRef.current) {
        flushedOnEndRef.current = true;
        flushNow(true);
      }
      clearInterval(flushInterval);
      clearInterval(visionInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, active, camera?.enabled]);

  return {
    postureMode,
    setPostureMode,
    liveSnapshot,
    lastDetectedBanner,
    fastForwardVisionMs: (ms: number) => runVisionTick(ms),
  };
}
