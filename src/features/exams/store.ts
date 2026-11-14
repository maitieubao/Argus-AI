import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  EssayQuestion,
  EssayQuestionInput,
  Exam,
  ExamInput,
  FieldErrors,
  McqQuestion,
  McqQuestionInput,
  Question,
  validateEssayQuestionInput,
  validateExamInput,
  validateMcqQuestionInput,
} from "./domain";

export type {
  EssayQuestion,
  EssayQuestionInput,
  Exam,
  ExamInput,
  ExamStatus,
  FieldErrors,
  McqOption,
  McqQuestion,
  McqQuestionInput,
  Question,
  RubricCriterion,
  ValidationResult,
} from "./domain";
export {
  formatDateTime,
  toDatetimeLocalValue,
  validateEssayQuestionInput,
  validateExamInput,
} from "./domain";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "exams.json");

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]", "utf8");
  }
}

function normalizeExam(raw: unknown): Exam {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const questionsRaw = Array.isArray(r.questions) ? r.questions : [];
  const questions = questionsRaw
    .map((q) => {
      if (!q || typeof q !== "object") return null;
      const qr = q as Record<string, unknown>;
      const type = qr.type === "ESSAY" ? "ESSAY" : qr.type === "MCQ" ? "MCQ" : null;
      if (!type) return null;

      if (type === "MCQ") {
        const optionsRaw = Array.isArray(qr.options) ? qr.options : [];
        const options = optionsRaw
          .map((o, idx) => {
            if (!o || typeof o !== "object") return null;
            const or = o as Record<string, unknown>;
            const content = typeof or.content === "string" ? or.content : "";
            return {
              id: typeof or.id === "string" && or.id ? or.id : `opt_${idx + 1}`,
              content,
              order:
                typeof or.order === "number" && Number.isFinite(or.order) ? or.order : idx + 1,
            };
          })
          .filter((o): o is { id: string; content: string; order: number } => o !== null)
          .sort((a, b) => a.order - b.order);

        const mq: McqQuestion = {
          id: typeof qr.id === "string" ? qr.id : randomUUID(),
          examId: typeof qr.examId === "string" ? qr.examId : (typeof r.id === "string" ? r.id : ""),
          type: "MCQ",
          prompt: typeof qr.prompt === "string" ? qr.prompt : "",
          points:
            typeof qr.points === "number" && Number.isFinite(qr.points) ? qr.points : 0,
          order:
            typeof qr.order === "number" && Number.isFinite(qr.order) ? qr.order : 0,
          options,
          correctOptionId:
            typeof qr.correctOptionId === "string" ? qr.correctOptionId : "",
          createdAt: typeof qr.createdAt === "string" ? qr.createdAt : new Date().toISOString(),
          updatedAt: typeof qr.updatedAt === "string" ? qr.updatedAt : new Date().toISOString(),
        };
        return mq as Question;
      }

      const criteriaRaw = Array.isArray(qr.rubricCriteria) ? qr.rubricCriteria : [];
      const rubricCriteria = criteriaRaw
        .map((c, idx) => {
          if (!c || typeof c !== "object") return null;
          const cr = c as Record<string, unknown>;
          return {
            id: typeof cr.id === "string" && cr.id ? cr.id : `crit_${idx + 1}`,
            name: typeof cr.name === "string" ? cr.name : "",
            description: typeof cr.description === "string" ? cr.description : "",
            maxScore:
              typeof cr.maxScore === "number" && Number.isFinite(cr.maxScore) ? cr.maxScore : 0,
            order:
              typeof cr.order === "number" && Number.isFinite(cr.order) ? cr.order : idx + 1,
          };
        })
        .filter(
          (c): c is { id: string; name: string; description: string; maxScore: number; order: number } =>
            c !== null,
        )
        .sort((a, b) => a.order - b.order);

      const eq: EssayQuestion = {
        id: typeof qr.id === "string" ? qr.id : randomUUID(),
        examId: typeof qr.examId === "string" ? qr.examId : (typeof r.id === "string" ? r.id : ""),
        type: "ESSAY",
        prompt: typeof qr.prompt === "string" ? qr.prompt : "",
        points:
          typeof qr.points === "number" && Number.isFinite(qr.points) ? qr.points : 0,
        order:
          typeof qr.order === "number" && Number.isFinite(qr.order) ? qr.order : 0,
        rubricCriteria,
        createdAt: typeof qr.createdAt === "string" ? qr.createdAt : new Date().toISOString(),
        updatedAt: typeof qr.updatedAt === "string" ? qr.updatedAt : new Date().toISOString(),
      };
      return eq as Question;
    })
    .filter((q): q is Question => q !== null)
    .sort((a, b) => a.order - b.order);

  return {
    id: typeof r.id === "string" ? r.id : randomUUID(),
    ownerId: typeof r.ownerId === "string" ? r.ownerId : "",
    title: typeof r.title === "string" ? r.title : "",
    description: typeof r.description === "string" ? r.description : null,
    durationMinutes:
      typeof r.durationMinutes === "number" && Number.isFinite(r.durationMinutes)
        ? r.durationMinutes
        : 0,
    openAt: typeof r.openAt === "string" ? r.openAt : null,
    closeAt: typeof r.closeAt === "string" ? r.closeAt : null,
    status: r.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    joinCode: typeof r.joinCode === "string" ? r.joinCode : null,
    publishedAt: typeof r.publishedAt === "string" ? r.publishedAt : null,
    questions,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

async function readAll(): Promise<Exam[]> {
  await ensureStore();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeExam);
  } catch {
    return [];
  }
}

