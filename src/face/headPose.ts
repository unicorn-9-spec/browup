// Head yaw and pitch from the nose tip against the outer eye corners,
// relative to the learner's neutral pose.
//
// The nose tip sits in front of the eye plane by depth d. Turning the head
// by θ moves it along the eye line by ≈ d·sin θ, so with E the eye distance,
//   ratio(θ) − ratio(0) ≈ (d/E)·sin θ.
// The same holds for pitch along the face's vertical axis (chin up moves the
// nose tip up the image). Adapted from Upbeat (pitch) and Legible (yaw).

import { LANDMARKS } from '../../config/thresholds';

export function angleFromRatio(ratio: number, baselineRatio: number, depthRatio: number = LANDMARKS.NOSE_DEPTH_RATIO): number {
  const s = (ratio - baselineRatio) / depthRatio;
  return (Math.asin(Math.max(-1, Math.min(1, s))) * 180) / Math.PI;
}

/** Yaw in degrees; + = nose towards the signer's left (image right). */
export function yawDeg(yawRatio: number, baseline: number): number {
  return angleFromRatio(yawRatio, baseline);
}

/** Pitch in degrees; + = chin up (the nose tip moves up the face). */
export function pitchDeg(pitchRatio: number, baseline: number): number {
  return -angleFromRatio(pitchRatio, baseline);
}
