import { promises as fs } from "fs";
import path from "path";
import {
  type Attempt,
  type AttemptAnswer,
  type AttemptCameraCheck,
  type AttemptStatus,
  type CandidateInfo,
  type EssayGradingStatus,
  type McqResult,
  type OverallGradingStatus,
  type SubmitReason,
  normalizeAnswersForExam,
} from "./domain";
import type { Exam } from "@/features/exams/domain";
import type { EssayQuestionGrading, EssayResultSummary } from "@/features/essay-grading/domain";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "attempts.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

function asIso(v: unknown, fallback: string): string {
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallback;
}

function asNullableIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function normalizeCandidate(raw: unknown): CandidateInfo {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fullName = typeof r.fullName === "string" ? r.fullName.trim().slice(0, 120) : "";
  return { fullName: fullName || "Candidate" };
}

function normalizeCamera(raw: unknown): AttemptCameraCheck {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const allowed = new Set(["granted", "denied", "unavailable", "skipped", "not_checked"]);
  const status = typeof r.status === "string" && allowed.has(r.status) ? (r.status as AttemptCameraCheck["status"]) : "not_checked";
  return {
    status,
    note: typeof r.note === "string" ? r.note.slice(0, 300) : null,
    checkedAt: asNullableIso(r.checkedAt),
  };
}

function normalizeStatus(raw: unknown): AttemptStatus {
  return raw === "SUBMITTED" || raw === "AUTO_SUBMITTED" || raw === "IN_PROGRESS" ? raw : "IN_PROGRESS";
}

function normalizeSubmitReason(raw: unknown): SubmitReason | null {
  return raw === "MANUAL" || raw === "TIMEOUT" ? raw : null;
}

function normalizeOverall(raw: unknown): OverallGradingStatus {
  if (
    raw === "MCQ_GRADED" ||
    raw === "MCQ_GRADED_PENDING_ESSAY_REVIEW" ||
    raw === "NOT_SUBMITTED" ||
    raw === "ESSAY_GRADED"
  ) {
    return raw;
  }
  // compatibility with older/custom values
  if (raw === "COMPLETED" || raw === "GRADED") return "ESSAY_GRADED";
  return "NOT_SUBMITTED";
}

function normalizeEssayStatus(raw: unknown): EssayGradingStatus {
  if (raw === "PENDING" || raw === "IN_REVIEW" || raw === "FINALIZED") return raw;
  return null;
}

function normalizeMcqResult(raw: unknown): McqResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items = itemsRaw.map((it) => {
    const i = it && typeof it === "object" ? (it as Record<string, unknown>) : {};
    return {
      questionId: typeof i.questionId === "string" ? i.questionId : "",
      selectedOptionId: typeof i.selectedOptionId === "string" ? i.selectedOptionId : null,
      correctOptionId: typeof i.correctOptionId === "string" ? i.correctOptionId : "",
      isCorrect: i.isCorrect === true,
      earnedPoints: typeof i.earnedPoints === "number" && Number.isFinite(i.earnedPoints) ? i.earnedPoints : 0,
      maxPoints: typeof i.maxPoints === "number" && Number.isFinite(i.maxPoints) ? i.maxPoints : 0,
    };
  }).filter((i) => i.questionId);
  return {
    totalEarned: typeof r.totalEarned === "number" && Number.isFinite(r.totalEarned) ? r.totalEarned : 0,
    totalPossible: typeof r.totalPossible === "number" && Number.isFinite(r.totalPossible) ? r.totalPossible : 0,
    gradedAt: asIso(r.gradedAt, new Date().toISOString()),
    items,
  };
}

function normalizeAnswers(raw: unknown): AttemptAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: AttemptAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const questionId = typeof r.questionId === "string" ? r.questionId : "";
    if (!questionId) continue;
    if (r.type === "MCQ") {
      out.push({ questionId, type: "MCQ", selectedOptionId: typeof r.selectedOptionId === "string" ? r.selectedOptionId : null });
    } else if (r.type === "ESSAY") {
      out.push({ questionId, type: "ESSAY", text: typeof r.text === "string" ? r.text : "" });
    }
  }
  return out;
}

function normalizeEssayResult(raw: unknown): EssayResultSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    earned: num(r.earned),
    possible: num(r.possible),
    finalizedCount: Math.max(0, Math.floor(num(r.finalizedCount))),
    totalCount: Math.max(0, Math.floor(num(r.totalCount))),
  };
}

