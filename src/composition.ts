export interface AccumulatedPoseChangedEventV1 {
  readonly version: 1;
  readonly poseName: string;
  readonly previousPoseName: string;
  readonly score: number;
  readonly reason: 'prediction' | 'reset' | 'stop';
  readonly timestamp: number;
}

export type AccumulatedPoseListener = (
  event: Readonly<AccumulatedPoseChangedEventV1>
) => void;

export interface AccumulatedPoseSource {
  resetAccumulatedPose(): void;
  subscribeAccumulatedPose(listener: AccumulatedPoseListener): () => void;
}

export interface WaitForPoseCandidateOptions {
  readonly candidates: ReadonlyArray<string>;
  readonly signal?: AbortSignal;
}

export interface AsyncInputComposition {
  waitForPoseCandidate(options: WaitForPoseCandidateOptions): Promise<string>;
  releaseAll(): void;
}

export interface AsyncInputCompositionOptions {
  readonly poseSource: AccumulatedPoseSource;
}

interface PendingWait {
  readonly generation: number;
  readonly candidates: ReadonlySet<string>;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (poseName: string) => void;
  readonly reject: (error: Error) => void;
  unsubscribe: (() => void) | null;
  abortListener: (() => void) | null;
  lastPoseName: string | null;
  settled: boolean;
}

const POSE_CHANGE_REASONS = new Set(['prediction', 'reset', 'stop']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compositionError(code: string, message: string): Error {
  const error = new Error(message);
  Object.defineProperty(error, 'code', {value: code});
  return error;
}

function abortError(code: string, message: string): Error {
  const error = compositionError(code, message);
  error.name = 'AbortError';
  return error;
}

function validatePoseSource(value: unknown): AccumulatedPoseSource {
  if (
    !isRecord(value) ||
    typeof value.resetAccumulatedPose !== 'function' ||
    typeof value.subscribeAccumulatedPose !== 'function'
  ) {
    throw new TypeError(
      'poseSource must provide resetAccumulatedPose() and subscribeAccumulatedPose(listener).'
    );
  }
  return value as unknown as AccumulatedPoseSource;
}

function validateSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.aborted !== 'boolean' ||
    typeof value.addEventListener !== 'function' ||
    typeof value.removeEventListener !== 'function'
  ) {
    throw compositionError('ASYNC-INPUT-COMPOSITION-002', 'signal must be an AbortSignal.');
  }
  return value as unknown as AbortSignal;
}

function validateWaitOptions(value: unknown): {
  candidates: ReadonlySet<string>;
  signal: AbortSignal | undefined;
} {
  if (
    !isRecord(value) ||
    !Object.hasOwn(value, 'candidates') ||
    Object.keys(value).some((key) => key !== 'candidates' && key !== 'signal') ||
    !Array.isArray(value.candidates) ||
    value.candidates.length === 0
  ) {
    throw compositionError(
      'ASYNC-INPUT-COMPOSITION-001',
      'waitForPoseCandidate requires a non-empty candidates array.'
    );
  }
  const candidates = new Set<string>();
  for (const candidate of value.candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      throw compositionError(
        'ASYNC-INPUT-COMPOSITION-001',
        'Every pose candidate must be a non-empty string.'
      );
    }
    const normalized = candidate.trim();
    if (candidates.has(normalized)) {
      throw compositionError(
        'ASYNC-INPUT-COMPOSITION-001',
        `Pose candidate is duplicated: ${normalized}`
      );
    }
    candidates.add(normalized);
  }
  return {candidates, signal: validateSignal(value.signal)};
}

function parsePoseEvent(value: unknown): AccumulatedPoseChangedEventV1 | null {
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    typeof value.poseName !== 'string' ||
    typeof value.previousPoseName !== 'string' ||
    typeof value.score !== 'number' ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    typeof value.reason !== 'string' ||
    !POSE_CHANGE_REASONS.has(value.reason) ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp)
  ) {
    return null;
  }
  return value as unknown as AccumulatedPoseChangedEventV1;
}

