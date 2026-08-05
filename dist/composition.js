const POSE_CHANGE_REASONS = /* @__PURE__ */ new Set(["prediction", "reset", "stop"]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function compositionError(code, message) {
  const error = new Error(message);
  Object.defineProperty(error, "code", { value: code });
  return error;
}
function abortError(code, message) {
  const error = compositionError(code, message);
  error.name = "AbortError";
  return error;
}
function validatePoseSource(value) {
  if (!isRecord(value) || typeof value.resetAccumulatedPose !== "function" || typeof value.subscribeAccumulatedPose !== "function") {
    throw new TypeError(
      "poseSource must provide resetAccumulatedPose() and subscribeAccumulatedPose(listener)."
    );
  }
  return value;
}
function validateSignal(value) {
  if (value === void 0) return void 0;
  if (!isRecord(value) || typeof value.aborted !== "boolean" || typeof value.addEventListener !== "function" || typeof value.removeEventListener !== "function") {
    throw compositionError("ASYNC-INPUT-COMPOSITION-002", "signal must be an AbortSignal.");
  }
  return value;
}
function validateWaitOptions(value) {
  if (!isRecord(value) || !Object.hasOwn(value, "candidates") || Object.keys(value).some((key) => key !== "candidates" && key !== "signal") || !Array.isArray(value.candidates) || value.candidates.length === 0) {
    throw compositionError(
      "ASYNC-INPUT-COMPOSITION-001",
      "waitForPoseCandidate requires a non-empty candidates array."
    );
  }
  const candidates = /* @__PURE__ */ new Set();
  for (const candidate of value.candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throw compositionError(
        "ASYNC-INPUT-COMPOSITION-001",
        "Every pose candidate must be a non-empty string."
      );
    }
    const normalized = candidate.trim();
    if (candidates.has(normalized)) {
      throw compositionError(
        "ASYNC-INPUT-COMPOSITION-001",
        `Pose candidate is duplicated: ${normalized}`
      );
    }
    candidates.add(normalized);
  }
  return { candidates, signal: validateSignal(value.signal) };
}
function parsePoseEvent(value) {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || typeof value.poseName !== "string" || typeof value.previousPoseName !== "string" || typeof value.score !== "number" || !Number.isFinite(value.score) || value.score < 0 || typeof value.reason !== "string" || !POSE_CHANGE_REASONS.has(value.reason) || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return null;
  }
  return value;
}
function createAsyncInputComposition(options) {
  if (!isRecord(options)) {
    throw new TypeError("Async Input composition options must be an object.");
  }
  const poseSource = validatePoseSource(options.poseSource);
  let released = false;
  let generation = 0;
  let pending = null;
  function finish(wait, outcome) {
    if (wait.settled) return;
    wait.settled = true;
    wait.unsubscribe?.();
    wait.unsubscribe = null;
    if (wait.signal && wait.abortListener) {
      wait.signal.removeEventListener("abort", wait.abortListener);
    }
    wait.abortListener = null;
    if (pending === wait) pending = null;
    if ("poseName" in outcome) wait.resolve(outcome.poseName);
    else wait.reject(outcome.error);
  }
  function cancelPending(code, message) {
    if (pending) finish(pending, { error: abortError(code, message) });
  }
  const composition = {
    waitForPoseCandidate(waitOptions) {
      if (released) {
        return Promise.reject(
          compositionError(
            "ASYNC-INPUT-COMPOSITION-003",
            "Async Input composition has been released."
          )
        );
      }
      const validated = validateWaitOptions(waitOptions);
      if (validated.signal?.aborted) {
        return Promise.reject(
          abortError("ASYNC-INPUT-COMPOSITION-004", "Pose candidate wait was aborted.")
        );
      }
      cancelPending(
        "ASYNC-INPUT-COMPOSITION-004",
        "Pose candidate wait was superseded by a newer wait."
      );
      try {
        poseSource.resetAccumulatedPose();
      } catch {
        return Promise.reject(
          compositionError(
            "ASYNC-INPUT-COMPOSITION-006",
            "poseSource.resetAccumulatedPose failed."
          )
        );
      }
      const activeGeneration = ++generation;
      return new Promise((resolve, reject) => {
        const wait = {
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
              error: abortError("ASYNC-INPUT-COMPOSITION-004", "Pose candidate wait was aborted.")
            });
          };
          wait.signal.addEventListener("abort", wait.abortListener, { once: true });
        }
        try {
          const unsubscribe = poseSource.subscribeAccumulatedPose((value) => {
            if (wait.settled || pending !== wait || wait.generation !== generation) return;
            const event = parsePoseEvent(value);
            if (!event) {
              finish(wait, {
                error: compositionError(
                  "ASYNC-INPUT-COMPOSITION-005",
                  "Pose source published an invalid accumulated pose event."
                )
              });
              return;
            }
            if (event.poseName === event.previousPoseName || event.poseName === wait.lastPoseName) {
              return;
            }
            wait.lastPoseName = event.poseName;
            if (!event.poseName || !wait.candidates.has(event.poseName)) return;
            finish(wait, { poseName: event.poseName });
          });
          if (typeof unsubscribe !== "function") {
            throw compositionError(
              "ASYNC-INPUT-COMPOSITION-006",
              "poseSource.subscribeAccumulatedPose must return an unsubscribe function."
            );
          }
          wait.unsubscribe = unsubscribe;
          if (wait.settled) {
            wait.unsubscribe();
            wait.unsubscribe = null;
          }
        } catch (error) {
          const diagnosed = error instanceof Error ? error : compositionError(
            "ASYNC-INPUT-COMPOSITION-006",
            "poseSource.subscribeAccumulatedPose failed."
          );
          finish(wait, { error: diagnosed });
        }
      });
    },
    releaseAll() {
      if (released) return;
      released = true;
      generation += 1;
      cancelPending(
        "ASYNC-INPUT-COMPOSITION-004",
        "Pose candidate wait was cancelled because the composition was released."
      );
    }
  };
  return Object.freeze(composition);
}
export {
  createAsyncInputComposition
};
