import {describe, expect, it, vi} from 'vitest';
import {
  createAsyncInputComposition,
  type AccumulatedPoseChangedEventV1,
  type AccumulatedPoseListener,
  type ActorTouchCandidateEventV1,
  type ActorTouchCandidateListener,
  type KeyCandidateEventV1,
  type KeyCandidateListener
} from '../src/composition.js';

function poseEvent(
  poseName: string,
  previousPoseName = '',
  overrides: Partial<AccumulatedPoseChangedEventV1> = {}
): AccumulatedPoseChangedEventV1 {
  return {
    version: 1,
    poseName,
    previousPoseName,
    score: poseName ? 1 : 0,
    reason: poseName ? 'prediction' : 'reset',
    timestamp: 1,
    ...overrides
  };
}

function keyEvent(
  code: string,
  overrides: Partial<KeyCandidateEventV1> = {}
): KeyCandidateEventV1 {
  return {
    version: 1,
    code,
    repeat: false,
    isComposing: false,
    hasModifier: false,
    interactiveTarget: false,
    timestamp: 1,
    ...overrides
  };
}

function actorTouchEvent(
  actorId: string,
  overrides: Partial<ActorTouchCandidateEventV1> = {}
): ActorTouchCandidateEventV1 {
  return {
    version: 1,
    actorId,
    primaryButton: true,
    topmost: true,
    actorNameUnique: true,
    timestamp: 1,
    ...overrides
  };
}

class FakePoseSource {
  readonly listeners = new Set<AccumulatedPoseListener>();
  readonly history: AccumulatedPoseListener[] = [];
  readonly resetAccumulatedPose = vi.fn();
  readonly subscribeAccumulatedPose = vi.fn((listener: AccumulatedPoseListener) => {
    this.listeners.add(listener);
    this.history.push(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  });

  emit(event: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(event as AccumulatedPoseChangedEventV1);
    }
  }
}

class FakeKeySource {
  readonly listeners = new Set<KeyCandidateListener>();
  readonly history: KeyCandidateListener[] = [];
  readonly subscribeKeyCandidate = vi.fn((listener: KeyCandidateListener) => {
    this.listeners.add(listener);
    this.history.push(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  });

  emit(event: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(event as KeyCandidateEventV1);
    }
  }
}

class FakeActorTouchSource {
  readonly listeners = new Set<ActorTouchCandidateListener>();
  readonly history: ActorTouchCandidateListener[] = [];
  readonly subscribeActorTouchCandidate = vi.fn(
    (listener: ActorTouchCandidateListener) => {
      this.listeners.add(listener);
      this.history.push(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        this.listeners.delete(listener);
      };
    }
  );

  emit(event: unknown): void {
    for (const listener of [...this.listeners]) {
      listener(event as ActorTouchCandidateEventV1);
    }
  }
}

