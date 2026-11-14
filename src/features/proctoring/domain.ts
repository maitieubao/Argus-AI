export const PROCTORING_EVENT_TYPES = [
  "VISIBILITY_HIDDEN",
  "VISIBILITY_VISIBLE",
  "WINDOW_BLUR",
  "WINDOW_FOCUS",
  "FULLSCREEN_EXIT",
  "FULLSCREEN_ENTER",
  "CAMERA_STATUS",
  "CAMERA_TRACK_ENDED",
  "CAMERA_ERROR",
  "CAMERA_SNAPSHOT",
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "CAMERA_OBSTRUCTED",
  "LOOKING_AWAY",
  "HEAD_TURNED",
  "HANDS_MISSING",
  "PHONE_DETECTED",
] as const;

export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

export type ProctoringWarningLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";
export type ProctoringReviewStatus = "DETECTED" | "CONFIRMED" | "RESOLVED";

export interface ProctoringEvent {
  id: string;
  attemptId: string;
  examId: string;
  type: ProctoringEventType;
  occurredAt: string;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
  reviewStatus?: ProctoringReviewStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
}

export interface LiveProctorTelemetry {
  updatedAt: string;
  faceVisible: boolean;
  faceCount: number;
  cameraObstructed: boolean;
  eyeGazeDirection: string;
  headOrientation: string;
  yaw: number;
  pitch: number;
  roll: number;
  leftHandVisible: boolean;
  rightHandVisible: boolean;
  totalMonitoringDurationMs: number;
  bothHandsVisibleDurationMs: number;
}

export interface ProctoringSummary {
  attemptId: string;
  examId: string;
  totalEvents: number;
  countsByType: Record<string, number>;
  firstEventAt: string | null;
  lastEventAt: string | null;
  warningLevel: ProctoringWarningLevel;
  warningLabel: string;
  warningReasons: string[];
  reviewedCount: number;
  unresolvedCount: number;
  liveTelemetry: LiveProctorTelemetry | null;
  events: ProctoringEvent[];
}

export interface ProctoringEventInput {
  type?: unknown;
  occurredAt?: unknown;
  metadata?: unknown;
}

export const MAX_PROCTORING_EVENTS_PER_REQUEST = 50;
export const MAX_PROCTORING_EVENTS_PER_ATTEMPT = 500;
export const MAX_METADATA_JSON_LENGTH = 250_000;
export const MAX_SNAPSHOT_DATA_URL_LENGTH = 180_000;

const EVENT_TYPE_SET = new Set<string>(PROCTORING_EVENT_TYPES);

const SNAPSHOT_ALLOWED_TYPES = new Set<ProctoringEventType>([
  "CAMERA_SNAPSHOT",
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "CAMERA_OBSTRUCTED",
  "LOOKING_AWAY",
  "HEAD_TURNED",
  "HANDS_MISSING",
  "PHONE_DETECTED",
]);

export const AI_BEHAVIOR_EVENT_TYPES = new Set<ProctoringEventType>([
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "CAMERA_OBSTRUCTED",
  "LOOKING_AWAY",
  "HEAD_TURNED",
  "HANDS_MISSING",
  "PHONE_DETECTED",
]);

export function isKnownEventType(type: string): type is ProctoringEventType {
  return EVENT_TYPE_SET.has(type);
}

