# TurboWarp-Async-Input

<img src="assets/block-icon.svg" alt="" width="48" height="48">

[English](README.md)

TurboWarp Temporary Variables向けに、target単位で非同期のキーボード・ポインタ・累積ポーズ入力を扱う
拡張機能です。

導入手順、例、listenerの所有関係、トラブルシューティングは、図入りの
[English user guide](https://kubohiroya.github.io/turbowarp-async-input/)または
[日本語ユーザーガイド](https://kubohiroya.github.io/turbowarp-async-input/ja/)を参照してください。

## インストール

`dist/async-input.js`をビルドまたはダウンロードし、TurboWarp Desktopで**サンドボックス化せずに実行**を
有効にして、ローカルのカスタム拡張機能として読み込みます。入力を登録する前に、TurboWarpの
**Temporary Variables**拡張機能を読み込んでください。ポーズ入力にはさらに、累積ポーズのスコアリングと
変化イベントを有効にしたTurboWarp TMが必要です。

versionを付けたnpm packageにレビュー済みのビルドが入っています。

```bash
pnpm add --save-exact @kubohiroya/turbowarp-async-input@0.8.1
```

`node_modules/@kubohiroya/turbowarp-async-input/dist/async-input.js`を読み込むか、version固定の
CDN URLを使います。

```text
https://cdn.jsdelivr.net/npm/@kubohiroya/turbowarp-async-input@0.8.1/dist/async-input.js
```

配布ビルドでは、`config/feature-flags.ts`のコンパイル時feature flag `asyncInput`によってキーとタッチの
blockが有効になります。ポーズのblockにはさらに、独立して切り戻せるfeature flag `poseInput`が必要で、
これは既定でOFFのままです。

## Composition API

DSLのcontrollerは、Standaloneの拡張機能を登録せず、グローバルの`Scratch`、DOM、TurboWarpのVMにも
触れずに`@kubohiroya/turbowarp-async-input/composition`をimportできます。呼び出し側は、使うevent
sourceだけを注入します。

```js
import {createAsyncInputComposition} from '@kubohiroya/turbowarp-async-input/composition';

const input = createAsyncInputComposition({
  poseSource: tmComposition,
  keySource,
  actorTouchSource,
  qrSource,
  nfcSource,
});
const selectedPose = await input.waitForPoseCandidate({
  candidates: ['help', 'jump'],
  signal,
});
const selectedKey = await input.waitForKeyCandidate({
  candidates: ['Space', 'ArrowRight'],
  signal,
});
const selectedActor = await input.waitForActorTouchCandidate({
  candidates: ['LeftDoor', 'RightDoor'],
  signal,
});
const selectedQr = await input.waitForQrCandidate({
  candidates: ['qr:next'],
  cameraId: 'qr',
  signal,
});
const selectedNfc = await input.waitForNfcCandidate({
  candidates: ['0123456789ABCDEF'],
  readerId: 'right',
  signal,
});
```

`waitForPoseCandidate`は、pose sourceの現在値をpollingしません。待機の開始後にversion 1の累積ポーズ
変化だけを購読し、登録済みの候補ちょうど1つで解決します。購読の前に`poseSource.resetAccumulatedPose()`を
呼ぶため、受理されたすべての待機は累積スコア0の新しい選択セッションから始まります。空のポーズと候補外は
無視します。不正なイベントは、ポーズを選ばずに待機をrejectします。

`keySource`はversion 1のキー観測を発行します。`code`は`KeyboardEvent.code`そのもので、あわせて
リピート、IMEの変換中、Shift/Ctrl/Alt/Metaの修飾、対話的なフォーカスの状態も報告します。compositionは
これらの除外フラグのいずれかを持つ観測を無視し、`candidates`に含まれる最初のcodeで解決します。sourceは
ブラウザの既定動作を妨げたり、イベントの伝播を止めたりしてはいけません。

`actorTouchSource`はversion 1のrenderer canvasのポインタ観測を発行します。最前面のdrawableを、
`actorName`の完全かつ一意な一致でDSLのactor IDへ解決し、primaryボタン・最前面の取得・一意性のフラグを
報告します。compositionは3つのフラグがすべてtrueでなければ観測を無視し、その上で`candidates`に含まれる
最初のactor IDで解決します。

`qrSource`は`waitForQrText({cameraId, signal})`を提供します。通常は
`@kubohiroya/turbowarp-jsqr`が担います。`cameraId`は`qr`のような名前付きのCamera Source streamを
選びます。`nfcSource`は`waitForNfcIdm({readerId, signal})`を提供し、通常は
`@kubohiroya/turbowarp-webusb-pasori`が担います。`readerId`は`left`や`right`のような名前付きの
PaSoRiを選びます。compositionは`candidates`に含まれる値だけを受理し、候補外の読み取りでは、sourceが
別の値を返すかsignalがabortされるまで待機を続けます。

ポーズ、キー、actorタッチ、QR、NFCの待機は、1つのcomposition instance内でlatest-winsの所有関係を
共有します。いずれかのモードで新しい有効な待機を始めると、まず前の待機を購読解除して`AbortError`で
rejectします。古いイベントがどちらの待機も解決することはありません。すでにabort済み、不正、sourceが
無い要求は購読せず、現在の有効な待機を置き換えません。空の候補と重複した候補はrejectします。abort、
解決、reject、`releaseAll()`はいずれも即座に購読を解除します。

このAPIが実装するのは非同期入力の候補選択だけです。DSLのcontrollerは、これをActorの順序付きポーズ列と
排他にする必要があります。衝突する場合、controllerは候補の待機をキャンセルし、Actorの列を優先します。
2つのモードはスコアや進捗の状態を共有しません。シーンの移動、巻き戻し、停止、live reload、runtimeの
解放では、actionのsignalをabortしなければなりません。同じシーンへ再び入ると、スコア0の選択セッションが
もう一度始まります。Standaloneのblock、opcode、既定OFFの`poseInput` feature flagは変わりません。

## 拡張機能IDの互換性

この移行releaseでは、標準に準拠したID`kubohiroyaasyncinput`を使います。`twAsyncInput`のopcodeを
保存したままの既存プロジェクトには、同時にschemaを理解した移行処理が必要です。JavaScriptの成果物だけを
置き換えると、既存のblockが壊れます。

## 実行時変数の初期化

listenのblockが行うのは、入力の束縛の登録または置換だけです。listenerの登録や削除は、その実行時変数を
作成・消去・初期化しません。プロジェクトが予測可能な初期状態を必要とする場合は、listenerの登録前に
Temporary Variablesで変数を明示的に初期化してください。初期値が未設定の入力には空文字列を、`+`、`-`、
`*`、`/`の複合代入を使う前には`0`のような有限の数値を使います。

共有する実行時変数は、そこへ書き込むすべてのtargetを登録する前に、一度だけ初期化してください。ある
targetの登録が、別のtargetが既に使っている値をリセットしてしまうのを避けられます。

## targetの所有関係

すべての束縛は、登録blockを実行したスプライト、クローン、またはステージに属します。キーの束縛は現在の
target IDと`KeyboardEvent.code`で識別します。通常のタッチの束縛は現在のスプライトまたはクローンの
target IDで識別します。actorタッチの互換blockは、実行したtargetを所有者としたまま、ポインタのヒットを
解決後のactor targetへ束縛します。したがって同じスプライトの2つのクローンが、独立した束縛を登録できます。

この拡張機能は、束縛の数にかかわらず、windowの`keydown` listener 1つ、renderer canvasの`pointerdown`
listener 1つ、TurboWarp TMのruntime event listener 1つだけを使います。targetの削除は、そのtargetの
束縛を取り除きます。緑の旗、プロジェクトの停止、runtimeの破棄はすべての束縛を取り除きます。

## キーボード入力

キーIDには`KeyboardEvent.code`を使います。たとえば`KeyA`、`Digit1`、`ArrowLeft`、`Space`、`Enter`です。
複数のtargetが同じキーを待ち受けても、互いを置き換えることはありません。同じtargetから同じキーを
登録し直した場合は、そのtargetの束縛だけを置き換えます。

keydownのリピート、IMEの変換中、input・textarea・select・編集可能要素からのイベントは無視します。この
拡張機能はブラウザの既定動作を妨げず、伝播も止めません。

## タッチ入力

通常のタッチ登録blockは、常にそれを実行したスプライトまたはクローンを指します。ステージのtargetは
拒否します。rendererの最前面の取得結果をtarget IDで照合するため、元のスプライトとクローンは区別され、
透明ピクセルの扱いはTurboWarp rendererの挙動に従います。

紙芝居DSLとの統合では、`listenForActorTouchAndBroadcast`が、`actorName`変数が与えられたactor名と
完全に一致する非ステージのtargetを解決します。actor名が存在しない場合と重複する場合は拒否します。この
互換blockは、生成される公開block一覧の外で維持しています。

## 入力後のブロードキャスト

キーとタッチの`and broadcast`版は、まず実行時変数を更新し、続いて対応する標準のScratchブロードキャストを
開始します。受信側のscriptの終了は待ちません。メッセージ名は前後の空白を取り除き、空であってはなりません。
不正な複合算術の更新を含め、実行時変数の更新に失敗した場合はブロードキャストを開始しません。条件に
合致したtarget所有のキー束縛は、それぞれが設定どおりのブロードキャストを開始します。

## 累積ポーズ入力

ポーズ登録blockは、TurboWarp TMの`TM_ACCUMULATED_POSE_CHANGED` version 1イベントを待ち受けます。
選択された累積ポーズ名が登録済みの名前へ変化したときだけ動作し、同じ累積ポーズのまま確信度が変わっても
再発火しません。ポーズから離れて後で戻ると、束縛は再び発火します。

束縛は、実行したtarget IDとポーズ名で識別します。複数のtargetが同じポーズを独立して待ち受けられ、
1つのtargetが複数のポーズを待ち受けることもできます。Temporary Variablesが無い場合、または累積ポーズ
イベントへの対応を報告するTurboWarp TM拡張機能が無い場合、登録は失敗します。

## 複合算術

`+`、`-`、`*`、`/`で始まる値は、実行時変数の最新値に対する数値の複合代入になります。

```text
+2   -> current += 2
-1   -> current -= 1
*3   -> current *= 3
/2   -> current /= 2
```

被演算子は有限の数値でなければなりません。現在値が無い場合や数値でない場合、0除算、オーバーフロー、
その他の非有限な結果では、現在値を変更しません。算術の接頭辞が無い値は、空の値も含めて、文字列として
そのまま代入します。

## DSLとの統合

actorを意識したタッチの振り分けには、互換blockを直接使えます。例です。

```text
action=touchInput:a1,a2:v1,v1:+2,+5
```

これは各actorを`actorName`の値で登録しつつ、束縛の所有者としては実行中のtargetを保ちます。actor側の
targetと所有側のtargetのどちらを削除しても、対応するタッチの束縛は取り除かれます。

ポーズの振り分けも同じ形です。

```text
action=poseInput:jump:v1:+2
action=poseInput:jump:
action=poseInput:
```

これらはそれぞれ、現在のtargetに`jump`を登録する、そのtargetの`jump`の束縛を取り除く、現在のtargetが
所有するすべてのポーズ束縛を取り除く、に対応します。

## ブロック

| block | opcode | feature flag | 動作 |
|---|---|---|---|
| `listen for key [KEY_ID] set runtime var [RUNTIME_VAR] to [VALUE]` | `listenForKey` | `asyncInput` | target所有のキー束縛を登録または置換します。 |
| `listen for key ... and broadcast [MESSAGE]` | `listenForKeyAndBroadcast` | `asyncInput` | 実行時変数の更新後にブロードキャストする、target所有のキー束縛を登録または置換します。 |
| `stop listening for key [KEY_ID] for this target` | `stopListeningForKey` | `asyncInput` | 物理キーコード1つに対する、このtargetの束縛を取り除きます。 |
| `stop all key listeners registered by this target` | `stopAllKeyListeners` | `asyncInput` | 現在のtargetが所有するすべてのキー束縛を取り除きます。 |
| `listen for touch on this sprite set runtime var [RUNTIME_VAR] to [VALUE]` | `listenForTouch` | `asyncInput` | 現在のスプライトまたはクローンのポインタ束縛を登録または置換します。 |
| `listen for touch ... and broadcast [MESSAGE]` | `listenForTouchAndBroadcast` | `asyncInput` | 実行時変数の更新後にブロードキャストする、ポインタ束縛を登録または置換します。 |
| `stop listening for touch on this sprite` | `stopListeningForTouch` | `asyncInput` | 現在のtargetのポインタ束縛を取り除きます。 |
| `listen for accumulated pose [POSE_NAME] set runtime var [RUNTIME_VAR] to [VALUE]` | `listenForPose` | `poseInput` | target所有の累積ポーズ束縛を登録または置換します。 |
| `stop listening for accumulated pose [POSE_NAME] for this target` | `stopListeningForPose` | `poseInput` | 累積ポーズ名1つに対する、このtargetの束縛を取り除きます。 |
| `stop all pose listeners registered by this target` | `stopAllPoseListeners` | `poseInput` | 現在のtargetが所有するすべての累積ポーズ束縛を取り除きます。 |
| `stop all input listeners registered by this target` | `stopAllInputListeners` | `asyncInput` | 現在のtargetが所有するキー・ポインタ・累積ポーズのすべての束縛を取り除きます。 |

既定値は`KEY_ID`が`KeyA`、`RUNTIME_VAR`が`input`、`VALUE`がキーとタッチでは`pressed`・ポーズでは
`detected`、`MESSAGE`が`message1`、`POSE_NAME`が`jump`です。すべてCommand blockです。

## 開発

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

## リリース

releaseのcommitでは、`package.json`、このREADMEとGitHub Pagesの2つのガイドにあるversion固定の
npm/CDNの例、`CHANGELOG.md`を同じversionに揃えます。releaseのPRがmergeされ、CIとPagesのデプロイが
成功したら、その正確なpackage versionを公開し、merge commitに対応する`v<version>`タグを作成し、その
タグからGitHub Releaseを作成します。利用側は直前のnpm versionを固定することで切り戻せます。

ビルドは`dist/async-input.js`、`dist/composition.js`、`dist/types/composition.d.ts`を生成します。
拡張機能またはCompositionのsourceを変更したら、再ビルドした成果物をcommitしてください。

## ライセンス

MPL-2.0
