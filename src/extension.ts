import definitions from './block-definitions.json' with {type: 'json'};
import {FEATURE_FLAGS} from '../config/feature-flags.js';
import {
  readRuntimeVariable,
  requireRuntimeVariables,
  writeRuntimeVariable
} from './runtime-variables.js';

export const EXTENSION_ID = 'kubohiroyaasyncinput';
export const EXTENSION_VERSION = '2026-07-18-key-touch-broadcast-v1';
export const ACCUMULATED_POSE_CHANGED_EVENT = 'TMPOSE_ACCUMULATED_POSE_CHANGED';

type BlockArgs = Record<string, unknown>;
type ArithmeticOperator = '+' | '-' | '*' | '/';

interface SetRuntimeBinding {
  kind: 'set';
  runtimeVariable: string;
  value: string;
}

interface ArithmeticRuntimeBinding {
  kind: 'arithmetic';
  runtimeVariable: string;
  operator: ArithmeticOperator;
  operand: number;
}

type RuntimeBinding = SetRuntimeBinding | ArithmeticRuntimeBinding;
type OwnedBinding = RuntimeBinding & {
  ownerTargetId: string;
  broadcastMessage: string | null;
};

interface AccumulatedPoseChangedEventV1 {
  version: 1;
  poseName: string;
  previousPoseName: string;
  score: number;
  reason: 'prediction' | 'reset' | 'stop';
  timestamp: number;
}

interface DefinitionArgument {
  type: keyof typeof Scratch.ArgumentType;
  defaultValue: unknown;
}

interface DefinitionBlock {
  opcode: string;
  blockType: keyof typeof Scratch.BlockType;
  text: string;
  description?: string;
  featureFlag?: keyof typeof FEATURE_FLAGS;
  arguments: Record<string, DefinitionArgument>;
}

type FeatureFlags = Readonly<Record<keyof typeof FEATURE_FLAGS, boolean>>;

const ARITHMETIC_OPERATORS = new Set<ArithmeticOperator>(['+', '-', '*', '/']);
const POSE_CHANGE_REASONS = new Set(['prediction', 'reset', 'stop']);
const blockDefinitions = definitions.blocks as DefinitionBlock[];
const internalBlockDefinitions: DefinitionBlock[] = [{
  opcode: 'listenForActorTouchAndBroadcast',
  blockType: 'COMMAND',
  text: 'listen for touch on actor [ACTOR] set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]',
  description: 'Registers or replaces a pointer binding for a named kamishibai actor.',
  featureFlag: 'asyncInput',
  arguments: {
    ACTOR: {type: 'STRING', defaultValue: 'Actor1'},
    RUNTIME_VAR: {type: 'STRING', defaultValue: 'input'},
    VALUE: {type: 'STRING', defaultValue: 'pressed'},
    MESSAGE: {type: 'STRING', defaultValue: 'message1'}
  }
}];

function normalizeName(value: unknown): string {
  return String(value ?? '').trim();
}

function isArithmeticOperator(value: string): value is ArithmeticOperator {
  return ARITHMETIC_OPERATORS.has(value as ArithmeticOperator);
}

function parseRuntimeBinding(runtimeVariable: string, value: string): RuntimeBinding {
  const operator = value[0];
  if (!operator || !isArithmeticOperator(operator)) {
    return {kind: 'set', runtimeVariable, value};
  }

  const operandText = value.slice(1).trim();
  if (!operandText) {
    throw new Error(
      `Runtime input arithmetic value ${JSON.stringify(value)} requires a numeric operand.`
    );
  }
  const operand = Number(operandText);
  if (!Number.isFinite(operand)) {
    throw new Error(
      `Runtime input arithmetic value ${JSON.stringify(value)} must contain a finite numeric operand.`
    );
  }
  return {kind: 'arithmetic', runtimeVariable, operator, operand};
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as {tagName?: unknown; isContentEditable?: unknown};
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  return tagName === 'INPUT'
    || tagName === 'TEXTAREA'
    || tagName === 'SELECT'
    || element.isContentEditable === true;
}