async function writeAll(exams: Exam[]): Promise<void> {
  await ensureStore();
  // Unique temp file avoids rename races when parallel writes occur.
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(exams, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

export async function listExamsByOwner(ownerId: string): Promise<Exam[]> {
  const exams = await readAll();
  return exams
    .filter((e) => e.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getExamById(id: string): Promise<Exam | null> {
  const exams = await readAll();
  return exams.find((e) => e.id === id) ?? null;
}

export async function getExamByJoinCode(joinCode: string): Promise<Exam | null> {
  const normalized = joinCode.trim().toUpperCase();
  if (!normalized) return null;
  const exams = await readAll();
  return exams.find((e) => (e.joinCode || "").toUpperCase() === normalized) ?? null;
}

export async function createExam(
  ownerId: string,
  input: ExamInput,
): Promise<
  | { ok: true; exam: Exam }
  | { ok: false; errors: FieldErrors }
> {
  const validated = validateExamInput(input);
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const exam: Exam = {
    id: randomUUID(),
    ownerId,
    title: validated.data.title,
    description: validated.data.description,
    durationMinutes: validated.data.durationMinutes,
    openAt: validated.data.openAt,
    closeAt: validated.data.closeAt,
    status: "DRAFT",
    joinCode: null,
    publishedAt: null,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };

  const exams = await readAll();
  exams.push(exam);
  await writeAll(exams);
  return { ok: true, exam };
}

export async function updateExamDraft(
  id: string,
  ownerId: string,
  input: ExamInput,
): Promise<
  | { ok: true; exam: Exam }
  | { ok: false; errors: FieldErrors; code?: "NOT_FOUND" | "FORBIDDEN" | "NOT_DRAFT" }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === id);
  if (idx === -1) return { ok: false, errors: { form: "Exam not found." }, code: "NOT_FOUND" };
  const exam = exams[idx];
  if (exam.ownerId !== ownerId) return { ok: false, errors: { form: "You do not have permission to edit this exam." }, code: "FORBIDDEN" };
  if (exam.status !== "DRAFT") return { ok: false, errors: { form: "This exam has been published and can no longer be edited." }, code: "NOT_DRAFT" };

  const validated = validateExamInput(input);
  if (!validated.ok) return validated;

  const updated: Exam = {
    ...exam,
    title: validated.data.title,
    description: validated.data.description,
    durationMinutes: validated.data.durationMinutes,
    openAt: validated.data.openAt,
    closeAt: validated.data.closeAt,
    updatedAt: new Date().toISOString(),
  };
  exams[idx] = updated;
  await writeAll(exams);
  return { ok: true, exam: updated };
}

type ExamMutationErrorCode = "NOT_FOUND" | "FORBIDDEN" | "NOT_DRAFT";
type QuestionMutationErrorCode = ExamMutationErrorCode | "QUESTION_NOT_FOUND";

function guardExamForQuestionMutation(
  exam: Exam | null,
  ownerId: string,
): { ok: true; exam: Exam } | { ok: false; errors: FieldErrors; code: ExamMutationErrorCode } {
  if (!exam) return { ok: false, errors: { form: "Exam not found." }, code: "NOT_FOUND" };
  if (exam.ownerId !== ownerId)
    return { ok: false, errors: { form: "You do not have permission to edit this exam." }, code: "FORBIDDEN" };
  if (exam.status !== "DRAFT")
    return {
      ok: false,
      errors: { form: "This exam has been published and can no longer be edited." },
      code: "NOT_DRAFT",
    };
  return { ok: true, exam };
}

export async function createMcqQuestion(
  examId: string,
  ownerId: string,
  input: McqQuestionInput,
): Promise<
  | { ok: true; exam: Exam; question: McqQuestion }
  | { ok: false; errors: FieldErrors; code?: ExamMutationErrorCode }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  const guard = guardExamForQuestionMutation(idx === -1 ? null : exams[idx], ownerId);
  if (!guard.ok) return guard;

  const validated = validateMcqQuestionInput(input);
  if (!validated.ok) return validated;

  const exam = guard.exam;
  const now = new Date().toISOString();
  const nextOrder =
    exam.questions.length === 0
      ? 1
      : Math.max(...exam.questions.map((q) => q.order || 0)) + 1;

  const question: McqQuestion = {
    id: randomUUID(),
    examId: exam.id,
    type: "MCQ",
    prompt: validated.data.prompt,
    points: validated.data.points,
    order: nextOrder,
    options: validated.data.options.map((o, i) => ({
      id: o.id,
      content: o.content,
      order: i + 1,
    })),
    correctOptionId: validated.data.correctOptionId,
    createdAt: now,
    updatedAt: now,
  };

  const updatedExam: Exam = {
    ...exam,
    questions: [...exam.questions, question].sort((a, b) => a.order - b.order),
    updatedAt: now,
  };
  exams[idx] = updatedExam;
  await writeAll(exams);
  return { ok: true, exam: updatedExam, question };
}

export async function updateMcqQuestion(
  examId: string,
  questionId: string,
  ownerId: string,
  input: McqQuestionInput,
): Promise<
  | { ok: true; exam: Exam; question: McqQuestion }
  | { ok: false; errors: FieldErrors; code?: QuestionMutationErrorCode }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  const guard = guardExamForQuestionMutation(idx === -1 ? null : exams[idx], ownerId);
  if (!guard.ok) return guard;

  const exam = guard.exam;
  const qIdx = exam.questions.findIndex((q) => q.id === questionId);
  if (qIdx === -1)
    return { ok: false, errors: { form: "Question not found." }, code: "QUESTION_NOT_FOUND" };
  const existing = exam.questions[qIdx];
  if (existing.type !== "MCQ")
    return { ok: false, errors: { form: "Invalid question type." }, code: "QUESTION_NOT_FOUND" };

  const validated = validateMcqQuestionInput(input);
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const updatedQuestion: McqQuestion = {
    ...existing,
    prompt: validated.data.prompt,
    points: validated.data.points,
    options: validated.data.options.map((o, i) => ({
      id: o.id,
      content: o.content,
      order: i + 1,
    })),
    correctOptionId: validated.data.correctOptionId,
    updatedAt: now,
  };

  const questions = [...exam.questions];
  questions[qIdx] = updatedQuestion;
  const updatedExam: Exam = { ...exam, questions: questions.sort((a, b) => a.order - b.order), updatedAt: now };
  exams[idx] = updatedExam;
  await writeAll(exams);
  return { ok: true, exam: updatedExam, question: updatedQuestion };
}

