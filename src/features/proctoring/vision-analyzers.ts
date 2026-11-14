export interface Point3D {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface BoundingBox {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface DetectedFaceInput {
  boundingBox: BoundingBox;
  confidence: number;
  landmarks?: Point3D[];
  eulerAngles?: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  irisGazeOffset?: {
    horizontal: number;
    vertical: number;
  };
}

export interface DetectedHandInput {
  handedness: "LEFT" | "RIGHT";
  confidence: number;
  landmarks: Point3D[];
}

export interface DetectedObjectInput {
  label: string;
  confidence: number;
  boundingBox: BoundingBox;
}

export interface FrameQualityStats {
  meanBrightness: number;
  brightnessStdDev: number;
}

export interface VisionAnalyzerConfig {
  minFaceConfidence: number;
  minFrameBrightness: number;
  maxObstructedBrightnessStdDev: number;
  gazeHorizontalThreshold: number;
  gazeVerticalDownThreshold: number;
  headYawThresholdDeg: number;
  headPitchDownThresholdDeg: number;
  headPitchUpThresholdDeg: number;
  headRollThresholdDeg: number;
  minHandConfidence: number;
  expectedHandRegion: BoundingBox;
  minObjectConfidence: number;
  suspiciousObjectLabels: string[];
}

export const DEFAULT_VISION_ANALYZER_CONFIG: VisionAnalyzerConfig = {
  minFaceConfidence: 0.5,
  minFrameBrightness: 18,
  maxObstructedBrightnessStdDev: 8,
  gazeHorizontalThreshold: 0.28,
  gazeVerticalDownThreshold: 0.3,
  headYawThresholdDeg: 28,
  headPitchDownThresholdDeg: 22,
  headPitchUpThresholdDeg: 25,
  headRollThresholdDeg: 30,
  minHandConfidence: 0.5,
  expectedHandRegion: { xMin: 0.0, yMin: 0.15, xMax: 1.0, yMax: 1.0 },
  minObjectConfidence: 0.55,
  suspiciousObjectLabels: [
    "cell phone",
    "mobile phone",
    "smartphone",
    "book",
    "laptop",
    "remote",
    "secondary device",
  ],
};

export interface FaceMonitoringAnalysis {
  faceVisible: boolean;
  faceCount: number;
  faceMissing: boolean;
  multipleFaces: boolean;
  cameraObstructed: boolean;
  confidence: number;
}

export type GazeDirection = "CENTER" | "LEFT" | "RIGHT" | "DOWN" | "UP";

export interface EyeGazeAnalysis {
  direction: GazeDirection;
  isLookingAway: boolean;
  horizontalOffset: number;
  verticalOffset: number;
  confidence: number;
}

export type HeadOrientation = "FORWARD" | "LEFT" | "RIGHT" | "DOWN" | "UP" | "TILTED";

export interface HeadPoseAnalysis {
  yaw: number;
  pitch: number;
  roll: number;
  orientation: HeadOrientation;
  isHeadTurned: boolean;
  confidence: number;
}

export interface HandMonitoringAnalysis {
  leftHandVisible: boolean;
  rightHandVisible: boolean;
  bothHandsVisible: boolean;
  oneOrBothHandsMissing: boolean;
  missingHands: Array<"LEFT" | "RIGHT">;
  confidence: number;
}

export interface SuspiciousObjectAnalysis {
  suspiciousObjectDetected: boolean;
  phoneDetected: boolean;
  detectedLabels: string[];
  topConfidence: number;
}

export function analyzeFaceAndObstruction(
  faces: DetectedFaceInput[],
  frameStats?: FrameQualityStats,
  config: VisionAnalyzerConfig = DEFAULT_VISION_ANALYZER_CONFIG,
): FaceMonitoringAnalysis {
  const validFaces = faces.filter((face) => face.confidence >= config.minFaceConfidence);
  const faceCount = validFaces.length;

  const lowLightObstructed =
    frameStats !== undefined &&
    frameStats.meanBrightness < config.minFrameBrightness &&
    frameStats.brightnessStdDev < config.maxObstructedBrightnessStdDev;

  const primaryFace = validFaces[0];
  const lowLandmarkVisibility =
    primaryFace?.landmarks !== undefined &&
    primaryFace.landmarks.length > 0 &&
    primaryFace.landmarks.every(
      (pt) => pt.visibility !== undefined && pt.visibility < config.minFaceConfidence,
    );

  const cameraObstructed = Boolean(lowLightObstructed || lowLandmarkVisibility);
  const faceVisible = faceCount === 1 && !cameraObstructed;

  const maxConfidence =
    validFaces.length > 0
      ? Math.max(...validFaces.map((f) => Math.min(1, Math.max(0, f.confidence))))
      : cameraObstructed
        ? 0.85
        : 0.9;

  return {
    faceVisible,
    faceCount,
    faceMissing: faceCount === 0 && !cameraObstructed,
    multipleFaces: faceCount >= 2,
    cameraObstructed,
    confidence: Math.round(maxConfidence * 100) / 100,
  };
}

export function analyzeEyeGaze(
  face: DetectedFaceInput | undefined,
  config: VisionAnalyzerConfig = DEFAULT_VISION_ANALYZER_CONFIG,
): EyeGazeAnalysis {
  if (!face) {
    return {
      direction: "CENTER",
      isLookingAway: false,
      horizontalOffset: 0,
      verticalOffset: 0,
      confidence: 0,
    };
  }

  let horizontal = face.irisGazeOffset?.horizontal ?? 0;
  let vertical = face.irisGazeOffset?.vertical ?? 0;

  if (!face.irisGazeOffset && face.landmarks && face.landmarks.length >= 474) {
    const leftOuter = face.landmarks[33];
    const leftInner = face.landmarks[133];
    const leftTop = face.landmarks[159];
    const leftBottom = face.landmarks[145];
    const leftIris = face.landmarks[468];

    const eyeWidth = Math.max(1e-5, Math.abs(leftInner.x - leftOuter.x));
    const eyeHeight = Math.max(1e-5, Math.abs(leftBottom.y - leftTop.y));
    const eyeCenterX = (leftOuter.x + leftInner.x) / 2;
    const eyeCenterY = (leftTop.y + leftBottom.y) / 2;

    horizontal = (leftIris.x - eyeCenterX) / (eyeWidth / 2);
    vertical = (leftIris.y - eyeCenterY) / (eyeHeight / 2);
  }

  let direction: GazeDirection = "CENTER";
  if (horizontal <= -config.gazeHorizontalThreshold) {
    direction = "LEFT";
  } else if (horizontal >= config.gazeHorizontalThreshold) {
    direction = "RIGHT";
  } else if (vertical >= config.gazeVerticalDownThreshold) {
    direction = "DOWN";
  } else if (vertical <= -config.gazeVerticalDownThreshold) {
    direction = "UP";
  }

  const isLookingAway = direction === "LEFT" || direction === "RIGHT" || direction === "DOWN";
  const magnitude = Math.max(Math.abs(horizontal), Math.abs(vertical));
  const confidence = isLookingAway
    ? Math.min(1, Math.max(0.5, Math.round(magnitude * 100) / 100))
    : Math.round(face.confidence * 100) / 100;

  return {
    direction,
    isLookingAway,
    horizontalOffset: Math.round(horizontal * 1000) / 1000,
    verticalOffset: Math.round(vertical * 1000) / 1000,
    confidence,
  };
}

export function analyzeHeadPose(
  face: DetectedFaceInput | undefined,
  config: VisionAnalyzerConfig = DEFAULT_VISION_ANALYZER_CONFIG,
): HeadPoseAnalysis {
  if (!face) {
    return {
      yaw: 0,
      pitch: 0,
      roll: 0,
      orientation: "FORWARD",
      isHeadTurned: false,
      confidence: 0,
    };
  }

  let yaw = face.eulerAngles?.yaw ?? 0;
  let pitch = face.eulerAngles?.pitch ?? 0;
  let roll = face.eulerAngles?.roll ?? 0;

  if (!face.eulerAngles && face.landmarks && face.landmarks.length > 263) {
    const nose = face.landmarks[1];
    const leftEye = face.landmarks[33];
    const rightEye = face.landmarks[263];
    const chin = face.landmarks[152];

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const interEyeDist = Math.max(1e-4, Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y));
    const faceHeight = Math.max(1e-4, Math.abs(chin.y - eyeMidY));

    yaw = ((nose.x - eyeMidX) / (interEyeDist / 2)) * 45;
    pitch = ((nose.y - eyeMidY) / faceHeight - 0.5) * 90;
    roll = (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) / Math.PI;
  }

  let orientation: HeadOrientation = "FORWARD";
  if (yaw <= -config.headYawThresholdDeg) {
    orientation = "LEFT";
  } else if (yaw >= config.headYawThresholdDeg) {
    orientation = "RIGHT";
  } else if (pitch >= config.headPitchDownThresholdDeg) {
    orientation = "DOWN";
  } else if (pitch <= -config.headPitchUpThresholdDeg) {
    orientation = "UP";
  } else if (Math.abs(roll) >= config.headRollThresholdDeg) {
    orientation = "TILTED";
  }

  const isHeadTurned = orientation !== "FORWARD";

  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
    orientation,
    isHeadTurned,
    confidence: Math.round(face.confidence * 100) / 100,
  };
}

