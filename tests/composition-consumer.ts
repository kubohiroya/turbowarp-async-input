import {
  createAsyncInputComposition,
  type AccumulatedPoseChangedEventV1,
  type AccumulatedPoseListener,
  type AccumulatedPoseSource,
  type ActorTouchCandidateEventV1,
  type ActorTouchCandidateListener,
  type ActorTouchCandidateSource,
  type AsyncInputComposition,
  type KeyCandidateEventV1,
  type KeyCandidateListener,
  type KeyCandidateSource,
  type NfcCandidateSource,
  type QrCandidateSource
} from '@kubohiroya/turbowarp-async-input/composition';

declare const subscribe: (listener: AccumulatedPoseListener) => () => void;
declare const subscribeKey: (listener: KeyCandidateListener) => () => void;
declare const subscribeActorTouch: (
  listener: ActorTouchCandidateListener
) => () => void;

declare const tmCompatibleSource: {
  resetAccumulatedPose(): void;
  subscribeAccumulatedPose(
    listener: (event: Readonly<AccumulatedPoseChangedEventV1>) => void
  ): () => void;
};

const poseSource: AccumulatedPoseSource = {
  resetAccumulatedPose() {},
  subscribeAccumulatedPose: subscribe
};
const keySource: KeyCandidateSource = {subscribeKeyCandidate: subscribeKey};
const actorTouchSource: ActorTouchCandidateSource = {
  subscribeActorTouchCandidate: subscribeActorTouch
};
const qrSource: QrCandidateSource = {
  async waitForQrText() {
    return 'qr:next';
  }
};
const nfcSource: NfcCandidateSource = {
  async waitForNfcIdm() {
    return '0123456789ABCDEF';
  }
};
const input: AsyncInputComposition = createAsyncInputComposition({
  poseSource,
  keySource,
  actorTouchSource,
  qrSource,
  nfcSource
});
const directInput: AsyncInputComposition = createAsyncInputComposition({
  poseSource: tmCompatibleSource
});
const selected: Promise<string> = input.waitForPoseCandidate({
  candidates: ['jump', 'stand'],
  signal: new AbortController().signal
});
const selectedKey: Promise<string> = input.waitForKeyCandidate({
  candidates: ['Space', 'ArrowRight']
});
const selectedActor: Promise<string> = input.waitForActorTouchCandidate({
  candidates: ['Hero']
});
const selectedQr: Promise<string> = input.waitForQrCandidate({
  candidates: ['qr:next'],
  cameraId: 'qr'
});
const selectedNfc: Promise<string> = input.waitForNfcCandidate({
  candidates: ['0123456789ABCDEF'],
  readerId: 'right'
});
const event: AccumulatedPoseChangedEventV1 = {
  version: 1,
  poseName: 'jump',
  previousPoseName: 'stand',
  score: 1,
  reason: 'prediction',
  timestamp: 1
};
const keyEvent: KeyCandidateEventV1 = {
  version: 1,
  code: 'Space',
  repeat: false,
  isComposing: false,
  hasModifier: false,
  interactiveTarget: false,
  timestamp: 1
};
const actorTouchEvent: ActorTouchCandidateEventV1 = {
  version: 1,
  actorId: 'Hero',
  primaryButton: true,
  topmost: true,
  actorNameUnique: true,
  timestamp: 1
};

void selected;
void selectedKey;
void selectedActor;
void selectedQr;
void selectedNfc;
void event;
void keyEvent;
void actorTouchEvent;
input.releaseAll();
directInput.releaseAll();
