import {
  createAsyncInputComposition,
  type AccumulatedPoseChangedEventV1,
  type AccumulatedPoseListener,
  type AccumulatedPoseSource,
  type AsyncInputComposition
} from '@kubohiroya/turbowarp-async-input/composition';

declare const subscribe: (listener: AccumulatedPoseListener) => () => void;

declare const tmposeCompatibleSource: {
  resetAccumulatedPose(): void;
  subscribeAccumulatedPose(
    listener: (event: Readonly<AccumulatedPoseChangedEventV1>) => void
  ): () => void;
};

const poseSource: AccumulatedPoseSource = {
  resetAccumulatedPose() {},
  subscribeAccumulatedPose: subscribe
};
const input: AsyncInputComposition = createAsyncInputComposition({poseSource});
const directInput: AsyncInputComposition = createAsyncInputComposition({
  poseSource: tmposeCompatibleSource
});
const selected: Promise<string> = input.waitForPoseCandidate({
  candidates: ['jump', 'stand'],
  signal: new AbortController().signal
});
const event: AccumulatedPoseChangedEventV1 = {
  version: 1,
  poseName: 'jump',
  previousPoseName: 'stand',
  score: 1,
  reason: 'prediction',
  timestamp: 1
};

void selected;
void event;
input.releaseAll();
directInput.releaseAll();
