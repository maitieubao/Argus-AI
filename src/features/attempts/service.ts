import { randomUUID } from "crypto";
import type { Exam } from "@/features/exams/domain";
import { getExamById, getExamByJoinCode } from "@/features/exams/store";
import {
  type Attempt,
  type CandidateAttemptView,
  type FieldErrors,
  type JoinAvailability,
  buildCandidateAttemptView,
  computeDeadlineAt,
  getJoinAvailability,
  getRemainingMs,
  isGradingCompleteForPublish,
  isResultPublished,
  isSubmitted,
  normalizeAnswersForExam,
  normalizeCameraCheck,
  normalizeJoinCode,
  upsertAnswers,
  validateCandidateInput,
} from "./domain";
import { gradeMcq, syncAttemptGradingWithExam } from "./grading";
import { createAttempt, getAttemptById, getAttemptsByExamId, replaceAttempt } from "./store";
import { getProctoringSummaryForAttemptRecord } from "@/features/proctoring/service";
import type { ProctoringSummary } from "@/features/proctoring/domain";

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "NOT_PUBLISHED"
  | "NOT_OPEN"
  | "CLOSED"
  | "INVALID"
  | "CONSENT_REQUIRED"
  | "ALREADY_SUBMITTED"
  | "FORBIDDEN"
  | "NOT_SUBMITTED";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ServiceErrorCode; errors: FieldErrors; status?: number };

function err(code: ServiceErrorCode, errors: FieldErrors, status?: number): ServiceResult<never> {
  return { ok: false, code, errors, status };
}

function nowIso() {
  return new Date().toISOString();
}

export async function getPublicJoinInfo(codeRaw: string): Promise<{ availability: JoinAvailability }> {
  const code = normalizeJoinCode(codeRaw);
  const exam = code ? await getExamByJoinCode(code) : null;
  const availability = getJoinAvailability(exam, Date.now());
  return { availability };
}

export async function startAttempt(params: {
  codeRaw: string;
  candidateInput: unknown;
  consentAccepted: unknown;
  cameraCheckInput?: unknown;
}): Promise<ServiceResult<{ attemptId: string }>> {
  const code = normalizeJoinCode(params.codeRaw);
  if (!code) return err("NOT_FOUND", { form: "Invalid join code." }, 404);

  const exam = await getExamByJoinCode(code);
  const availability = getJoinAvailability(exam, Date.now());
  if (!exam || availability.status === "not_found") {
    return err("NOT_FOUND", { form: "This join code is invalid or the exam is not available." }, 404);
  }
  if (availability.status === "not_published") {
    return err("NOT_PUBLISHED", { form: "This join code is invalid or the exam is not available." }, 400);
  }
  if (availability.status === "not_open") {
    return err("NOT_OPEN", { form: "This exam is not open yet." }, 409);
  }
  if (availability.status === "closed") {
    return err("CLOSED", { form: "This exam is no longer accepting entries." }, 409);
  }

  const candidateV = validateCandidateInput(params.candidateInput);
  if (!candidateV.ok) return err("INVALID", candidateV.errors, 400);

  if (params.consentAccepted !== true) {
    return err("CONSENT_REQUIRED", { consent: "Please confirm consent before starting." }, 400);
  }

  const startedAt = nowIso();
  const startedMs = new Date(startedAt).getTime();
  const closeMs = exam.closeAt ? new Date(exam.closeAt).getTime() : NaN;
  if (Number.isFinite(closeMs) && startedMs > closeMs) {
    return err("CLOSED", { form: "This exam is no longer accepting entries." }, 409);
  }

  const deadlineAt = computeDeadlineAt(startedAt, exam.durationMinutes, exam.closeAt);
  if (new Date(deadlineAt).getTime() <= startedMs) {
    return err("CLOSED", { form: "There is no valid time remaining to start this exam." }, 409);
  }

  const cameraCheck = normalizeCameraCheck(params.cameraCheckInput);
  const createdAt = nowIso();
  const attempt: Attempt = {
    id: randomUUID(),
    examId: exam.id,
    joinCode: exam.joinCode || code,
    candidate: candidateV.data,
    consentAcceptedAt: createdAt,
    cameraCheck,
    status: "IN_PROGRESS",
    submitReason: null,
    startedAt,
    deadlineAt,
    submittedAt: null,
    answers: normalizeAnswersForExam(exam, []),
    mcqResult: null,
    essayGradingStatus: null,
    overallGradingStatus: "NOT_SUBMITTED",
    resultPublishedAt: null,
    createdAt,
    updatedAt: createdAt,
  };

  await createAttempt(attempt);
  return { ok: true, data: { attemptId: attempt.id } };
}