export function normalizeOccurredAt(v: unknown): string {
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

export function normalizeEventMetadata(type: ProctoringEventType, metadata: unknown): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const input = metadata as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof input.visibilityState === "string") out.visibilityState = input.visibilityState.slice(0, 40);
  if (typeof input.fullscreen === "boolean") out.fullscreen = input.fullscreen;
  if (typeof input.status === "string") out.status = input.status.slice(0, 40);
  if (typeof input.note === "string") out.note = input.note.slice(0, 300);
  if (typeof input.reason === "string") out.reason = input.reason.slice(0, 200);
  if (typeof input.source === "string") out.source = input.source.slice(0, 60);

  // AI-Proctor temporal & vision metadata fields
  if (typeof input.durationMs === "number" && Number.isFinite(input.durationMs)) {
    out.durationMs = Math.max(0, Math.round(input.durationMs));
  }
  if (typeof input.confidence === "number" && Number.isFinite(input.confidence)) {
    out.confidence = Math.min(1, Math.max(0, Math.round(input.confidence * 100) / 100));
  }
  if (typeof input.severity === "string") out.severity = input.severity.slice(0, 20);
  if (typeof input.startTimestamp === "string") out.startTimestamp = input.startTimestamp.slice(0, 40);
  if (typeof input.endTimestamp === "string") out.endTimestamp = input.endTimestamp.slice(0, 40);
  if (typeof input.faceCount === "number" && Number.isFinite(input.faceCount)) out.faceCount = Math.round(input.faceCount);
  if (typeof input.faceVisible === "boolean") out.faceVisible = input.faceVisible;
  if (typeof input.cameraObstructed === "boolean") out.cameraObstructed = input.cameraObstructed;
  if (typeof input.gazeDirection === "string") out.gazeDirection = input.gazeDirection.slice(0, 20);
  if (typeof input.eyeGazeDirection === "string") out.eyeGazeDirection = input.eyeGazeDirection.slice(0, 20);
  if (typeof input.orientation === "string") out.orientation = input.orientation.slice(0, 20);
  if (typeof input.headOrientation === "string") out.headOrientation = input.headOrientation.slice(0, 20);
  if (typeof input.movementType === "string") out.movementType = input.movementType.slice(0, 40);
  if (typeof input.yaw === "number" && Number.isFinite(input.yaw)) out.yaw = Math.round(input.yaw * 10) / 10;
  if (typeof input.pitch === "number" && Number.isFinite(input.pitch)) out.pitch = Math.round(input.pitch * 10) / 10;
  if (typeof input.roll === "number" && Number.isFinite(input.roll)) out.roll = Math.round(input.roll * 10) / 10;
  if (typeof input.leftHandVisible === "boolean") out.leftHandVisible = input.leftHandVisible;
  if (typeof input.rightHandVisible === "boolean") out.rightHandVisible = input.rightHandVisible;
  if (typeof input.missingHands === "string") out.missingHands = input.missingHands.slice(0, 40);
  if (typeof input.detectedObjects === "string") out.detectedObjects = input.detectedObjects.slice(0, 120);
  if (typeof input.totalMonitoringDurationMs === "number" && Number.isFinite(input.totalMonitoringDurationMs)) {
    out.totalMonitoringDurationMs = Math.max(0, Math.round(input.totalMonitoringDurationMs));
  }
  if (typeof input.bothHandsVisibleDurationMs === "number" && Number.isFinite(input.bothHandsVisibleDurationMs)) {
    out.bothHandsVisibleDurationMs = Math.max(0, Math.round(input.bothHandsVisibleDurationMs));
  }

  if (SNAPSHOT_ALLOWED_TYPES.has(type)) {
    const dataUrl = typeof input.dataUrl === "string" ? input.dataUrl : null;
    if (dataUrl && dataUrl.startsWith("data:image/") && dataUrl.length <= MAX_SNAPSHOT_DATA_URL_LENGTH) {
      out.dataUrl = dataUrl;
    }
    if (typeof input.mimeType === "string") out.mimeType = input.mimeType.slice(0, 40);
    if (typeof input.width === "number" && Number.isFinite(input.width)) out.width = Math.max(0, Math.round(input.width));
    if (typeof input.height === "number" && Number.isFinite(input.height)) out.height = Math.max(0, Math.round(input.height));
    if (typeof input.capturedAt === "string") {
      const t = new Date(input.capturedAt).getTime();
      if (Number.isFinite(t)) out.capturedAt = new Date(t).toISOString();
    }
  }

  try {
    const json = JSON.stringify(out);
    if (json.length > MAX_METADATA_JSON_LENGTH) return null;
  } catch {
    return null;
  }

  return Object.keys(out).length > 0 ? out : null;
}

export function getEventTypeLabel(type: ProctoringEventType): string {
  switch (type) {
    case "VISIBILITY_HIDDEN":
      return "Tab or window hidden";
    case "VISIBILITY_VISIBLE":
      return "Returned to tab/window";
    case "WINDOW_BLUR":
      return "Window focus lost";
    case "WINDOW_FOCUS":
      return "Window focus regained";
    case "FULLSCREEN_EXIT":
      return "Exited fullscreen";
    case "FULLSCREEN_ENTER":
      return "Entered fullscreen";
    case "CAMERA_STATUS":
      return "Camera status / telemetry signal";
    case "CAMERA_TRACK_ENDED":
      return "Camera stream ended";
    case "CAMERA_ERROR":
      return "Camera error/signal";
    case "CAMERA_SNAPSHOT":
      return "Camera snapshot";
    case "FACE_MISSING":
      return "AI Proctor: Face missing from frame (≥5s)";
    case "MULTIPLE_FACES":
      return "AI Proctor: Multiple faces detected (≥2s)";
    case "CAMERA_OBSTRUCTED":
      return "AI Proctor: Camera or face obstructed (≥5s)";
    case "LOOKING_AWAY":
      return "AI Proctor: Prolonged eye gaze looking away (≥5s)";
    case "HEAD_TURNED":
      return "AI Proctor: Prolonged head turned away (≥5s)";
    case "HANDS_MISSING":
      return "AI Proctor: One or both hands out of frame (≥10s)";
    case "PHONE_DETECTED":
      return "AI Proctor: Suspicious device / mobile phone detected (≥3s)";
    default:
      return type;
  }
}

export function getEventSeverityWeight(type: ProctoringEventType): number {
  switch (type) {
    case "MULTIPLE_FACES":
    case "PHONE_DETECTED":
      return 5;
    case "FACE_MISSING":
    case "CAMERA_OBSTRUCTED":
    case "LOOKING_AWAY":
    case "HEAD_TURNED":
      return 3;
    case "VISIBILITY_HIDDEN":
    case "WINDOW_BLUR":
    case "FULLSCREEN_EXIT":
    case "CAMERA_TRACK_ENDED":
    case "CAMERA_ERROR":
      return 2;
    case "HANDS_MISSING":
      return 1;
    case "CAMERA_STATUS":
    case "CAMERA_SNAPSHOT":
    case "VISIBILITY_VISIBLE":
    case "WINDOW_FOCUS":
    case "FULLSCREEN_ENTER":
    default:
      return 0;
  }
}