function normalizeEssayGradings(raw: unknown, attemptId: string, examId: string): EssayQuestionGrading[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: EssayQuestionGrading[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const questionId = typeof r.questionId === "string" ? r.questionId : "";
    if (!questionId) continue;

    let aiSuggestion: EssayQuestionGrading["aiSuggestion"] = null;
    if (r.aiSuggestion && typeof r.aiSuggestion === "object") {
      const a = r.aiSuggestion as Record<string, unknown>;
      const status = a.status === "success" || a.status === "error" || a.status === "unavailable" ? a.status : "error";
      const criteria = Array.isArray(a.criteria)
        ? a.criteria
            .map((c) => {
              if (!c || typeof c !== "object") return null;
              const cr = c as Record<string, unknown>;
              if (typeof cr.criterionId !== "string") return null;
              const score = typeof cr.score === "number" && Number.isFinite(cr.score) ? cr.score : Number(cr.score);
              return {
                criterionId: cr.criterionId,
                score: Number.isFinite(score) ? score : 0,
                ...(typeof cr.comment === "string" && cr.comment.trim() ? { comment: cr.comment.slice(0, 2000) } : {}),
              };
            })
            .filter((x): x is NonNullable<typeof x> => !!x)
        : undefined;
      aiSuggestion = {
        status,
        ...(criteria ? { criteria } : {}),
        ...(typeof a.suggestedTotal === "number" && Number.isFinite(a.suggestedTotal) ? { suggestedTotal: a.suggestedTotal } : {}),
        ...(typeof a.overallComment === "string" && a.overallComment.trim() ? { overallComment: a.overallComment.slice(0, 4000) } : {}),
        ...(Array.isArray(a.strengths) ? { strengths: a.strengths.filter((s): s is string => typeof s === "string").slice(0, 10) } : {}),
        ...(Array.isArray(a.improvements) ? { improvements: a.improvements.filter((s): s is string => typeof s === "string").slice(0, 10) } : {}),
        ...(typeof a.generatedAt === "string" ? { generatedAt: a.generatedAt } : {}),
        ...(typeof a.model === "string" ? { model: a.model } : {}),
        ...(typeof a.error === "string" ? { error: a.error.slice(0, 500) } : {}),
      };
    }

    let teacherEvaluation: EssayQuestionGrading["teacherEvaluation"] = null;
    if (r.teacherEvaluation && typeof r.teacherEvaluation === "object") {
      const t = r.teacherEvaluation as Record<string, unknown>;
      const criteria = Array.isArray(t.criteria)
        ? t.criteria
            .map((c) => {
              if (!c || typeof c !== "object") return null;
              const cr = c as Record<string, unknown>;
              if (typeof cr.criterionId !== "string") return null;
              const score = typeof cr.score === "number" && Number.isFinite(cr.score) ? cr.score : Number(cr.score);
              return {
                criterionId: cr.criterionId,
                score: Number.isFinite(score) ? score : 0,
                ...(typeof cr.comment === "string" && cr.comment.trim() ? { comment: cr.comment.slice(0, 2000) } : {}),
              };
            })
            .filter((x): x is NonNullable<typeof x> => !!x)
        : [];
      const evalStatus = t.status === "FINALIZED" ? "FINALIZED" : "DRAFT";
      teacherEvaluation = {
        criteria,
        totalScore: typeof t.totalScore === "number" && Number.isFinite(t.totalScore) ? t.totalScore : 0,
        ...(typeof t.overallComment === "string" && t.overallComment.trim() ? { overallComment: t.overallComment.slice(0, 4000) } : {}),
        status: evalStatus,
        updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),
        ...(typeof t.finalizedAt === "string" ? { finalizedAt: t.finalizedAt } : {}),
      };
    }

    out.push({
      attemptId: typeof r.attemptId === "string" ? r.attemptId : attemptId,
      examId: typeof r.examId === "string" ? r.examId : examId,
      questionId,
      aiSuggestion: aiSuggestion ?? null,
      teacherEvaluation: teacherEvaluation ?? null,
    });
  }
  return out;
}

function normalizeAttempt(raw: unknown): Attempt {
  const now = new Date().toISOString();
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const status = normalizeStatus(r.status);
  const id = typeof r.id === "string" ? r.id : "";
  const examId = typeof r.examId === "string" ? r.examId : "";
  const essayGradings = normalizeEssayGradings(r.essayGradings, id, examId);
  const essayResult = normalizeEssayResult(r.essayResult);
  return {
    id,
    examId,
    joinCode: typeof r.joinCode === "string" ? r.joinCode : "",
    candidate: normalizeCandidate(r.candidate),
    consentAcceptedAt: asNullableIso(r.consentAcceptedAt),
    cameraCheck: normalizeCamera(r.cameraCheck),
    status,
    submitReason: normalizeSubmitReason(r.submitReason),
    startedAt: asIso(r.startedAt, now),
    deadlineAt: asIso(r.deadlineAt, now),
    submittedAt: asNullableIso(r.submittedAt),
    answers: normalizeAnswers(r.answers),
    mcqResult: normalizeMcqResult(r.mcqResult),
    essayGradingStatus: normalizeEssayStatus(r.essayGradingStatus),
    overallGradingStatus: status === "IN_PROGRESS" ? "NOT_SUBMITTED" : normalizeOverall(r.overallGradingStatus),
    ...(essayGradings ? { essayGradings } : {}),
    essayResult: essayResult ?? null,
    resultPublishedAt: asNullableIso(r.resultPublishedAt),
    createdAt: asIso(r.createdAt, now),
    updatedAt: asIso(r.updatedAt, now),
  };
}

async function readAll(): Promise<Attempt[]> {
  await ensureStore();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeAttempt).filter((a) => a.id);
  } catch {
    return [];
  }
}

async function writeAll(attempts: Attempt[]): Promise<void> {
  await ensureStore();
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(attempts, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

export async function getAttemptById(id: string): Promise<Attempt | null> {
  const attempts = await readAll();
  return attempts.find((a) => a.id === id) ?? null;
}

export async function createAttempt(attempt: Attempt): Promise<Attempt> {
  const attempts = await readAll();
  attempts.push(attempt);
  await writeAll(attempts);
  return attempt;
}

export async function replaceAttempt(updated: Attempt): Promise<void> {
  const attempts = await readAll();
  const idx = attempts.findIndex((a) => a.id === updated.id);
  if (idx === -1) {
    attempts.push(updated);
  } else {
    attempts[idx] = updated;
  }
  await writeAll(attempts);
}

export async function getAllAttempts(): Promise<Attempt[]> {
  return readAll();
}

// Reconcile answers shape against exam when needed (e.g. after load)
export function reconcileAttemptAnswers(attempt: Attempt, exam: Exam): Attempt {
  return { ...attempt, answers: normalizeAnswersForExam(exam, attempt.answers) };
}

export async function getAttemptsByExamId(examId: string): Promise<Attempt[]> {
  const attempts = await readAll();
  return attempts
    .filter((a) => a.examId === examId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
