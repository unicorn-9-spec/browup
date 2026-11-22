// SmartSpectra validation and error codes (from @smartspectra/node-sdk 3.5.0
// index.d.ts, as verified by the sibling projects Upbeat and Legible), and
// how BrowUp treats each validation code.

import type { InvalidReason } from '../types';

export const VC = {
  kOk: 0,
  kNoFaceFound: 1,
  kMultipleFacesFound: 2,
  kFaceNotCentered: 3,
  kFaceSizeOutOfRange: 4,
  kTooDark: 5,
  kTooBright: 6,
  kChestNotVisible: 7,
  kCameraTuning: 10,
  kFrameRateTooLow: 11,
  kExcessiveMotion: 12,
  kFaceTooClose: 13,
  kFaceTooFar: 14,
  kFaceTooHigh: 15,
  kFaceTooLow: 16,
  kFaceNotForward: 17,
} as const;

export const EC = {
  kOk: 0,
  kInvalidState: 1,
  kAuthenticationFailed: 2,
  kConfigurationFailed: 3,
  kCreditExhausted: 4,
  kNetworkError: 5,
  kServerError: 6,
  kInputUnavailable: 7,
  kProcessingFailed: 8,
  kFrameConversionFailed: 9,
  kNonMonotonicTimestamp: 10,
  kTimestampGap: 11,
  kMetricNotAuthorized: 13,
  kSustainedLowFrameRate: 14,
} as const;

/**
 * What a validation code does to a frame. BrowUp is face-only, so codes about
 * the chest, centring or frame rate do not invalidate anything (Legible saw
 * FRAME_RATE_TOO_LOW for most sessions on this laptop camera; treating it as
 * invalid would make every verdict NOT SEEN). A turned face and excessive
 * motion are *expected* during a head shake, so they never invalidate head
 * features; a turned face does invalidate brow features (one brow is
 * foreshortened), as does a face cut off at the top of the frame.
 */
export interface CodeEffect {
  readonly brow: boolean;
  readonly head: boolean;
  readonly reason: InvalidReason | null;
}

const NONE: CodeEffect = { brow: true, head: true, reason: null };

export function codeEffect(code: number): CodeEffect {
  switch (code) {
    case VC.kNoFaceFound: return { brow: false, head: false, reason: 'noFace' };
    case VC.kMultipleFacesFound: return { brow: false, head: false, reason: 'multipleFaces' };
    case VC.kTooDark: return { brow: false, head: false, reason: 'tooDark' };
    case VC.kTooBright: return { brow: false, head: false, reason: 'tooBright' };
    case VC.kFaceNotForward: return { brow: false, head: true, reason: 'faceTurned' };
    case VC.kFaceTooClose:
    case VC.kFaceTooHigh: return { brow: false, head: true, reason: 'faceOutOfFrame' };
    default: return NONE;
  }
}

/** Codes that pause capture outright (PLAN: "Hint shown as-is, capture
 *  paused") once they have lasted the debounce time. */
export function pausesCapture(code: number): boolean {
  return code === VC.kNoFaceFound || code === VC.kTooDark || code === VC.kTooBright || code === VC.kMultipleFacesFound;
}
