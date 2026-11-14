import {
  analyzeEyeGaze,
  analyzeFaceAndObstruction,
  analyzeHandVisibility,
  analyzeHeadPose,
  analyzeSuspiciousObjects,
  classifyGazeVsHeadMovement,
  DEFAULT_VISION_ANALYZER_CONFIG,
  type DetectedFaceInput,
  type DetectedHandInput,
  type DetectedObjectInput,
  type FrameQualityStats,
  type GazeDirection,
  type HeadOrientation,
  type VisionAnalyzerConfig,
} from "./vision-analyzers";

export type BehaviorEventType =
  | "FACE_MISSING"
  | "MULTIPLE_FACES"
  | "CAMERA_OBSTRUCTED"
  | "LOOK_LEFT"
  | "LOOK_RIGHT"
  | "LOOK_DOWN"
  | "LOOK_UP"
  | "HEAD_LEFT"
  | "HEAD_RIGHT"
  | "HEAD_DOWN"
  | "HEAD_TILTED"
  | "GAZE_HEAD_MISMATCH"
  | "HANDS_MISSING"
  | "PHONE_DETECTED";

export type BehaviorSeverity = "LOW" | "MEDIUM" | "HIGH";
export type BehaviorEventStatus = "DETECTED" | "CONFIRMED" | "RESOLVED";

export interface BehaviorRuleConfig {
  minDurationMs: number;
  cooldownMs: number;
  severity: BehaviorSeverity;
  enabled: boolean;
}

export type BehaviorThresholdsConfig = Record<BehaviorEventType, BehaviorRuleConfig>;

const GAZE_DIRECTION_TO_EVENT: Record<string, BehaviorEventType> = {
  LEFT: "LOOK_LEFT",
  RIGHT: "LOOK_RIGHT",
  DOWN: "LOOK_DOWN",
  UP: "LOOK_UP",
};

function gazeDirectionToEventType(direction: string): BehaviorEventType {
  return GAZE_DIRECTION_TO_EVENT[direction] ?? "LOOK_LEFT";
}

function headOrientationToEventType(orientation: string): BehaviorEventType | null {
  switch (orientation) {
    case "LEFT":
      return "HEAD_LEFT";
    case "RIGHT":
      return "HEAD_RIGHT";
    case "DOWN":
      return "HEAD_DOWN";
    case "TILTED":
      return "HEAD_TILTED";
    default:
      return null;
  }
}

function headDirectionEqualsGazeDirection(orientation: string, gazeDirection: string): boolean {
  if (orientation === "LEFT" && gazeDirection === "LEFT") return true;
  if (orientation === "RIGHT" && gazeDirection === "RIGHT") return true;
  if (orientation === "DOWN" && gazeDirection === "DOWN") return true;
  return false;
}

const PEEK_EVENT_TYPES = new Set<BehaviorEventType>([
  "LOOK_LEFT",
  "LOOK_RIGHT",
  "LOOK_DOWN",
  "LOOK_UP",
  "HEAD_LEFT",
  "HEAD_RIGHT",
  "HEAD_DOWN",
  "HEAD_TILTED",
  "GAZE_HEAD_MISMATCH",
]);

function isPeekEventType(type: BehaviorEventType): boolean {
  return PEEK_EVENT_TYPES.has(type);
}

export const DEFAULT_BEHAVIOR_THRESHOLDS: BehaviorThresholdsConfig = {
  FACE_MISSING: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  MULTIPLE_FACES: {
    minDurationMs: 2_000,
    cooldownMs: 10_000,
    severity: "HIGH",
    enabled: true,
  },
  CAMERA_OBSTRUCTED: {
    minDurationMs: 5_000,
    cooldownMs: 15_000,
    severity: "MEDIUM",
    enabled: true,
  },
  LOOK_LEFT: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  LOOK_RIGHT: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  LOOK_DOWN: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  LOOK_UP: {
    minDurationMs: 8_000,
    cooldownMs: 15_000,
    severity: "LOW",
    enabled: true,
  },
  HEAD_LEFT: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  HEAD_RIGHT: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  HEAD_DOWN: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  HEAD_TILTED: {
    minDurationMs: 8_000,
    cooldownMs: 15_000,
    severity: "LOW",
    enabled: true,
  },
  GAZE_HEAD_MISMATCH: {
    minDurationMs: 5_000,
    cooldownMs: 10_000,
    severity: "MEDIUM",
    enabled: true,
  },
  HANDS_MISSING: {
    minDurationMs: 10_000,
    cooldownMs: 30_000,
    severity: "LOW",
    enabled: true,
  },
  PHONE_DETECTED: {
    minDurationMs: 3_000,
    cooldownMs: 10_000,
    severity: "HIGH",
    enabled: true,
  },
};

