import {
  AI_BEHAVIOR_EVENT_TYPES,
  type LiveProctorTelemetry,
  type ProctoringEvent,
  type ProctoringSummary,
  type ProctoringWarningLevel,
  getEventSeverityWeight,
} from "./domain";

const SEVERITY_TYPES = new Set([
  "VISIBILITY_HIDDEN",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
  "CAMERA_TRACK_ENDED",
  "CAMERA_ERROR",
  "FACE_MISSING",
  "MULTIPLE_FACES",
  "CAMERA_OBSTRUCTED",
  "LOOKING_AWAY",
  "HEAD_TURNED",
  "HANDS_MISSING",
  "PHONE_DETECTED",
]);

export function getWarningMeta(level: ProctoringWarningLevel): { label: string } {
  switch (level) {
    case "HIGH":
      return { label: "High signal level" };
    case "MEDIUM":
      return { label: "Medium signal level" };
    case "LOW":
      return { label: "Low signal level" };
    case "NONE":
    default:
      return { label: "No notable signals" };
  }
}

function computeWarningLevel(
  totalSeverityEvents: number,
  totalSeverityWeight: number,
  visibilityHidden: number,
  highRiskAiCount: number,
): ProctoringWarningLevel {
  if (totalSeverityEvents <= 0) return "NONE";
  if (highRiskAiCount >= 1 || totalSeverityEvents >= 10 || totalSeverityWeight >= 12 || visibilityHidden >= 6) {
    return "HIGH";
  }
  if (totalSeverityEvents >= 3 || totalSeverityWeight >= 5 || visibilityHidden >= 3) {
    return "MEDIUM";
  }
  return "LOW";
}

function extractLatestLiveTelemetry(events: ProctoringEvent[]): LiveProctorTelemetry | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    const m = e.metadata;
    if (!m) continue;
    if (
      typeof m.faceVisible === "boolean" ||
      typeof m.eyeGazeDirection === "string" ||
      typeof m.headOrientation === "string"
    ) {
      return {
        updatedAt: e.occurredAt,
        faceVisible: typeof m.faceVisible === "boolean" ? m.faceVisible : true,
        faceCount: typeof m.faceCount === "number" ? m.faceCount : 1,
        cameraObstructed: typeof m.cameraObstructed === "boolean" ? m.cameraObstructed : false,
        eyeGazeDirection: typeof m.eyeGazeDirection === "string" ? m.eyeGazeDirection : "CENTER",
        headOrientation: typeof m.headOrientation === "string" ? m.headOrientation : "FORWARD",
        yaw: typeof m.yaw === "number" ? m.yaw : 0,
        pitch: typeof m.pitch === "number" ? m.pitch : 0,
        roll: typeof m.roll === "number" ? m.roll : 0,
        leftHandVisible: typeof m.leftHandVisible === "boolean" ? m.leftHandVisible : true,
        rightHandVisible: typeof m.rightHandVisible === "boolean" ? m.rightHandVisible : true,
        totalMonitoringDurationMs: typeof m.totalMonitoringDurationMs === "number" ? m.totalMonitoringDurationMs : 0,
        bothHandsVisibleDurationMs: typeof m.bothHandsVisibleDurationMs === "number" ? m.bothHandsVisibleDurationMs : 0,
      };
    }
  }
  return null;
}

