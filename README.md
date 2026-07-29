# TurboWarp Async Input

A target-scoped asynchronous keyboard, pointer, and accumulated pose input extension for
TurboWarp Temporary Variables.

## Installation

Build or download `dist/async-input.js`, then load it as a local custom extension in TurboWarp
Desktop with **Run extension without sandbox** enabled. Load TurboWarp's **Temporary Variables**
extension before registering input. Pose input also requires TMPose with its accumulated pose
scoring and change event features enabled.

The distributed build enables key and touch blocks through the compile-time `asyncInput` feature
flag in `config/feature-flags.ts`. Pose blocks additionally require the independently reversible
`poseInput` feature flag, which remains OFF by default.

## Extension ID compatibility

The current extension ID remains `twAsyncInput` for compatibility with projects that already
store its opcodes. A future standards-compliant ID is planned as
`kubohiroyaasyncinput`. That change must be released together with a schema-aware project
migration; replacing the ID in this repository alone would break existing blocks.

## Runtime variable initialization

Listen blocks only register or replace input bindings. Registering or removing a listener does not
create, clear, or otherwise initialize its runtime variable. Initialize the variable explicitly
with Temporary Variables before registering listeners whenever the project requires a predictable
starting state. Use an empty string for an initially unset input value, or a finite number such as
`0` before using `+`, `-`, `*`, or `/` compound assignment.

Initialize a shared runtime variable once before registering all targets that write to it. This
avoids one target's registration resetting values already used by another target.

## Target ownership

Every binding belongs to the sprite, clone, or stage that executes the registration block. Key bindings are identified by the current target ID and `KeyboardEvent.code`. Ordinary touch bindings are identified by the current sprite or clone target ID. The actor-touch compatibility block keeps the executing target as owner while binding the pointer hit to the resolved actor target. Two clones of the same sprite can therefore register independent bindings.

The extension uses one window `keydown` listener, one renderer-canvas `pointerdown` listener, and
one TMPose runtime-event listener regardless of the number of bindings. Target deletion removes
that target's bindings. Green flag, project stop, and runtime disposal remove all bindings.

## Keyboard input

Key IDs use `KeyboardEvent.code`, for example `KeyA`, `Digit1`, `ArrowLeft`, `Space`, or `Enter`. Multiple targets may listen for the same key without replacing each other. Re-registering the same key from the same target replaces only that target's binding.

Repeated keydown events, IME composition, and events from input, textarea, select, or editable elements are ignored. The extension does not prevent browser defaults or stop propagation.

## Touch input

The ordinary touch registration block always refers to the sprite or clone that executes it. Stage targets are rejected. The renderer's topmost pick result is matched by target ID, so original sprites and clones remain distinct and transparent pixels follow TurboWarp renderer behavior.

For kamishibai DSL integration, `listenForActorTouchAndBroadcast` resolves a non-stage target whose `actorName` variable exactly matches the supplied actor name. Missing and duplicate actor names are rejected. This compatibility block is maintained outside the generated public block reference.

## Broadcast after input

The key and touch `and broadcast` variants update the runtime variable first, then start the
matching standard Scratch broadcast without waiting for its receiver scripts to finish. The
message name is trimmed and must not be empty. If the runtime variable update fails, including an
invalid compound arithmetic update, the broadcast is not started. Each matching target-owned key
binding starts its own configured broadcast.

## Accumulated pose input

The pose registration block listens for TMPose's `TMPOSE_ACCUMULATED_POSE_CHANGED` version 1
event. It runs only when the selected accumulated pose name changes to the registered name;
confidence changes that keep the same accumulated pose do not retrigger it. Leaving a pose and
later returning to it triggers the binding again.

Bindings are keyed by the executing target ID and pose name. Multiple targets can listen for the
same pose independently, and one target can listen for multiple poses. Registration fails without
Temporary Variables or a TMPose extension that reports accumulated pose event support.

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

Actor-aware touch routing can use the compatibility block directly. For example:

```text
action=touchInput:a1,a2:v1,v1:+2,+5
```

can register each actor by its `actorName` value while preserving the executing target as the binding owner. Removing either the actor target or the owning target removes the corresponding touch binding.

Pose routing follows the same pattern:

```text
action=poseInput:jump:v1:+2
action=poseInput:jump:
action=poseInput:
```

These map to registering `jump` for the current target, removing that target's `jump` binding,
and removing every pose binding owned by the current target.

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

### `listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]`

Registers or replaces a target-owned key binding that broadcasts after updating the runtime variable.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `listenForKeyAndBroadcast` |
| Feature flag | `asyncInput` |
| `KEY_ID` | String, default: `KeyA` |
| `RUNTIME_VAR` | String, default: `input` |
| `VALUE` | String, default: `pressed` |
| `MESSAGE` | String, default: `message1` |

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

### `listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE] and broadcast [MESSAGE]`

Registers or replaces the current sprite or clone's pointer binding that broadcasts after updating the runtime variable.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `listenForTouchAndBroadcast` |
| Feature flag | `asyncInput` |
| `RUNTIME_VAR` | String, default: `input` |
| `VALUE` | String, default: `pressed` |
| `MESSAGE` | String, default: `message1` |

### `stop listening for touch on this sprite`

Removes the current target's pointer binding.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopListeningForTouch` |
| Feature flag | `asyncInput` |

### `listen for accumulated pose [POSE_NAME] set runtime var [RUNTIME_VAR] to [VALUE]`

Registers or replaces a target-owned accumulated pose binding.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `listenForPose` |
| Feature flag | `poseInput` |
| `POSE_NAME` | String, default: `jump` |
| `RUNTIME_VAR` | String, default: `input` |
| `VALUE` | String, default: `detected` |

### `stop listening for accumulated pose [POSE_NAME] for this target`

Removes this target's binding for one accumulated pose name.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopListeningForPose` |
| Feature flag | `poseInput` |
| `POSE_NAME` | String, default: `jump` |

### `stop all pose listeners registered by this target`

Removes every accumulated pose binding owned by the current target.

| Property | Value |
|---|---|
| Type | Command |
| Opcode | `stopAllPoseListeners` |
| Feature flag | `poseInput` |

### `stop all input listeners registered by this target`

Removes every key, pointer, and accumulated pose binding owned by the current target.

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
