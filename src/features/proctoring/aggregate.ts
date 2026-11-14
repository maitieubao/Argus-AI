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

export function getWarningMeta(level: ProctoringWarningLevel): { label: string } {
  switch (level) {
    case "HIGH":
      return { label: "Needs urgent review" };
    case "MEDIUM":
      return { label: "Worth checking" };
    case "LOW":
      return { label: "Minor activity" };
    case "NONE":
    default:
      return { label: "All clear" };
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
  const countText = (n: number, singular: string, plural = `${singular}s`) =>
    `${n} ${n === 1 ? singular : plural}`;
  if ((countsByType["MULTIPLE_FACES"] || 0) > 0) {
    reasons.push(`Another person appeared on camera (${countText(countsByType["MULTIPLE_FACES"], "time")})`);
  }
  if ((countsByType["PHONE_DETECTED"] || 0) > 0) {
    reasons.push(`Phone or mobile device detected (${countText(countsByType["PHONE_DETECTED"], "time")})`);
  }
  if ((countsByType["FACE_MISSING"] || 0) > 0) {
    reasons.push(`Candidate's face left the camera view (${countText(countsByType["FACE_MISSING"], "time")})`);
  }
  if ((countsByType["CAMERA_OBSTRUCTED"] || 0) > 0) {
    reasons.push(`Camera lens appeared covered or blocked (${countText(countsByType["CAMERA_OBSTRUCTED"], "time")})`);
  }
  if ((countsByType["LOOKING_AWAY"] || 0) > 0) {
    reasons.push(`Candidate looked away from the screen for 5s+ (${countText(countsByType["LOOKING_AWAY"], "time")})`);
  }
  if ((countsByType["HEAD_TURNED"] || 0) > 0) {
    reasons.push(`Candidate turned their head away for 5s+ (${countText(countsByType["HEAD_TURNED"], "time")})`);
  }
  const gazeLeft = countsByType["LOOK_LEFT"] || 0;
  const gazeRight = countsByType["LOOK_RIGHT"] || 0;
  const gazeDown = countsByType["LOOK_DOWN"] || 0;
  const gazeUp = countsByType["LOOK_UP"] || 0;
  if (gazeLeft + gazeRight + gazeDown + gazeUp > 0) {
    const parts: string[] = [];
    if (gazeLeft > 0) parts.push(`left ×${gazeLeft}`);
    if (gazeRight > 0) parts.push(`right ×${gazeRight}`);
    if (gazeDown > 0) parts.push(`down ×${gazeDown}`);
    if (gazeUp > 0) parts.push(`up ×${gazeUp}`);
    reasons.push(`Eye gaze left the screen for 5s+ (${parts.join(", ")})`);
  }
  const headLeft = countsByType["HEAD_LEFT"] || 0;
  const headRight = countsByType["HEAD_RIGHT"] || 0;
  const headDown = countsByType["HEAD_DOWN"] || 0;
  const headTilted = countsByType["HEAD_TILTED"] || 0;
  if (headLeft + headRight + headDown + headTilted > 0) {
    const parts: string[] = [];
    if (headLeft > 0) parts.push(`left ×${headLeft}`);
    if (headRight > 0) parts.push(`right ×${headRight}`);
    if (headDown > 0) parts.push(`down ×${headDown}`);
    if (headTilted > 0) parts.push(`tilted ×${headTilted}`);
    reasons.push(`Head turned away from the screen for 5s+ (${parts.join(", ")})`);
  }
  if ((countsByType["GAZE_HEAD_MISMATCH"] || 0) > 0) {
    reasons.push(`Eyes and head looked in different directions (${countText(countsByType["GAZE_HEAD_MISMATCH"], "time")})`);
  }
  if ((countsByType["HANDS_MISSING"] || 0) > 0) {
    reasons.push(`Hands moved out of camera view for 10s+ (${countText(countsByType["HANDS_MISSING"], "time")})`);
  }
  if ((countsByType["VISIBILITY_HIDDEN"] || 0) > 0) {
    reasons.push(`Switched away from the exam tab (${countText(countsByType["VISIBILITY_HIDDEN"], "time")})`);
  }
  if ((countsByType["WINDOW_BLUR"] || 0) > 0) {
    reasons.push(`Clicked outside the exam window (${countText(countsByType["WINDOW_BLUR"], "time")})`);
  }
  if ((countsByType["FULLSCREEN_EXIT"] || 0) > 0) {
    reasons.push(`Exited fullscreen mode (${countText(countsByType["FULLSCREEN_EXIT"], "time")})`);
  }
  if ((countsByType["CAMERA_TRACK_ENDED"] || 0) > 0) {
    reasons.push(`Webcam disconnected during the exam (${countText(countsByType["CAMERA_TRACK_ENDED"], "time")})`);
  }
  if ((countsByType["CAMERA_ERROR"] || 0) > 0) {
    reasons.push(`Camera access error occurred (${countText(countsByType["CAMERA_ERROR"], "time")})`);
  }
  if (reasons.length === 0) reasons.push("No unusual behavior, tab switches, or camera issues recorded.");

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