function finalizeSubmission(attempt: Attempt, exam: Exam, reason: "MANUAL" | "TIMEOUT"): Attempt {
  if (isSubmitted(attempt.status)) {
    return attempt; // idempotent: keep stored result
  }
  const submittedAt = nowIso();
  const normalizedAnswers = normalizeAnswersForExam(exam, attempt.answers);
  const mcqResult = gradeMcq(exam, normalizedAnswers);
  const base: Attempt = {
    ...attempt,
    answers: normalizedAnswers,
    status: reason === "TIMEOUT" ? "AUTO_SUBMITTED" : "SUBMITTED",
    submitReason: reason,
    submittedAt,
    mcqResult,
    updatedAt: submittedAt,
  };
  // Initialize/sync essay grading records and overall statuses (E4-compatible, backward-safe)
  return syncAttemptGradingWithExam(base, exam);
}

export async function getCandidateAttemptView(
  attemptId: string,
): Promise<ServiceResult<{ view: CandidateAttemptView; attempt: Attempt }>> {
  const attempt = await getAttemptById(attemptId);
  if (!attempt) return err("NOT_FOUND", { form: "Exam session not found." }, 404);
  const exam = await getExamById(attempt.examId);
  if (!exam) return err("NOT_FOUND", { form: "Exam for this session was not found." }, 404);

  let current = attempt;
  if (!isSubmitted(current.status) && getRemainingMs(current.deadlineAt, Date.now()) === 0) {
    current = finalizeSubmission(current, exam, "TIMEOUT");
    await replaceAttempt(current);
  } else {
    // ensure answers normalized to exam (in case structure changed / older data)
    const normalized = normalizeAnswersForExam(exam, current.answers);
    let changed = JSON.stringify(normalized) !== JSON.stringify(current.answers);
    let nextAttempt: Attempt = changed ? { ...current, answers: normalized } : current;
    if (isSubmitted(nextAttempt.status) && nextAttempt.mcqResult) {
      const synced = syncAttemptGradingWithExam(nextAttempt, exam);
      if (
        JSON.stringify(synced.essayGradings ?? null) !== JSON.stringify(nextAttempt.essayGradings ?? null) ||
        synced.essayGradingStatus !== nextAttempt.essayGradingStatus ||
        synced.overallGradingStatus !== nextAttempt.overallGradingStatus ||
        JSON.stringify(synced.essayResult ?? null) !== JSON.stringify(nextAttempt.essayResult ?? null)
      ) {
        nextAttempt = synced;
        changed = true;
      }
    }
    if (changed) {
      current = { ...nextAttempt, updatedAt: nowIso() };
      await replaceAttempt(current);
    } else {
      current = nextAttempt;
    }
  }

  return { ok: true, data: { view: buildCandidateAttemptView(current, exam), attempt: current } };
}

export async function saveAttemptAnswers(params: {
  attemptId: string;
  answersPatch: unknown;
}): Promise<ServiceResult<{ view: CandidateAttemptView; savedAt: string; expired: boolean }>> {
  const attempt = await getAttemptById(params.attemptId);
  if (!attempt) return err("NOT_FOUND", { form: "Exam session not found." }, 404);
  const exam = await getExamById(attempt.examId);
  if (!exam) return err("NOT_FOUND", { form: "Exam not found." }, 404);

  if (isSubmitted(attempt.status)) {
    return {
      ok: false,
      code: "ALREADY_SUBMITTED",
      errors: { form: "This attempt has been submitted and can no longer be edited." },
      status: 409,
    };
  }

  if (getRemainingMs(attempt.deadlineAt, Date.now()) === 0) {
    const finalized = finalizeSubmission(attempt, exam, "TIMEOUT");
    await replaceAttempt(finalized);
    return { ok: true, data: { view: buildCandidateAttemptView(finalized, exam), savedAt: finalized.updatedAt, expired: true } };
  }

  const nextAnswers = upsertAnswers(exam, attempt.answers, params.answersPatch);
  const savedAt = nowIso();
  const updated: Attempt = { ...attempt, answers: nextAnswers, updatedAt: savedAt };
  await replaceAttempt(updated);
  return { ok: true, data: { view: buildCandidateAttemptView(updated, exam), savedAt, expired: false } };
}

export async function submitAttempt(params: {
  attemptId: string;
  reasonHint?: unknown;
}): Promise<ServiceResult<{ view: CandidateAttemptView }>> {
  const attempt = await getAttemptById(params.attemptId);
  if (!attempt) return err("NOT_FOUND", { form: "Exam session not found." }, 404);
  const exam = await getExamById(attempt.examId);
  if (!exam) return err("NOT_FOUND", { form: "Exam not found." }, 404);

  if (isSubmitted(attempt.status)) {
    // idempotent
    return { ok: true, data: { view: buildCandidateAttemptView(attempt, exam) } };
  }

  const expired = getRemainingMs(attempt.deadlineAt, Date.now()) === 0;
  const hint = params.reasonHint === "TIMEOUT" ? "TIMEOUT" : params.reasonHint === "MANUAL" ? "MANUAL" : null;
  const reason: "MANUAL" | "TIMEOUT" = expired || hint === "TIMEOUT" ? "TIMEOUT" : "MANUAL";

  const finalized = finalizeSubmission(attempt, exam, reason);
  await replaceAttempt(finalized);
  return { ok: true, data: { view: buildCandidateAttemptView(finalized, exam) } };
}

