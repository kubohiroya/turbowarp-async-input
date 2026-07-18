# TurboWarp Async Input

A target-scoped asynchronous keyboard and pointer input extension for TurboWarp Temporary Variables.

## Installation

Build or download `dist/async-input.js`, then load it as a local custom extension in TurboWarp Desktop with **Run extension without sandbox** enabled. Load TurboWarp's **Temporary Variables** extension before registering input.

The initial implementation is guarded by the compile-time `asyncInput` feature flag in `config/feature-flags.ts`, which is OFF by default.

## Target ownership

Every binding belongs to the sprite, clone, or stage that executes the registration block. Key bindings are identified by the current target ID and `KeyboardEvent.code`. Touch bindings are identified by the current sprite or clone target ID. Two clones of the same sprite can therefore register independent bindings.

The extension uses one window `keydown` listener and one renderer-canvas `pointerdown` listener regardless of the number of bindings. Target deletion removes that target's bindings. Green flag, project stop, and runtime disposal remove all bindings.

## Keyboard input

Key IDs use `KeyboardEvent.code`, for example `KeyA`, `Digit1`, `ArrowLeft`, `Space`, or `Enter`. Multiple targets may listen for the same key without replacing each other. Re-registering the same key from the same target replaces only that target's binding.

Repeated keydown events, IME composition, and events from input, textarea, select, or editable elements are ignored. The extension does not prevent browser defaults or stop propagation.

## Touch input

The touch registration block always refers to the sprite or clone that executes it. Stage targets are rejected. The renderer's topmost pick result is matched by target ID, so original sprites and clones remain distinct and transparent pixels follow TurboWarp renderer behavior.

## Compound arithmetic

A value beginning with `+`, `-`, `*`, or `/` performs numeric compound assignment against the runtime variable's latest value:

```text
+2   -> current += 2
-1   -> current -= 1
*3   -> current *= 3
/2   -> current /= 2
```

Operands must be finite numbers. Missing or non-numeric current values, division by zero, overflow, and other non-finite results leave the current value unchanged. Values without an arithmetic prefix, including an empty value, use exact string assignment.

## DSL integration

Actor names belong to the DSL routing layer rather than this extension's block API. For example:

```text
action=touchInput:a1,a2:v1,v1:+2,+5
```

must execute `listen for touch on this sprite...` once in a1's target context and once in a2's target context. The extension stores only the resulting target IDs.

## Blocks

<!-- BEGIN GENERATED BLOCKS -->

### `listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE]`

Registers or replaces a target-owned key binding.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `listenForKey` |
| Feature flag | `asyncInput` |
| `KEY_ID` | String, default: `KeyA` |
| `RUNTIME_VAR` | String, default: `input` |
| `VALUE` | String, default: `pressed` |

### `stop listening for key [KEY_ID] for this target`

Removes this target's binding for one physical key code.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopListeningForKey` |
| Feature flag | `asyncInput` |
| `KEY_ID` | String, default: `KeyA` |

### `stop all key listeners registered by this target`

Removes every key binding owned by the current target.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopAllKeyListeners` |
| Feature flag | `asyncInput` |

### `listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE]`

Registers or replaces the current sprite or clone's pointer binding.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `listenForTouch` |
| Feature flag | `asyncInput` |
| `RUNTIME_VAR` | String, default: `input` |
| `VALUE` | String, default: `pressed` |

### `stop listening for touch on this sprite`

Removes the current target's pointer binding.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopListeningForTouch` |
| Feature flag | `asyncInput` |

### `stop all input listeners registered by this target`

Removes every key and pointer binding owned by the current target.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopAllInputListeners` |
| Feature flag | `asyncInput` |

<!-- END GENERATED BLOCKS -->

## Development

```bash
npm install
npm run check
```

The build produces `dist/async-input.js`. Commit the rebuilt file whenever extension source changes.

## License

MPL-2.0
