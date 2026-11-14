import type { Exam, FieldErrors, Question } from "@/features/exams/domain";

import type { EssayQuestionGrading, EssayResultSummary } from "@/features/essay-grading/domain";

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";
export type SubmitReason = "MANUAL" | "TIMEOUT";
export type CameraCheckStatus = "granted" | "denied" | "unavailable" | "skipped" | "not_checked";
export type EssayGradingStatus = "PENDING" | "IN_REVIEW" | "FINALIZED" | null;
export type OverallGradingStatus =
  | "NOT_SUBMITTED"
  | "MCQ_GRADED"
  | "MCQ_GRADED_PENDING_ESSAY_REVIEW"
  | "ESSAY_GRADED";

export interface CandidateInfo {
  fullName: string;
}

export interface AttemptCameraCheck {
  status: CameraCheckStatus;
  note: string | null;
  checkedAt: string | null;
}

export interface McqAnswer {
  questionId: string;
  type: "MCQ";
  selectedOptionId: string | null;
}

export interface EssayAnswer {
  questionId: string;
  type: "ESSAY";
  text: string;
}

export type AttemptAnswer = McqAnswer | EssayAnswer;

export interface McqGradeItem {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
}

export interface McqResult {
  totalEarned: number;
  totalPossible: number;
  gradedAt: string;
  items: McqGradeItem[];
}