export function classifyGazeVsHeadMovement(
  gaze: EyeGazeAnalysis,
  headPose: HeadPoseAnalysis,
): "CENTER" | "EYE_GAZE_ONLY" | "HEAD_TURN_ONLY" | "BOTH_HEAD_AND_GAZE" {
  if (gaze.isLookingAway && headPose.isHeadTurned) {
    return "BOTH_HEAD_AND_GAZE";
  }
  if (headPose.isHeadTurned) {
    return "HEAD_TURN_ONLY";
  }
  if (gaze.isLookingAway) {
    return "EYE_GAZE_ONLY";
  }
  return "CENTER";
}

function isHandInExpectedRegion(hand: DetectedHandInput, region: BoundingBox): boolean {
  if (hand.landmarks.length === 0) {
    return false;
  }
  const centroidX = hand.landmarks.reduce((sum, pt) => sum + pt.x, 0) / hand.landmarks.length;
  const centroidY = hand.landmarks.reduce((sum, pt) => sum + pt.y, 0) / hand.landmarks.length;

  return (
    centroidX >= region.xMin &&
    centroidX <= region.xMax &&
    centroidY >= region.yMin &&
    centroidY <= region.yMax
  );
}

export function analyzeHandVisibility(
  hands: DetectedHandInput[],
  config: VisionAnalyzerConfig = DEFAULT_VISION_ANALYZER_CONFIG,
): HandMonitoringAnalysis {
  let leftHandVisible = false;
  let rightHandVisible = false;
  const confidences: number[] = [];

  for (const hand of hands) {
    if (
      hand.confidence >= config.minHandConfidence &&
      isHandInExpectedRegion(hand, config.expectedHandRegion)
    ) {
      confidences.push(hand.confidence);
      if (hand.handedness === "LEFT") {
        leftHandVisible = true;
      } else if (hand.handedness === "RIGHT") {
        rightHandVisible = true;
      }
    }
  }

  const missingHands: Array<"LEFT" | "RIGHT"> = [];
  if (!leftHandVisible) missingHands.push("LEFT");
  if (!rightHandVisible) missingHands.push("RIGHT");

  const bothHandsVisible = leftHandVisible && rightHandVisible;
  const avgConfidence =
    confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0.85;

  return {
    leftHandVisible,
    rightHandVisible,
    bothHandsVisible,
    oneOrBothHandsMissing: !bothHandsVisible,
    missingHands,
    confidence: avgConfidence,
  };
}

