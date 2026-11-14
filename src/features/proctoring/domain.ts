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
  "LOOK_LEFT",
  "LOOK_RIGHT",
  "LOOK_DOWN",
  "LOOK_UP",
  "HEAD_LEFT",
  "HEAD_RIGHT",
  "HEAD_DOWN",
  "HEAD_TILTED",
  "GAZE_HEAD_MISMATCH",
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
export const MAX_PROCTORING_EVENTS_PER_ATTEMPT = 1000;
export const MAX_METADATA_JSON_LENGTH = 250_000;
export const MAX_SNAPSHOT_DATA_URL_LENGTH = 180_000;

const EVENT_TYPE_SET = new Set<string>(PROCTORING_EVENT_TYPES);

const SNAPSHOT_ALLOWED_TYPES = new Set<ProctoringEventType>(PROCTORING_EVENT_TYPES);

export const AI_BEHAVIOR_EVENT_TYPES = new Set<ProctoringEventType>([
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "CAMERA_OBSTRUCTED",
  "LOOKING_AWAY",
  "HEAD_TURNED",
  "LOOK_LEFT",
  "LOOK_RIGHT",
  "LOOK_DOWN",
  "LOOK_UP",
  "HEAD_LEFT",
  "HEAD_RIGHT",
  "HEAD_DOWN",
  "HEAD_TILTED",
  "GAZE_HEAD_MISMATCH",
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

export function getEventTypeTitle(type: ProctoringEventType): string {
  switch (type) {
    case "VISIBILITY_HIDDEN":
      return "Rời khỏi tab bài thi";
    case "VISIBILITY_VISIBLE":
      return "Quay lại tab bài thi";
    case "WINDOW_BLUR":
      return "Click ra ngoài cửa sổ thi";
    case "WINDOW_FOCUS":
      return "Quay lại cửa sổ thi";
    case "FULLSCREEN_EXIT":
      return "Thoát chế độ toàn màn hình";
    case "FULLSCREEN_ENTER":
      return "Vào chế độ toàn màn hình";
    case "CAMERA_STATUS":
      return "Kiểm tra camera định kỳ";
    case "CAMERA_TRACK_ENDED":
      return "Mất kết nối camera";
    case "CAMERA_ERROR":
      return "Sự cố truy cập camera";
    case "CAMERA_SNAPSHOT":
      return "Ảnh check-in";
    case "FACE_MISSING":
      return "Không thấy gương mặt";
    case "MULTIPLE_FACES":
      return "Phát hiện người khác trong khung hình";
    case "CAMERA_OBSTRUCTED":
      return "Camera bị che hoặc tối";
    case "LOOKING_AWAY":
      return "Mắt nhìn ra ngoài màn hình";
    case "HEAD_TURNED":
      return "Đầu quay khỏi màn hình";
    case "LOOK_LEFT":
      return "Mắt liếc sang trái";
    case "LOOK_RIGHT":
      return "Mắt liếc sang phải";
    case "LOOK_DOWN":
      return "Mắt cúi nhìn xuống";
    case "LOOK_UP":
      return "Mắt nhìn lên trên";
    case "HEAD_LEFT":
      return "Đầu quay sang trái";
    case "HEAD_RIGHT":
      return "Đầu quay sang phải";
    case "HEAD_DOWN":
      return "Đầu cúi xuống";
    case "HEAD_TILTED":
      return "Đầu nghiêng sang ngang";
    case "GAZE_HEAD_MISMATCH":
      return "Mắt và đầu nhìn khác hướng";
    case "HANDS_MISSING":
      return "Tay rời khỏi khung hình";
    case "PHONE_DETECTED":
      return "Phát hiện điện thoại hoặc thiết bị di động";
    default:
      return type;
  }
}

export function getEventTypeDescription(type: ProctoringEventType): string {
  switch (type) {
    case "VISIBILITY_HIDDEN":
      return "Thí sinh chuyển sang tab khác hoặc thu nhỏ cửa sổ bài thi.";
    case "VISIBILITY_VISIBLE":
      return "Thí sinh quay lại tab bài thi.";
    case "WINDOW_BLUR":
      return "Cửa sổ bài thi mất trạng thái đang hoạt động (thí sinh có thể đã click sang ứng dụng khác).";
    case "WINDOW_FOCUS":
      return "Thí sinh click quay lại cửa sổ bài thi.";
    case "FULLSCREEN_EXIT":
      return "Thí sinh rời khỏi chế độ xem toàn màn hình.";
    case "FULLSCREEN_ENTER":
      return "Thí sinh vào chế độ xem toàn màn hình.";
    case "CAMERA_STATUS":
      return "Kiểm tra tự động xác nhận camera đang hoạt động bình thường.";
    case "CAMERA_TRACK_ENDED":
      return "Luồng webcam dừng bất ngờ trong lúc thi.";
    case "CAMERA_ERROR":
      return "Trình duyệt báo sự cố khi truy cập webcam.";
    case "CAMERA_SNAPSHOT":
      return "Ảnh webcam chụp tự động trong quá trình thi.";
    case "FACE_MISSING":
      return "Gương mặt thí sinh vắng khỏi khung hình camera trong 5 giây trở lên.";
    case "MULTIPLE_FACES":
      return "Nhiều hơn một gương mặt xuất hiện trên camera trong 2 giây trở lên.";
    case "CAMERA_OBSTRUCTED":
      return "Ống kính camera có vẻ bị che hoặc hình ảnh tối bất thường trong 5 giây trở lên.";
    case "LOOKING_AWAY":
      return "Thí sinh nhìn ra ngoài màn hình trong 5 giây trở lên.";
    case "HEAD_TURNED":
      return "Thí sinh quay đầu khỏi màn hình trong 5 giây trở lên.";
    case "LOOK_LEFT":
      return "Mắt thí sinh liếc sang trái trong 5 giây trở lên (dấu hiệu xem tài liệu bên cạnh).";
    case "LOOK_RIGHT":
      return "Mắt thí sinh liếc sang phải trong 5 giây trở lên (dấu hiệu xem tài liệu bên cạnh).";
    case "LOOK_DOWN":
      return "Mắt thí sinh cúi nhìn xuống trong 5 giây trở lên (dấu hiệu xem vật dưới bàn).";
    case "LOOK_UP":
      return "Mắt thí sinh nhìn lên trên trong 5 giây trở lên (có thể chỉ đang suy nghĩ).";
    case "HEAD_LEFT":
      return "Đầu thí sinh quay sang trái trong 5 giây trở lên.";
    case "HEAD_RIGHT":
      return "Đầu thí sinh quay sang phải trong 5 giây trở lên.";
    case "HEAD_DOWN":
      return "Đầu thí sinh cúi xuống thấp trong 5 giây trở lên.";
    case "HEAD_TILTED":
      return "Đầu thí sinh nghiêng sang ngang trong 5 giây trở lên.";
    case "GAZE_HEAD_MISMATCH":
      return "Hướng nhìn của mắt và hướng đầu không trùng nhau — có thể đang lén liếc.";
    case "HANDS_MISSING":
      return "Một hoặc hai tay rời khỏi khung hình camera trong 10 giây trở lên.";
    case "PHONE_DETECTED":
      return "Phát hiện điện thoại hoặc thiết bị cầm tay trong 3 giây trở lên.";
    default:
      return type;
  }
}

export function getEventTypeLabel(type: ProctoringEventType): string {
  return getEventTypeTitle(type);
}

export function formatDurationFriendly(ms?: unknown): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function formatCameraCheckStatus(status?: string | null): string {
  switch (status) {
    case "granted":
      return "Enabled";
    case "denied":
      return "Permission denied";
    case "unavailable":
      return "Camera unavailable";
    case "skipped":
      return "Skipped during check-in";
    case "not_checked":
    default:
      return "Not checked";
  }
}

export function formatFacePresence(input: {
  cameraObstructed: boolean;
  faceCount: number;
  faceVisible: boolean;
}): string {
  if (input.cameraObstructed) return "Camera blocked";
  if (input.faceCount >= 2) return `Multiple people (${input.faceCount})`;
  return input.faceVisible ? "Face visible" : "Face not in view";
}

export function formatGazeDirection(direction?: string | null): string {
  switch (direction) {
    case "CENTER":
      return "Looking at screen";
    case "LEFT":
      return "Looking left";
    case "RIGHT":
      return "Looking right";
    case "UP":
      return "Looking up";
    case "DOWN":
      return "Looking down";
    case "UNKNOWN":
      return "Unclear";
    default:
      return direction || "—";
  }
}

export function formatHeadOrientation(orientation?: string | null): string {
  switch (orientation) {
    case "FORWARD":
      return "Facing screen";
    case "LEFT":
      return "Turned left";
    case "RIGHT":
      return "Turned right";
    case "UP":
      return "Tilted up";
    case "DOWN":
      return "Tilted down";
    case "UNKNOWN":
      return "Unclear";
    default:
      return orientation || "—";
  }
}

export function formatHandsVisibility(leftVisible: boolean, rightVisible: boolean): string {
  if (leftVisible && rightVisible) return "Both hands visible";
  if (!leftVisible && !rightVisible) return "Neither hand visible";
  return leftVisible ? "Left hand only" : "Right hand only";
}

export function formatReviewStatusLabel(status?: ProctoringReviewStatus | null): string {
  switch (status) {
    case "CONFIRMED":
      return "Flagged";
    case "RESOLVED":
      return "Cleared";
    case "DETECTED":
    default:
      return "Needs review";
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
    case "LOOK_LEFT":
    case "LOOK_RIGHT":
    case "LOOK_DOWN":
    case "HEAD_LEFT":
    case "HEAD_RIGHT":
    case "HEAD_DOWN":
    case "GAZE_HEAD_MISMATCH":
      return 3;
    case "LOOK_UP":
    case "HEAD_TILTED":
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
