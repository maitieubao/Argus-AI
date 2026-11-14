import {
  type ProctoringEvent,
  type ProctoringSummary,
  type ProctoringWarningLevel,
  getEventSeverityWeight,
} from "./domain";

const SEVERITY_TYPES = new Set(["VISIBILITY_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "CAMERA_TRACK_ENDED", "CAMERA_ERROR"]);

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
): ProctoringWarningLevel {
  // Heuristic, rule-based signal levels:
  // NONE: no notable focus/fullscreen/camera events recorded
  // LOW: few or low-weight signals
  // MEDIUM: repeated or multiple signals
  // HIGH: many signals
  if (totalSeverityEvents <= 0) return "NONE";
  if (totalSeverityEvents >= 10 || totalSeverityWeight >= 18 || visibilityHidden >= 6) return "HIGH";
  if (totalSeverityEvents >= 4 || totalSeverityWeight >= 7 || visibilityHidden >= 3) return "MEDIUM";
  return "LOW";
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

  for (const e of sorted) {
    countsByType[e.type] = (countsByType[e.type] || 0) + 1;
    const weight = getEventSeverityWeight(e.type);
    if (weight > 0 || SEVERITY_TYPES.has(e.type)) {
      totalSeverityEvents += 1;
      totalSeverityWeight += weight;
    }
  }

  const visibilityHidden = countsByType["VISIBILITY_HIDDEN"] || 0;
  const warningLevel = computeWarningLevel(totalSeverityEvents, totalSeverityWeight, visibilityHidden);
  const warningLabel = getWarningMeta(warningLevel).label;

  const reasons: string[] = [];
  if ((countsByType["VISIBILITY_HIDDEN"] || 0) > 0) reasons.push(`${countsByType["VISIBILITY_HIDDEN"]} tab/window hidden event(s)`);
  if ((countsByType["WINDOW_BLUR"] || 0) > 0) reasons.push(`${countsByType["WINDOW_BLUR"]} window blur event(s)`);
  if ((countsByType["FULLSCREEN_EXIT"] || 0) > 0) reasons.push(`${countsByType["FULLSCREEN_EXIT"]} fullscreen exit event(s)`);
  if ((countsByType["CAMERA_TRACK_ENDED"] || 0) > 0) reasons.push(`${countsByType["CAMERA_TRACK_ENDED"]} camera stream ended event(s)`);
  if ((countsByType["CAMERA_ERROR"] || 0) > 0) reasons.push(`${countsByType["CAMERA_ERROR"]} camera error event(s)`);
  if ((countsByType["CAMERA_SNAPSHOT"] || 0) > 0) reasons.push(`${countsByType["CAMERA_SNAPSHOT"]} camera snapshot(s)`);
  if (reasons.length === 0) reasons.push("No notable focus, fullscreen, or camera events recorded.");

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
    events: sorted,
  };
}