export async function deleteQuestion(
  examId: string,
  questionId: string,
  ownerId: string,
): Promise<
  | { ok: true; exam: Exam }
  | { ok: false; errors: FieldErrors; code?: QuestionMutationErrorCode }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  const guard = guardExamForQuestionMutation(idx === -1 ? null : exams[idx], ownerId);
  if (!guard.ok) return guard;

  const exam = guard.exam;
  const exists = exam.questions.some((q) => q.id === questionId);
  if (!exists)
    return { ok: false, errors: { form: "Question not found." }, code: "QUESTION_NOT_FOUND" };

  const now = new Date().toISOString();
  const updatedExam: Exam = {
    ...exam,
    questions: exam.questions.filter((q) => q.id !== questionId),
    updatedAt: now,
  };
  exams[idx] = updatedExam;
  await writeAll(exams);
  return { ok: true, exam: updatedExam };
}

export async function createEssayQuestion(
  examId: string,
  ownerId: string,
  input: EssayQuestionInput,
): Promise<
  | { ok: true; exam: Exam; question: EssayQuestion }
  | { ok: false; errors: FieldErrors; code?: ExamMutationErrorCode }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  const guard = guardExamForQuestionMutation(idx === -1 ? null : exams[idx], ownerId);
  if (!guard.ok) return guard;

  const validated = validateEssayQuestionInput(input);
  if (!validated.ok) return validated;

  const exam = guard.exam;
  const now = new Date().toISOString();
  const nextOrder =
    exam.questions.length === 0
      ? 1
      : Math.max(...exam.questions.map((q) => q.order || 0)) + 1;

  const question: EssayQuestion = {
    id: randomUUID(),
    examId: exam.id,
    type: "ESSAY",
    prompt: validated.data.prompt,
    points: validated.data.points,
    order: nextOrder,
    rubricCriteria: validated.data.rubricCriteria.map((c, i) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      maxScore: c.maxScore,
      order: i + 1,
    })),
    createdAt: now,
    updatedAt: now,
  };

  const updatedExam: Exam = {
    ...exam,
    questions: [...exam.questions, question].sort((a, b) => a.order - b.order),
    updatedAt: now,
  };
  exams[idx] = updatedExam;
  await writeAll(exams);
  return { ok: true, exam: updatedExam, question };
}

