interface TurboWarpRenderer {
  canvas: HTMLCanvasElement;
  pick(x: number, y: number): number;
}

interface TurboWarpTarget {
  id: string;
  isStage: boolean;
  drawableID: number | null;
  lookupVariableByNameAndType?(name: string, type: string): {value: unknown} | null;
}

interface TemporaryVariablesExtension {
  setRuntimeVariable(args: {VAR: string; STRING: unknown}): void;
  getRuntimeVariable(args: {VAR: string}): unknown;
  runtimeVariableExists(args: {VAR: string}): boolean;
}

interface TMPoseExtension {
  supportsAccumulatedPoseEvents(): boolean;
}

interface TurboWarpRuntime {
  renderer: TurboWarpRenderer;
  targets: TurboWarpTarget[];
  ext_lmsTempVars2?: TemporaryVariablesExtension;
  ext_tmpose?: TMPoseExtension;
  on(eventName: string, listener: (payload?: any) => void): void;
  off(eventName: string, listener: (payload?: any) => void): void;
  startHats(
    opcode: string,
    matchFields?: Record<string, unknown>,
    target?: TurboWarpTarget
  ): unknown[];
}

interface ScratchBlockUtility {
  target: TurboWarpTarget;
}

interface ScratchBlockDefinition {
  opcode: string;
  blockType: string;
  text: string;
  arguments: Record<string, {type: string; defaultValue: unknown}>;
}

interface ScratchExtensionInfo {
  id: string;
  name: string;
  color1: string;
  color2: string;
  color3: string;
  blocks: ScratchBlockDefinition[];
}

declare const Scratch: {
  vm: {runtime: TurboWarpRuntime};
  extensions: {
    unsandboxed: boolean;
    register(extension: unknown): void;
  };
  BlockType: {
    COMMAND: string;
    BOOLEAN: string;
    REPORTER: string;
  };
  ArgumentType: {
    STRING: string;
  };
  translate(text: string): string;
};
