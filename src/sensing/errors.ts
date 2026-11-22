// SDK errors, camera errors and validation codes → plain, friendly text
// (PLAN §5.8 error banners: no face, hands covering face, bad key, credits,
// network). Every message offers a way on — never a dead end. Codes verified
// against @smartspectra/node-sdk 3.5.0 (see codes.ts).

import { EC, VC } from './codes';

export type ErrorAction = 'retry' | 'setup' | 'settings' | 'replay' | 'welcome' | 'dismiss';

export interface AppError {
  readonly title: string;
  readonly body: string;
  readonly actions: readonly ErrorAction[];
}

export function errorForSdk(code: number, retryable: boolean): AppError {
  switch (code) {
    case EC.kAuthenticationFailed:
      return { title: 'Key not accepted', body: 'SmartSpectra did not accept the API key. Check it in Setup. The replay still works without a key.', actions: ['setup', 'replay'] };
    case EC.kCreditExhausted:
      return { title: 'No SmartSpectra credits left', body: 'This API key has used its credits. Practice needs credits; the replay does not.', actions: ['setup', 'replay'] };
    case EC.kNetworkError:
    case EC.kServerError:
      return { title: 'Cannot reach Presage', body: 'SmartSpectra runs on your computer but checks its licence online. Check your internet connection and try again.', actions: ['retry', 'replay'] };
    case EC.kInputUnavailable:
      return { title: 'The camera is busy', body: 'The camera could not be opened. It may be in use by another app, or unplugged. Close the other app, or pick another camera in Settings.', actions: ['retry', 'settings'] };
    case EC.kSustainedLowFrameRate:
      return { title: 'The camera fell behind', body: 'The frame rate stayed too low to follow your face. Close other video apps and add light; the next start uses a smaller picture.', actions: ['retry', 'settings'] };
    case EC.kMetricNotAuthorized:
    case EC.kConfigurationFailed:
      return { title: 'Face tracking could not start', body: 'SmartSpectra refused the requested face signals for this key. The replay still works.', actions: ['setup', 'replay'] };
    default:
      return retryable
        ? { title: 'Face tracking stopped', body: 'SmartSpectra stopped unexpectedly. Try again; if it keeps happening, restart the app.', actions: ['retry', 'welcome'] }
        : { title: 'Face tracking stopped', body: 'SmartSpectra stopped and cannot continue this session. Restart the app to try again.', actions: ['welcome'] };
  }
}

/** getUserMedia DOMException names. */
export function errorForCamera(name: string): AppError {
  switch (name) {
    case 'NotAllowedError':
      return { title: 'Camera permission denied', body: 'Your computer blocked camera access for BrowUp. Allow it in your privacy settings, then try again.', actions: ['retry', 'welcome'] };
    case 'NotReadableError':
    case 'AbortError':
      return { title: 'The camera is busy', body: 'Another app is holding the camera. Close it and try again.', actions: ['retry', 'settings'] };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { title: 'No camera found', body: 'Plug in a camera or pick another one in Settings.', actions: ['retry', 'settings'] };
    default:
      return { title: 'The camera could not start', body: 'Try again, or pick another camera in Settings.', actions: ['retry', 'settings'] };
  }
}

/** Short banner title over the mirror for a validation code; the SDK's own
 *  hint is shown beneath it as-is. null = nothing to show. */
export function validationBanner(code: number): string | null {
  switch (code) {
    case VC.kNoFaceFound: return 'Can’t see your face';
    case VC.kMultipleFacesFound: return 'More than one face in view';
    case VC.kTooDark: return 'Too dark to see your brows';
    case VC.kTooBright: return 'Too much light on your face';
    case VC.kFaceNotForward: return 'Face the camera';
    case VC.kFaceTooClose: return 'Move back a little';
    case VC.kFaceTooFar: return 'Move a little closer';
    case VC.kFaceTooHigh: return 'Your forehead is out of frame';
    case VC.kFaceTooLow: return 'Raise the camera or sit up';
    case VC.kExcessiveMotion: return null; // expected during head shakes
    case VC.kFrameRateTooLow: return null; // common on laptop cameras; not a reason to stop
    default: return null;
  }
}