function isAccumulatedPoseChangedEventV1(
  payload: unknown
): payload is AccumulatedPoseChangedEventV1 {
  if (!payload || typeof payload !== 'object') return false;
  const event = payload as Partial<AccumulatedPoseChangedEventV1>;
  return event.version === 1
    && typeof event.poseName === 'string'
    && typeof event.previousPoseName === 'string'
    && event.poseName !== event.previousPoseName
    && typeof event.score === 'number'
    && Number.isFinite(event.score)
    && typeof event.reason === 'string'
    && POSE_CHANGE_REASONS.has(event.reason)
    && typeof event.timestamp === 'number'
    && Number.isFinite(event.timestamp);
}

export class AsyncInputExtension {
  private readonly runtime = Scratch.vm.runtime;
  private readonly keyBindings = new Map<string, Map<string, OwnedBinding>>();
  private readonly touchBindings = new Map<string, OwnedBinding>();
  private readonly poseBindings = new Map<string, Map<string, OwnedBinding>>();
  private keyListenerAttached = false;
  private pointerListenerAttached = false;
  private poseListenerAttached = false;
  private runtimeListenersAttached = false;
  private runtimeDependencyFailureReported = false;
  private disposed = false;

  constructor(private readonly featureFlags: FeatureFlags = FEATURE_FLAGS) {
    this.registerRuntimeListeners();
  }

  getInfo(): ScratchExtensionInfo {
    return {
      id: EXTENSION_ID,
      name: Scratch.translate(definitions.extensionName),
      color1: '#2f9d8f',
      color2: '#247c72',
      color3: '#185b54',
      blocks: [...blockDefinitions, ...internalBlockDefinitions]
        .filter((block) =>
          this.featureFlags.asyncInput
          && (!block.featureFlag || this.featureFlags[block.featureFlag])
        )
        .map((block) => ({
          opcode: block.opcode,
          blockType: Scratch.BlockType[block.blockType],
          text: Scratch.translate(block.text),
          arguments: Object.fromEntries(
            Object.entries(block.arguments).map(([name, argument]) => [
              name,
              {
                type: Scratch.ArgumentType[argument.type],
                defaultValue: argument.defaultValue
              }
            ])
          )
        }))
    };
  }

  listenForKey(args: BlockArgs, util: ScratchBlockUtility): void {
    this.registerKeyBinding(args, util, false);
  }

  listenForKeyAndBroadcast(args: BlockArgs, util: ScratchBlockUtility): void {
    this.registerKeyBinding(args, util, true);
  }

  private registerKeyBinding(
    args: BlockArgs,
    util: ScratchBlockUtility,
    shouldBroadcast: boolean
  ): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    const keyId = normalizeName(args.KEY_ID);
    const runtimeVariable = normalizeName(args.RUNTIME_VAR);
    const value = String(args.VALUE ?? '');
    const broadcastMessage = shouldBroadcast ? normalizeName(args.MESSAGE) : null;
    if (!keyId) throw new Error('KEY_ID must be specified.');
    if (!runtimeVariable) throw new Error('RUNTIME_VAR must be specified.');
    if (shouldBroadcast && !broadcastMessage) throw new Error('MESSAGE must be specified.');