export function analyzeSuspiciousObjects(
  detections: DetectedObjectInput[],
  config: VisionAnalyzerConfig = DEFAULT_VISION_ANALYZER_CONFIG,
): SuspiciousObjectAnalysis {
  const allowedSet = new Set(config.suspiciousObjectLabels.map((label) => label.toLowerCase()));
  const phoneLabels = new Set(["cell phone", "mobile phone", "smartphone", "phone"]);

  const matched = detections.filter(
    (d) => d.confidence >= config.minObjectConfidence && allowedSet.has(d.label.trim().toLowerCase()),
  );

  const detectedLabels = Array.from(new Set(matched.map((d) => d.label.trim().toLowerCase())));
  const phoneDetected = detectedLabels.some((label) => phoneLabels.has(label));
  const topConfidence =
    matched.length > 0
      ? Math.round(Math.max(...matched.map((d) => d.confidence)) * 100) / 100
      : 0;

  return {
    suspiciousObjectDetected: matched.length > 0,
    phoneDetected,
    detectedLabels,
    topConfidence,
  };
}

/**
 * Computes frame luminance statistics from a browser <video> element to detect camera obstruction.
 */
export function computeVideoFrameStats(video: HTMLVideoElement | null): FrameQualityStats | undefined {
  try {
    if (!video || !video.videoWidth || !video.videoHeight) return undefined;
    const canvas = document.createElement("canvas");
    const w = 64;
    const h = 48;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const count = w * h;
    if (count === 0) return undefined;

    let sum = 0;
    const lumaValues = new Float32Array(count);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      lumaValues[p] = luma;
      sum += luma;
    }
    const mean = sum / count;
    let varianceSum = 0;
    for (let p = 0; p < count; p += 1) {
      const diff = lumaValues[p] - mean;
      varianceSum += diff * diff;
    }
    const stdDev = Math.sqrt(varianceSum / count);
    return {
      meanBrightness: Math.round(mean * 10) / 10,
      brightnessStdDev: Math.round(stdDev * 10) / 10,
    };
  } catch {
    return undefined;
  }
}
