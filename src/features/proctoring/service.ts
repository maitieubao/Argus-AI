import type { FieldErrors } from "@/features/exams/domain";
import type { Attempt } from "@/features/attempts/domain";
import { isSubmitted } from "@/features/attempts/domain";
import { getAttemptById as getAttemptByIdStore } from "@/features/attempts/store";
import {
  type ProctoringEvent,
  type ProctoringEventInput,
  type ProctoringSummary,
  MAX_PROCTORING_EVENTS_PER_REQUEST,
} from "./domain";
import {
  appendProctoringEvents,
  getProctoringEventsByAttemptId,
  updateProctoringEventReviewStatus,
} from "./store";
import { aggregateProctoringEvents } from "./aggregate";

export type ProctoringServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errors: FieldErrors };

export async function recordProctoringEvents(params: {
  attemptId: string;
  events: ProctoringEventInput[];
}): Promise<ProctoringServiceResult<{ savedCount: number; truncated: boolean }>> {
  const { attemptId, events } = params;
  const attempt = await getAttemptByIdStore(attemptId);
  if (!attempt) {
    return { ok: false, status: 404, errors: { form: "Exam session not found." } };
  }
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, status: 400, errors: { form: "Invalid proctoring events payload." } };
  }

  // Best-effort: do not reject near submit race; ignore if already submitted.
  if (isSubmitted(attempt.status)) {
    return { ok: true, data: { savedCount: 0, truncated: false } };
  }

  const limited = events.slice(0, MAX_PROCTORING_EVENTS_PER_REQUEST);
  try {
    const result = await appendProctoringEvents(attempt, limited);
    return {
      ok: true,
      data: { savedCount: result.saved.length, truncated: result.truncated || events.length > limited.length },
    };
  } catch {
    return { ok: false, status: 500, errors: { form: "Unable to save proctoring events." } };
  }
}

export async function getProctoringSummaryByAttempt(
  attemptId: string,
): Promise<ProctoringServiceResult<ProctoringSummary>> {
  const attempt = await getAttemptByIdStore(attemptId);
  if (!attempt) {
    return { ok: false, status: 404, errors: { form: "Exam session not found." } };
  }
  const events = await getProctoringEventsByAttemptId(attemptId);
  return { ok: true, data: aggregateProctoringEvents(attempt.id, attempt.examId, events) };
}

export async function getProctoringSummaryForAttemptRecord(attempt: Attempt): Promise<ProctoringSummary> {
  const events = await getProctoringEventsByAttemptId(attempt.id);
  return aggregateProctoringEvents(attempt.id, attempt.examId, events);
}

export async function reviewProctoringEventForAttempt(params: {
  attemptId: string;
  eventId: string;
  targetStatus: "CONFIRMED" | "RESOLVED";
  actorId: string;
  reviewNote?: string | null;
}): Promise<ProctoringServiceResult<ProctoringEvent>> {
  try {
    const updated = await updateProctoringEventReviewStatus(params);
    if (!updated) {
      return { ok: false, status: 404, errors: { form: "Proctoring event not found." } };
    }
    return { ok: true, data: updated };
  } catch (err) {
    return {
      ok: false,
      status: 409,
      errors: { form: err instanceof Error ? err.message : "Unable to update review status." },
    };
  }
}