export async function updateEssayQuestion(
  examId: string,
  questionId: string,
  ownerId: string,
  input: EssayQuestionInput,
): Promise<
  | { ok: true; exam: Exam; question: EssayQuestion }
  | { ok: false; errors: FieldErrors; code?: QuestionMutationErrorCode }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  const guard = guardExamForQuestionMutation(idx === -1 ? null : exams[idx], ownerId);
  if (!guard.ok) return guard;

  const exam = guard.exam;
  const qIdx = exam.questions.findIndex((q) => q.id === questionId);
  if (qIdx === -1)
    return { ok: false, errors: { form: "Question not found." }, code: "QUESTION_NOT_FOUND" };
  const existing = exam.questions[qIdx];
  if (existing.type !== "ESSAY")
    return { ok: false, errors: { form: "Invalid question type." }, code: "QUESTION_NOT_FOUND" };

  const validated = validateEssayQuestionInput(input);
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const updatedQuestion: EssayQuestion = {
    ...existing,
    prompt: validated.data.prompt,
    points: validated.data.points,
    rubricCriteria: validated.data.rubricCriteria.map((c, i) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      maxScore: c.maxScore,
      order: i + 1,
    })),
    updatedAt: now,
  };

  const questions = [...exam.questions];
  questions[qIdx] = updatedQuestion;
  const updatedExam: Exam = { ...exam, questions: questions.sort((a, b) => a.order - b.order), updatedAt: now };
  exams[idx] = updatedExam;
  await writeAll(exams);
  return { ok: true, exam: updatedExam, question: updatedQuestion };
}

export async function publishExam(
  examId: string,
  ownerId: string,
): Promise<
  | { ok: true; exam: Exam }
  | { ok: false; errors: FieldErrors; code?: "NOT_FOUND" | "FORBIDDEN" | "NOT_DRAFT" | "INVALID" }
> {
  const exams = await readAll();
  const idx = exams.findIndex((e) => e.id === examId);
  if (idx === -1) return { ok: false, errors: { form: "Exam not found." }, code: "NOT_FOUND" };
  const exam = exams[idx];
  if (exam.ownerId !== ownerId)
    return { ok: false, errors: { form: "You do not have permission to publish this exam." }, code: "FORBIDDEN" };

  // Idempotent: already published is a successful state (guarded by ownership above).
  if (exam.status === "PUBLISHED") {
    return { ok: true, exam };
  }

  const errors: FieldErrors = {};
  if (!exam.title?.trim()) errors.title = "A title is required to publish the exam.";
  if (!Number.isFinite(exam.durationMinutes) || exam.durationMinutes <= 0) {
    errors.durationMinutes = "A valid duration is required.";
  }
  if (!Array.isArray(exam.questions) || exam.questions.length < 1) {
    errors.questions = "Add at least one question before publishing.";
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, code: "INVALID" };
  }

  const now = new Date().toISOString();
  let joinCode = exam.joinCode;
  if (!joinCode) {
    // 8-char uppercase alnum code, regenerated on the (very unlikely) collision.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous chars
    const gen = () => {
      let s = "";
      for (let i = 0; i < 8; i += 1) s += alphabet[Math.floor(Math.random() * alphabet.length)];
      return s;
    };
    const existingCodes = new Set(
      exams.map((e) => e.joinCode).filter((c): c is string => !!c),
    );
    let attempts = 0;
    do {
      joinCode = gen();
      attempts += 1;
    } while (existingCodes.has(joinCode) && attempts < 20);
    if (existingCodes.has(joinCode)) {
      return {
        ok: false,
        errors: { form: "Unable to generate a unique join code. Please try again." },
        code: "INVALID",
      };
    }
  }

  const updated: Exam = {
    ...exam,
    status: "PUBLISHED",
    joinCode,
    publishedAt: exam.publishedAt ?? now,
    updatedAt: now,
  };
  exams[idx] = updated;
  await writeAll(exams);
  return { ok: true, exam: updated };
}
