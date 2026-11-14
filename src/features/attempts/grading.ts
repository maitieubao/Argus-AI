import type { Exam } from "@/features/exams/domain";
import type { Attempt, AttemptAnswer, EssayGradingStatus, McqGradeItem, McqResult, OverallGradingStatus } from "./domain";
import { computeEssayGradingSummary, ensureEssayGradingRecords } from "@/features/essay-grading/domain";

export function gradeMcq(exam: Exam, answers: AttemptAnswer[]): McqResult {
  const byId = new Map(answers.map((a) => [a.questionId, a] as const));
  let totalEarned = 0;
  let totalPossible = 0;
  const items: McqGradeItem[] = [];

  const mcqQuestions = [...exam.questions]
    .filter((q): q is Extract<Exam["questions"][number], { type: "MCQ" }> => q.type === "MCQ")
    .sort((a, b) => a.order - b.order);

  for (const q of mcqQuestions) {
    const maxPoints = Number.isFinite(q.points) ? q.points : 0;
    totalPossible += maxPoints;
    const ans = byId.get(q.id);
    const selectedOptionId = ans && ans.type === "MCQ" ? ans.selectedOptionId : null;
    const isCorrect = !!selectedOptionId && selectedOptionId === q.correctOptionId;
    const earnedPoints = isCorrect ? maxPoints : 0;
    totalEarned += earnedPoints;
    items.push({
      questionId: q.id,
      selectedOptionId,
      correctOptionId: q.correctOptionId,
      isCorrect,
      earnedPoints,
      maxPoints,
    });
  }

  // round to avoid float noise
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    totalEarned: round(totalEarned),
    totalPossible: round(totalPossible),
    gradedAt: new Date().toISOString(),
    items,
  };
}

export function deriveGradingStatus(exam: Exam): {
  essayGradingStatus: EssayGradingStatus | null;
  overallGradingStatus: OverallGradingStatus;
} {
  const hasEssay = exam.questions.some((q) => q.type === "ESSAY");
  if (hasEssay) {
    return { essayGradingStatus: "PENDING", overallGradingStatus: "MCQ_GRADED_PENDING_ESSAY_REVIEW" };
  }
  return { essayGradingStatus: null, overallGradingStatus: "MCQ_GRADED" };
}

export function syncAttemptGradingWithExam(attempt: Attempt, exam: Exam): Attempt {
  const hasEssay = exam.questions.some((q) => q.type === "ESSAY");

  // Not submitted or not MCQ-graded yet: keep as-is (candidate flow owns this state).
  if (attempt.status === "IN_PROGRESS" || !attempt.mcqResult) {
    return {
      ...attempt,
      essayGradings: hasEssay ? ensureEssayGradingRecords(attempt, exam) : attempt.essayGradings ?? [],
      essayResult: hasEssay ? attempt.essayResult ?? null : null,
    };
  }

  if (!hasEssay) {
    return {
      ...attempt,
      essayGradings: [],
      essayGradingStatus: null,
      overallGradingStatus: "MCQ_GRADED",
      essayResult: null,
    };
  }

  const ensured = ensureEssayGradingRecords(attempt, exam);
  const summary = computeEssayGradingSummary({ ...attempt, essayGradings: ensured }, exam);
  return {
    ...attempt,
    essayGradings: ensured,
    essayGradingStatus: summary.attemptEssayStatus,
    overallGradingStatus: summary.overallGradingStatus,
    essayResult: {
      earned: summary.essayEarned,
      possible: summary.essayPossible,
      finalizedCount: summary.essayFinalizedCount,
      totalCount: summary.essayTotalCount,
    },
  };
}