describe('Async Input composition API', () => {
  it('resets a selection session and resolves with one registered candidate', async () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    const selected = input.waitForPoseCandidate({candidates: [' help ', 'jump']});
    expect(source.resetAccumulatedPose).toHaveBeenCalledOnce();
    expect(source.listeners.size).toBe(1);

    source.emit(poseEvent(''));
    source.emit(poseEvent('stand', ''));
    source.emit(poseEvent('stand', 'stand', {score: 2}));
    expect(source.listeners.size).toBe(1);
    source.emit(poseEvent('help', 'stand'));

    await expect(selected).resolves.toBe('help');
    expect(source.listeners.size).toBe(0);
    source.emit(poseEvent('jump', 'help'));
  });

  it('uses latest-wins ownership and ignores stale events from superseded waits', async () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    const first = input.waitForPoseCandidate({candidates: ['jump']});
    const staleListener = source.history[0]!;
    source.resetAccumulatedPose.mockImplementation(() => {
      expect(source.listeners.size).toBe(0);
    });
    const second = input.waitForPoseCandidate({candidates: ['stand']});

    await expect(first).rejects.toMatchObject({
      name: 'AbortError',
      message: expect.stringMatching(/superseded/u)
    });
    expect(source.resetAccumulatedPose).toHaveBeenCalledTimes(2);
    expect(source.listeners.size).toBe(1);
    staleListener(poseEvent('jump'));
    source.emit(poseEvent('jump'));
    source.emit(poseEvent('stand', 'jump'));

    await expect(second).resolves.toBe('stand');
    expect(source.listeners.size).toBe(0);
  });

  it('selects the first eligible KeyboardEvent.code candidate', async () => {
    const source = new FakeKeySource();
    const input = createAsyncInputComposition({keySource: source});
    const selected = input.waitForKeyCandidate({
      candidates: [' ArrowLeft ', 'ArrowRight']
    });
    expect(source.listeners.size).toBe(1);

    source.emit(keyEvent('KeyA'));
    source.emit(keyEvent('ArrowLeft', {repeat: true}));
    source.emit(keyEvent('ArrowLeft', {isComposing: true}));
    source.emit(keyEvent('ArrowLeft', {hasModifier: true}));
    source.emit(keyEvent('ArrowLeft', {interactiveTarget: true}));
    expect(source.listeners.size).toBe(1);
    source.emit(keyEvent('ArrowRight'));

    await expect(selected).resolves.toBe('ArrowRight');
    expect(source.listeners.size).toBe(0);
  });

  it('selects an eligible topmost uniquely resolved actor ID', async () => {
    const source = new FakeActorTouchSource();
    const input = createAsyncInputComposition({actorTouchSource: source});
    const selected = input.waitForActorTouchCandidate({
      candidates: ['LeftDoor', 'RightDoor']
    });
    expect(source.listeners.size).toBe(1);

    source.emit(actorTouchEvent('UnknownDoor'));
    source.emit(actorTouchEvent('LeftDoor', {primaryButton: false}));
    source.emit(actorTouchEvent('LeftDoor', {topmost: false}));
    source.emit(actorTouchEvent('LeftDoor', {actorNameUnique: false}));
    expect(source.listeners.size).toBe(1);
    source.emit(actorTouchEvent('RightDoor'));

    await expect(selected).resolves.toBe('RightDoor');
    expect(source.listeners.size).toBe(0);
  });

  it('applies latest-wins ownership across pose, key, and actor touch modes', async () => {
    const poseSource = new FakePoseSource();
    const keySource = new FakeKeySource();
    const actorTouchSource = new FakeActorTouchSource();
    const input = createAsyncInputComposition({
      poseSource,
      keySource,
      actorTouchSource
    });
    const pose = input.waitForPoseCandidate({candidates: ['jump']});
    const stalePose = poseSource.history[0]!;
    const key = input.waitForKeyCandidate({candidates: ['Space']});

    await expect(pose).rejects.toMatchObject({name: 'AbortError'});
    expect(poseSource.listeners.size).toBe(0);
    stalePose(poseEvent('jump'));
    const staleKey = keySource.history[0]!;
    const touch = input.waitForActorTouchCandidate({candidates: ['Hero']});

    await expect(key).rejects.toMatchObject({name: 'AbortError'});
    expect(keySource.listeners.size).toBe(0);
    staleKey(keyEvent('Space'));
    actorTouchSource.emit(actorTouchEvent('Hero'));
    await expect(touch).resolves.toBe('Hero');
    expect(actorTouchSource.listeners.size).toBe(0);
  });

  it('does not replace an active wait with an invalid or already-aborted request', async () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    const active = input.waitForPoseCandidate({candidates: ['jump']});
    expect(() => input.waitForPoseCandidate({candidates: []})).toThrow(/candidates/u);
    const controller = new AbortController();
    controller.abort();
    const aborted = input.waitForPoseCandidate({
      candidates: ['stand'],
      signal: controller.signal
    });

    await expect(aborted).rejects.toMatchObject({name: 'AbortError'});
    expect(source.resetAccumulatedPose).toHaveBeenCalledOnce();
    expect(source.listeners.size).toBe(1);
    source.emit(poseEvent('jump'));
    await expect(active).resolves.toBe('jump');
  });

  it('does not replace an active wait with invalid cross-mode or unavailable-source requests', async () => {
    const keySource = new FakeKeySource();
    const actorTouchSource = new FakeActorTouchSource();
    const input = createAsyncInputComposition({keySource, actorTouchSource});
    const active = input.waitForKeyCandidate({candidates: ['Space']});

    expect(() => input.waitForActorTouchCandidate({candidates: []}))
      .toThrow(/candidates/u);
    expect(() => input.waitForActorTouchCandidate({
      candidates: ['Hero', ' Hero ']
    })).toThrow(/duplicated/u);
    const controller = new AbortController();
    controller.abort();
    await expect(input.waitForActorTouchCandidate({
      candidates: ['Hero'],
      signal: controller.signal
    })).rejects.toMatchObject({name: 'AbortError'});
    expect(keySource.listeners.size).toBe(1);
    expect(actorTouchSource.listeners.size).toBe(0);

    const withoutPoseSource = input.waitForPoseCandidate({candidates: ['jump']});
    await expect(withoutPoseSource).rejects.toMatchObject({
      code: 'ASYNC-INPUT-COMPOSITION-007'
    });
    expect(keySource.listeners.size).toBe(1);
    keySource.emit(keyEvent('Space'));
    await expect(active).resolves.toBe('Space');
  });

  it('unsubscribes immediately on abort and ignores its stale listener', async () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    const controller = new AbortController();
    const selected = input.waitForPoseCandidate({
      candidates: ['jump'],
      signal: controller.signal
    });
    const staleListener = source.history[0]!;
    controller.abort('scene-transition');

    await expect(selected).rejects.toMatchObject({name: 'AbortError'});
    expect(source.listeners.size).toBe(0);
    staleListener(poseEvent('jump'));
  });

  it('rejects malformed candidates, signals, sources, and events fail closed', async () => {
    const source = new FakePoseSource();
    expect(() => createAsyncInputComposition({poseSource: {} as never})).toThrow(/poseSource/u);
    expect(() => createAsyncInputComposition({keySource: {} as never})).toThrow(/keySource/u);
    expect(() => createAsyncInputComposition({actorTouchSource: {} as never}))
      .toThrow(/actorTouchSource/u);
    const input = createAsyncInputComposition({poseSource: source});
    const invalidCandidates = [
      {candidates: ['']},
      {candidates: ['jump', ' jump ']},
      {candidates: [1]},
      {candidates: ['jump'], extra: true},
      {candidates: ['jump'], signal: {aborted: false}}
    ];
    for (const value of invalidCandidates) {
      expect(() => input.waitForPoseCandidate(value as never)).toThrow();
    }

    const selected = input.waitForPoseCandidate({candidates: ['jump']});
    source.emit({version: 2, poseName: 'jump'});
    await expect(selected).rejects.toMatchObject({
      message: expect.stringMatching(/invalid accumulated pose event/u)
    });
    expect(source.listeners.size).toBe(0);
  });

  it('rejects malformed key and actor touch events and unsubscribes immediately', async () => {
    const keySource = new FakeKeySource();
    const actorTouchSource = new FakeActorTouchSource();
    const input = createAsyncInputComposition({keySource, actorTouchSource});
    const key = input.waitForKeyCandidate({candidates: ['Space']});
    keySource.emit({...keyEvent('Space'), timestamp: Number.NaN});
    await expect(key).rejects.toMatchObject({
      code: 'ASYNC-INPUT-COMPOSITION-008'
    });
    expect(keySource.listeners.size).toBe(0);

    const touch = input.waitForActorTouchCandidate({candidates: ['Hero']});
    actorTouchSource.emit({...actorTouchEvent('Hero'), topmost: 'yes'});
    await expect(touch).rejects.toMatchObject({
      code: 'ASYNC-INPUT-COMPOSITION-010'
    });
    expect(actorTouchSource.listeners.size).toBe(0);
  });

  it('diagnoses source reset and subscription failures', async () => {
    const resetFailure = createAsyncInputComposition({
      poseSource: {
        resetAccumulatedPose() {
          throw new Error('reset failed');
        },
        subscribeAccumulatedPose: vi.fn(() => () => undefined)
      }
    });
    await expect(resetFailure.waitForPoseCandidate({candidates: ['jump']})).rejects.toThrow(
      /resetAccumulatedPose failed/u
    );

    const invalidUnsubscribe = createAsyncInputComposition({
      poseSource: {
        resetAccumulatedPose() {},
        subscribeAccumulatedPose: vi.fn(() => null as never)
      }
    });
    await expect(invalidUnsubscribe.waitForPoseCandidate({candidates: ['jump']})).rejects.toThrow(
      /unsubscribe/u
    );

    let listener: KeyCandidateListener | null = null;
    const cleanupFailure = createAsyncInputComposition({
      keySource: {
        subscribeKeyCandidate(nextListener) {
          listener = nextListener;
          return () => {
            throw new Error('cleanup failed');
          };
        }
      }
    });
    const selected = cleanupFailure.waitForKeyCandidate({candidates: ['Space']});
    const emit = listener as KeyCandidateListener | null;
    expect(emit).not.toBeNull();
    emit?.(keyEvent('Space'));
    await expect(selected).rejects.toMatchObject({
      code: 'ASYNC-INPUT-COMPOSITION-009',
      message: expect.stringMatching(/cleanup failed/u)
    });
  });

  it('keeps latest-wins ownership isolated between instances', async () => {
    const firstSource = new FakePoseSource();
    const secondSource = new FakePoseSource();
    const firstInput = createAsyncInputComposition({poseSource: firstSource});
    const secondInput = createAsyncInputComposition({poseSource: secondSource});
    const replaced = firstInput.waitForPoseCandidate({candidates: ['help']});
    const second = secondInput.waitForPoseCandidate({candidates: ['stand']});
    const first = firstInput.waitForPoseCandidate({candidates: ['jump']});

    await expect(replaced).rejects.toMatchObject({name: 'AbortError'});
    secondSource.emit(poseEvent('stand'));
    await expect(second).resolves.toBe('stand');
    expect(firstSource.listeners.size).toBe(1);
    firstSource.emit(poseEvent('jump'));
    await expect(first).resolves.toBe('jump');
  });

  it('keeps key and touch listeners isolated between composition instances', async () => {
    const firstSource = new FakeKeySource();
    const secondSource = new FakeActorTouchSource();
    const firstInput = createAsyncInputComposition({keySource: firstSource});
    const secondInput = createAsyncInputComposition({actorTouchSource: secondSource});
    const key = firstInput.waitForKeyCandidate({candidates: ['Space']});
    const touch = secondInput.waitForActorTouchCandidate({candidates: ['Hero']});

    firstSource.emit(keyEvent('Space'));
    await expect(key).resolves.toBe('Space');
    expect(secondSource.listeners.size).toBe(1);
    secondSource.emit(actorTouchEvent('Hero'));
    await expect(touch).resolves.toBe('Hero');
  });

  it('makes releaseAll idempotent, final, and cancelling', async () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    const selected = input.waitForPoseCandidate({candidates: ['jump']});
    const staleListener = source.history[0]!;
    input.releaseAll();
    input.releaseAll();

    await expect(selected).rejects.toMatchObject({name: 'AbortError'});
    expect(source.listeners.size).toBe(0);
    staleListener(poseEvent('jump'));
    await expect(input.waitForPoseCandidate({candidates: ['jump']})).rejects.toThrow(/released/u);
  });

  it('constructs without global Scratch', () => {
    const source = new FakePoseSource();
    const input = createAsyncInputComposition({poseSource: source});
    input.releaseAll();
  });
});
