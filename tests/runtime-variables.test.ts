import {describe, expect, it, vi} from 'vitest';
import {
  readRuntimeVariable,
  requireRuntimeVariables,
  writeRuntimeVariable
} from '../src/runtime-variables.js';

function createExtension(values = new Map<string, unknown>()): TemporaryVariablesExtension {
  return {
    setRuntimeVariable: vi.fn(({VAR, STRING}: {VAR: string; STRING: unknown}) => {
      values.set(VAR, STRING);
    }),
    getRuntimeVariable: vi.fn(({VAR}: {VAR: string}) => values.get(VAR) ?? ''),
    runtimeVariableExists: vi.fn(({VAR}: {VAR: string}) => values.has(VAR))
  };
}

describe('Temporary Variables adapter', () => {
  it('validates and returns the exposed extension API', () => {
    const extension = createExtension();
    const runtime = {ext_lmsTempVars2: extension} as TurboWarpRuntime;
    expect(requireRuntimeVariables(runtime)).toBe(extension);
  });

  it('rejects a missing or incomplete extension API', () => {
    expect(() => requireRuntimeVariables({} as TurboWarpRuntime))
      .toThrow('Temporary Variables (lmsTempVars2) must be loaded');
    expect(() => requireRuntimeVariables({
      ext_lmsTempVars2: {setRuntimeVariable: vi.fn()}
    } as unknown as TurboWarpRuntime)).toThrow('Temporary Variables (lmsTempVars2) must be loaded');
  });

  it('distinguishes a missing variable from an existing empty value', () => {
    const values = new Map<string, unknown>([['empty', '']]);
    const extension = createExtension(values);
    expect(readRuntimeVariable(extension, 'empty')).toBe('');
    expect(readRuntimeVariable(extension, 'missing')).toBeUndefined();
  });

  it('writes through the public setter API', () => {
    const values = new Map<string, unknown>();
    const extension = createExtension(values);
    writeRuntimeVariable(extension, 'state', 'ready');
    expect(extension.setRuntimeVariable).toHaveBeenCalledWith({VAR: 'state', STRING: 'ready'});
    expect(values.get('state')).toBe('ready');
  });
});
