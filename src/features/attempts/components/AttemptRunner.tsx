"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProctoringEvents, type DemoPostureMode } from "@/features/proctoring/client";
import {
  formatFacePresence,
  formatGazeDirection,
  formatHandsVisibility,
  formatHeadOrientation,
} from "@/features/proctoring/domain";

type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED";

type AttemptView = {
  attempt: {
    id: string;
    examId: string;
    joinCode: string;
    candidate: { fullName: string };
    consentAcceptedAt: string | null;
    cameraCheck: { status: string; note: string | null; checkedAt: string | null };
    status: AttemptStatus;
    submitReason: "MANUAL" | "TIMEOUT" | null;
    startedAt: string;
    deadlineAt: string;
    submittedAt: string | null;
    resultPublishedAt?: string | null;
    answers: Array<{ questionId: string; type: "MCQ" | "ESSAY"; selectedOptionId?: string | null; text?: string }>;
    mcqSummary: { totalEarned: number; totalPossible: number } | null;
    essayGradingStatus: "PENDING" | "IN_REVIEW" | "FINALIZED" | null;
    overallGradingStatus: string;
  };
  exam: { id: string; title: string; durationMinutes: number; openAt: string | null; closeAt: string | null };
  questions: Array<
    | { id: string; type: "MCQ"; prompt: string; points: number; order: number; options: { id: string; content: string; order: number }[] }
    | { id: string; type: "ESSAY"; prompt: string; points: number; order: number; rubricCriteria?: { id: string; name: string; description: string; maxScore: number; order?: number }[] }
  >;
  publishedResult?: {
    publishedAt: string;
    mcq: {
      totalEarned: number;
      totalPossible: number;
      items: Array<{ questionId: string; selectedOptionId: string | null; isCorrect: boolean; earnedPoints: number; maxPoints: number }>;
    } | null;
    essay: {
      earned: number;
      possible: number;
      finalizedCount: number;
      totalCount: number;
      complete: boolean;
      items: Array<{
        questionId: string;
        prompt: string;
        maxPoints: number;
        status: "FINALIZED" | "NOT_FINALIZED";
        totalScore: number | null;
        overallComment?: string;
        criteria: Array<{ criterionId: string; name: string; description: string; maxScore: number; score: number | null; comment?: string }>;
      }>;
    } | null;
    overall: { earned: number; possible: number; complete: boolean };
  } | null;
  serverNow: string;
};