export interface Attempt {
  id: string;
  examId: string;
  joinCode: string;
  candidate: CandidateInfo;
  consentAcceptedAt: string | null;
  cameraCheck: AttemptCameraCheck;
  status: AttemptStatus;
  submitReason: SubmitReason | null;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  answers: AttemptAnswer[];
  mcqResult: McqResult | null;
  essayGradingStatus: EssayGradingStatus | null;
  overallGradingStatus: OverallGradingStatus;
  essayGradings?: EssayQuestionGrading[];
  essayResult?: EssayResultSummary | null;
  resultPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type JoinAvailabilityStatus =
  | "not_found"
  | "not_published"
  | "not_open"
  | "closed"
  | "open";

export interface PublicJoinExam {
  id: string;
  title: string;
  durationMinutes: number;
  openAt: string | null;
  closeAt: string | null;
  questionCount: number;
}

export interface JoinAvailability {
  status: JoinAvailabilityStatus;
  exam?: PublicJoinExam;
  openAt?: string | null;
  closeAt?: string | null;
  message?: string;
}

export interface PublicMcqOption {
  id: string;
  content: string;
  order: number;
}

export interface PublicQuestionBase {
  id: string;
  type: "MCQ" | "ESSAY";
  prompt: string;
  points: number;
  order: number;
}

export interface PublicMcqQuestion extends PublicQuestionBase {
  type: "MCQ";
  options: PublicMcqOption[];
}

export interface PublicEssayQuestion extends PublicQuestionBase {
  type: "ESSAY";
  rubricCriteria: { id: string; name: string; description: string; maxScore: number; order: number }[];
}

export type PublicQuestion = PublicMcqQuestion | PublicEssayQuestion;

export interface PublicExam {
  id: string;
  title: string;
  durationMinutes: number;
  openAt: string | null;
  closeAt: string | null;
}

export interface PublishedMcqItem {
  questionId: string;
  selectedOptionId: string | null;
  isCorrect: boolean;
  earnedPoints: number;
  maxPoints: number;
}

export interface PublishedEssayCriterion {
  criterionId: string;
  name: string;
  description: string;
  maxScore: number;
  score: number | null;
  comment?: string;
}

export interface PublishedEssayItem {
  questionId: string;
  prompt: string;
  maxPoints: number;
  status: "FINALIZED" | "NOT_FINALIZED";
  totalScore: number | null;
  overallComment?: string;
  criteria: PublishedEssayCriterion[];
}

export interface CandidatePublishedResult {
  publishedAt: string;
  mcq: {
    totalEarned: number;
    totalPossible: number;
    items: PublishedMcqItem[];
  } | null;
  essay: {
    earned: number; // finalized only
    possible: number;
    finalizedCount: number;
    totalCount: number;
    complete: boolean;
    items: PublishedEssayItem[];
  } | null;
  overall: {
    earned: number;
    possible: number;
    complete: boolean;
  };
}

export interface CandidateAttemptView {
  attempt: {
    id: string;
    examId: string;
    joinCode: string;
    candidate: CandidateInfo;
    consentAcceptedAt: string | null;
    cameraCheck: AttemptCameraCheck;
    status: AttemptStatus;
    submitReason: SubmitReason | null;
    startedAt: string;
    deadlineAt: string;
    submittedAt: string | null;
    resultPublishedAt: string | null;
    answers: AttemptAnswer[];
    mcqSummary: { totalEarned: number; totalPossible: number } | null;
    essayGradingStatus: EssayGradingStatus | null;
    overallGradingStatus: OverallGradingStatus;
  };
  exam: PublicExam;
  questions: PublicQuestion[];
  publishedResult: CandidatePublishedResult | null;
  serverNow: string;
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getJoinAvailability(exam: Exam | null, nowMs = Date.now()): JoinAvailability {
  if (!exam) return { status: "not_found", message: "This join code is invalid or the exam is not available." };
  if (exam.status !== "PUBLISHED" || !exam.joinCode) {
    return { status: "not_published", message: "This join code is invalid or the exam is not available." };
  }
  const openAtMs = exam.openAt ? new Date(exam.openAt).getTime() : NaN;
  const closeAtMs = exam.closeAt ? new Date(exam.closeAt).getTime() : NaN;
  if (Number.isFinite(openAtMs) && nowMs < openAtMs) {
    return {
      status: "not_open",
      openAt: exam.openAt,
      closeAt: exam.closeAt,
      message: "This exam is not open yet.",
      exam: sanitizeExamForJoin(exam),
    };
  }
  if (Number.isFinite(closeAtMs) && nowMs > closeAtMs) {
    return {
      status: "closed",
      openAt: exam.openAt,
      closeAt: exam.closeAt,
      message: "This exam is no longer accepting entries.",
      exam: sanitizeExamForJoin(exam),
    };
  }
  return { status: "open", exam: sanitizeExamForJoin(exam) };
}

export function sanitizeExamForJoin(exam: Exam): PublicJoinExam {
  return {
    id: exam.id,
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    openAt: exam.openAt,
    closeAt: exam.closeAt,
    questionCount: exam.questions.length,
  };
}

export function sanitizeExamForCandidate(exam: Exam): { exam: PublicExam; questions: PublicQuestion[] } {
  const questions: PublicQuestion[] = [...exam.questions]
    .sort((a, b) => a.order - b.order)
    .map((q): PublicQuestion => {
      if (q.type === "MCQ") {
        return {
          id: q.id,
          type: "MCQ",
          prompt: q.prompt,
          points: q.points,
          order: q.order,
          options: [...q.options]
            .sort((a, b) => a.order - b.order)
            .map((o) => ({ id: o.id, content: o.content, order: o.order })),
        };
      }
      return {
        id: q.id,
        type: "ESSAY",
        prompt: q.prompt,
        points: q.points,
        order: q.order,
        rubricCriteria: [...(q.rubricCriteria || [])]
          .sort((a, b) => a.order - b.order)
          .map((c) => ({ id: c.id, name: c.name, description: c.description, maxScore: c.maxScore, order: c.order })),
      };
    });
  return {
    exam: {
      id: exam.id,
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      openAt: exam.openAt,
      closeAt: exam.closeAt,
    },
    questions,
  };
}

export function validateCandidateInput(
  input: unknown,
): { ok: true; data: CandidateInfo } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fullName = typeof obj.fullName === "string" ? obj.fullName.trim() : "";
  if (!fullName) errors.fullName = "Please enter your full name.";
  else if (fullName.length < 2) errors.fullName = "Full name must be at least 2 characters.";
  else if (fullName.length > 120) errors.fullName = "Full name must be 120 characters or fewer.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { fullName } };
}

export function normalizeCameraCheck(input: unknown): AttemptCameraCheck {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const rawStatus = typeof obj.status === "string" ? obj.status : "not_checked";
  const allowed: CameraCheckStatus[] = ["granted", "denied", "unavailable", "skipped", "not_checked"];
  const status = (allowed.includes(rawStatus as CameraCheckStatus) ? rawStatus : "not_checked") as CameraCheckStatus;
  const note = typeof obj.note === "string" ? obj.note.slice(0, 300) : null;
  return {
    status,
    note,
    checkedAt: status === "not_checked" ? null : new Date().toISOString(),
  };
}

export function computeDeadlineAt(startedAtIso: string, durationMinutes: number, closeAt: string | null): string {
  const startedMs = new Date(startedAtIso).getTime();
  const byDuration = startedMs + Math.max(1, durationMinutes) * 60_000;
  const closeMs = closeAt ? new Date(closeAt).getTime() : NaN;
  const deadlineMs = Number.isFinite(closeMs) ? Math.min(byDuration, closeMs) : byDuration;
  return new Date(deadlineMs).toISOString();
}

export function normalizeAnswersForExam(exam: Exam, answers: AttemptAnswer[] | null | undefined): AttemptAnswer[] {
  const list = Array.isArray(answers) ? answers : [];
  const byId = new Map<string, AttemptAnswer>();
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const qid = typeof (a as { questionId?: unknown }).questionId === "string" ? (a as { questionId: string }).questionId : "";
    if (!qid) continue;
    if ((a as { type?: unknown }).type === "MCQ") {
      const sel = (a as { selectedOptionId?: unknown }).selectedOptionId;
      byId.set(qid, { questionId: qid, type: "MCQ", selectedOptionId: typeof sel === "string" ? sel : null });
    } else if ((a as { type?: unknown }).type === "ESSAY") {
      const text = (a as { text?: unknown }).text;
      byId.set(qid, { questionId: qid, type: "ESSAY", text: typeof text === "string" ? text : "" });
    }
  }

