import type { EssayQuestion, Exam, FieldErrors } from "@/features/exams/domain";

// NOTE: Keep this module free of imports from attempts/domain to avoid circular dependencies.
// Attempt-dependent helpers accept a minimal structural type.

export type AiSuggestionStatus = "success" | "error" | "unavailable";

export interface EssayCriterionScore {
  criterionId: string;
  score: number;
  comment?: string;
}

export interface AiEssaySuggestion {
  status: AiSuggestionStatus;
  criteria?: EssayCriterionScore[];
  suggestedTotal?: number;
  overallComment?: string;
  strengths?: string[];
  improvements?: string[];
  generatedAt?: string;
  model?: string;
  error?: string;
}

export interface TeacherEssayEvaluation {
  criteria: EssayCriterionScore[];
  totalScore: number;
  overallComment?: string;
  status: "DRAFT" | "FINALIZED";
  updatedAt: string;
  finalizedAt?: string;
}

export interface EssayQuestionGrading {
  attemptId: string;
  examId: string;
  questionId: string;
  aiSuggestion?: AiEssaySuggestion | null;
  teacherEvaluation?: TeacherEssayEvaluation | null;
}

export interface EssayResultSummary {
  earned: number;
  possible: number;
  finalizedCount: number;
  totalCount: number;
}

export type EssayGradingStatusValue = "PENDING" | "IN_REVIEW" | "FINALIZED" | null;
export type OverallGradingStatusValue =
  | "NOT_SUBMITTED"
  | "MCQ_GRADED"
  | "MCQ_GRADED_PENDING_ESSAY_REVIEW"
  | "ESSAY_GRADED";

export interface EssayGradingSummary {
  essayTotalCount: number;
  essayFinalizedCount: number;
  essayDraftCount: number;
  essaySuggestedCount: number;
  essayEarned: number; // finalized only
  essayPossible: number;
  mcqEarned: number;
  mcqPossible: number;
  overallEarned: number;
  overallPossible: number;
  allEssaysFinalized: boolean;
  attemptEssayStatus: EssayGradingStatusValue;
  overallGradingStatus: OverallGradingStatusValue;
}

export type GradingAttemptLike = {
  id: string;
  examId: string;
  status: string;
  answers: Array<{ questionId: string; type: "MCQ" | "ESSAY"; selectedOptionId?: string | null; text?: string }>;
  mcqResult?: { totalEarned: number; totalPossible: number } | null;
  overallGradingStatus?: OverallGradingStatusValue;
  essayGradings?: EssayQuestionGrading[] | null;
};

export function roundScore(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function clampScore(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function isSubmittedAttempt(attempt: { status: string }): boolean {
  return attempt.status === "SUBMITTED" || attempt.status === "AUTO_SUBMITTED";
}

export function getEssayQuestions(exam: Exam): EssayQuestion[] {
  return exam.questions
    .filter((q): q is EssayQuestion => q.type === "ESSAY")
    .sort((a, b) => a.order - b.order);
}

export function getAttemptEssayAnswerText(attempt: GradingAttemptLike, questionId: string): string {
  const a = attempt.answers.find((x) => x.questionId === questionId);
  if (!a || a.type !== "ESSAY") return "";
  return a.text || "";
}

export function normalizeCriterionScores(
  question: EssayQuestion,
  raw: unknown,
): { ok: true; data: EssayCriterionScore[] } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const arr = Array.isArray(raw) ? raw : null;
  const byId = new Map<string, unknown>();
  if (arr) {
    for (const item of arr) {
      if (item && typeof item === "object") {
        const r = item as Record<string, unknown>;
        if (typeof r.criterionId === "string") byId.set(r.criterionId, r);
      }
    }
  }
  const criteria: EssayCriterionScore[] = question.rubricCriteria.map((c) => {
    const rawItem = byId.get(c.id);
    const r = rawItem && typeof rawItem === "object" ? (rawItem as Record<string, unknown>) : {};
    const scoreRaw = r.score;
    let score = 0;
    if (scoreRaw === null || scoreRaw === undefined || scoreRaw === "") {
      errors[`criterion_${c.id}`] = "Please enter a score for this criterion.";
      score = 0;
    } else {
      const n = typeof scoreRaw === "number" ? scoreRaw : Number(scoreRaw);
      if (!Number.isFinite(n)) {
        errors[`criterion_${c.id}`] = "Criterion score is invalid.";
      } else if (n < 0 || n > c.maxScore + 0.001) {
        errors[`criterion_${c.id}`] = `Criterion score must be between 0 and ${c.maxScore}.`; 
        score = clampScore(n, 0, c.maxScore);
      } else {
        score = roundScore(clampScore(n, 0, c.maxScore));
      }
    }
    const comment = typeof r.comment === "string" ? r.comment.trim().slice(0, 2000) : undefined;
    return { criterionId: c.id, score, ...(comment ? { comment } : {}) };
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: criteria };
}

export function computeTotalFromCriteria(criteria: EssayCriterionScore[]): number {
  return roundScore(criteria.reduce((sum, c) => sum + (Number.isFinite(c.score) ? c.score : 0), 0));
}

export function validateTeacherEvaluationInput(
  question: EssayQuestion,
  input: unknown,
): { ok: true; data: { criteria: EssayCriterionScore[]; totalScore: number; overallComment?: string } } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const crit = normalizeCriterionScores(question, obj.criteria);
  if (!crit.ok) {
    return { ok: false, errors: { ...errors, ...crit.errors } };
  }
  const criteria = crit.data;
  const totalScore = computeTotalFromCriteria(criteria);
  if (totalScore < -0.001 || totalScore > question.points + 0.001) {
    errors.totalScore = `Total score must be between 0 and ${question.points}.`; 
  }
  const overallComment = typeof obj.overallComment === "string" ? obj.overallComment.trim().slice(0, 4000) : undefined;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { criteria, totalScore: clampScore(totalScore, 0, question.points), ...(overallComment ? { overallComment } : {}) } };
}

