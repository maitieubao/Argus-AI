import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Attempt } from "@/features/attempts/domain";
import {
  type ProctoringEvent,
  type ProctoringEventInput,
  type ProctoringEventType,
  type ProctoringReviewStatus,
  MAX_PROCTORING_EVENTS_PER_ATTEMPT,
  isKnownEventType,
  normalizeEventMetadata,
  normalizeOccurredAt,
} from "./domain";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "proctoring.json");

let writeQueue: Promise<unknown> = Promise.resolve();

function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.catch(() => undefined).then(task);
  writeQueue = next;
  return next;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ events: [] }, null, 2), "utf8");
  }
}

function normalizeReviewStatus(v: unknown): ProctoringReviewStatus {
  if (v === "CONFIRMED" || v === "RESOLVED" || v === "DETECTED") return v;
  return "DETECTED";
}

function normalizeStoredEvent(raw: unknown): ProctoringEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const attemptId = typeof r.attemptId === "string" ? r.attemptId : "";
  const examId = typeof r.examId === "string" ? r.examId : "";
  const typeRaw = typeof r.type === "string" ? r.type : "";
  if (!id || !attemptId || !examId || !isKnownEventType(typeRaw)) return null;
  const type = typeRaw as ProctoringEventType;
  const occurredAt = normalizeOccurredAt(r.occurredAt);
  const receivedAt = normalizeOccurredAt(r.receivedAt || r.createdAt);
  const metadata = normalizeEventMetadata(type, r.metadata);
  const reviewStatus = normalizeReviewStatus(r.reviewStatus);
  const reviewedBy = typeof r.reviewedBy === "string" ? r.reviewedBy : null;
  const reviewedAt = typeof r.reviewedAt === "string" ? r.reviewedAt : null;
  const reviewNote = typeof r.reviewNote === "string" ? r.reviewNote : null;
  return {
    id,
    attemptId,
    examId,
    type,
    occurredAt,
    receivedAt,
    metadata,
    reviewStatus,
    reviewedBy,
    reviewedAt,
    reviewNote,
  };
}

async function readAll(): Promise<ProctoringEvent[]> {
  await ensureStore();
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const eventsRaw = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { events?: unknown }).events)
        ? (parsed as { events: unknown[] }).events
        : [];
    return eventsRaw.map(normalizeStoredEvent).filter((e): e is ProctoringEvent => e !== null);
  } catch {
    return [];
  }
}

async function writeAll(events: ProctoringEvent[]): Promise<void> {
  await ensureStore();
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ events }, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
}

export async function getProctoringEventsByAttemptId(attemptId: string): Promise<ProctoringEvent[]> {
  const events = await readAll();
  return events
    .filter((e) => e.attemptId === attemptId)
    .sort((a, b) => {
      const ta = new Date(a.occurredAt).getTime();
      const tb = new Date(b.occurredAt).getTime();
      if (ta !== tb) return ta - tb;
      return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
    });
}

export async function getProctoringEventsByExamId(examId: string): Promise<ProctoringEvent[]> {
  const events = await readAll();
  return events
    .filter((e) => e.examId === examId)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

export async function appendProctoringEvents(
  attempt: Attempt,
  inputs: ProctoringEventInput[],
): Promise<{ saved: ProctoringEvent[]; truncated: boolean }> {
  return withStoreLock(async () => {
    const now = new Date().toISOString();
    const normalized: ProctoringEvent[] = [];

    for (const input of inputs) {
      if (!input || typeof input !== "object") continue;
      const typeRaw = typeof input.type === "string" ? input.type : "";
      if (!isKnownEventType(typeRaw)) continue;
      const type = typeRaw as ProctoringEventType;
      normalized.push({
        id: randomUUID(),
        attemptId: attempt.id,
        examId: attempt.examId,
        type,
        occurredAt: normalizeOccurredAt(input.occurredAt),
        receivedAt: now,
        metadata: normalizeEventMetadata(type, input.metadata),
        reviewStatus: "DETECTED",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
      });
    }

    if (normalized.length === 0) return { saved: [], truncated: false };

    const events = await readAll();
    const existingCount = events.filter((e) => e.attemptId === attempt.id).length;
    const remaining = Math.max(0, MAX_PROCTORING_EVENTS_PER_ATTEMPT - existingCount);
    const toSave = remaining > 0 ? normalized.slice(0, remaining) : [];
    if (toSave.length === 0) return { saved: [], truncated: true };

    events.push(...toSave);
    await writeAll(events);
    return { saved: toSave, truncated: normalized.length > toSave.length };
  });
}

export async function updateProctoringEventReviewStatus(params: {
  attemptId: string;
  eventId: string;
  targetStatus: "CONFIRMED" | "RESOLVED";
  actorId: string;
  reviewNote?: string | null;
}): Promise<ProctoringEvent | null> {
  return withStoreLock(async () => {
    const events = await readAll();
    const idx = events.findIndex((e) => e.id === params.eventId && e.attemptId === params.attemptId);
    if (idx === -1) return null;

    const current = events[idx];
    const currentStatus = current.reviewStatus ?? "DETECTED";
    const valid =
      (currentStatus === "DETECTED" && (params.targetStatus === "CONFIRMED" || params.targetStatus === "RESOLVED")) ||
      (currentStatus === "CONFIRMED" && params.targetStatus === "RESOLVED");

    if (!valid) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${params.targetStatus}`);
    }

    const updated: ProctoringEvent = {
      ...current,
      reviewStatus: params.targetStatus,
      reviewedBy: params.actorId,
      reviewedAt: new Date().toISOString(),
      reviewNote: params.reviewNote?.trim() || current.reviewNote || null,
    };

    events[idx] = updated;
    await writeAll(events);
    return updated;
  });
}
