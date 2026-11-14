import type { EssayQuestion, Exam, FieldErrors } from "@/features/exams/domain";
import { getExamById } from "@/features/exams/store";
import type { Attempt } from "@/features/attempts/domain";
import { getAttemptById, getAttemptsByExamId, replaceAttempt } from "@/features/attempts/store";
import { syncAttemptGradingWithExam } from "@/features/attempts/grading";
import {
  type AiEssaySuggestion,
  type EssayGradingSummary,
  type EssayQuestionGrading,
  computeEssayGradingSummary,
  ensureEssayGradingRecords,
  getAttemptEssayAnswerText,
  getEssayQuestions,
  isSubmittedAttempt,
  validateTeacherEvaluationInput,
} from "./domain";
import { generateAiEssaySuggestion } from "./ai";

export type GradingErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "NOT_SUBMITTED"
  | "NOT_ESSAY_QUESTION";

export type GradingServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: GradingErrorCode; errors: FieldErrors; status?: number };

function fail(code: GradingErrorCode, errors: FieldErrors, status?: number): GradingServiceResult<never> {
  return { ok: false, code, errors, status };
}

export type AttemptGradingContext = {
  exam: Exam;
  attempt: Attempt;
  essayQuestions: EssayQuestion[];
  records: EssayQuestionGrading[];
  summary: EssayGradingSummary;
};

async function loadOwnedAttempt(
  examId: string,
  attemptId: string,
  teacherId: string,
): Promise<GradingServiceResult<{ exam: Exam; attempt: Attempt }>> {
  const exam = await getExamById(examId);
  if (!exam) return fail("NOT_FOUND", { form: "Exam not found." }, 404);
  if (exam.ownerId !== teacherId) return fail("FORBIDDEN", { form: "You do not have permission to access this exam." }, 403);
  const attempt = await getAttemptById(attemptId);
  if (!attempt || attempt.examId !== exam.id) return fail("NOT_FOUND", { form: "Attempt not found." }, 404);
  return { ok: true, data: { exam, attempt } };
}

export function buildGradingContext(exam: Exam, attempt: Attempt): AttemptGradingContext {
  const synced = syncAttemptGradingWithExam(attempt, exam);
  const essayQuestions = getEssayQuestions(exam);
  const records = ensureEssayGradingRecords(synced, exam);
  const summary = computeEssayGradingSummary({ ...synced, essayGradings: records }, exam);
  return { exam, attempt: { ...synced, essayGradings: records }, essayQuestions, records, summary };
}

export async function getAttemptGradingContext(params: {
  examId: string;
  attemptId: string;
  teacherId: string;
}): Promise<GradingServiceResult<AttemptGradingContext>> {
  const loaded = await loadOwnedAttempt(params.examId, params.attemptId, params.teacherId);
  if (!loaded.ok) return loaded;
  const { exam, attempt } = loaded.data;
  const ctx = buildGradingContext(exam, attempt);
  // persist normalized/synced grading state if needed (safe, idempotent)
  if (JSON.stringify(attempt.essayGradings ?? null) !== JSON.stringify(ctx.attempt.essayGradings ?? null) ||
      attempt.essayGradingStatus !== ctx.attempt.essayGradingStatus ||
      attempt.overallGradingStatus !== ctx.attempt.overallGradingStatus ||
      JSON.stringify(attempt.essayResult ?? null) !== JSON.stringify(ctx.attempt.essayResult ?? null)) {
    await replaceAttempt({ ...ctx.attempt, updatedAt: new Date().toISOString() });
  }
  return { ok: true, data: ctx };
}

export async function listExamGradingOverview(params: {
  examId: string;
  teacherId: string;
}): Promise<GradingServiceResult<{ exam: Exam; items: Array<{ attempt: Attempt; summary: EssayGradingSummary; essayQuestionCount: number }> }>> {
  const exam = await getExamById(params.examId);
  if (!exam) return fail("NOT_FOUND", { form: "Exam not found." }, 404);
  if (exam.ownerId !== params.teacherId) return fail("FORBIDDEN", { form: "You do not have permission to access this exam." }, 403);
  const attempts = await getAttemptsByExamId(exam.id);
  const essayQuestionCount = getEssayQuestions(exam).length;
  const items = attempts.map((a) => {
    const ctx = buildGradingContext(exam, a);
    return { attempt: ctx.attempt, summary: ctx.summary, essayQuestionCount };
  });
  return { ok: true, data: { exam, items } };
}

