import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FEATURE_FLAGS} from '../config/feature-flags.js';
import {AsyncInputExtension, DOCS_URI, isEditableTarget} from '../src/extension.js';

type TestListener = (event: Record<string, unknown>) => void;

class FakeEventSource {
  readonly listeners = new Map<string, Set<TestListener>>();
  readonly addEventListener = vi.fn((type: string, listener: TestListener) => {
    const listeners = this.listeners.get(type) ?? new Set<TestListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  });
  readonly removeEventListener = vi.fn((type: string, listener: TestListener) => {
    this.listeners.get(type)?.delete(listener);
  });

  emit(type: string, event: Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

describe('Async Input extension', () => {
  const windowEvents = new FakeEventSource();
  const canvasEvents = new FakeEventSource();
  const runtimeListeners = new Map<string, Set<(payload?: unknown) => void>>();
  const runtimeOn = vi.fn((eventName: string, listener: (payload?: unknown) => void) => {
    const listeners = runtimeListeners.get(eventName) ?? new Set();
    listeners.add(listener);
    runtimeListeners.set(eventName, listeners);
  });
  const runtimeOff = vi.fn((eventName: string, listener: (payload?: unknown) => void) => {
    runtimeListeners.get(eventName)?.delete(listener);
  });
  const sideEffects: string[] = [];
  const startHats = vi.fn(() => {
    sideEffects.push('broadcast');
    return [];
  });
  const supportsAccumulatedPoseEvents = vi.fn(() => true);
  const pick = vi.fn(() => 7);
  const runtimeValues = new Map<string, unknown>();
  const setRuntimeVariable = vi.fn(({VAR, STRING}: {VAR: string; STRING: unknown}) => {
    sideEffects.push('write');
    runtimeValues.set(VAR, STRING);
  });
  const temporaryVariables: TemporaryVariablesExtension = {
    setRuntimeVariable,
    getRuntimeVariable: ({VAR}) => runtimeValues.get(VAR) ?? '',
    runtimeVariableExists: ({VAR}) => runtimeValues.has(VAR)
  };
  const stage: TurboWarpTarget = {
    id: 'stage',
    isStage: true,
    drawableID: 0
  };
  const actor: TurboWarpTarget = {
    id: 'actor-original',
    isStage: false,
    drawableID: 7,
    lookupVariableByNameAndType: (name) =>
      name === 'actorName' ? {value: 'Actor1'} : null
  };
  const clone: TurboWarpTarget = {
    id: 'actor-clone',
    isStage: false,
    drawableID: 8,
    lookupVariableByNameAndType: (name) =>
      name === 'actorName' ? {value: 'Actor2'} : null
  };

  beforeEach(() => {
    windowEvents.listeners.clear();
    windowEvents.addEventListener.mockClear();
    windowEvents.removeEventListener.mockClear();
    canvasEvents.listeners.clear();
    canvasEvents.addEventListener.mockClear();
    canvasEvents.removeEventListener.mockClear();
    runtimeListeners.clear();
    runtimeOn.mockClear();
    runtimeOff.mockClear();
    sideEffects.length = 0;
    startHats.mockClear();
    supportsAccumulatedPoseEvents.mockReset();
    supportsAccumulatedPoseEvents.mockReturnValue(true);
    runtimeValues.clear();
    setRuntimeVariable.mockClear();
    pick.mockReset();
    pick.mockReturnValue(7);

    const canvas = {
      addEventListener: canvasEvents.addEventListener,
      removeEventListener: canvasEvents.removeEventListener,
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        width: 480,
        height: 360,
        right: 490,
        bottom: 380,
        x: 10,
        y: 20,
        toJSON: () => ({})
      })
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('window', {
      addEventListener: windowEvents.addEventListener,
      removeEventListener: windowEvents.removeEventListener
    });
    vi.stubGlobal('Scratch', {
      vm: {
        runtime: {
          renderer: {canvas, pick},
          targets: [stage, actor, clone],
          ext_lmsTempVars2: temporaryVariables,
          ext_tmpose: {supportsAccumulatedPoseEvents},
          on: runtimeOn,
          off: runtimeOff,
          startHats
        }
      },
      extensions: {unsandboxed: true, register: vi.fn()},
      BlockType: {COMMAND: 'command', BOOLEAN: 'boolean', REPORTER: 'reporter'},
      ArgumentType: {STRING: 'string'},
      translate: (text: string) => text
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function util(target: TurboWarpTarget): ScratchBlockUtility {
    return {target};
  }

  function emitRuntime(eventName: string, payload?: unknown): void {
    for (const listener of [...(runtimeListeners.get(eventName) ?? [])]) listener(payload);
  }

  function keyEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      code: 'KeyA',
      repeat: false,
      isComposing: false,
      target: null,
      ...overrides
    };
  }

  function pointerEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      button: 0,
      clientX: 110,
      clientY: 120,
      ...overrides
    };
  }

  it('publishes key and touch blocks while keeping rollback flags independent', () => {
    expect(FEATURE_FLAGS.asyncInput).toBe(true);
    expect(FEATURE_FLAGS.poseInput).toBe(false);
    const extensionInfo = new AsyncInputExtension().getInfo();
    expect(extensionInfo.docsURI).toBe(DOCS_URI);
    expect(extensionInfo.blocks.map((block) => block.opcode))
      .toEqual([
        'listenForKey',
        'listenForKeyAndBroadcast',
        'stopListeningForKey',
        'stopAllKeyListeners',
        'listenForTouch',
        'listenForTouchAndBroadcast',
        'stopListeningForTouch',
        'stopAllInputListeners',
        'listenForActorTouchAndBroadcast'
      ]);

    expect(new AsyncInputExtension({
      asyncInput: true,
      poseInput: true
    }).getInfo().blocks.map((block) => block.opcode)).toEqual([
      'listenForKey',
      'listenForKeyAndBroadcast',
      'stopListeningForKey',
      'stopAllKeyListeners',
      'listenForTouch',
      'listenForTouchAndBroadcast',
      'stopListeningForTouch',
      'listenForPose',
      'stopListeningForPose',
      'stopAllPoseListeners',
      'stopAllInputListeners',
      'listenForActorTouchAndBroadcast'
    ]);

    expect(new AsyncInputExtension({
      asyncInput: false,
      poseInput: true
    }).getInfo().blocks).toEqual([]);
  });

  it('does not initialize runtime variables while registering listeners', () => {
    runtimeValues.set('keyState', 'existing-key');
    runtimeValues.set('touchState', 'existing-touch');
    runtimeValues.set('poseState', 'existing-pose');
    const extension = new AsyncInputExtension();

    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'keyState', VALUE: 'pressed'},
      util(actor)
    );
    extension.listenForTouch(
      {RUNTIME_VAR: 'touchState', VALUE: 'touched'},
      util(actor)
    );
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'poseState', VALUE: 'detected'},
      util(actor)
    );

