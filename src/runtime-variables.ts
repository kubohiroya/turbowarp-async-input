export function requireRuntimeVariables(
  runtime: TurboWarpRuntime
): TemporaryVariablesExtension {
  const extension = runtime.ext_lmsTempVars2;
  if (
    !extension
    || typeof extension.setRuntimeVariable !== 'function'
    || typeof extension.getRuntimeVariable !== 'function'
    || typeof extension.runtimeVariableExists !== 'function'
  ) {
    throw new Error(
      'Temporary Variables (lmsTempVars2) must be loaded before using Async Input.'
    );
  }
  return extension;
}

export function readRuntimeVariable(
  extension: TemporaryVariablesExtension,
  name: string
): unknown {
  return extension.runtimeVariableExists({VAR: name})
    ? extension.getRuntimeVariable({VAR: name})
    : undefined;
}

export function writeRuntimeVariable(
  extension: TemporaryVariablesExtension,
  name: string,
  value: unknown
): void {
  extension.setRuntimeVariable({VAR: name, STRING: value});
}
