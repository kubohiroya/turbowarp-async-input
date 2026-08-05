export interface AccumulatedPoseChangedEventV1 {
    readonly version: 1;
    readonly poseName: string;
    readonly previousPoseName: string;
    readonly score: number;
    readonly reason: 'prediction' | 'reset' | 'stop';
    readonly timestamp: number;
}
export type AccumulatedPoseListener = (event: Readonly<AccumulatedPoseChangedEventV1>) => void;
export interface AccumulatedPoseSource {
    resetAccumulatedPose(): void;
    subscribeAccumulatedPose(listener: AccumulatedPoseListener): () => void;
}
export interface KeyCandidateEventV1 {
    readonly version: 1;
    readonly code: string;
    readonly repeat: boolean;
    readonly isComposing: boolean;
    readonly hasModifier: boolean;
    readonly interactiveTarget: boolean;
    readonly timestamp: number;
}
export type KeyCandidateListener = (event: Readonly<KeyCandidateEventV1>) => void;
/**
 * Publishes keydown observations without owning browser behavior. `code` must
 * come from `KeyboardEvent.code`; the remaining fields must describe repeat,
 * IME composition, any Shift/Ctrl/Alt/Meta modifier, and editable focus.
 * The source must not call preventDefault() or stopPropagation().
 */
export interface KeyCandidateSource {
    subscribeKeyCandidate(listener: KeyCandidateListener): () => void;
}
export interface ActorTouchCandidateEventV1 {
    readonly version: 1;
    readonly actorId: string;
    readonly primaryButton: boolean;
    readonly topmost: boolean;
    readonly actorNameUnique: boolean;
    readonly timestamp: number;
}
export type ActorTouchCandidateListener = (event: Readonly<ActorTouchCandidateEventV1>) => void;
/**
 * Publishes renderer-canvas pointer observations. `actorId` must be resolved
 * from an exact `actorName` match on a non-stage target. The source reports
 * whether the pointer used the primary button, hit the renderer's topmost
 * drawable, and resolved exactly one matching actor name.
 */
export interface ActorTouchCandidateSource {
    subscribeActorTouchCandidate(listener: ActorTouchCandidateListener): () => void;
}
export interface WaitForPoseCandidateOptions {
    readonly candidates: ReadonlyArray<string>;
    readonly signal?: AbortSignal;
}
export interface WaitForKeyCandidateOptions {
    readonly candidates: ReadonlyArray<string>;
    readonly signal?: AbortSignal;
}
export interface WaitForActorTouchCandidateOptions {
    readonly candidates: ReadonlyArray<string>;
    readonly signal?: AbortSignal;
}
export interface AsyncInputComposition {
    waitForPoseCandidate(options: WaitForPoseCandidateOptions): Promise<string>;
    waitForKeyCandidate(options: WaitForKeyCandidateOptions): Promise<string>;
    waitForActorTouchCandidate(options: WaitForActorTouchCandidateOptions): Promise<string>;
    releaseAll(): void;
}
export interface AsyncInputCompositionOptions {
    readonly poseSource?: AccumulatedPoseSource;
    readonly keySource?: KeyCandidateSource;
    readonly actorTouchSource?: ActorTouchCandidateSource;
}
export declare function createAsyncInputComposition(options: AsyncInputCompositionOptions): AsyncInputComposition;