export function aggregateProctoringEvents(attemptId: string, examId: string, events: ProctoringEvent[]): ProctoringSummary {
  const sorted = [...events].sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    if (ta !== tb) return ta - tb;
    return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
  });

  const countsByType: Record<string, number> = {};
  let totalSeverityEvents = 0;
  let totalSeverityWeight = 0;
  let reviewedCount = 0;
  let unresolvedCount = 0;

  for (const e of sorted) {
    countsByType[e.type] = (countsByType[e.type] || 0) + 1;
    const status = e.reviewStatus ?? "DETECTED";
    if (AI_BEHAVIOR_EVENT_TYPES.has(e.type) || SEVERITY_TYPES.has(e.type)) {
      if (status === "RESOLVED") {
        reviewedCount += 1;
        // Resolved events do not inflate active warning severity
        continue;
      }
      if (status === "CONFIRMED") {
        reviewedCount += 1;
      } else {
        unresolvedCount += 1;
      }
    }

    const weight = getEventSeverityWeight(e.type);
    if (weight > 0 || SEVERITY_TYPES.has(e.type)) {
      totalSeverityEvents += 1;
      totalSeverityWeight += weight;
    }
  }

  const visibilityHidden = countsByType["VISIBILITY_HIDDEN"] || 0;
  const highRiskAiCount =
    (countsByType["MULTIPLE_FACES"] || 0) + (countsByType["PHONE_DETECTED"] || 0);
  const warningLevel = computeWarningLevel(
    totalSeverityEvents,
    totalSeverityWeight,
    visibilityHidden,
    highRiskAiCount,
  );
  const warningLabel = getWarningMeta(warningLevel).label;

  const reasons: string[] = [];
  if ((countsByType["MULTIPLE_FACES"] || 0) > 0) reasons.push(`${countsByType["MULTIPLE_FACES"]} multiple-face detection(s)`);
  if ((countsByType["PHONE_DETECTED"] || 0) > 0) reasons.push(`${countsByType["PHONE_DETECTED"]} suspicious device / phone detection(s)`);
  if ((countsByType["FACE_MISSING"] || 0) > 0) reasons.push(`${countsByType["FACE_MISSING"]} face-missing event(s)`);
  if ((countsByType["CAMERA_OBSTRUCTED"] || 0) > 0) reasons.push(`${countsByType["CAMERA_OBSTRUCTED"]} camera-obstructed event(s)`);
  if ((countsByType["LOOKING_AWAY"] || 0) > 0) reasons.push(`${countsByType["LOOKING_AWAY"]} prolonged looking-away event(s)`);
  if ((countsByType["HEAD_TURNED"] || 0) > 0) reasons.push(`${countsByType["HEAD_TURNED"]} prolonged head-turned event(s)`);
  if ((countsByType["HANDS_MISSING"] || 0) > 0) reasons.push(`${countsByType["HANDS_MISSING"]} hand-visibility signal(s)`);
  if ((countsByType["VISIBILITY_HIDDEN"] || 0) > 0) reasons.push(`${countsByType["VISIBILITY_HIDDEN"]} tab/window hidden event(s)`);
  if ((countsByType["WINDOW_BLUR"] || 0) > 0) reasons.push(`${countsByType["WINDOW_BLUR"]} window blur event(s)`);
  if ((countsByType["FULLSCREEN_EXIT"] || 0) > 0) reasons.push(`${countsByType["FULLSCREEN_EXIT"]} fullscreen exit event(s)`);
  if ((countsByType["CAMERA_TRACK_ENDED"] || 0) > 0) reasons.push(`${countsByType["CAMERA_TRACK_ENDED"]} camera stream ended event(s)`);
  if ((countsByType["CAMERA_ERROR"] || 0) > 0) reasons.push(`${countsByType["CAMERA_ERROR"]} camera error event(s)`);
  if ((countsByType["CAMERA_SNAPSHOT"] || 0) > 0) reasons.push(`${countsByType["CAMERA_SNAPSHOT"]} camera snapshot(s)`);
  if (reasons.length === 0) reasons.push("No notable focus, fullscreen, or AI camera events recorded.");

  return {
    attemptId,
    examId,
    totalEvents: sorted.length,
    countsByType,
    firstEventAt: sorted.length > 0 ? sorted[0].occurredAt : null,
    lastEventAt: sorted.length > 0 ? sorted[sorted.length - 1].occurredAt : null,
    warningLevel,
    warningLabel,
    warningReasons: reasons,
    reviewedCount,
    unresolvedCount,
    liveTelemetry: extractLatestLiveTelemetry(sorted),
    events: sorted,
  };
}
