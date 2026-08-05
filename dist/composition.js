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
function validateKeySource(value) {
  if (!isRecord(value) || typeof value.subscribeKeyCandidate !== "function") {
    throw new TypeError(
      "keySource must provide subscribeKeyCandidate(listener)."
    );
  }
  return value;
}
function validateActorTouchSource(value) {
  if (!isRecord(value) || typeof value.subscribeActorTouchCandidate !== "function") {
    throw new TypeError(
      "actorTouchSource must provide subscribeActorTouchCandidate(listener)."
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
function validateWaitOptions(value, methodName, candidateKind) {
  if (!isRecord(value) || !Object.hasOwn(value, "candidates") || Object.keys(value).some((key) => key !== "candidates" && key !== "signal") || !Array.isArray(value.candidates) || value.candidates.length === 0) {
    throw compositionError(
      "ASYNC-INPUT-COMPOSITION-001",
      `${methodName} requires a non-empty candidates array.`
    );
  }
  const candidates = /* @__PURE__ */ new Set();
  for (const candidate of value.candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      throw compositionError(
        "ASYNC-INPUT-COMPOSITION-001",
        `Every ${candidateKind} candidate must be a non-empty string.`
      );
    }
    const normalized = candidate.trim();
    if (candidates.has(normalized)) {
      throw compositionError(
        "ASYNC-INPUT-COMPOSITION-001",
        `${candidateKind} candidate is duplicated: ${normalized}`
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
function parseKeyEvent(value) {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || typeof value.code !== "string" || value.code.trim().length === 0 || value.code !== value.code.trim() || typeof value.repeat !== "boolean" || typeof value.isComposing !== "boolean" || typeof value.hasModifier !== "boolean" || typeof value.interactiveTarget !== "boolean" || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return null;
  }
  return value;
}
function parseActorTouchEvent(value) {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || typeof value.actorId !== "string" || value.actorId.trim().length === 0 || value.actorId !== value.actorId.trim() || typeof value.primaryButton !== "boolean" || typeof value.topmost !== "boolean" || typeof value.actorNameUnique !== "boolean" || typeof value.timestamp !== "number" || !Number.isFinite(value.timestamp)) {
    return null;
  }
  return value;
}
function createAsyncInputComposition(options) {
  if (!isRecord(options)) {
    throw new TypeError("Async Input composition options must be an object.");
  }
  const poseSource = options.poseSource === void 0 ? null : validatePoseSource(options.poseSource);
  const keySource = options.keySource === void 0 ? null : validateKeySource(options.keySource);
  const actorTouchSource = options.actorTouchSource === void 0 ? null : validateActorTouchSource(options.actorTouchSource);
  let released = false;
  let generation = 0;
  let pending = null;
  function finish(wait, outcome) {
    if (wait.settled) return;
    wait.settled = true;
    let cleanupError = null;
    try {
      wait.unsubscribe?.();
    } catch {
      cleanupError = compositionError(
        wait.sourceFailureCode,
        `${wait.kind} candidate source cleanup failed.`
      );
    }
    wait.unsubscribe = null;
    if (wait.signal && wait.abortListener) {
      try {
        wait.signal.removeEventListener("abort", wait.abortListener);
      } catch {
        cleanupError ??= compositionError(
          "ASYNC-INPUT-COMPOSITION-002",
          "AbortSignal cleanup failed."
        );
      }
    }
    wait.abortListener = null;
    if (pending === wait) pending = null;
    if ("error" in outcome) wait.reject(outcome.error);
    else if (cleanupError) wait.reject(cleanupError);
    else wait.resolve(outcome.candidate);
  }
  function cancelPending(code, message) {
    if (pending) finish(pending, { error: abortError(code, message) });
  }
  function unavailableSource(kind) {
    return Promise.reject(
      compositionError(
        "ASYNC-INPUT-COMPOSITION-007",
        `No ${kind} candidate source was provided.`
      )
    );
  }
  function startWait(startOptions) {
    cancelPending(
      "ASYNC-INPUT-COMPOSITION-004",
      `${startOptions.kind} candidate wait was superseded by a newer wait.`
    );
    const activeGeneration = ++generation;
    return new Promise((resolve, reject) => {
      const wait = {
        generation: activeGeneration,
        kind: startOptions.kind,
        sourceFailureCode: startOptions.sourceFailureCode,
        candidates: startOptions.candidates,
        signal: startOptions.signal,
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
            error: abortError(
              "ASYNC-INPUT-COMPOSITION-004",
              `${wait.kind} candidate wait was aborted.`
            )
          });
        };
        wait.signal.addEventListener("abort", wait.abortListener, { once: true });
      }
      try {
        const unsubscribe = startOptions.subscribe((value) => {
          if (wait.settled || pending !== wait || wait.generation !== generation) return;
          let candidate;
          try {
            candidate = startOptions.selectCandidate(value, wait);
          } catch {
            finish(wait, {
              error: compositionError(
                startOptions.invalidEventCode,
                startOptions.invalidEventMessage
              )
            });
            return;
          }
          if (candidate === null || !wait.candidates.has(candidate)) return;
          finish(wait, { candidate });
        });
        if (typeof unsubscribe !== "function") {
          throw compositionError(
            startOptions.sourceFailureCode,
            `${startOptions.kind} candidate source subscription must return an unsubscribe function.`
          );
        }
        wait.unsubscribe = unsubscribe;
        if (wait.settled) {
          wait.unsubscribe();
          wait.unsubscribe = null;
        }
      } catch (error) {
        const diagnosed = error instanceof Error ? error : compositionError(
          startOptions.sourceFailureCode,
          `${startOptions.kind} candidate source subscription failed.`
        );
        finish(wait, { error: diagnosed });
      }
    });
  }
  function requireActive() {
    return released ? compositionError(
      "ASYNC-INPUT-COMPOSITION-003",
      "Async Input composition has been released."
    ) : null;
  }
  function rejectPreAborted(kind, validated) {
    return validated.signal?.aborted ? Promise.reject(
      abortError(
        "ASYNC-INPUT-COMPOSITION-004",
        `${kind} candidate wait was aborted.`
      )
    ) : null;
  }
  const composition = {
    waitForPoseCandidate(waitOptions) {
      const inactive = requireActive();
      if (inactive) return Promise.reject(inactive);
      const validated = validateWaitOptions(
        waitOptions,
        "waitForPoseCandidate",
        "Pose"
      );
      const preAborted = rejectPreAborted("pose", validated);
      if (preAborted) return preAborted;
      if (!poseSource) return unavailableSource("pose");
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
      return startWait({
        ...validated,
        kind: "pose",
        invalidEventCode: "ASYNC-INPUT-COMPOSITION-005",
        invalidEventMessage: "Pose source published an invalid accumulated pose event.",
        sourceFailureCode: "ASYNC-INPUT-COMPOSITION-006",
        subscribe: (listener) => poseSource.subscribeAccumulatedPose(listener),
        selectCandidate(value, wait) {
          const event = parsePoseEvent(value);
          if (!event) throw new Error("invalid pose event");
          if (event.poseName === event.previousPoseName || event.poseName === wait.lastPoseName) {
            return null;
          }
          wait.lastPoseName = event.poseName;
          return event.poseName || null;
        }
      });
    },
    waitForKeyCandidate(waitOptions) {
      const inactive = requireActive();
      if (inactive) return Promise.reject(inactive);
      const validated = validateWaitOptions(
        waitOptions,
        "waitForKeyCandidate",
        "Key"
      );
      const preAborted = rejectPreAborted("key", validated);
      if (preAborted) return preAborted;
      if (!keySource) return unavailableSource("key");
      return startWait({
        ...validated,
        kind: "key",
        invalidEventCode: "ASYNC-INPUT-COMPOSITION-008",
        invalidEventMessage: "Key source published an invalid key candidate event.",
        sourceFailureCode: "ASYNC-INPUT-COMPOSITION-009",
        subscribe: (listener) => keySource.subscribeKeyCandidate(listener),
        selectCandidate(value) {
          const event = parseKeyEvent(value);
          if (!event) throw new Error("invalid key event");
          if (event.repeat || event.isComposing || event.hasModifier || event.interactiveTarget) {
            return null;
          }
          return event.code;
        }
      });
    },
    waitForActorTouchCandidate(waitOptions) {
      const inactive = requireActive();
      if (inactive) return Promise.reject(inactive);
      const validated = validateWaitOptions(
        waitOptions,
        "waitForActorTouchCandidate",
        "Actor touch"
      );
      const preAborted = rejectPreAborted("actor touch", validated);
      if (preAborted) return preAborted;
      if (!actorTouchSource) return unavailableSource("actor touch");
      return startWait({
        ...validated,
        kind: "actor touch",
        invalidEventCode: "ASYNC-INPUT-COMPOSITION-010",
        invalidEventMessage: "Actor touch source published an invalid candidate event.",
        sourceFailureCode: "ASYNC-INPUT-COMPOSITION-011",
        subscribe: (listener) => actorTouchSource.subscribeActorTouchCandidate(listener),
        selectCandidate(value) {
          const event = parseActorTouchEvent(value);
          if (!event) throw new Error("invalid actor touch event");
          if (!event.primaryButton || !event.topmost || !event.actorNameUnique) {
            return null;
          }
          return event.actorId;
        }
      });
    },
    releaseAll() {
      if (released) return;
      released = true;
      generation += 1;
      cancelPending(
        "ASYNC-INPUT-COMPOSITION-004",
        "Candidate wait was cancelled because the composition was released."
      );
    }
  };
  return Object.freeze(composition);
}
export {
  createAsyncInputComposition
};