export function createAsyncInputComposition(
  options: AsyncInputCompositionOptions
): AsyncInputComposition {
  if (!isRecord(options)) {
    throw new TypeError('Async Input composition options must be an object.');
  }
  const poseSource = validatePoseSource(options.poseSource);
  let released = false;
  let generation = 0;
  let pending: PendingWait | null = null;

  function finish(
    wait: PendingWait,
    outcome: {poseName: string} | {error: Error}
  ): void {
    if (wait.settled) return;
    wait.settled = true;
    wait.unsubscribe?.();
    wait.unsubscribe = null;
    if (wait.signal && wait.abortListener) {
      wait.signal.removeEventListener('abort', wait.abortListener);
    }
    wait.abortListener = null;
    if (pending === wait) pending = null;
    if ('poseName' in outcome) wait.resolve(outcome.poseName);
    else wait.reject(outcome.error);
  }

  function cancelPending(code: string, message: string): void {
    if (pending) finish(pending, {error: abortError(code, message)});
  }

  const composition: AsyncInputComposition = {
    waitForPoseCandidate(waitOptions) {
      if (released) {
        return Promise.reject(
          compositionError(
            'ASYNC-INPUT-COMPOSITION-003',
            'Async Input composition has been released.'
          )
        );
      }
      const validated = validateWaitOptions(waitOptions);
      if (validated.signal?.aborted) {
        return Promise.reject(
          abortError('ASYNC-INPUT-COMPOSITION-004', 'Pose candidate wait was aborted.')
        );
      }

      cancelPending(
        'ASYNC-INPUT-COMPOSITION-004',
        'Pose candidate wait was superseded by a newer wait.'
      );
      try {
        poseSource.resetAccumulatedPose();
      } catch {
        return Promise.reject(
          compositionError(
            'ASYNC-INPUT-COMPOSITION-006',
            'poseSource.resetAccumulatedPose failed.'
          )
        );
      }

      const activeGeneration = ++generation;
      return new Promise<string>((resolve, reject) => {
        const wait: PendingWait = {
          generation: activeGeneration,
          candidates: validated.candidates,
          signal: validated.signal,
          resolve,
          reject,
          unsubscribe: null,
          abortListener: null,
          lastPoseName: null,
          settled: false
        };
        pending = wait;
        if (wait.signal) {
          wait.abortListener = () => {
            finish(wait, {
              error: abortError('ASYNC-INPUT-COMPOSITION-004', 'Pose candidate wait was aborted.')
            });
          };
          wait.signal.addEventListener('abort', wait.abortListener, {once: true});
        }

        try {
          const unsubscribe = poseSource.subscribeAccumulatedPose((value) => {
            if (wait.settled || pending !== wait || wait.generation !== generation) return;
            const event = parsePoseEvent(value);
            if (!event) {
              finish(wait, {
                error: compositionError(
                  'ASYNC-INPUT-COMPOSITION-005',
                  'Pose source published an invalid accumulated pose event.'
                )
              });
              return;
            }
            if (
              event.poseName === event.previousPoseName ||
              event.poseName === wait.lastPoseName
            ) {
              return;
            }
            wait.lastPoseName = event.poseName;
            if (!event.poseName || !wait.candidates.has(event.poseName)) return;
            finish(wait, {poseName: event.poseName});
          });
          if (typeof unsubscribe !== 'function') {
            throw compositionError(
              'ASYNC-INPUT-COMPOSITION-006',
              'poseSource.subscribeAccumulatedPose must return an unsubscribe function.'
            );
          }
          wait.unsubscribe = unsubscribe;
          if (wait.settled) {
            wait.unsubscribe();
            wait.unsubscribe = null;
          }
        } catch (error) {
          const diagnosed = error instanceof Error
            ? error
            : compositionError(
                'ASYNC-INPUT-COMPOSITION-006',
                'poseSource.subscribeAccumulatedPose failed.'
              );
          finish(wait, {error: diagnosed});
        }
      });
    },

    releaseAll() {
      if (released) return;
      released = true;
      generation += 1;
      cancelPending(
        'ASYNC-INPUT-COMPOSITION-004',
        'Pose candidate wait was cancelled because the composition was released.'
      );
    }
  };

  return Object.freeze(composition);
}