export type AttemptPublishSummary = {
  attemptId: string;
  resultPublishedAt: string | null;
  published: boolean;
  gradingComplete: boolean;
  overallGradingStatus: Attempt["overallGradingStatus"];
};

export async function setAttemptResultPublished(params: {
  examId: string;
  attemptId: string;
  teacherId: string;
  published: boolean;
}): Promise<ServiceResult<{ summary: AttemptPublishSummary }>> {
  const exam = await getExamById(params.examId);
  if (!exam) return err("NOT_FOUND", { form: "Exam not found." }, 404);
  if (exam.ownerId !== params.teacherId) {
    return err("FORBIDDEN", { form: "You do not have permission to perform this action." }, 403);
  }

  const attempt = await getAttemptById(params.attemptId);
  if (!attempt || attempt.examId !== exam.id) {
    return err("NOT_FOUND", { form: "Attempt not found for this exam." }, 404);
  }
  if (!isSubmitted(attempt.status)) {
    return err("NOT_SUBMITTED", { form: "Results can only be published for submitted attempts." }, 409);
  }

  const now = nowIso();
  let nextPublishedAt = attempt.resultPublishedAt ?? null;
  if (params.published) {
    // idempotent: keep existing publish time if already published
    nextPublishedAt = isResultPublished(attempt) ? attempt.resultPublishedAt : now;
  } else {
    nextPublishedAt = null;
  }

  let updated = attempt;
  if (nextPublishedAt !== (attempt.resultPublishedAt ?? null)) {
    updated = { ...attempt, resultPublishedAt: nextPublishedAt, updatedAt: now };
    await replaceAttempt(updated);
  }

  return {
    ok: true,
    data: {
      summary: {
        attemptId: updated.id,
        resultPublishedAt: updated.resultPublishedAt ?? null,
        published: isResultPublished(updated),
        gradingComplete: isGradingCompleteForPublish(updated),
        overallGradingStatus: updated.overallGradingStatus,
      },
    },
  };
}

export type ExamResultsAttemptRow = {
  attempt: Attempt;
  proctoring: ProctoringSummary;
};

export type ExamResultsReport = {
  exam: Exam;
  attempts: ExamResultsAttemptRow[];
  summary: {
    totalAttempts: number;
    submittedCount: number;
    inProgressCount: number;
    gradingCompleteCount: number;
    publishedCount: number;
  };
};

export async function getExamResultsReport(params: {
  examId: string;
  teacherId: string;
}): Promise<ServiceResult<ExamResultsReport>> {
  const exam = await getExamById(params.examId);
  if (!exam) return err("NOT_FOUND", { form: "Exam not found." }, 404);
  if (exam.ownerId !== params.teacherId) {
    return err("FORBIDDEN", { form: "You do not have permission to view this exam report." }, 403);
  }

  const attempts = await getAttemptsByExamId(exam.id);
  const rows = await Promise.all(
    attempts.map(async (attempt) => {
      // ensure grading/sync normalized for display
      const synced = syncAttemptGradingWithExam(attempt, exam);
      if (synced !== attempt) {
        // keep persisted normalized view consistent if changed by sync
        if (
          JSON.stringify(synced.essayGradings ?? null) !== JSON.stringify(attempt.essayGradings ?? null) ||
          synced.essayGradingStatus !== attempt.essayGradingStatus ||
          synced.overallGradingStatus !== attempt.overallGradingStatus ||
          JSON.stringify(synced.essayResult ?? null) !== JSON.stringify(attempt.essayResult ?? null)
        ) {
          await replaceAttempt({ ...synced, updatedAt: nowIso() });
        }
      }
      const proctoring = await getProctoringSummaryForAttemptRecord(synced);
      return { attempt: synced, proctoring };
    }),
  );

  const summary = {
    totalAttempts: rows.length,
    submittedCount: rows.filter((r) => isSubmitted(r.attempt.status)).length,
    inProgressCount: rows.filter((r) => r.attempt.status === "IN_PROGRESS").length,
    gradingCompleteCount: rows.filter(
      (r) => isSubmitted(r.attempt.status) && isGradingCompleteForPublish(r.attempt),
    ).length,
    publishedCount: rows.filter((r) => isResultPublished(r.attempt)).length,
  };

  return { ok: true, data: { exam, attempts: rows, summary } };
}