    expect(runtimeValues.get('keyState')).toBe('existing-key');
    expect(runtimeValues.get('touchState')).toBe('existing-touch');
    expect(runtimeValues.get('poseState')).toBe('existing-pose');
    expect(setRuntimeVariable).not.toHaveBeenCalled();
  });

  it('allows multiple targets to own independent bindings for the same key', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'originalState', VALUE: 'original'},
      util(actor)
    );
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'cloneState', VALUE: 'clone'},
      util(clone)
    );
    expect(windowEvents.listenerCount('keydown')).toBe(1);

    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('originalState')).toBe('original');
    expect(runtimeValues.get('cloneState')).toBe('clone');
    expect(startHats).not.toHaveBeenCalled();
  });

  it('keeps the runtime value at registration and broadcasts after a key update', () => {
    runtimeValues.set('state', 'existing');
    const extension = new AsyncInputExtension();
    extension.listenForKeyAndBroadcast(
      {
        KEY_ID: 'KeyA',
        RUNTIME_VAR: 'state',
        VALUE: 'pressed',
        MESSAGE: '  key pressed  '
      },
      util(actor)
    );
    expect(runtimeValues.get('state')).toBe('existing');
    expect(setRuntimeVariable).not.toHaveBeenCalled();
    expect(startHats).not.toHaveBeenCalled();

    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('state')).toBe('pressed');
    expect(startHats).toHaveBeenCalledOnce();
    expect(startHats).toHaveBeenCalledWith('event_whenbroadcastreceived', {
      BROADCAST_OPTION: 'key pressed'
    });
    expect(sideEffects).toEqual(['write', 'broadcast']);
  });

  it('replaces and removes only the current target key binding', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'originalState', VALUE: 'first'},
      util(actor)
    );
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'cloneState', VALUE: 'clone'},
      util(clone)
    );
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'originalState', VALUE: 'replacement'},
      util(actor)
    );
    extension.stopListeningForKey({KEY_ID: 'KeyA'}, util(clone));
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('originalState')).toBe('replacement');
    expect(runtimeValues.has('cloneState')).toBe(false);

    extension.stopAllKeyListeners({}, util(actor));
    expect(windowEvents.listenerCount('keydown')).toBe(0);
  });

  it('applies all key arithmetic operators to the latest value', () => {
    runtimeValues.set('total', '10');
    const extension = new AsyncInputExtension();
    extension.listenForKey({KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '+2'}, util(actor));
    windowEvents.emit('keydown', keyEvent());
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe(14);

    extension.listenForKey({KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '*3'}, util(actor));
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe(42);
    extension.listenForKey({KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '-2'}, util(actor));
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe(40);
    extension.listenForKey({KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '/4'}, util(actor));
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe(10);
  });

  it('ignores repeat, composition, and editable key events', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: 'pressed'},
      util(actor)
    );
    windowEvents.emit('keydown', keyEvent({repeat: true}));
    windowEvents.emit('keydown', keyEvent({isComposing: true}));
    windowEvents.emit('keydown', keyEvent({target: {tagName: 'input'}}));
    expect(setRuntimeVariable).not.toHaveBeenCalled();
  });

  it('binds pointer input by current target ID for originals and clones', () => {
    const extension = new AsyncInputExtension();
    extension.listenForTouch(
      {RUNTIME_VAR: 'originalTouch', VALUE: 'original'},
      util(actor)
    );
    extension.listenForTouch(
      {RUNTIME_VAR: 'cloneTouch', VALUE: 'clone'},
      util(clone)
    );
    expect(canvasEvents.listenerCount('pointerdown')).toBe(1);

    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('originalTouch')).toBe('original');
    pick.mockReturnValue(8);
    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('cloneTouch')).toBe('clone');
    expect(startHats).not.toHaveBeenCalled();
  });

  it('keeps the runtime value at registration and broadcasts after a touch update', () => {
    runtimeValues.set('touch', 'existing');
    const extension = new AsyncInputExtension();
    extension.listenForTouchAndBroadcast(
      {
        RUNTIME_VAR: 'touch',
        VALUE: 'touched',
        MESSAGE: 'sprite touched'
      },
      util(actor)
    );
    expect(runtimeValues.get('touch')).toBe('existing');
    expect(setRuntimeVariable).not.toHaveBeenCalled();
    expect(startHats).not.toHaveBeenCalled();

    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('touch')).toBe('touched');
    expect(startHats).toHaveBeenCalledOnce();
    expect(startHats).toHaveBeenCalledWith('event_whenbroadcastreceived', {
      BROADCAST_OPTION: 'sprite touched'
    });
    expect(sideEffects).toEqual(['write', 'broadcast']);
  });

  it('binds actor touch by actorName while preserving the executing target as owner', () => {
    const extension = new AsyncInputExtension();
    extension.listenForActorTouchAndBroadcast(
      {
        ACTOR: 'Actor1',
        RUNTIME_VAR: 'actorTouch',
        VALUE: 'touched',
        MESSAGE: 'actor touched'
      },
      util(stage)
    );

    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('actorTouch')).toBe('touched');
    expect(startHats).toHaveBeenLastCalledWith('event_whenbroadcastreceived', {
      BROADCAST_OPTION: 'actor touched'
    });

    emitRuntime('targetWasRemoved', stage);
    expect(canvasEvents.listenerCount('pointerdown')).toBe(0);
  });

  it('requires actor touch targets to resolve uniquely', () => {
    const extension = new AsyncInputExtension();
    expect(() => extension.listenForActorTouchAndBroadcast(
      {ACTOR: '', RUNTIME_VAR: 'touch', VALUE: 'yes', MESSAGE: 'touched'},
      util(stage)
    )).toThrow('ACTOR must be specified');
    expect(() => extension.listenForActorTouchAndBroadcast(
      {ACTOR: 'Missing', RUNTIME_VAR: 'touch', VALUE: 'yes', MESSAGE: 'touched'},
      util(stage)
    )).toThrow('Actor not found: Missing');

    const lookup = clone.lookupVariableByNameAndType!;
    clone.lookupVariableByNameAndType = actor.lookupVariableByNameAndType!;
    expect(() => extension.listenForActorTouchAndBroadcast(
      {ACTOR: 'Actor1', RUNTIME_VAR: 'touch', VALUE: 'yes', MESSAGE: 'touched'},
      util(stage)
    )).toThrow('Actor name is not unique: Actor1');
    clone.lookupVariableByNameAndType = lookup;
  });

  it('applies touch arithmetic to the latest value', () => {
    runtimeValues.set('total', 10);
    const extension = new AsyncInputExtension();
    extension.listenForTouch({RUNTIME_VAR: 'total', VALUE: '+3'}, util(actor));
    canvasEvents.emit('pointerdown', pointerEvent());
    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('total')).toBe(16);
  });

  it('allows multiple targets to own independent bindings for the same accumulated pose', () => {
    const extension = new AsyncInputExtension();
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'originalPose', VALUE: 'original'},
      util(actor)
    );
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'clonePose', VALUE: 'clone'},
      util(clone)
    );
    expect(runtimeListeners.get('TMPOSE_ACCUMULATED_POSE_CHANGED')?.size).toBe(1);

    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 1,
      poseName: 'jump',
      previousPoseName: '',
      score: 1.25,
      reason: 'prediction',
      timestamp: 100
    });
    expect(runtimeValues.get('originalPose')).toBe('original');
    expect(runtimeValues.get('clonePose')).toBe('clone');
  });

  it('applies pose arithmetic and removes only the requested target binding', () => {
    runtimeValues.set('total', 10);
    const extension = new AsyncInputExtension();
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'total', VALUE: '+2'},
      util(actor)
    );
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'clonePose', VALUE: 'yes'},
      util(clone)
    );
    extension.stopListeningForPose({POSE_NAME: 'jump'}, util(clone));

    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 1,
      poseName: 'jump',
      previousPoseName: 'stand',
      score: 2,
      reason: 'prediction',
      timestamp: 200
    });
    expect(runtimeValues.get('total')).toBe(12);
    expect(runtimeValues.has('clonePose')).toBe(false);

    extension.stopAllPoseListeners({}, util(actor));
    expect(runtimeListeners.get('TMPOSE_ACCUMULATED_POSE_CHANGED')?.size).toBe(0);
  });

  it('validates TMPose capability and ignores invalid event payloads', () => {
    supportsAccumulatedPoseEvents.mockReturnValue(false);
    const unavailable = new AsyncInputExtension();
    expect(() => unavailable.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'pose', VALUE: 'yes'},
      util(actor)
    )).toThrow('TMPose accumulated pose events are unavailable');
    expect(runtimeListeners.get('TMPOSE_ACCUMULATED_POSE_CHANGED')?.size ?? 0).toBe(0);

    supportsAccumulatedPoseEvents.mockReturnValue(true);
    const extension = new AsyncInputExtension();
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'pose', VALUE: 'yes'},
      util(actor)
    );
    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 2,
      poseName: 'jump'
    });
    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 1,
      poseName: 'jump',
      previousPoseName: 'jump',
      score: 1,
      reason: 'prediction',
      timestamp: 250
    });
    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 1,
      poseName: '',
      previousPoseName: 'jump',
      score: 0,
      reason: 'reset',
      timestamp: 300
    });
    expect(runtimeValues.has('pose')).toBe(false);
  });

  it('rejects stage touch registration and ignores non-left or out-of-bounds input', () => {
    const extension = new AsyncInputExtension();
    expect(() => extension.listenForTouch(
      {RUNTIME_VAR: 'touch', VALUE: 'yes'},
      util(stage)
    )).toThrow('sprite or clone');

    extension.listenForTouch({RUNTIME_VAR: 'touch', VALUE: 'yes'}, util(actor));
    canvasEvents.emit('pointerdown', pointerEvent({button: 2}));
    canvasEvents.emit('pointerdown', pointerEvent({clientX: 5}));
    pick.mockReturnValue(999);
    canvasEvents.emit('pointerdown', pointerEvent());
    expect(setRuntimeVariable).not.toHaveBeenCalled();
  });

  it('rejects invalid arithmetic without replacing an existing binding', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: 'original'},
      util(actor)
    );
    expect(() => extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: '+'},
      util(actor)
    )).toThrow('numeric operand');
    expect(() => extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: '*invalid'},
      util(actor)
    )).toThrow('finite numeric operand');
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('state')).toBe('original');
  });

  it('leaves runtime values unchanged for non-finite arithmetic', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    runtimeValues.set('total', 'not-a-number');
    const extension = new AsyncInputExtension();
    extension.listenForKeyAndBroadcast(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '+1', MESSAGE: 'updated'},
      util(actor)
    );
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe('not-a-number');

    runtimeValues.set('total', 10);
    extension.listenForKeyAndBroadcast(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'total', VALUE: '/0', MESSAGE: 'updated'},
      util(actor)
    );
    windowEvents.emit('keydown', keyEvent());
    expect(runtimeValues.get('total')).toBe(10);
    expect(error).toHaveBeenCalledTimes(2);
    expect(startHats).not.toHaveBeenCalled();
  });

  it('removes only the deleted target bindings', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'originalKey', VALUE: 'yes'},
      util(actor)
    );
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'cloneKey', VALUE: 'yes'},
      util(clone)
    );
    extension.listenForTouch({RUNTIME_VAR: 'originalTouch', VALUE: 'yes'}, util(actor));
    extension.listenForTouch({RUNTIME_VAR: 'cloneTouch', VALUE: 'yes'}, util(clone));
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'originalPose', VALUE: 'yes'},
      util(actor)
    );
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'clonePose', VALUE: 'yes'},
      util(clone)
    );

    emitRuntime('targetWasRemoved', actor);
    windowEvents.emit('keydown', keyEvent());
    canvasEvents.emit('pointerdown', pointerEvent());
    emitRuntime('TMPOSE_ACCUMULATED_POSE_CHANGED', {
      version: 1,
      poseName: 'jump',
      previousPoseName: '',
      score: 1,
      reason: 'prediction',
      timestamp: 100
    });
    expect(runtimeValues.has('originalKey')).toBe(false);
    expect(runtimeValues.has('originalTouch')).toBe(false);
    expect(runtimeValues.has('originalPose')).toBe(false);
    expect(runtimeValues.get('cloneKey')).toBe('yes');
    expect(runtimeValues.get('clonePose')).toBe('yes');

    pick.mockReturnValue(8);
    canvasEvents.emit('pointerdown', pointerEvent());
    expect(runtimeValues.get('cloneTouch')).toBe('yes');
  });

  it('clears listeners at project boundaries and runtime disposal', () => {
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'key', VALUE: 'yes'},
      util(actor)
    );
    extension.listenForTouch({RUNTIME_VAR: 'touch', VALUE: 'yes'}, util(actor));
    extension.listenForPose(
      {POSE_NAME: 'jump', RUNTIME_VAR: 'pose', VALUE: 'yes'},
      util(actor)
    );
    emitRuntime('PROJECT_STOP_ALL');
    expect(windowEvents.listenerCount('keydown')).toBe(0);
    expect(canvasEvents.listenerCount('pointerdown')).toBe(0);
    expect(runtimeListeners.get('TMPOSE_ACCUMULATED_POSE_CHANGED')?.size).toBe(0);

    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'key', VALUE: 'again'},
      util(actor)
    );
    emitRuntime('RUNTIME_DISPOSED');
    expect(runtimeOff).toHaveBeenCalledTimes(5);
    expect(() => extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'key', VALUE: 'late'},
      util(actor)
    )).toThrow('runtime has been disposed');
  });

  it('stops all bindings if Temporary Variables disappears', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const extension = new AsyncInputExtension();
    extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: 'ready'},
      util(actor)
    );
    delete Scratch.vm.runtime.ext_lmsTempVars2;
    windowEvents.emit('keydown', keyEvent());
    expect(windowEvents.listenerCount('keydown')).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('requires non-empty key IDs and runtime variable names', () => {
    const extension = new AsyncInputExtension();
    expect(() => extension.listenForKey(
      {KEY_ID: '', RUNTIME_VAR: 'state', VALUE: 'ready'},
      util(actor)
    )).toThrow('KEY_ID');
    expect(() => extension.listenForKey(
      {KEY_ID: 'KeyA', RUNTIME_VAR: '', VALUE: 'ready'},
      util(actor)
    )).toThrow('RUNTIME_VAR');
    expect(() => extension.listenForTouch(
      {RUNTIME_VAR: '', VALUE: 'ready'},
      util(actor)
    )).toThrow('RUNTIME_VAR');
    expect(() => extension.listenForKeyAndBroadcast(
      {KEY_ID: 'KeyA', RUNTIME_VAR: 'state', VALUE: 'ready', MESSAGE: '   '},
      util(actor)
    )).toThrow('MESSAGE');
    expect(() => extension.listenForTouchAndBroadcast(
      {RUNTIME_VAR: 'state', VALUE: 'ready', MESSAGE: ''},
      util(actor)
    )).toThrow('MESSAGE');
  });
});

describe('Async Input helpers', () => {
  it('recognizes editable targets without requiring DOM classes', () => {
    expect(isEditableTarget({tagName: 'textarea'} as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({isContentEditable: true} as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({tagName: 'canvas'} as unknown as EventTarget)).toBe(false);
  });
});