function fmt(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function AttemptRunner({ attemptId }: { attemptId: string }) {
  const [view, setView] = useState<AttemptView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, { type: "MCQ"; selectedOptionId: string | null } | { type: "ESSAY"; text: string }>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef<Set<string>>(new Set());
  const autoSubmittedRef = useRef(false);
  const inFlightSave = useRef<Promise<void> | null>(null);
  const localAnswersRef = useRef<typeof localAnswers>({});
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const proctorStreamRef = useRef<MediaStream | null>(null);
  const [cameraMonitoring, setCameraMonitoring] = useState(false);

  const applyView = useCallback((v: AttemptView) => {
    setView(v);
    const map: typeof localAnswers = {};
    for (const a of v.attempt.answers || []) {
      if (a.type === "MCQ") map[a.questionId] = { type: "MCQ", selectedOptionId: a.selectedOptionId ?? null };
      else map[a.questionId] = { type: "ESSAY", text: a.text ?? "" };
    }
    localAnswersRef.current = map;
    setLocalAnswers(map);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/attempts/${attemptId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data?.errors?.form || "Unable to load this exam session.");
        return;
      }
      applyView(data as AttemptView);
    } catch {
      setLoadError("Unable to connect to the server. Please try again.");
    }
  }, [attemptId, applyView]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const deadlineMs = view ? new Date(view.attempt.deadlineAt).getTime() : 0;
  const remainingMs = view ? Math.max(0, deadlineMs - nowMs) : 0;
  const isSubmitted = view ? view.attempt.status !== "IN_PROGRESS" : false;
  const warningLevel = remainingMs <= 60_000 ? "critical" : remainingMs <= 5 * 60_000 ? "warn" : "normal";

  const proctoring = useProctoringEvents({
    attemptId,
    examId: view?.exam.id,
    candidateName: view?.attempt.candidate.fullName,
    active: !!view && !isSubmitted,
    camera: { enabled: cameraMonitoring, getVideoEl: () => proctorVideoRef.current },
  });

  const hasView = !!view;
  const consentAccepted = !!view?.attempt.consentAcceptedAt;
  const cameraCheckStatus = view?.attempt.cameraCheck?.status;

  useEffect(() => {
    if (!hasView || isSubmitted) {
      setCameraMonitoring(false);
      if (proctorStreamRef.current) {
        proctorStreamRef.current.getTracks().forEach((t) => t.stop());
        proctorStreamRef.current = null;
      }
      return;
    }
    const consentOk = consentAccepted;
    const cameraStatus = cameraCheckStatus;
    const canTry = consentOk && cameraStatus !== "denied" && cameraStatus !== "unavailable";
    if (!canTry) {
      setCameraMonitoring(false);
      return;
    }
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraMonitoring(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        proctorStreamRef.current = stream;
        if (proctorVideoRef.current) {
          const videoEl = proctorVideoRef.current;
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
          if (videoEl.videoWidth === 0) {
            await new Promise<void>((resolve) => {
              let settled = false;
              const done = () => {
                if (settled) return;
                settled = true;
                videoEl.removeEventListener("loadeddata", done);
                resolve();
              };
              videoEl.addEventListener("loadeddata", done, { once: true });
              setTimeout(done, 1200);
            });
          }
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            setCameraMonitoring(false);
            void fetch(`/api/attempts/${attemptId}/proctoring/events`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                events: [
                  {
                    type: "CAMERA_TRACK_ENDED",
                    occurredAt: new Date().toISOString(),
                    metadata: { status: "ended" },
                  },
                ],
              }),
              keepalive: true,
            }).catch(() => {});
          });
        });
        setCameraMonitoring(true);
      } catch (e) {
        setCameraMonitoring(false);
        const err = e as { name?: string };
        void fetch(`/api/attempts/${attemptId}/proctoring/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: [
              {
                type: "CAMERA_ERROR",
                occurredAt: new Date().toISOString(),
                metadata: { status: "error", reason: err?.name || "unknown" },
              },
            ],
          }),
          keepalive: true,
        }).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
      if (proctorStreamRef.current) {
        proctorStreamRef.current.getTracks().forEach((t) => t.stop());
        proctorStreamRef.current = null;
      }
    };
  }, [attemptId, isSubmitted, hasView, consentAccepted, cameraCheckStatus]);

  const questions = useMemo(() => view?.questions || [], [view]);
  const currentQ = questions[currentIdx];

  const answeredCount = useMemo(() => {
    let c = 0;
    for (const q of questions) {
      const a = localAnswers[q.id];
      if (!a) continue;
      if (q.type === "MCQ" && a.type === "MCQ" && a.selectedOptionId) c += 1;
      if (q.type === "ESSAY" && a.type === "ESSAY" && a.text.trim()) c += 1;
    }
    return c;
  }, [questions, localAnswers]);

  const dataExpiredRef = useRef(false);
  useEffect(() => {
    dataExpiredRef.current = isSubmitted;
  }, [isSubmitted]);

  const flushSave = useCallback(async () => {
    if (!hasView || isSubmitted) return;
    if (inFlightSave.current) {
      await inFlightSave.current;
    }
    if (dirtyRef.current.size === 0) return;

    const snapshot = new Map<string, (typeof localAnswers)[string]>();
    const ids = Array.from(dirtyRef.current);
    const payload = ids.map((qid) => {
      const a = localAnswersRef.current[qid];
      if (!a) return null;
      snapshot.set(qid, a);
      if (a.type === "MCQ") return { questionId: qid, type: "MCQ" as const, selectedOptionId: a.selectedOptionId };
      return { questionId: qid, type: "ESSAY" as const, text: a.text };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    if (payload.length === 0) return;

    let savedOk = false;
    const run = (async () => {
      setSaveState("saving");
      setSaveMsg("Saving…");
      try {
        const res = await fetch(`/api/attempts/${attemptId}/answers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data?.code === "ALREADY_SUBMITTED") {
            dirtyRef.current.clear();
            await load();
            return;
          }
          setSaveState("error");
          setSaveMsg(data?.errors?.form || "Could not save. Please try again.");
          return;
        }
        for (const id of ids) {
          const sent = snapshot.get(id);
          const latest = localAnswersRef.current[id];
          if (sent && latest && JSON.stringify(sent) === JSON.stringify(latest)) {
            dirtyRef.current.delete(id);
          }
        }
        savedOk = true;
        setSaveState("saved");
        setSaveMsg(data?.expired ? "Time expired. Your exam was submitted." : "Saved");
        if (data?.expired && data?.view) {
          applyView(data.view as AttemptView);
        }
      } catch {
        setSaveState("error");
        setSaveMsg("Network error while saving. Please try again.");
      } finally {
        inFlightSave.current = null;
      }
    })();
    inFlightSave.current = run;
    await run;

    if (savedOk && dirtyRef.current.size > 0 && !dataExpiredRef.current) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void flushSaveRef.current(); }, 400);
    }
  }, [attemptId, hasView, isSubmitted, load, applyView]);

  const flushSaveRef = useRef(flushSave);
  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSaveRef.current(); }, 700);
  }, []);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  function markDirty(qid: string) {
    dirtyRef.current.add(qid);
    scheduleSave();
  }

  function setMcqAnswer(questionId: string, selectedOptionId: string) {
    if (isSubmitted) return;
    const next = { ...localAnswersRef.current, [questionId]: { type: "MCQ" as const, selectedOptionId } };
    localAnswersRef.current = next;
    setLocalAnswers(next);
    markDirty(questionId);
  }

  function setEssayAnswer(questionId: string, text: string) {
    if (isSubmitted) return;
    const next = { ...localAnswersRef.current, [questionId]: { type: "ESSAY" as const, text } };
    localAnswersRef.current = next;
    setLocalAnswers(next);
    markDirty(questionId);
  }

  async function doSubmit(reason: "MANUAL" | "TIMEOUT") {
    if (!view || submitting) return;
    if (isSubmitted) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await flushSave();
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.errors?.form || "Unable to submit. Please try again.");
        return;
      }
      if (data?.view) applyView(data.view as AttemptView);
      else await load();
      setShowConfirm(false);
    } catch {
      setSubmitError("Network error while submitting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!view || isSubmitted) return;
    if (remainingMs > 0) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void doSubmit("TIMEOUT");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, isSubmitted, view]);

  if (loadError) {
    return (
      <div className="card login-form" style={{ maxWidth: 720, margin: "40px auto" }}>
        <div className="error-message" role="alert">{loadError}</div>
        <button type="button" className="primary-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="card login-form" style={{ maxWidth: 720, margin: "40px auto" }}>
        <div className="muted">Loading exam session…</div>
      </div>
    );
  }

  const submittedView = view.attempt.status !== "IN_PROGRESS";

  if (submittedView) {
    const a = view.attempt;
    const pr = view.publishedResult ?? null;
    const published = !!pr;
    const mcqByQ = new Map((pr?.mcq?.items || []).map((it) => [it.questionId, it] as const));

    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <div className="brand-inline">Argus AI</div>
            <div className="muted">{published ? "Results" : "Submission"}</div>
          </div>
          <span className={`status-badge ${published ? "published" : "draft"}`}>
            {published ? "Published" : "Submitted"}
          </span>
        </header>
        <section className="content narrow">
          <div className="card question-section">
            <div className="success-message" style={{ marginBottom: 12 }}>
              Your exam has been submitted{a.submitReason === "TIMEOUT" ? " (time expired)" : ""}.
            </div>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>{view.exam.title}</h1>
            <div className="exam-info-block" style={{ marginBottom: 12 }}>
              <div>Candidate: <strong>{a.candidate.fullName}</strong></div>
              <div>Submitted: <strong>{fmt(a.submittedAt)}</strong></div>
              <div>Answered: <strong>{answeredCount} / {questions.length}</strong></div>
              {published ? <div>Published: <strong>{fmt(pr.publishedAt)}</strong></div> : null}
            </div>

            {!published ? (
              <>
                {a.mcqSummary ? (
                  <div className="result-box">
                    <div className="result-title">Multiple-choice score</div>
                    <div className="result-score"><strong>{a.mcqSummary.totalEarned}</strong> / {a.mcqSummary.totalPossible} points</div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="result-box" style={{ marginBottom: 12 }}>
                  <div className="result-title">Total score</div>
                  <div className="result-score"><strong>{pr.overall.earned}</strong> / {pr.overall.possible} points</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    MCQ: <strong>{pr.mcq?.totalEarned ?? 0}</strong> / {pr.mcq?.totalPossible ?? 0}
                    {pr.essay ? (
                      <> · Essay (finalized): <strong>{pr.essay.earned}</strong> / {pr.essay.possible} ({pr.essay.finalizedCount}/{pr.essay.totalCount})</>
                    ) : null}
                  </div>
                </div>

                {pr.mcq ? (
                  <div className="card question-section" style={{ marginTop: 12 }}>
                    <div className="question-section-head" style={{ marginBottom: 8 }}>
                      <div><h2>Multiple choice</h2></div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Question</th>
                            <th>Selected</th>
                            <th>Result</th>
                            <th>Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {questions.filter((q) => q.type === "MCQ").map((q, idx) => {
                            const item = mcqByQ.get(q.id);
                            const ans = localAnswers[q.id];
                            const selectedId = item?.selectedOptionId ?? (ans && ans.type === "MCQ" ? ans.selectedOptionId : null);
                            const selectedText = q.options.find((o) => o.id === selectedId)?.content || (selectedId ? "—" : "No answer");
                            return (
                              <tr key={q.id}>
                                <td data-label="Question"><strong>{idx + 1}</strong></td>
                                <td data-label="Selected">{selectedText}</td>
                                <td data-label="Result">
                                  {item ? (
                                    <span className={`status-badge ${item.isCorrect ? "published" : "draft"}`}>{item.isCorrect ? "Correct" : "Incorrect"}</span>
                                  ) : "—"}
                                </td>
                                <td data-label="Points">{item ? `${item.earnedPoints} / ${item.maxPoints}` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {pr.essay && pr.essay.items.length > 0 ? (
                  <div className="card question-section" style={{ marginTop: 12 }}>
                    <div className="question-section-head" style={{ marginBottom: 8 }}>
                      <div><h2>Essay</h2></div>
                    </div>
                    <div style={{ display: "grid", gap: 12 }}>
                      {pr.essay.items.map((it, idx) => (
                        <div key={it.questionId} className="question-item" style={{ margin: 0 }}>
                          <div className="question-item-head">
                            <div className="question-index">Essay {idx + 1}</div>
                            <div className="question-meta">
                              <span className={`status-badge ${it.status === "FINALIZED" ? "published" : "draft"}`}>
                                {it.status === "FINALIZED" ? "Finalized" : "Not finalized"}
                              </span>
                              <span className="pill">{it.maxPoints} pts</span>
                            </div>
                          </div>
                          <div className="question-prompt">{it.prompt}</div>
                          {it.status === "FINALIZED" ? (
                            <>
                              <div className="result-box" style={{ marginTop: 10 }}>
                                <div className="result-title">Score</div>
                                <div className="result-score"><strong>{it.totalScore ?? 0}</strong> / {it.maxPoints} points</div>
                              </div>
                              {it.overallComment ? (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Overall comment</div>
                                  <div style={{ whiteSpace: "pre-wrap" }}>{it.overallComment}</div>
                                </div>
                              ) : null}
                              {it.criteria.length > 0 ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Criteria</div>
                                  <div className="table-wrap">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Criterion</th>
                                          <th>Score</th>
                                          <th>Comment</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {it.criteria.map((c) => (
                                          <tr key={c.criterionId}>
                                            <td data-label="Criterion">
                                              <div style={{ fontWeight: 700 }}>{c.name}</div>
                                              <div className="muted" style={{ fontSize: 13 }}>{c.description}</div>
                                            </td>
                                            <td data-label="Score">{c.score ?? "—"} / {c.maxScore}</td>
                                            <td data-label="Comment" style={{ whiteSpace: "pre-wrap" }}>{c.comment || "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  const unanswered = questions.length - answeredCount;

  return (
    <main className="app-shell">
      <video
        ref={proctorVideoRef}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        muted
        playsInline
        aria-hidden="true"
      />
      <header className="topbar exam-topbar">
        <div>
          <div className="brand-inline">Argus AI</div>
          <div className="muted">{view.exam.title}</div>
          <div className="muted" style={{ fontSize: 12 }}>Candidate: <strong>{view.attempt.candidate.fullName}</strong></div>
        </div>
        <div className={`timer-badge ${warningLevel}`}>
          <span className="timer-label">Time left</span>
          <span className="timer-value">{formatCountdown(remainingMs)}</span>
        </div>
      </header>

      {warningLevel !== "normal" ? (
        <div className={`time-warning ${warningLevel}`} role="alert">
          {warningLevel === "critical" ? "Less than 1 minute remaining." : "Less than 5 minutes remaining."}
        </div>
      ) : null}

      <section className="content exam-taking-layout">
        <aside className="card question-nav">
          <div className="nav-head">
            <strong>Questions</strong>
            <span className="muted" style={{ fontSize: 13 }}>{answeredCount}/{questions.length} answered</span>
          </div>
          <div className="nav-grid">
            {questions.map((q, idx) => {
              const a = localAnswers[q.id];
              const answered = q.type === "MCQ" ? !!(a && a.type === "MCQ" && a.selectedOptionId) : !!(a && a.type === "ESSAY" && a.text.trim());
              return (
                <button
                  key={q.id}
                  type="button"
                  className={`nav-item ${idx === currentIdx ? "current" : ""} ${answered ? "answered" : ""}`}
                  onClick={async () => { if (saveTimer.current) { clearTimeout(saveTimer.current); } await flushSave(); setCurrentIdx(idx); }}
                  title={`Question ${idx + 1}${answered ? " (answered)" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          <div className="save-status" aria-live="polite">
            <span className={saveState === "error" ? "err-text" : saveState === "saved" ? "ok-text" : "muted"}>
              {saveMsg || "—"}
            </span>
            {saveState === "error" ? (
              <button type="button" className="secondary-btn small-btn" onClick={() => void flushSave()} style={{ marginTop: 6 }}>Retry save</button>
            ) : null}
          </div>
          <button type="button" className="primary-btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowConfirm(true)} disabled={submitting}>
            Submit
          </button>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong>Monitoring</strong>
              <span className="pill" style={{ fontSize: 11 }}>
                {cameraMonitoring ? "Camera active" : "Browser only"}
              </span>
            </div>
            {proctoring.liveSnapshot ? (
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 6 }}>
                <div>
                  Presence: <strong>{formatFacePresence(proctoring.liveSnapshot)}</strong>
                </div>
                <div>
                  Focus: <strong>{formatGazeDirection(proctoring.liveSnapshot.eyeGazeDirection)}</strong> · {formatHeadOrientation(proctoring.liveSnapshot.headOrientation)}
                </div>
                <div>
                  Hands: <strong>{formatHandsVisibility(proctoring.liveSnapshot.leftHandVisible, proctoring.liveSnapshot.rightHandVisible)}</strong>
                </div>
              </div>
            ) : null}
            {proctoring.lastDetectedBanner ? (
              <div style={{ fontSize: 12, marginBottom: 6, padding: "6px 8px", borderRadius: 6, background: "var(--bg-soft)", border: "1px solid var(--border)" }}>
                Notice: <strong>{proctoring.lastDetectedBanner}</strong>
              </div>
            ) : null}
            <details style={{ marginTop: 6 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
                AI Proctor Demo Controls
              </summary>
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <label htmlFor="proctor-posture-select" style={{ fontSize: 11 }} className="muted">
                  Vision Posture Mode
                </label>
                <select
                  id="proctor-posture-select"
                  value={proctoring.postureMode}
                  onChange={(e) => proctoring.setPostureMode(e.target.value as DemoPostureMode)}
                  style={{ fontSize: 12, padding: "4px 6px" }}
                >
                  <option value="AUTO_WEBCAM">Auto Webcam (Normal)</option>
                  <option value="FACE_MISSING">Face Missing (≥5s)</option>
                  <option value="MULTIPLE_FACES">Multiple Faces (≥2s)</option>
                  <option value="CAMERA_OBSTRUCTED">Camera Obstructed (≥5s)</option>
                  <option value="LOOKING_AWAY">Eye Gaze Left (≥5s)</option>
                  <option value="LOOK_RIGHT">Eye Gaze Right (≥5s)</option>
                  <option value="LOOK_DOWN">Eye Gaze Down (≥5s)</option>
                  <option value="HEAD_TURNED">Head Turned Right 38° (≥5s)</option>
                  <option value="HEAD_LEFT">Head Turned Left 38° (≥5s)</option>
                  <option value="HEAD_DOWN">Head Down 30° (≥5s)</option>
                  <option value="HANDS_MISSING">Hand Missing (≥10s)</option>
                  <option value="PHONE_DETECTED">Phone Detected (≥3s)</option>
                </select>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-btn small-btn"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => proctoring.fastForwardVisionMs(3000)}
                  >
                    +3s Tick
                  </button>
                  <button
                    type="button"
                    className="secondary-btn small-btn"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => proctoring.fastForwardVisionMs(5500)}
                  >
                    +5.5s Tick
                  </button>
                  <button
                    type="button"
                    className="secondary-btn small-btn"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => proctoring.fastForwardVisionMs(10500)}
                  >
                    +10.5s Tick
                  </button>
                </div>
              </div>
            </details>
          </div>
        </aside>

        <div className="card question-section take-panel">
          {currentQ ? (
            <>
              <div className="question-item-head" style={{ marginBottom: 10 }}>
                <div className="question-index">Question {currentIdx + 1}</div>
                <div className="question-meta">
                  <span className="pill">{currentQ.type === "MCQ" ? "Multiple choice" : "Essay"}</span>
                  <span className="pill">{currentQ.points} pts</span>
                </div>
              </div>
              <div className="question-prompt" style={{ fontSize: 16 }}>{currentQ.prompt}</div>

              {currentQ.type === "MCQ" ? (
                <div className="take-options" role="radiogroup" aria-label={`Options for question ${currentIdx + 1}`}>
                  {currentQ.options.map((o) => {
                    const a = localAnswers[currentQ.id];
                    const checked = a && a.type === "MCQ" && a.selectedOptionId === o.id;
                    return (
                      <label key={o.id} className={`take-option ${checked ? "selected" : ""}`}>
                        <input
                          type="radio"
                          name={`q-${currentQ.id}`}
                          checked={checked}
                          onChange={() => setMcqAnswer(currentQ.id, o.id)}
                          disabled={submitting}
                        />
                        <span>{o.content}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="field">
                  <label htmlFor={`essay-${currentQ.id}`}>Your answer</label>
                  <textarea
                    id={`essay-${currentQ.id}`}
                    rows={10}
                    value={(localAnswers[currentQ.id] && localAnswers[currentQ.id].type === "ESSAY") ? (localAnswers[currentQ.id] as { text: string }).text : ""}
                    onChange={(e) => setEssayAnswer(currentQ.id, e.target.value)}
                    placeholder="Type your answer here..."
                    disabled={submitting}
                  />
                </div>
              )}

              <div className="form-actions" style={{ justifyContent: "space-between", marginTop: 16 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={async () => { if (saveTimer.current) clearTimeout(saveTimer.current); await flushSave(); setCurrentIdx((i) => Math.max(0, i - 1)); }}
                  disabled={currentIdx === 0}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={async () => { if (saveTimer.current) clearTimeout(saveTimer.current); await flushSave(); setCurrentIdx((i) => Math.min(questions.length - 1, i + 1)); }}
                  disabled={currentIdx >= questions.length - 1}
                >
                  Next →
                </button>
              </div>
            </>
          ) : (
            <div className="muted">No questions.</div>
          )}
        </div>
      </section>

      {showConfirm ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm submission">
          <div className="card modal-card">
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Confirm submission</h2>
            {unanswered > 0 ? (
              <p className="muted" style={{ marginBottom: 10 }}>You have <strong>{unanswered}</strong> unanswered question(s).</p>
            ) : (
              <p className="muted" style={{ marginBottom: 10 }}>All questions answered.</p>
            )}
            <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>After submitting, you cannot change your answers.</p>
            {submitError ? <div className="error-message" role="alert" style={{ marginBottom: 10 }}>{submitError}</div> : null}
            <div className="form-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowConfirm(false)} disabled={submitting}>Cancel</button>
              <button type="button" className="primary-btn" onClick={() => void doSubmit("MANUAL")} disabled={submitting}>
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