  return [...exam.questions]
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      if (q.type === "MCQ") {
        const existing = byId.get(q.id);
        let selectedOptionId: string | null = null;
        if (existing && existing.type === "MCQ") {
          selectedOptionId = existing.selectedOptionId && q.options.some((o) => o.id === existing.selectedOptionId)
            ? existing.selectedOptionId
            : null;
        }
        return { questionId: q.id, type: "MCQ", selectedOptionId } as McqAnswer;
      }
      const existing = byId.get(q.id);
      const text = existing && existing.type === "ESSAY" ? existing.text : "";
      return { questionId: q.id, type: "ESSAY", text } as EssayAnswer;
    });
}

export function upsertAnswers(exam: Exam, current: AttemptAnswer[], patch: unknown): AttemptAnswer[] {
  const base = normalizeAnswersForExam(exam, current);
  if (!Array.isArray(patch)) return base;
  const byId = new Map(base.map((a) => [a.questionId, a] as const));
  for (const item of patch) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const questionId = typeof r.questionId === "string" ? r.questionId : "";
    if (!questionId) continue;
    const question = exam.questions.find((q) => q.id === questionId);
    if (!question) continue;
    if (question.type === "MCQ") {
      const sel = typeof r.selectedOptionId === "string" ? r.selectedOptionId : null;
      const validSel = sel && question.options.some((o) => o.id === sel) ? sel : null;
      byId.set(questionId, { questionId, type: "MCQ", selectedOptionId: validSel });
    } else {
      const text = typeof r.text === "string" ? r.text : "";
      // keep reasonable cap for demo
      byId.set(questionId, { questionId, type: "ESSAY", text: text.slice(0, 20000) });
    }
  }
  return normalizeAnswersForExam(exam, Array.from(byId.values()));
}

export function getRemainingMs(deadlineAt: string, nowMs = Date.now()): number {
  const d = new Date(deadlineAt).getTime();
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, d - nowMs);
}

export function isSubmitted(status: AttemptStatus): boolean {
  return status === "SUBMITTED" || status === "AUTO_SUBMITTED";
}

export function isResultPublished(attempt: Pick<Attempt, "resultPublishedAt">): boolean {
  return typeof attempt.resultPublishedAt === "string" && attempt.resultPublishedAt.length > 0;
}

export function isGradingCompleteForPublish(attempt: Pick<Attempt, "overallGradingStatus">): boolean {
  return attempt.overallGradingStatus === "MCQ_GRADED" || attempt.overallGradingStatus === "ESSAY_GRADED";
}

export function countAnswered(answers: AttemptAnswer[]): number {
  return answers.filter((a) => {
    if (a.type === "MCQ") return !!a.selectedOptionId;
    return a.text.trim().length > 0;
  }).length;
}

