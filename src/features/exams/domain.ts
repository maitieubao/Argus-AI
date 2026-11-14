export type ExamStatus = "DRAFT" | "PUBLISHED";
export type QuestionType = "MCQ" | "ESSAY";

export interface McqOption {
  id: string;
  content: string;
  order: number;
}

export interface McqQuestion {
  id: string;
  examId: string;
  type: "MCQ";
  prompt: string;
  points: number;
  order: number;
  options: McqOption[];
  correctOptionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  order: number;
}

export interface EssayQuestion {
  id: string;
  examId: string;
  type: "ESSAY";
  prompt: string;
  points: number;
  order: number;
  rubricCriteria: RubricCriterion[];
  createdAt: string;
  updatedAt: string;
}

export type Question = McqQuestion | EssayQuestion;

export interface Exam {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  openAt: string | null; // ISO string
  closeAt: string | null; // ISO string
  status: ExamStatus;
  joinCode: string | null;
  publishedAt: string | null;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

export type ExamInput = {
  title?: unknown;
  description?: unknown;
  durationMinutes?: unknown;
  openAt?: unknown;
  closeAt?: unknown;
};

export type FieldErrors = Record<string, string>;

export type ValidationResult =
  | { ok: true; data: { title: string; description: string | null; durationMinutes: number; openAt: string | null; closeAt: string | null } }
  | { ok: false; errors: FieldErrors };

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function parseOptionalDate(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d.toISOString() };
}

export function validateExamInput(input: ExamInput): ValidationResult {
  const errors: FieldErrors = {};

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) errors.title = "Please enter an exam title.";
  else if (title.length > 200) errors.title = "Exam title must be 200 characters or fewer.";

  let description: string | null = null;
  if (typeof input.description === "string") {
    const trimmed = input.description.trim();
    description = trimmed ? trimmed : null;
    if (trimmed.length > 2000) errors.description = "Description must be 2000 characters or fewer.";
  } else if (input.description === null || input.description === undefined) {
    description = null;
  } else {
    errors.description = "Description is invalid.";
  }

  const durationRaw = input.durationMinutes;
  let durationMinutes = 0;
  if (durationRaw === null || durationRaw === undefined || durationRaw === "") {
    errors.durationMinutes = "Please enter a duration in minutes.";
  } else {
    const num = typeof durationRaw === "number" ? durationRaw : Number(durationRaw);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      errors.durationMinutes = "Duration must be a positive whole number.";
    } else if (num > 24 * 60) {
      errors.durationMinutes = "Duration must not exceed 1440 minutes.";
    } else {
      durationMinutes = num;
    }
  }

  const openParsed = parseOptionalDate(input.openAt);
  const closeParsed = parseOptionalDate(input.closeAt);
  if (!openParsed.ok) errors.openAt = "Open time is invalid.";
  if (!closeParsed.ok) errors.closeAt = "Close time is invalid.";

  const openAt = openParsed.ok ? openParsed.value : null;
  const closeAt = closeParsed.ok ? closeParsed.value : null;

  if (openAt && closeAt) {
    if (new Date(closeAt).getTime() <= new Date(openAt).getTime()) {
      errors.closeAt = "Close time must be after open time.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { title, description, durationMinutes, openAt, closeAt },
  };
}

export type McqOptionInput = { id?: unknown; content?: unknown };
export type McqQuestionInput = {
  prompt?: unknown;
  points?: unknown;
  options?: unknown;
  correctOptionId?: unknown;
};

export type McqValidated = {
  prompt: string;
  points: number;
  options: { id: string; content: string }[];
  correctOptionId: string;
};

function normalizeOptionId(raw: unknown, index: number): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return `opt_${index + 1}`;
}

export function validateMcqQuestionInput(
  input: McqQuestionInput,
): { ok: true; data: McqValidated } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) errors.prompt = "Please enter the question text.";
  else if (prompt.length > 5000) errors.prompt = "Question text must be 5000 characters or fewer.";

  const pointsRaw = input.points;
  let points = 0;
  if (pointsRaw === null || pointsRaw === undefined || pointsRaw === "") {
    errors.points = "Please enter points for this question.";
  } else {
    const num = typeof pointsRaw === "number" ? pointsRaw : Number(pointsRaw);
    if (!Number.isFinite(num) || num <= 0) {
      errors.points = "Points must be a number greater than 0.";
    } else if (num > 1000) {
      errors.points = "Points must not exceed 1000.";
    } else {
      points = num;
    }
  }

  const rawOptions = Array.isArray(input.options) ? input.options : null;
  if (!rawOptions) {
    errors.options = "Options list is invalid.";
  }

  const options: { id: string; content: string }[] = [];
  const seenIds = new Set<string>();
  if (rawOptions) {
    rawOptions.forEach((o, idx) => {
      const obj = o && typeof o === "object" ? (o as McqOptionInput) : {};
      const content = typeof obj.content === "string" ? obj.content.trim() : "";
      let id = normalizeOptionId(obj.id, idx);
      if (seenIds.has(id)) id = `${id}_${idx + 1}`;
      seenIds.add(id);
      options.push({ id, content });
      if (!content) {
        errors[`option_${idx}`] = "Option text cannot be empty.";
      } else if (content.length > 2000) {
        errors[`option_${idx}`] = "Option text must be 2000 characters or fewer.";
      }
    });
    if (options.length < 2) {
      errors.optionsCount = "At least 2 options are required.";
    }
  }

  const correctOptionId =
    typeof input.correctOptionId === "string" ? input.correctOptionId.trim() : "";
  if (!correctOptionId) {
    errors.correctOptionId = "Please select the correct answer.";
  } else if (options.length > 0 && !options.some((o) => o.id === correctOptionId)) {
    errors.correctOptionId = "The correct answer must be one of the options.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { prompt, points, options, correctOptionId } };
}