export interface BehaviorMonitoringEvent {
  id: string;
  examSessionId: string;
  examId: string;
  candidateId: string;
  eventType: BehaviorEventType;
  severity: BehaviorSeverity;
  confidence: number;
  startTimestamp: string;
  endTimestamp: string;
  durationMs: number;
  evidenceRef: string | null;
  status: BehaviorEventStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  metadata: Record<string, unknown>;
}

export interface FrameVisionObservation {
  timestampMs: number;
  faces: DetectedFaceInput[];
  hands?: DetectedHandInput[];
  objects?: DetectedObjectInput[];
  frameStats?: FrameQualityStats;
  evidenceSnapshotRef?: string | null;
}

export interface LiveCandidateMonitoringSnapshot {
  timestamp: string;
  webcamAvailable: boolean;
  faceVisible: boolean;
  faceCount: number;
  cameraObstructed: boolean;
  eyeGazeDirection: GazeDirection;
  isLookingAway: boolean;
  headOrientation: HeadOrientation;
  headPose: { yaw: number; pitch: number; roll: number };
  gazeVsHeadClassification: "CENTER" | "EYE_GAZE_ONLY" | "HEAD_TURN_ONLY" | "BOTH_HEAD_AND_GAZE";
  leftHandVisible: boolean;
  rightHandVisible: boolean;
  suspiciousObjects: string[];
}

interface ActiveConditionTracker {
  startTimestampMs: number;
  lastSeenTimestampMs: number;
  confidenceSum: number;
  sampleCount: number;
  emittedEventId: string | null;
  evidenceRef: string | null;
  metadata: Record<string, unknown>;
}

export interface BehaviorEngineInitOptions {
  examSessionId: string;
  examId: string;
  candidateId: string;
  thresholds?: Partial<Record<BehaviorEventType, Partial<BehaviorRuleConfig>>>;
  visionConfig?: Partial<VisionAnalyzerConfig>;
}

function generateEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `bev_${globalThis.crypto.randomUUID()}`;
  }
  return `bev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mergeThresholds(
  overrides?: Partial<Record<BehaviorEventType, Partial<BehaviorRuleConfig>>>,
): BehaviorThresholdsConfig {
  const result = structuredClone(DEFAULT_BEHAVIOR_THRESHOLDS);
  if (!overrides) return result;

  for (const key of Object.keys(overrides) as BehaviorEventType[]) {
    const patch = overrides[key];
    if (patch) {
      result[key] = { ...result[key], ...patch };
    }
  }
  return result;
}

export class BehaviorAnalysisEngine {
  readonly examSessionId: string;
  readonly examId: string;
  readonly candidateId: string;
  private thresholds: BehaviorThresholdsConfig;
  private visionConfig: VisionAnalyzerConfig;

  private readonly activeConditions = new Map<BehaviorEventType, ActiveConditionTracker>();
  private readonly lastEmittedEndMs = new Map<BehaviorEventType, number>();
  private readonly events: BehaviorMonitoringEvent[] = [];
  private readonly eventsById = new Map<string, BehaviorMonitoringEvent>();

  private lastFrameTimestampMs: number | null = null;
  private totalMonitoringDurationMs = 0;
  private bothHandsVisibleDurationMs = 0;
  private lookingAwayTotalDurationMs = 0;
  private lookingAwayEpisodeCount = 0;
  private latestLiveSnapshot: LiveCandidateMonitoringSnapshot | null = null;

  constructor(options: BehaviorEngineInitOptions) {
    this.examSessionId = options.examSessionId;
    this.examId = options.examId;
    this.candidateId = options.candidateId;
    this.thresholds = mergeThresholds(options.thresholds);
    this.visionConfig = { ...DEFAULT_VISION_ANALYZER_CONFIG, ...options.visionConfig };
  }

  processFrame(observation: FrameVisionObservation): {
    newlyDetected: BehaviorMonitoringEvent[];
    liveSnapshot: LiveCandidateMonitoringSnapshot;
  } {
    const nowMs = observation.timestampMs;
    const deltaMs =
      this.lastFrameTimestampMs !== null && nowMs > this.lastFrameTimestampMs
        ? nowMs - this.lastFrameTimestampMs
        : 0;
    this.lastFrameTimestampMs = nowMs;
    this.totalMonitoringDurationMs += deltaMs;

    const faceAnalysis = analyzeFaceAndObstruction(
      observation.faces,
      observation.frameStats,
      this.visionConfig,
    );
    const primaryFace = faceAnalysis.faceCount === 1 ? observation.faces[0] : undefined;
    const gazeAnalysis = analyzeEyeGaze(primaryFace, this.visionConfig);
    const headPoseAnalysis = analyzeHeadPose(primaryFace, this.visionConfig);
    const gazeVsHead = classifyGazeVsHeadMovement(gazeAnalysis, headPoseAnalysis);
    const handAnalysis = analyzeHandVisibility(observation.hands ?? [], this.visionConfig);
    const objectAnalysis = analyzeSuspiciousObjects(observation.objects ?? [], this.visionConfig);

    if (handAnalysis.bothHandsVisible) {
      this.bothHandsVisibleDurationMs += deltaMs;
    }
    if (gazeAnalysis.isLookingAway) {
      this.lookingAwayTotalDurationMs += deltaMs;
    }

    const liveSnapshot: LiveCandidateMonitoringSnapshot = {
      timestamp: new Date(nowMs).toISOString(),
      webcamAvailable: true,
      faceVisible: faceAnalysis.faceVisible,
      faceCount: faceAnalysis.faceCount,
      cameraObstructed: faceAnalysis.cameraObstructed,
      eyeGazeDirection: gazeAnalysis.direction,
      isLookingAway: gazeAnalysis.isLookingAway,
      headOrientation: headPoseAnalysis.orientation,
      headPose: {
        yaw: headPoseAnalysis.yaw,
        pitch: headPoseAnalysis.pitch,
        roll: headPoseAnalysis.roll,
      },
      gazeVsHeadClassification: gazeVsHead,
      leftHandVisible: handAnalysis.leftHandVisible,
      rightHandVisible: handAnalysis.rightHandVisible,
      suspiciousObjects: objectAnalysis.detectedLabels,
    };
    this.latestLiveSnapshot = liveSnapshot;

    const conditionChecks: Array<{
      type: BehaviorEventType;
      active: boolean;
      confidence: number;
      metadata: Record<string, unknown>;
    }> = [
      {
        type: "FACE_MISSING",
        active: faceAnalysis.faceMissing,
        confidence: faceAnalysis.confidence,
        metadata: { faceCount: 0 },
      },
      {
        type: "MULTIPLE_FACES",
        active: faceAnalysis.multipleFaces,
        confidence: faceAnalysis.confidence,
        metadata: { faceCount: faceAnalysis.faceCount },
      },
      {
        type: "CAMERA_OBSTRUCTED",
        active: faceAnalysis.cameraObstructed,
        confidence: faceAnalysis.confidence,
        metadata: {
          meanBrightness: observation.frameStats?.meanBrightness ?? null,
          brightnessStdDev: observation.frameStats?.brightnessStdDev ?? null,
        },
      },
      {
        type: gazeDirectionToEventType(gazeAnalysis.direction),
        active: faceAnalysis.faceVisible && gazeAnalysis.isLookingAway,
        confidence: gazeAnalysis.confidence,
        metadata: {
          gazeDirection: gazeAnalysis.direction,
          horizontalOffset: gazeAnalysis.horizontalOffset,
          verticalOffset: gazeAnalysis.verticalOffset,
          movementType: gazeVsHead,
        },
      },
      {
        type: headOrientationToEventType(headPoseAnalysis.orientation) ?? "HEAD_TILTED",
        active:
          faceAnalysis.faceVisible &&
          headPoseAnalysis.isHeadTurned &&
          headOrientationToEventType(headPoseAnalysis.orientation) !== null,
        confidence: headPoseAnalysis.confidence,
        metadata: {
          orientation: headPoseAnalysis.orientation,
          yaw: headPoseAnalysis.yaw,
          pitch: headPoseAnalysis.pitch,
          roll: headPoseAnalysis.roll,
          movementType: gazeVsHead,
        },
      },
      {
        type: "GAZE_HEAD_MISMATCH",
        active:
          faceAnalysis.faceVisible &&
          gazeAnalysis.isLookingAway &&
          headPoseAnalysis.isHeadTurned &&
          headDirectionEqualsGazeDirection(headPoseAnalysis.orientation, gazeAnalysis.direction) === false,
        confidence: Math.min(gazeAnalysis.confidence, headPoseAnalysis.confidence),
        metadata: {
          gazeDirection: gazeAnalysis.direction,
          headOrientation: headPoseAnalysis.orientation,
          movementType: gazeVsHead,
        },
      },
      {
        type: "HANDS_MISSING",
        active: handAnalysis.oneOrBothHandsMissing,
        confidence: handAnalysis.confidence,
        metadata: {
          missingHands: handAnalysis.missingHands.join(", "),
          leftHandVisible: handAnalysis.leftHandVisible,
          rightHandVisible: handAnalysis.rightHandVisible,
        },
      },
      {
        type: "PHONE_DETECTED",
        active: objectAnalysis.suspiciousObjectDetected,
        confidence: objectAnalysis.topConfidence,
        metadata: {
          phoneDetected: objectAnalysis.phoneDetected,
          detectedObjects: objectAnalysis.detectedLabels.join(", "),
        },
      },
    ];

    const newlyDetected: BehaviorMonitoringEvent[] = [];

    for (const check of conditionChecks) {
      const rule = this.thresholds[check.type];
      if (!rule?.enabled) {
        this.activeConditions.delete(check.type);
        continue;
      }

      if (!check.active) {
        const completed = this.activeConditions.get(check.type);
        if (completed?.emittedEventId) {
          this.lastEmittedEndMs.set(check.type, completed.lastSeenTimestampMs);
        }
        this.activeConditions.delete(check.type);
        continue;
      }

      let tracker = this.activeConditions.get(check.type);
      if (!tracker) {
        tracker = {
          startTimestampMs: nowMs,
          lastSeenTimestampMs: nowMs,
          confidenceSum: check.confidence,
          sampleCount: 1,
          emittedEventId: null,
          evidenceRef: observation.evidenceSnapshotRef ?? null,
          metadata: check.metadata,
        };
        this.activeConditions.set(check.type, tracker);
      } else {
        tracker.lastSeenTimestampMs = nowMs;
        tracker.confidenceSum += check.confidence;
        tracker.sampleCount += 1;
        tracker.metadata = { ...tracker.metadata, ...check.metadata };
        if (!tracker.evidenceRef && observation.evidenceSnapshotRef) {
          tracker.evidenceRef = observation.evidenceSnapshotRef;
        }
      }

      const durationMs = tracker.lastSeenTimestampMs - tracker.startTimestampMs;
      const avgConfidence = Math.round((tracker.confidenceSum / tracker.sampleCount) * 100) / 100;

      if (tracker.emittedEventId) {
        const existingEvent = this.eventsById.get(tracker.emittedEventId);
        if (existingEvent) {
          existingEvent.endTimestamp = new Date(nowMs).toISOString();
          existingEvent.durationMs = durationMs;
          existingEvent.confidence = avgConfidence;
          existingEvent.metadata = tracker.metadata;
          if (!existingEvent.evidenceRef && tracker.evidenceRef) {
            existingEvent.evidenceRef = tracker.evidenceRef;
          }
        }
        continue;
      }

      if (durationMs < rule.minDurationMs) {
        continue;
      }

      const prevEndMs = this.lastEmittedEndMs.get(check.type);
      if (prevEndMs !== undefined && tracker.startTimestampMs - prevEndMs < rule.cooldownMs) {
        continue;
      }

      const eventId = generateEventId();
      const newEvent: BehaviorMonitoringEvent = {
        id: eventId,
        examSessionId: this.examSessionId,
        examId: this.examId,
        candidateId: this.candidateId,
        eventType: check.type,
        severity: rule.severity,
        confidence: avgConfidence,
        startTimestamp: new Date(tracker.startTimestampMs).toISOString(),
        endTimestamp: new Date(nowMs).toISOString(),
        durationMs,
        evidenceRef: tracker.evidenceRef,
        status: "DETECTED",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        metadata: tracker.metadata,
      };

      tracker.emittedEventId = eventId;
      if (isPeekEventType(check.type)) {
        this.lookingAwayEpisodeCount += 1;
      }

      this.events.push(newEvent);
      this.eventsById.set(eventId, newEvent);
      newlyDetected.push(newEvent);
    }

    return { newlyDetected, liveSnapshot };
  }

  getLatestLiveSnapshot(): LiveCandidateMonitoringSnapshot | null {
    return this.latestLiveSnapshot ? structuredClone(this.latestLiveSnapshot) : null;
  }

  getSessionMetrics() {
    return {
      totalMonitoringDurationMs: this.totalMonitoringDurationMs,
      bothHandsVisibleDurationMs: this.bothHandsVisibleDurationMs,
      lookingAwayTotalDurationMs: this.lookingAwayTotalDurationMs,
      lookingAwayEpisodeCount: this.lookingAwayEpisodeCount,
    };
  }
}
