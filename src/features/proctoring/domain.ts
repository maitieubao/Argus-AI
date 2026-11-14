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
] as const;

export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

export type ProctoringWarningLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export interface ProctoringEvent {
  id: string;
  attemptId: string;
  examId: string;
  type: ProctoringEventType;
  occurredAt: string;
  receivedAt: string;
  metadata: Record<string, unknown> | null;
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
  events: ProctoringEvent[];
}

export interface ProctoringEventInput {
  type?: unknown;
  occurredAt?: unknown;
  metadata?: unknown;
}

export const MAX_PROCTORING_EVENTS_PER_REQUEST = 50;
export const MAX_PROCTORING_EVENTS_PER_ATTEMPT = 500;
export const MAX_METADATA_JSON_LENGTH = 250_000; // allow small thumbnails, cap size
export const MAX_SNAPSHOT_DATA_URL_LENGTH = 180_000;

const EVENT_TYPE_SET = new Set<string>(PROCTORING_EVENT_TYPES);

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

  // Keep only small, safe, JSON-serializable fields
  if (typeof input.visibilityState === "string") out.visibilityState = input.visibilityState.slice(0, 40);
  if (typeof input.fullscreen === "boolean") out.fullscreen = input.fullscreen;
  if (typeof input.status === "string") out.status = input.status.slice(0, 40);
  if (typeof input.note === "string") out.note = input.note.slice(0, 300);
  if (typeof input.reason === "string") out.reason = input.reason.slice(0, 200);
  if (typeof input.source === "string") out.source = input.source.slice(0, 60);

  if (type === "CAMERA_SNAPSHOT") {
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
      return "Camera status signal";
    case "CAMERA_TRACK_ENDED":
      return "Camera stream ended";
    case "CAMERA_ERROR":
      return "Camera error/signal";
    case "CAMERA_SNAPSHOT":
      return "Camera snapshot";
    default:
      return type;
  }
}

export function getEventSeverityWeight(type: ProctoringEventType): number {
  switch (type) {
    case "VISIBILITY_HIDDEN":
    case "WINDOW_BLUR":
    case "FULLSCREEN_EXIT":
    case "CAMERA_TRACK_ENDED":
    case "CAMERA_ERROR":
      return 2;
    case "CAMERA_STATUS":
    case "CAMERA_SNAPSHOT":
      return 0;
    case "VISIBILITY_VISIBLE":
    case "WINDOW_FOCUS":
    case "FULLSCREEN_ENTER":
      return 0;
    default:
      return 0;
  }
}