export type RubricCriterionInput = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  maxScore?: unknown;
};

export type EssayQuestionInput = {
  type?: unknown;
  prompt?: unknown;
  points?: unknown;
  rubricCriteria?: unknown;
};

export type RubricValidated = {
  id: string;
  name: string;
  description: string;
  maxScore: number;
};

export type EssayValidated = {
  prompt: string;
  points: number;
  rubricCriteria: RubricValidated[];
};

function normalizeCriterionId(raw: unknown, index: number): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return `crit_${index + 1}`;
}

function roundScore(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function validateEssayQuestionInput(
  input: EssayQuestionInput,
): { ok: true; data: EssayValidated } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) errors.prompt = "Please enter the essay prompt.";
  else if (prompt.length > 10000) errors.prompt = "Essay prompt must be 10000 characters or fewer.";

  const pointsRaw = input.points;
  let points = 0;
  if (pointsRaw === null || pointsRaw === undefined || pointsRaw === "") {
    errors.points = "Please enter the maximum points for this question.";
  } else {
    const num = typeof pointsRaw === "number" ? pointsRaw : Number(pointsRaw);
    if (!Number.isFinite(num) || num <= 0) {
      errors.points = "Points must be a number greater than 0.";
    } else if (num > 1000) {
      errors.points = "Points must not exceed 1000.";
    } else {
      points = roundScore(num);
    }
  }

  const rawCriteria = Array.isArray(input.rubricCriteria) ? input.rubricCriteria : null;
  if (!rawCriteria) {
    errors.rubricCriteria = "Rubric is invalid.";
  }

  const rubricCriteria: RubricValidated[] = [];
  const seenIds = new Set<string>();
  if (rawCriteria) {
    if (rawCriteria.length < 1) {
      errors.rubricCriteriaCount = "At least one rubric criterion is required.";
    }
    rawCriteria.forEach((c, idx) => {
      const obj = c && typeof c === "object" ? (c as RubricCriterionInput) : {};
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      const description = typeof obj.description === "string" ? obj.description.trim() : "";
      let id = normalizeCriterionId(obj.id, idx);
      if (seenIds.has(id)) id = `${id}_${idx + 1}`;
      seenIds.add(id);

      const msRaw = obj.maxScore;
      let maxScore = 0;
      let maxScoreValid = false;
      if (msRaw === null || msRaw === undefined || msRaw === "") {
        errors[`criteria_${idx}_maxScore`] = "Maximum score is required.";
      } else {
        const num = typeof msRaw === "number" ? msRaw : Number(msRaw);
        if (!Number.isFinite(num) || num <= 0) {
          errors[`criteria_${idx}_maxScore`] = "Maximum score must be greater than 0.";
        } else if (num > 1000) {
          errors[`criteria_${idx}_maxScore`] = "Criterion maximum score must not exceed 1000.";
        } else {
          maxScore = roundScore(num);
          maxScoreValid = true;
        }
      }

      if (!name) errors[`criteria_${idx}_name`] = "Please enter a criterion name.";
      else if (name.length > 200) errors[`criteria_${idx}_name`] = "Criterion name must be 200 characters or fewer.";

      if (!description) errors[`criteria_${idx}_description`] = "Please enter a criterion description.";
      else if (description.length > 2000) errors[`criteria_${idx}_description`] = "Criterion description must be 2000 characters or fewer.";

      rubricCriteria.push({ id, name, description, maxScore: maxScoreValid ? maxScore : 0 });
    });
  }

  if (points > 0 && rubricCriteria.length > 0) {
    const hasCriteriaScoreErrors = Object.keys(errors).some((k) => k.endsWith("_maxScore"));
    if (!hasCriteriaScoreErrors) {
      const sum = roundScore(rubricCriteria.reduce((acc, c) => acc + c.maxScore, 0));
      if (Math.abs(sum - points) > 0.001) {
        errors.rubricSum = `Rubric total (${sum}) must equal the question points (${points}).`;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { prompt, points, rubricCriteria } };
}
