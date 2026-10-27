# Async Input 最小デモ

[Editorで開く](https://turbowarp.org/editor?project_url=https%3A%2F%2Fkubohiroya.github.io%2Fturbowarp-async-input%2Fsamples%2Fwait-for-space.sb3) · [SB3](https://kubohiroya.github.io/turbowarp-async-input/samples/wait-for-space.sb3)

緑の旗→ステージをクリックしてフォーカス→Spaceで受信カウンターが1ずつ増え、runtime値がpressedになります。Sで登録解除、停止ボタンでも解除します。再度緑の旗で0から再登録します。入力欄を編集中は反応しません。公式Temporary VariablesをSB3の関連拡張として記録しているため、その取得に通信が必要です。カメラ・マイク・機器は不要です。

## 編集と配信

`wait-for-space/project.json`とSVGを編集し、Node.js 26で`node scripts/build-samples.mjs`を実行します。生成SB3をコミットし、`node scripts/build-samples.mjs --check`と`node --test scripts/verify-samples.mjs`で検査します。`node scripts/prepare-pages.mjs`は既存サイト・dist・SB3を`_site/`へ集約します。

unsandboxed拡張の検証対象JSをSB3に同梱し、Editorの通常の許可画面を使用します。本体や既定フラグを変更しません。切戻しはサンプル・READMEリンク・Pages追加のrevertです。