function roundScore(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildPublishedResult(attempt: Attempt, exam: Exam): CandidatePublishedResult | null {
  if (!isSubmitted(attempt.status) || !isResultPublished(attempt) || !attempt.resultPublishedAt) return null;

  const mcq = attempt.mcqResult
    ? {
        totalEarned: attempt.mcqResult.totalEarned,
        totalPossible: attempt.mcqResult.totalPossible,
        // Sanitize: never expose correctOptionId
        items: (attempt.mcqResult.items || []).map((it) => ({
          questionId: it.questionId,
          selectedOptionId: it.selectedOptionId ?? null,
          isCorrect: it.isCorrect === true,
          earnedPoints: Number.isFinite(it.earnedPoints) ? it.earnedPoints : 0,
          maxPoints: Number.isFinite(it.maxPoints) ? it.maxPoints : 0,
        })),
      }
    : null;

  const essayQuestions = [...exam.questions]
    .filter((q): q is Extract<Question, { type: "ESSAY" }> => q.type === "ESSAY")
    .sort((a, b) => a.order - b.order);

  let essay: CandidatePublishedResult["essay"] = null;
  let essayEarnedFinalized = 0;
  let essayPossible = 0;
  let essayFinalizedCount = 0;

  if (essayQuestions.length > 0) {
    const gradingsByQ = new Map((attempt.essayGradings || []).map((g) => [g.questionId, g] as const));
    const items: PublishedEssayItem[] = essayQuestions.map((q) => {
      essayPossible = roundScore(essayPossible + (Number.isFinite(q.points) ? q.points : 0));
      const record = gradingsByQ.get(q.id);
      const ev = record?.teacherEvaluation;
      const finalized = ev?.status === "FINALIZED";
      if (finalized) {
        essayFinalizedCount += 1;
        essayEarnedFinalized = roundScore(essayEarnedFinalized + (Number.isFinite(ev.totalScore) ? ev.totalScore : 0));
      }
      const scoresByCriterion = new Map(
        finalized && Array.isArray(ev.criteria)
          ? ev.criteria.map((c) => [c.criterionId, c] as const)
          : [],
      );
      const criteria: PublishedEssayCriterion[] = [...(q.rubricCriteria || [])]
        .sort((a, b) => a.order - b.order)
        .map((c) => {
          const sc = scoresByCriterion.get(c.id);
          return {
            criterionId: c.id,
            name: c.name,
            description: c.description,
            maxScore: c.maxScore,
            score: finalized && sc && Number.isFinite(sc.score) ? sc.score : null,
            ...(finalized && sc && typeof sc.comment === "string" && sc.comment.trim() ? { comment: sc.comment } : {}),
          };
        });
      return {
        questionId: q.id,
        prompt: q.prompt,
        maxPoints: q.points,
        status: finalized ? "FINALIZED" : "NOT_FINALIZED",
        totalScore: finalized && Number.isFinite(ev.totalScore) ? ev.totalScore : null,
        ...(finalized && typeof ev.overallComment === "string" && ev.overallComment.trim() ? { overallComment: ev.overallComment } : {}),
        criteria,
      };
    });
    essay = {
      earned: essayEarnedFinalized,
      possible: essayPossible,
      finalizedCount: essayFinalizedCount,
      totalCount: essayQuestions.length,
      complete: essayFinalizedCount === essayQuestions.length,
      items,
    };
  }

  const mcqEarned = mcq?.totalEarned ?? 0;
  const mcqPossible = mcq?.totalPossible ?? 0;
  const overallEarned = roundScore(mcqEarned + (essay?.earned ?? 0));
  const overallPossible = roundScore(mcqPossible + (essay?.possible ?? 0));
  const overallComplete = essay ? essay.complete : true;

  return {
    publishedAt: attempt.resultPublishedAt,
    mcq,
    essay,
    overall: { earned: overallEarned, possible: overallPossible, complete: overallComplete },
  };
}

export function buildCandidateAttemptView(attempt: Attempt, exam: Exam): CandidateAttemptView {
  const sanitized = sanitizeExamForCandidate(exam);
  return {
    attempt: {
      id: attempt.id,
      examId: attempt.examId,
      joinCode: attempt.joinCode,
      candidate: attempt.candidate,
      consentAcceptedAt: attempt.consentAcceptedAt,
      cameraCheck: attempt.cameraCheck,
      status: attempt.status,
      submitReason: attempt.submitReason,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      resultPublishedAt: attempt.resultPublishedAt ?? null,
      answers: normalizeAnswersForExam(exam, attempt.answers),
      mcqSummary: attempt.mcqResult
        ? { totalEarned: attempt.mcqResult.totalEarned, totalPossible: attempt.mcqResult.totalPossible }
        : null,
      essayGradingStatus: attempt.essayGradingStatus,
      overallGradingStatus: attempt.overallGradingStatus,
    },
    exam: sanitized.exam,
    questions: sanitized.questions,
    publishedResult: buildPublishedResult(attempt, exam),
    serverNow: new Date().toISOString(),
  };
}

export type { Exam, Question, FieldErrors };