export async function generateSuggestionForEssay(params: {
  examId: string;
  attemptId: string;
  teacherId: string;
  questionId: string;
}): Promise<GradingServiceResult<{ attempt: Attempt; record: EssayQuestionGrading; summary: EssayGradingSummary }>> {
  const loaded = await loadOwnedAttempt(params.examId, params.attemptId, params.teacherId);
  if (!loaded.ok) return loaded;
  const { exam, attempt } = loaded.data;
  if (!isSubmittedAttempt(attempt)) {
    return fail("NOT_SUBMITTED", { form: "AI suggestions can only be generated for submitted attempts." }, 409);
  }
  const q = exam.questions.find((x) => x.id === params.questionId);
  if (!q || q.type !== "ESSAY") return fail("NOT_ESSAY_QUESTION", { form: "Invalid essay question." }, 400);

  const records = ensureEssayGradingRecords(attempt, exam);
  const idx = records.findIndex((r) => r.questionId === q.id);
  if (idx === -1) return fail("INVALID", { form: "Grading record not found for this question." }, 400);

  const answerText = getAttemptEssayAnswerText(attempt, q.id);
  const suggestion: AiEssaySuggestion = await generateAiEssaySuggestion({ question: q as EssayQuestion, answerText });
  const nextRecords = [...records];
  nextRecords[idx] = { ...nextRecords[idx], aiSuggestion: suggestion };

  const synced = syncAttemptGradingWithExam({ ...attempt, essayGradings: nextRecords }, exam);
  const summary = computeEssayGradingSummary(synced, exam);
  const nextAttempt: Attempt = { ...synced, essayGradings: ensureEssayGradingRecords(synced, exam), updatedAt: new Date().toISOString() };
  await replaceAttempt(nextAttempt);
  const record = (nextAttempt.essayGradings || []).find((r) => r.questionId === q.id)!;
  return { ok: true, data: { attempt: nextAttempt, record, summary } };
}

export async function saveTeacherEssayEvaluation(params: {
  examId: string;
  attemptId: string;
  teacherId: string;
  questionId: string;
  input: unknown;
  finalize: boolean;
}): Promise<GradingServiceResult<{ attempt: Attempt; record: EssayQuestionGrading; summary: EssayGradingSummary }>> {
  const loaded = await loadOwnedAttempt(params.examId, params.attemptId, params.teacherId);
  if (!loaded.ok) return loaded;
  const { exam, attempt } = loaded.data;
  if (!isSubmittedAttempt(attempt)) {
    return fail("NOT_SUBMITTED", { form: "Only submitted attempts can be graded." }, 409);
  }
  const q = exam.questions.find((x) => x.id === params.questionId);
  if (!q || q.type !== "ESSAY") return fail("NOT_ESSAY_QUESTION", { form: "Invalid essay question." }, 400);

  const validated = validateTeacherEvaluationInput(q as EssayQuestion, params.input);
  if (!validated.ok) return fail("INVALID", validated.errors, 400);

  const records = ensureEssayGradingRecords(attempt, exam);
  const idx = records.findIndex((r) => r.questionId === q.id);
  if (idx === -1) return fail("INVALID", { form: "Grading record not found for this question." }, 400);

  const now = new Date().toISOString();
  const existing = records[idx].teacherEvaluation;
  const teacherEvaluation = {
    criteria: validated.data.criteria,
    totalScore: validated.data.totalScore,
    ...(validated.data.overallComment ? { overallComment: validated.data.overallComment } : {}),
    status: params.finalize ? ("FINALIZED" as const) : ("DRAFT" as const),
    updatedAt: now,
    ...(params.finalize ? { finalizedAt: now } : existing?.finalizedAt ? { finalizedAt: existing.finalizedAt } : {}),
  };

  const nextRecords = [...records];
  nextRecords[idx] = { ...nextRecords[idx], teacherEvaluation };

  const synced = syncAttemptGradingWithExam({ ...attempt, essayGradings: nextRecords }, exam);
  const summary = computeEssayGradingSummary(synced, exam);
  const nextAttempt: Attempt = { ...synced, essayGradings: ensureEssayGradingRecords(synced, exam), updatedAt: now };
  await replaceAttempt(nextAttempt);
  const record = (nextAttempt.essayGradings || []).find((r) => r.questionId === q.id)!;
  return { ok: true, data: { attempt: nextAttempt, record, summary } };
}
