import {describe, expect, it, vi} from 'vitest';
import {
  createAsyncInputComposition,
  type AccumulatedPoseChangedEventV1,
  type AccumulatedPoseListener
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