    requireRuntimeVariables(this.runtime);
    const binding = {
      ownerTargetId: owner.id,
      broadcastMessage,
      ...parseRuntimeBinding(runtimeVariable, value)
    };
    const bindingsForKey = this.keyBindings.get(keyId) ?? new Map<string, OwnedBinding>();
    bindingsForKey.set(owner.id, binding);
    this.keyBindings.set(keyId, bindingsForKey);
    this.runtimeDependencyFailureReported = false;
    this.attachKeyListenerIfNeeded();
  }

  stopListeningForKey(args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    const keyId = normalizeName(args.KEY_ID);
    if (!keyId) throw new Error('KEY_ID must be specified.');
    this.removeKeyBinding(owner.id, keyId);
  }

  stopAllKeyListeners(_args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    this.removeAllKeyBindingsForTarget(owner.id);
  }

  listenForTouch(args: BlockArgs, util: ScratchBlockUtility): void {
    this.registerTouchBinding(args, util, false);
  }

  listenForTouchAndBroadcast(args: BlockArgs, util: ScratchBlockUtility): void {
    this.registerTouchBinding(args, util, true);
  }

  listenForActorTouchAndBroadcast(args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    const target = this.resolveActorTarget(args.ACTOR);
    this.registerTouchBindingForTarget(args, owner, target, true);
  }

  private registerTouchBinding(
    args: BlockArgs,
    util: ScratchBlockUtility,
    shouldBroadcast: boolean
  ): void {
    this.requireActiveRuntime();
    const owner = this.requireSpriteTarget(util);
    this.registerTouchBindingForTarget(args, owner, owner, shouldBroadcast);
  }

  private registerTouchBindingForTarget(
    args: BlockArgs,
    owner: TurboWarpTarget,
    target: TurboWarpTarget,
    shouldBroadcast: boolean
  ): void {
    const runtimeVariable = normalizeName(args.RUNTIME_VAR);
    const value = String(args.VALUE ?? '');
    const broadcastMessage = shouldBroadcast ? normalizeName(args.MESSAGE) : null;
    if (!runtimeVariable) throw new Error('RUNTIME_VAR must be specified.');
    if (shouldBroadcast && !broadcastMessage) throw new Error('MESSAGE must be specified.');

    requireRuntimeVariables(this.runtime);
    this.touchBindings.set(target.id, {
      ownerTargetId: owner.id,
      broadcastMessage,
      ...parseRuntimeBinding(runtimeVariable, value)
    });
    this.runtimeDependencyFailureReported = false;
    this.attachPointerListenerIfNeeded();
  }

  stopListeningForTouch(_args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    this.touchBindings.delete(owner.id);
    this.detachPointerListenerIfUnused();
  }

  listenForPose(args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    const poseName = normalizeName(args.POSE_NAME);
    const runtimeVariable = normalizeName(args.RUNTIME_VAR);
    const value = String(args.VALUE ?? '');
    if (!poseName) throw new Error('POSE_NAME must be specified.');
    if (!runtimeVariable) throw new Error('RUNTIME_VAR must be specified.');

    requireRuntimeVariables(this.runtime);
    this.requireAccumulatedPoseEvents();
    const binding = {
      ownerTargetId: owner.id,
      broadcastMessage: null,
      ...parseRuntimeBinding(runtimeVariable, value)
    };
    const bindingsForPose = this.poseBindings.get(poseName) ?? new Map<string, OwnedBinding>();
    bindingsForPose.set(owner.id, binding);
    this.poseBindings.set(poseName, bindingsForPose);
    this.runtimeDependencyFailureReported = false;
    this.attachPoseListenerIfNeeded();
  }

  stopListeningForPose(args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    const poseName = normalizeName(args.POSE_NAME);
    if (!poseName) throw new Error('POSE_NAME must be specified.');
    this.removePoseBinding(owner.id, poseName);
  }

  stopAllPoseListeners(_args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    this.removeAllPoseBindingsForTarget(owner.id);
  }

  stopAllInputListeners(_args: BlockArgs, util: ScratchBlockUtility): void {
    this.requireActiveRuntime();
    const owner = this.requireTarget(util);
    this.removeAllBindingsForTarget(owner.id);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.isComposing || isEditableTarget(event.target)) return;
    const bindings = [...(this.keyBindings.get(event.code)?.values() ?? [])];
    for (const binding of bindings) {
      if (!this.writeFromBackgroundEvent(binding)) break;
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const canvas = this.runtime.renderer.canvas;
    const rectangle = canvas.getBoundingClientRect();
    const x = event.clientX - rectangle.left;
    const y = event.clientY - rectangle.top;
    if (x <= 0 || y <= 0 || x >= rectangle.width || y >= rectangle.height) return;

    const drawableId = this.runtime.renderer.pick(x, y);
    const target = this.runtime.targets.find(
      (candidate) => !candidate.isStage && candidate.drawableID === drawableId
    );
    if (!target) return;
    const binding = this.touchBindings.get(target.id);
    if (binding) this.writeFromBackgroundEvent(binding);
  };

  private readonly handleAccumulatedPoseChanged = (payload?: unknown): void => {
    if (!isAccumulatedPoseChangedEventV1(payload) || !payload.poseName) return;
    const bindings = [...(this.poseBindings.get(payload.poseName)?.values() ?? [])];
    for (const binding of bindings) {
      if (!this.writeFromBackgroundEvent(binding)) break;
    }
  };

  private readonly handleProjectBoundary = (): void => {
    this.stopAllBindings();
  };

  private readonly handleTargetRemoved = (target?: TurboWarpTarget): void => {
    if (target) this.removeAllBindingsForTarget(target.id);
  };

  private readonly handleRuntimeDisposed = (): void => {
    this.disposed = true;
    this.stopAllBindings();
    this.unregisterRuntimeListeners();
  };

  private requireActiveRuntime(): void {
    if (this.disposed) throw new Error('Async Input runtime has been disposed.');
  }

  private requireTarget(util: ScratchBlockUtility): TurboWarpTarget {
    const target = util?.target;
    if (!target?.id) throw new Error('The current TurboWarp target is unavailable.');
    return target;
  }

  private requireSpriteTarget(util: ScratchBlockUtility): TurboWarpTarget {
    const target = this.requireTarget(util);
    if (target.isStage) throw new Error('Touch input must be registered by a sprite or clone.');
    return target;
  }

  private resolveActorTarget(value: unknown): TurboWarpTarget {
    const actorName = normalizeName(value);
    if (!actorName) throw new Error('ACTOR must be specified.');
    const matches = this.runtime.targets.filter((target) => (
      !target.isStage
      && String(target.lookupVariableByNameAndType?.('actorName', '')?.value ?? '') === actorName
    ));
    if (matches.length === 0) throw new Error(`Actor not found: ${actorName}`);
    if (matches.length > 1) throw new Error(`Actor name is not unique: ${actorName}`);
    return matches[0]!;
  }

  private requireAccumulatedPoseEvents(): TMPoseExtension {
    const extension = this.runtime.ext_tmpose;
    if (
      !extension
      || typeof extension.supportsAccumulatedPoseEvents !== 'function'
      || !extension.supportsAccumulatedPoseEvents()
    ) {
      throw new Error(
        'TMPose accumulated pose events are unavailable. '
        + 'Load TMPose with temporalPoseScoring and accumulatedPoseEvents enabled.'
      );
    }
    return extension;
  }

  private writeFromBackgroundEvent(binding: OwnedBinding): boolean {
    let runtimeVariables: TemporaryVariablesExtension;
    try {
      runtimeVariables = requireRuntimeVariables(this.runtime);
    } catch (error) {
      this.stopAllBindings();
      if (!this.runtimeDependencyFailureReported) {
        this.runtimeDependencyFailureReported = true;
        console.error('Async input bindings stopped.', error);
      }
      return false;
    }

    try {
      const value = binding.kind === 'set'
        ? binding.value
        : this.evaluateArithmeticBinding(runtimeVariables, binding);
      writeRuntimeVariable(runtimeVariables, binding.runtimeVariable, value);
    } catch (error) {
      console.error('Async input binding update failed.', error);
      return true;
    }

    if (binding.broadcastMessage !== null) {
      try {
        this.runtime.startHats('event_whenbroadcastreceived', {
          BROADCAST_OPTION: binding.broadcastMessage
        });
      } catch (error) {
        console.error('Async input binding broadcast failed.', error);
      }
    }
    return true;
  }

  private evaluateArithmeticBinding(
    runtimeVariables: TemporaryVariablesExtension,
    binding: ArithmeticRuntimeBinding
  ): number {
    const currentValue = readRuntimeVariable(runtimeVariables, binding.runtimeVariable);
    const currentNumber = Number(currentValue);
    if (!Number.isFinite(currentNumber)) {
      throw new Error(
        `Runtime variable ${JSON.stringify(binding.runtimeVariable)} must contain a finite number.`
      );
    }

    let result: number;
    switch (binding.operator) {
      case '+': result = currentNumber + binding.operand; break;
      case '-': result = currentNumber - binding.operand; break;
      case '*': result = currentNumber * binding.operand; break;
      case '/': result = currentNumber / binding.operand; break;
    }
    if (!Number.isFinite(result)) {
      throw new Error(
        `Async input arithmetic result for ${JSON.stringify(binding.runtimeVariable)} must be finite.`
      );
    }
    return result;
  }

  private removeKeyBinding(ownerTargetId: string, keyId: string): void {
    const bindingsForKey = this.keyBindings.get(keyId);
    bindingsForKey?.delete(ownerTargetId);
    if (bindingsForKey?.size === 0) this.keyBindings.delete(keyId);
    this.detachKeyListenerIfUnused();
  }

  private removeAllKeyBindingsForTarget(ownerTargetId: string): void {
    for (const [keyId, bindingsForKey] of this.keyBindings) {
      bindingsForKey.delete(ownerTargetId);
      if (bindingsForKey.size === 0) this.keyBindings.delete(keyId);
    }
    this.detachKeyListenerIfUnused();
  }

  private removePoseBinding(ownerTargetId: string, poseName: string): void {
    const bindingsForPose = this.poseBindings.get(poseName);
    bindingsForPose?.delete(ownerTargetId);
    if (bindingsForPose?.size === 0) this.poseBindings.delete(poseName);
    this.detachPoseListenerIfUnused();
  }

  private removeAllPoseBindingsForTarget(ownerTargetId: string): void {
    for (const [poseName, bindingsForPose] of this.poseBindings) {
      bindingsForPose.delete(ownerTargetId);
      if (bindingsForPose.size === 0) this.poseBindings.delete(poseName);
    }
    this.detachPoseListenerIfUnused();
  }

  private removeAllTouchBindingsForTarget(ownerTargetId: string): void {
    for (const [targetId, binding] of this.touchBindings) {
      if (targetId === ownerTargetId || binding.ownerTargetId === ownerTargetId) {
        this.touchBindings.delete(targetId);
      }
    }
    this.detachPointerListenerIfUnused();
  }

  private removeAllBindingsForTarget(ownerTargetId: string): void {
    this.removeAllKeyBindingsForTarget(ownerTargetId);
    this.removeAllTouchBindingsForTarget(ownerTargetId);
    this.removeAllPoseBindingsForTarget(ownerTargetId);
  }

  private stopAllBindings(): void {
    this.keyBindings.clear();
    this.touchBindings.clear();
    this.poseBindings.clear();
    this.detachKeyListenerIfUnused();
    this.detachPointerListenerIfUnused();
    this.detachPoseListenerIfUnused();
  }

  private attachKeyListenerIfNeeded(): void {
    if (this.keyListenerAttached || this.keyBindings.size === 0) return;
    window.addEventListener('keydown', this.handleKeyDown);
    this.keyListenerAttached = true;
  }

  private detachKeyListenerIfUnused(): void {
    if (!this.keyListenerAttached || this.keyBindings.size > 0) return;
    window.removeEventListener('keydown', this.handleKeyDown);
    this.keyListenerAttached = false;
  }

  private attachPointerListenerIfNeeded(): void {
    if (this.pointerListenerAttached || this.touchBindings.size === 0) return;
    this.runtime.renderer.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.pointerListenerAttached = true;
  }

  private detachPointerListenerIfUnused(): void {
    if (!this.pointerListenerAttached || this.touchBindings.size > 0) return;
    this.runtime.renderer.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.pointerListenerAttached = false;
  }

  private attachPoseListenerIfNeeded(): void {
    if (this.poseListenerAttached || this.poseBindings.size === 0) return;
    this.runtime.on(ACCUMULATED_POSE_CHANGED_EVENT, this.handleAccumulatedPoseChanged);
    this.poseListenerAttached = true;
  }

  private detachPoseListenerIfUnused(): void {
    if (!this.poseListenerAttached || this.poseBindings.size > 0) return;
    this.runtime.off(ACCUMULATED_POSE_CHANGED_EVENT, this.handleAccumulatedPoseChanged);
    this.poseListenerAttached = false;
  }

  private registerRuntimeListeners(): void {
    if (this.runtimeListenersAttached) return;
    this.runtime.on('PROJECT_STOP_ALL', this.handleProjectBoundary);
    this.runtime.on('PROJECT_START', this.handleProjectBoundary);
    this.runtime.on('targetWasRemoved', this.handleTargetRemoved);
    this.runtime.on('RUNTIME_DISPOSED', this.handleRuntimeDisposed);
    this.runtimeListenersAttached = true;
  }

  private unregisterRuntimeListeners(): void {
    if (!this.runtimeListenersAttached) return;
    this.runtime.off('PROJECT_STOP_ALL', this.handleProjectBoundary);
    this.runtime.off('PROJECT_START', this.handleProjectBoundary);
    this.runtime.off('targetWasRemoved', this.handleTargetRemoved);
    this.runtime.off('RUNTIME_DISPOSED', this.handleRuntimeDisposed);
    this.runtimeListenersAttached = false;
  }
}