export function emptyGradingRecord(attempt: { id: string; examId: string }, questionId: string): EssayQuestionGrading {
  return { attemptId: attempt.id, examId: attempt.examId, questionId, aiSuggestion: null, teacherEvaluation: null };
}

export function ensureEssayGradingRecords(attempt: GradingAttemptLike, exam: Exam): EssayQuestionGrading[] {
  const essays = getEssayQuestions(exam);
  const existing = Array.isArray(attempt.essayGradings) ? attempt.essayGradings : [];
  const byQ = new Map(existing.map((r) => [r.questionId, r]));
  return essays.map((q) => {
    const found = byQ.get(q.id);
    if (found && found.attemptId === attempt.id && found.questionId === q.id) return found;
    return emptyGradingRecord(attempt, q.id);
  });
}

export function getEssayQuestionStatus(record: EssayQuestionGrading | undefined): "PENDING" | "SUGGESTED" | "DRAFT" | "FINALIZED" {
  if (!record) return "PENDING";
  const evalStatus = record.teacherEvaluation?.status;
  if (evalStatus === "FINALIZED") return "FINALIZED";
  if (evalStatus === "DRAFT") return "DRAFT";
  if (record.aiSuggestion?.status === "success") return "SUGGESTED";
  return "PENDING";
}

export function computeEssayGradingSummary(attempt: GradingAttemptLike, exam: Exam): EssayGradingSummary {
  const essays = getEssayQuestions(exam);
  const records = ensureEssayGradingRecords(attempt, exam);
  const byQ = new Map(records.map((r) => [r.questionId, r]));

  let essayFinalizedCount = 0;
  let essayDraftCount = 0;
  let essaySuggestedCount = 0;
  let essayEarned = 0;
  let essayPossible = 0;

  for (const q of essays) {
    essayPossible = roundScore(essayPossible + q.points);
    const r = byQ.get(q.id);
    const st = getEssayQuestionStatus(r);
    if (st === "FINALIZED") {
      essayFinalizedCount += 1;
      essayEarned = roundScore(essayEarned + (r?.teacherEvaluation?.totalScore || 0));
    } else if (st === "DRAFT") {
      essayDraftCount += 1;
    } else if (st === "SUGGESTED") {
      essaySuggestedCount += 1;
    }
  }

  const essayTotalCount = essays.length;
  const allEssaysFinalized = essayTotalCount === 0 || essayFinalizedCount === essayTotalCount;

  let attemptEssayStatus: EssayGradingStatusValue = null;
  if (essayTotalCount > 0) {
    if (allEssaysFinalized) attemptEssayStatus = "FINALIZED";
    else if (essayDraftCount > 0 || essayFinalizedCount > 0 || essaySuggestedCount > 0) attemptEssayStatus = "IN_REVIEW";
    else attemptEssayStatus = "PENDING";
  }

  const mcqEarned = attempt.mcqResult?.totalEarned ?? 0;
  const mcqPossible = attempt.mcqResult?.totalPossible ?? 0;
  const overallEarned = roundScore(mcqEarned + essayEarned);
  const overallPossible = roundScore(mcqPossible + essayPossible);

  let overallGradingStatus: OverallGradingStatusValue = attempt.overallGradingStatus ?? "NOT_SUBMITTED";
  if (!isSubmittedAttempt(attempt)) {
    overallGradingStatus = "NOT_SUBMITTED";
  } else if (essayTotalCount === 0) {
    overallGradingStatus = "MCQ_GRADED";
  } else if (allEssaysFinalized) {
    overallGradingStatus = "ESSAY_GRADED";
  } else {
    overallGradingStatus = "MCQ_GRADED_PENDING_ESSAY_REVIEW";
  }

  return {
    essayTotalCount,
    essayFinalizedCount,
    essayDraftCount,
    essaySuggestedCount,
    essayEarned,
    essayPossible,
    mcqEarned,
    mcqPossible,
    overallEarned,
    overallPossible,
    allEssaysFinalized,
    attemptEssayStatus,
    overallGradingStatus,
  };
}

export function withUpdatedGrading<T extends GradingAttemptLike>(
  attempt: T,
  exam: Exam,
  records: EssayQuestionGrading[],
): T & {
  essayGradings: EssayQuestionGrading[];
  essayGradingStatus: EssayGradingStatusValue;
  overallGradingStatus: OverallGradingStatusValue;
  essayResult: EssayResultSummary | null;
  updatedAt: string;
} {
  const ensured = ensureEssayGradingRecords({ ...attempt, essayGradings: records } as GradingAttemptLike, exam);
  const summary = computeEssayGradingSummary({ ...attempt, essayGradings: ensured } as GradingAttemptLike, exam);
  return {
    ...attempt,
    essayGradings: ensured,
    essayGradingStatus: summary.attemptEssayStatus,
    overallGradingStatus: summary.overallGradingStatus,
    essayResult: summary.essayTotalCount > 0 ? {
      earned: summary.essayEarned,
      possible: summary.essayPossible,
      finalizedCount: summary.essayFinalizedCount,
      totalCount: summary.essayTotalCount,
    } : null,
    updatedAt: new Date().toISOString(),
  };
}
