"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type JoinStatus = "loading" | "not_found" | "not_published" | "not_open" | "closed" | "open" | "error";

type PublicJoinExam = {
  id: string;
  title: string;
  durationMinutes: number;
  openAt: string | null;
  closeAt: string | null;
  questionCount: number;
};

type JoinAvailability = {
  status: string;
  exam?: PublicJoinExam;
  openAt?: string | null;
  closeAt?: string | null;
  message?: string;
};

type CameraStatus = "not_checked" | "checking" | "granted" | "denied" | "unavailable" | "skipped";

function fmt(iso?: string | null) {
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

export default function JoinFlow({ code }: { code: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<JoinStatus>("loading");
  const [availability, setAvailability] = useState<JoinAvailability | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [step, setStep] = useState<"info" | "checkin">("info");
  const [fullName, setFullName] = useState("");
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [consent, setConsent] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("not_checked");
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setFetchError(null);
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(code)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFetchError(data?.error || "Unable to check the join code. Please try again.");
        setStatus("error");
        return;
      }
      const av = data?.availability as JoinAvailability | undefined;
      setAvailability(av || null);
      const s = (av?.status as JoinStatus) || "error";
      if (s === "open" || s === "not_open" || s === "closed" || s === "not_found" || s === "not_published") {
        setStatus(s);
      } else {
        setStatus("error");
      }
    } catch {
      setFetchError("Unable to connect to the server. Please try again.");
      setStatus("error");
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function checkCamera() {
    setCameraNote(null);
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraStatus("unavailable");
      setCameraNote("Camera check is not supported on this device or browser.");
      return;
    }
    setCameraStatus("checking");
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraStatus("granted");
      setCameraNote("Camera access granted.");
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setCameraStatus("denied");
        setCameraNote("Camera permission was denied.");
      } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        setCameraStatus("unavailable");
        setCameraNote("No camera device was found.");
      } else {
        setCameraStatus("unavailable");
        setCameraNote("Unable to access the camera.");
      }
    }
  }

  function goToCheckin(e: FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    if (!name) {
      setIdentityError("Please enter your full name.");
      return;
    }
    if (name.length < 2) {
      setIdentityError("Full name must be at least 2 characters.");
      return;
    }
    if (name.length > 120) {
      setIdentityError("Full name must be 120 characters or fewer.");
      return;
    }
    setIdentityError(null);
    setStep("checkin");
  }

  async function startExam() {
    setStartError(null);
    if (!consent) {
      setStartError("Please confirm consent before starting.");
      return;
    }
    setStarting(true);
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(code)}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate: { fullName: fullName.trim() },
          consentAccepted: true,
          cameraCheck: { status: cameraStatus === "checking" ? "not_checked" : cameraStatus, note: cameraNote },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data?.errors?.form ||
          data?.errors?.fullName ||
          data?.errors?.consent ||
          "Unable to start the exam session. Please try again.";
        setStartError(msg);
        return;
      }
      stopCamera();
      router.push(`/attempts/${data.attemptId}`);
    } catch {
      setStartError("Unable to connect to the server. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  const exam = availability?.exam;

  if (status === "loading") {
    return (
      <div className="card login-form" aria-live="polite">
        <div className="muted">Checking join code…</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card login-form">
        <div className="error-message" role="alert">{fetchError || "Something went wrong."}</div>
        <button type="button" className="button primary-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  if (status === "not_found" || status === "not_published") {
    return (
      <div className="card login-form">
        <div className="error-message" role="alert">
          {availability?.message || "This join code is invalid or the exam is not available."}
        </div>
      </div>
    );
  }

  if (status === "not_open") {
    return (
      <div className="card login-form">
        <div className="error-message" role="alert">This exam is not open yet.</div>
        {exam ? (
          <div className="exam-info-block">
            <div><strong>{exam.title}</strong></div>
            <div className="muted">Opens: <strong>{fmt(availability?.openAt || exam.openAt)}</strong></div>
            {exam.closeAt ? <div className="muted">Closes: <strong>{fmt(exam.closeAt)}</strong></div> : null}
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "closed") {
    return (
      <div className="card login-form">
        <div className="error-message" role="alert">This exam is no longer accepting entries.</div>
        {exam ? (
          <div className="exam-info-block">
            <div><strong>{exam.title}</strong></div>
            <div className="muted">Closed: <strong>{fmt(availability?.closeAt || exam.closeAt)}</strong></div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card login-form join-card">
      {exam ? (
        <div className="exam-info-block">
          <h2 style={{ fontSize: 18, marginBottom: 4, color: "var(--color-ink)" }}>{exam.title}</h2>
          <div className="muted">Duration: <strong>{exam.durationMinutes} min</strong> · Questions: <strong>{exam.questionCount}</strong></div>
          <div className="muted">Opens: <strong>{fmt(exam.openAt)}</strong> · Closes: <strong>{fmt(exam.closeAt)}</strong></div>
        </div>
      ) : null}

      {step === "info" ? (
        <form onSubmit={goToCheckin} noValidate style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="field">
            <label htmlFor="fullName">Full name <span aria-hidden="true">*</span></label>
            <input
              id="fullName"
              type="text"
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              maxLength={120}
            />
            {identityError ? <div className="field-error">{identityError}</div> : null}
          </div>
          <button type="submit" className="button primary-btn">
            Continue
          </button>
        </form>
      ) : (
        <div className="checkin-steps">
          <div className="checkin-block">
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Candidate</h3>
            <div><strong>{fullName.trim()}</strong></div>
            <button type="button" className="secondary-btn small-btn" style={{ marginTop: 8 }} onClick={() => setStep("info")} disabled={starting}>
              Edit
            </button>
          </div>

          <div className="checkin-block">
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Consent</h3>
            <label className="consent-row">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={starting} />
              <span>I understand and agree to the exam session terms before starting.</span>
            </label>
          </div>

          <div className="checkin-block">
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>Camera check</h3>
            <div className="camera-area">
              <video ref={videoRef} className={`camera-preview ${cameraStatus === "granted" ? "on" : ""}`} muted playsInline />
              {cameraStatus !== "granted" ? (
                <div className="camera-placeholder muted">
                  {cameraStatus === "checking"
                    ? "Requesting camera access…"
                    : cameraStatus === "denied"
                    ? "Camera permission denied."
                    : cameraStatus === "unavailable"
                    ? "Camera unavailable."
                    : cameraStatus === "skipped"
                    ? "Camera check skipped."
                    : "Camera not checked."}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button type="button" className="secondary-btn small-btn" onClick={checkCamera} disabled={starting || cameraStatus === "checking"}>
                {cameraStatus === "granted" ? "Check again" : "Check camera"}
              </button>
              <button type="button" className="secondary-btn small-btn" onClick={() => { stopCamera(); setCameraStatus("skipped"); setCameraNote("Camera check skipped."); }} disabled={starting}>
                Skip
              </button>
            </div>
            {cameraNote ? <div className={`field-help ${cameraStatus === "granted" ? "ok-text" : ""}`} style={{ marginTop: 6 }}>{cameraNote}</div> : null}
          </div>

          {startError ? <div className="error-message" role="alert">{startError}</div> : null}

          <div className="form-actions" style={{ justifyContent: "space-between" }}>
            <button type="button" className="secondary-btn" onClick={() => setStep("info")} disabled={starting}>Back</button>
            <button type="button" className="button primary-btn" onClick={startExam} disabled={starting || !consent}>
              {starting ? "Starting…" : "Start exam"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
