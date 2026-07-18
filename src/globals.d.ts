interface TurboWarpRenderer {
  canvas: HTMLCanvasElement;
  pick(x: number, y: number): number;
}

interface TurboWarpTarget {
  id: string;
  isStage: boolean;
  drawableID: number | null;
}

interface TemporaryVariablesExtension {
  setRuntimeVariable(args: {VAR: string; STRING: unknown}): void;
  getRuntimeVariable(args: {VAR: string}): unknown;
  runtimeVariableExists(args: {VAR: string}): boolean;
}

interface TurboWarpRuntime {
  renderer: TurboWarpRenderer;
  targets: TurboWarpTarget[];
  ext_lmsTempVars2?: TemporaryVariablesExtension;
  on(eventName: string, listener: (target?: TurboWarpTarget) => void): void;
  off(eventName: string, listener: (target?: TurboWarpTarget) => void): void;
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
