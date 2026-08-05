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
export interface WaitForPoseCandidateOptions {
    readonly candidates: ReadonlyArray<string>;
    readonly signal?: AbortSignal;
}
export interface AsyncInputComposition {
    waitForPoseCandidate(options: WaitForPoseCandidateOptions): Promise<string>;
    releaseAll(): void;
}
export interface AsyncInputCompositionOptions {
    readonly poseSource: AccumulatedPoseSource;
}
export declare function createAsyncInputComposition(options: AsyncInputCompositionOptions): AsyncInputComposition;
