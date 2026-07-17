// Name: Async Input
// ID: twAsyncInput
// Description: Bind keyboard and current-sprite pointer input to Temporary Variables runtime variables.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  const extensionName = "Async Input";
  const blocks = [{ "opcode": "listenForKey", "blockType": "COMMAND", "text": "listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE]", "description": "Registers or replaces a target-owned key binding.", "featureFlag": "asyncInput", "arguments": { "KEY_ID": { "type": "STRING", "defaultValue": "KeyA" }, "RUNTIME_VAR": { "type": "STRING", "defaultValue": "input" }, "VALUE": { "type": "STRING", "defaultValue": "pressed" } } }, { "opcode": "stopListeningForKey", "blockType": "COMMAND", "text": "stop listening for key [KEY_ID] for this target", "description": "Removes this target's binding for one physical key code.", "featureFlag": "asyncInput", "arguments": { "KEY_ID": { "type": "STRING", "defaultValue": "KeyA" } } }, { "opcode": "stopAllKeyListeners", "blockType": "COMMAND", "text": "stop all key listeners registered by this target", "description": "Removes every key binding owned by the current target.", "featureFlag": "asyncInput", "arguments": {} }, { "opcode": "listenForTouch", "blockType": "COMMAND", "text": "listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE]", "description": "Registers or replaces the current sprite or clone's pointer binding.", "featureFlag": "asyncInput", "arguments": { "RUNTIME_VAR": { "type": "STRING", "defaultValue": "input" }, "VALUE": { "type": "STRING", "defaultValue": "pressed" } } }, { "opcode": "stopListeningForTouch", "blockType": "COMMAND", "text": "stop listening for touch on this sprite", "description": "Removes the current target's pointer binding.", "featureFlag": "asyncInput", "arguments": {} }, { "opcode": "stopAllInputListeners", "blockType": "COMMAND", "text": "stop all input listeners registered by this target", "description": "Removes every key and pointer binding owned by the current target.", "featureFlag": "asyncInput", "arguments": {} }];
  const definitions = {
    extensionName,
    blocks
  };
  const FEATURE_FLAGS = {
    asyncInput: false
  };
  function requireRuntimeVariables(runtime) {
    const extension = runtime.ext_lmsTempVars2;
    if (!extension || typeof extension.setRuntimeVariable !== "function" || typeof extension.getRuntimeVariable !== "function" || typeof extension.runtimeVariableExists !== "function") {
      throw new Error(
        "Temporary Variables (lmsTempVars2) must be loaded before using Async Input."
      );
    }
    return extension;
  }
  function readRuntimeVariable(extension, name) {
    return extension.runtimeVariableExists({ VAR: name }) ? extension.getRuntimeVariable({ VAR: name }) : void 0;
  }
  function writeRuntimeVariable(extension, name, value) {
    extension.setRuntimeVariable({ VAR: name, STRING: value });
  }
  const EXTENSION_ID = "twAsyncInput";
  const ARITHMETIC_OPERATORS = /* @__PURE__ */ new Set(["+", "-", "*", "/"]);
  const blockDefinitions = definitions.blocks;
  function normalizeName(value) {
    return String(value ?? "").trim();
  }
  function isArithmeticOperator(value) {
    return ARITHMETIC_OPERATORS.has(value);
  }
  function parseRuntimeBinding(runtimeVariable, value) {
    const operator = value[0];
    if (!operator || !isArithmeticOperator(operator)) {
      return { kind: "set", runtimeVariable, value };
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
    return { kind: "arithmetic", runtimeVariable, operator, operand };
  }
  function isEditableTarget(target) {
    if (!target || typeof target !== "object") return false;
    const element = target;
    const tagName = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || element.isContentEditable === true;
  }
  class AsyncInputExtension {
    constructor() {
      __publicField(this, "runtime", Scratch.vm.runtime);
      __publicField(this, "keyBindings", /* @__PURE__ */ new Map());
      __publicField(this, "touchBindings", /* @__PURE__ */ new Map());
      __publicField(this, "keyListenerAttached", false);
      __publicField(this, "pointerListenerAttached", false);
      __publicField(this, "runtimeListenersAttached", false);
      __publicField(this, "runtimeDependencyFailureReported", false);
      __publicField(this, "disposed", false);
      __publicField(this, "handleKeyDown", (event) => {
        if (event.repeat || event.isComposing || isEditableTarget(event.target)) return;
        const bindings = [...this.keyBindings.get(event.code)?.values() ?? []];
        for (const binding of bindings) {
          if (!this.writeFromBackgroundEvent(binding)) break;
        }
      });
      __publicField(this, "handlePointerDown", (event) => {
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
      });
      __publicField(this, "handleProjectBoundary", () => {
        this.stopAllBindings();
      });
      __publicField(this, "handleTargetRemoved", (target) => {
        if (target) this.removeAllBindingsForTarget(target.id);
      });
      __publicField(this, "handleRuntimeDisposed", () => {
        this.disposed = true;
        this.stopAllBindings();
        this.unregisterRuntimeListeners();
      });
      this.registerRuntimeListeners();
    }
    getInfo() {
      return {
        id: EXTENSION_ID,
        name: Scratch.translate(definitions.extensionName),
        color1: "#2f9d8f",
        color2: "#247c72",
        color3: "#185b54",
        blocks: blockDefinitions.filter((block) => !block.featureFlag || FEATURE_FLAGS[block.featureFlag]).map((block) => ({
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
    listenForKey(args, util) {
      this.requireActiveRuntime();
      const owner = this.requireTarget(util);
      const keyId = normalizeName(args.KEY_ID);
      const runtimeVariable = normalizeName(args.RUNTIME_VAR);
      const value = String(args.VALUE ?? "");
      if (!keyId) throw new Error("KEY_ID must be specified.");
      if (!runtimeVariable) throw new Error("RUNTIME_VAR must be specified.");
      requireRuntimeVariables(this.runtime);
      const binding = {
        ownerTargetId: owner.id,
        ...parseRuntimeBinding(runtimeVariable, value)
      };
      const bindingsForKey = this.keyBindings.get(keyId) ?? /* @__PURE__ */ new Map();
      bindingsForKey.set(owner.id, binding);
      this.keyBindings.set(keyId, bindingsForKey);
      this.runtimeDependencyFailureReported = false;
      this.attachKeyListenerIfNeeded();
    }
    stopListeningForKey(args, util) {
      this.requireActiveRuntime();
      const owner = this.requireTarget(util);
      const keyId = normalizeName(args.KEY_ID);
      if (!keyId) throw new Error("KEY_ID must be specified.");
      this.removeKeyBinding(owner.id, keyId);
    }
    stopAllKeyListeners(_args, util) {
      this.requireActiveRuntime();
      const owner = this.requireTarget(util);
      this.removeAllKeyBindingsForTarget(owner.id);
    }
    listenForTouch(args, util) {
      this.requireActiveRuntime();
      const owner = this.requireSpriteTarget(util);
      const runtimeVariable = normalizeName(args.RUNTIME_VAR);
      const value = String(args.VALUE ?? "");
      if (!runtimeVariable) throw new Error("RUNTIME_VAR must be specified.");
      requireRuntimeVariables(this.runtime);
      this.touchBindings.set(owner.id, {
        ownerTargetId: owner.id,
        ...parseRuntimeBinding(runtimeVariable, value)
      });
      this.runtimeDependencyFailureReported = false;
      this.attachPointerListenerIfNeeded();
    }
    stopListeningForTouch(_args, util) {
      this.requireActiveRuntime();
      const owner = this.requireTarget(util);
      this.touchBindings.delete(owner.id);
      this.detachPointerListenerIfUnused();
    }
    stopAllInputListeners(_args, util) {
      this.requireActiveRuntime();
      const owner = this.requireTarget(util);
      this.removeAllBindingsForTarget(owner.id);
    }
    requireActiveRuntime() {
      if (this.disposed) throw new Error("Async Input runtime has been disposed.");
    }
    requireTarget(util) {
      const target = util?.target;
      if (!target?.id) throw new Error("The current TurboWarp target is unavailable.");
      return target;
    }
    requireSpriteTarget(util) {
      const target = this.requireTarget(util);
      if (target.isStage) throw new Error("Touch input must be registered by a sprite or clone.");
      return target;
    }
    writeFromBackgroundEvent(binding) {
      let runtimeVariables;
      try {
        runtimeVariables = requireRuntimeVariables(this.runtime);
      } catch (error) {
        this.stopAllBindings();
        if (!this.runtimeDependencyFailureReported) {
          this.runtimeDependencyFailureReported = true;
          console.error("Async input bindings stopped.", error);
        }
        return false;
      }
      try {
        const value = binding.kind === "set" ? binding.value : this.evaluateArithmeticBinding(runtimeVariables, binding);
        writeRuntimeVariable(runtimeVariables, binding.runtimeVariable, value);
      } catch (error) {
        console.error("Async input binding update failed.", error);
      }
      return true;
    }
    evaluateArithmeticBinding(runtimeVariables, binding) {
      const currentValue = readRuntimeVariable(runtimeVariables, binding.runtimeVariable);
      const currentNumber = Number(currentValue);
      if (!Number.isFinite(currentNumber)) {
        throw new Error(
          `Runtime variable ${JSON.stringify(binding.runtimeVariable)} must contain a finite number.`
        );
      }
      let result;
      switch (binding.operator) {
        case "+":
          result = currentNumber + binding.operand;
          break;
        case "-":
          result = currentNumber - binding.operand;
          break;
        case "*":
          result = currentNumber * binding.operand;
          break;
        case "/":
          result = currentNumber / binding.operand;
          break;
      }
      if (!Number.isFinite(result)) {
        throw new Error(
          `Async input arithmetic result for ${JSON.stringify(binding.runtimeVariable)} must be finite.`
        );
      }
      return result;
    }
    removeKeyBinding(ownerTargetId, keyId) {
      const bindingsForKey = this.keyBindings.get(keyId);
      bindingsForKey?.delete(ownerTargetId);
      if (bindingsForKey?.size === 0) this.keyBindings.delete(keyId);
      this.detachKeyListenerIfUnused();
    }
    removeAllKeyBindingsForTarget(ownerTargetId) {
      for (const [keyId, bindingsForKey] of this.keyBindings) {
        bindingsForKey.delete(ownerTargetId);
        if (bindingsForKey.size === 0) this.keyBindings.delete(keyId);
      }
      this.detachKeyListenerIfUnused();
    }
    removeAllBindingsForTarget(ownerTargetId) {
      this.removeAllKeyBindingsForTarget(ownerTargetId);
      this.touchBindings.delete(ownerTargetId);
      this.detachPointerListenerIfUnused();
    }
    stopAllBindings() {
      this.keyBindings.clear();
      this.touchBindings.clear();
      this.detachKeyListenerIfUnused();
      this.detachPointerListenerIfUnused();
    }
    attachKeyListenerIfNeeded() {
      if (this.keyListenerAttached || this.keyBindings.size === 0) return;
      window.addEventListener("keydown", this.handleKeyDown);
      this.keyListenerAttached = true;
    }
    detachKeyListenerIfUnused() {
      if (!this.keyListenerAttached || this.keyBindings.size > 0) return;
      window.removeEventListener("keydown", this.handleKeyDown);
      this.keyListenerAttached = false;
    }
    attachPointerListenerIfNeeded() {
      if (this.pointerListenerAttached || this.touchBindings.size === 0) return;
      this.runtime.renderer.canvas.addEventListener("pointerdown", this.handlePointerDown);
      this.pointerListenerAttached = true;
    }
    detachPointerListenerIfUnused() {
      if (!this.pointerListenerAttached || this.touchBindings.size > 0) return;
      this.runtime.renderer.canvas.removeEventListener("pointerdown", this.handlePointerDown);
      this.pointerListenerAttached = false;
    }
    registerRuntimeListeners() {
      if (this.runtimeListenersAttached) return;
      this.runtime.on("PROJECT_STOP_ALL", this.handleProjectBoundary);
      this.runtime.on("PROJECT_START", this.handleProjectBoundary);
      this.runtime.on("targetWasRemoved", this.handleTargetRemoved);
      this.runtime.on("RUNTIME_DISPOSED", this.handleRuntimeDisposed);
      this.runtimeListenersAttached = true;
    }
    unregisterRuntimeListeners() {
      if (!this.runtimeListenersAttached) return;
      this.runtime.off("PROJECT_STOP_ALL", this.handleProjectBoundary);
      this.runtime.off("PROJECT_START", this.handleProjectBoundary);
      this.runtime.off("targetWasRemoved", this.handleTargetRemoved);
      this.runtime.off("RUNTIME_DISPOSED", this.handleRuntimeDisposed);
      this.runtimeListenersAttached = false;
    }
  }
  if (!Scratch.extensions.unsandboxed) {
    throw new Error("Async Input must run unsandboxed.");
  }
  Scratch.extensions.register(new AsyncInputExtension());

})(Scratch);
