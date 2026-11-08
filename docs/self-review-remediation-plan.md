---
title: M1 自己レビュー指摘への対応計画
status: in-progress
created: 2026-11-06
updated: 2026-11-06
---

# M1 自己レビュー指摘への対応計画

## 目的と現在地

自己レビューで確認した6件を修正し、M1 の再受入を行う。既存19テストの成功は既存ケースの実績として残し、6件の解消や M1 全体の完了を示す根拠には使わない。実装と重点回帰テストは進行中だが、SR-01 と元の M1 条件に未解決事項があるため完了ではない。

この対応開始時点の製品版は利用者指定の `0.2.0` とする。後続の版更新は [development.md](development.md) に記録する。M2 の字句解析と companion skill の開発は、この対応後の作業である。

## 実施状況（2026-11-06）

- SR-02 / SR-04 / SR-05 / SR-06 の修正と再現 fixture を追加した。Node.js 26 の `npm test` は25件 pass、Node.js 22.23.4 の `node --test tests/analysis.test.mjs tests/artifacts.test.mjs` も25件 pass。JSON Schema は Ajv 2020-12 で実際の result/config を検証する。
- SR-01 は読取境界 adapter、親 path の前後検査、open 後・read 前の検査を追加した。親 symlink を「親検査直後」「open 直前」「open 後・read 前」に交換する注入テストで、外部 sentinel の read 呼出しは0回。ただし path-based `lstat` / `open` の間を OS 原子的に固定する証明ではない。
- Node.js 22 の `node:fs` API は `open(path, ...)` / `opendir(path, ...)` と descriptor 操作を文書化しているが、portable な directory-relative `openat` 操作は提供していない。この制約下では全競合順序についての fail-closed 条件を立証できず、SR-01 は未完了。`--inventory all` の再帰 `readdir` と `--output` の parent path も path-based であり、同じ保証を要する箇所として audit 対象に残す。詳細は [Node.js v22 fs API](https://nodejs.org/download/release/v22.23.0/docs/api/fs.html)。
- SR-03 workflow は `push.tags: ["v*"]` に変更済み。actionlint 1.7.12、Node 22 の v0.2.0 staging/final asset check、Node 26 の `npm run check:artifacts` が pass。GitHub hosted 実行は、修正を含む tag を実際に push した後の記録待ち。
- 元の M1 条件も照合した。物理行 offset mapping helper と known basename / supported shebang 識別を実装し、手計算 offset と混在 repository の言語・role・source 集計を regression 化した。RSC-04 は atomic filesystem 境界、RSC-07 は output parent race audit が残る。

## 作業順の更新（2026-11-06）

利用者の判断により、SR-01 は解決済み・受容済みとして閉じず、Node.js path-based API と `--inventory all` / `--output` に残る race を懸念事項としてこの文書に記録したまま、次の独立作業 RSC-02 へ進む。M1 の完了判定は保留し、RSC-02 の調査・方式選定を M1 の security acceptance の代替にしない。native helper や platform 別成果物を採用するかは、具体的な方式と配布影響を評価してから再判断する。

| 指摘 ID | 優先度 | 確認した問題 | 関連する元の作業 |
| --- | --- | --- | --- |
| SR-01 | P1 | 親ディレクトリ検査直後の symlink 差し替えでルート外を読み、ok を返す | RSC-03/04 |
| SR-02 | P1 | パス先頭 U+FEFF を BOM として除去し、別ファイルの重複計測が起こる | RSC-01/03/06 |
| SR-03 | P2 | release published のみが起動条件で、タグ push では生成されない | RSC-13 |
| SR-04 | P2 | shell-bash 等の指定が unknown/other となり source 集計から外れる | RSC-05/06 |
| SR-05 | P2 | UTF-8 BOM があると NUL の binary 判定を飛ばす | RSC-04/06 |
| SR-06 | P2 | 不正 UTF-8 パスの元 bytes が summary の診断から失われる | RSC-01/03 |

再現の観測値：SR-01 は内部1行に対して外部3行を計測し ok、SR-02 は本来合計4行の2ファイルを同一 path の2行として報告、SR-04 は source_composition が空、SR-05 は BOM の有無で basic/binary が変化、SR-06 は path:null と details:{}。SR-03 は workflow の起動条件から確認した。

## 実施順序

1. 再現 fixture とファイルアクセス境界の失敗注入を用意する。
2. SR-01 の読取境界を確定して修正する。
3. SR-02 → SR-05 → SR-04 → SR-06 を修正する。
4. SR-03 の workflow と配布手順を修正する。
5. 全修正を bundle に反映し、M1 の再受入と記録更新を行う。

各指摘は「現状で失敗する回帰テスト → 修正 → 対象テスト」の順に進める。全体 build/test は統合時に行い、同じチェックの繰返しは変更や失敗がある場合に限る。

## 0. 再現 fixture と外部境界

- 自己レビュー時の一時ファイルに依存しない再現を `tests/` に置く。期待値は上表の意味と手計算から固定し、実装の出力から生成しない。
- filesystem の読取・stat・path 解決を小さな内部 adapter 境界へまとめる。競合の注入はこの境界で行い、分類・集計・serializer を mock に置き換えない。
- 一時 Git repository と実子 process を使う。元 repository の index/worktree を変更しない。
- テストは結果の合計に加え、元 path と結果 path の対応、一意性、ファイル別 bytes、外部ファイルへの実際の read 呼出しの有無を観測する。

## SR-01：ルート外を読む競合を防ぐ

**先に確定する点：** Node.js 22 と現在の単体 `.mjs` 配布条件で、親ディレクトリを含む path 解決と読取ハンドルを安全に結び付ける方式を小さく実証する。最終要素だけの `O_NOFOLLOW` と一度の親 lstat では不足する。

**現状：未完了。** `src/file-access.mjs` に検査境界をまとめ、計画した3時点の symlink 交換で外部 sentinel を読まない回帰を確認した。通常の `lstat` / `open` を path で呼ぶ限り、検査間の任意の toggle/rename schedule を排除できないため、この結果を atomic containment と見なさない。portable な追加保証を得る helper/native dependency または配布契約の変更を判断してから再設計する。`--inventory all` の recursive `readdir` と `--output` の親 path 検査も原子的境界を持たず、未解決範囲に含める。

- ルート・親・対象ファイルの同一性、リンクの有無、実際に開く対象のルート内所属を、最初の内容読取より前に確認する。
- stat と open の間を含む競合に対して、親に固定した path 解決または同等の保証を提供できる OS/API の方式を評価する。単なる再検査で競合窓が狭くなったことを完成条件にしない。
- 保証できない状態では内容を読まず fail closed にする。対応 OS ごとに保証範囲を記録し、実装方式が確定できなければ SR-01 は未完了のまま設計課題を明示する。依存や配布形式の変更が必要なら、既存の Node.js + Git／単体 `.mjs` 契約との整合を先に判断する。
- 変更を検出した対象は `INPUT_CHANGED` または該当する path 診断、partial / exit 2 とし、未読 bytes と行数を null にする。安定した symlink / gitlink の skip は維持する。
- `--inventory all` の再帰走査と `--output` の親 path 検査も同じ種類の競合がないか照合する。同じ欠陥が確認できた箇所は、このアクセス境界の修正に含める。

**受入条件：** 親検査直後、open 直前、open 後かつ read 前の差し替えを注入しても、ルート外の sentinel 内容を読む呼出しが0件。集計を後から破棄するだけでは合格にしない。静止した正常入力は従来の期待値と一致する。

## SR-02：ファイル名の Unicode を保持する

- パス用 UTF-8 decoder では先頭 U+FEFF を文字として保持する。ファイル内容の BOM 処理とは別の契約にする。
- raw index path ごとに1結果となることを確認し、有効な path の重複を invariant で検出する。不正 UTF-8 path は元 bytes の identity で扱い、path:null 同士を重複と誤認しない。
- raw UTF-8 bytes による順序、元の Unicode 表現、name/extension/size_bytes を保持する。

**受入条件：** `notes.txt`（1行）と `\uFEFFnotes.txt`（3行）が異なる path として現れ、files=2、計測合計4行、各 bytes が実入力と一致する。BOM がファイル内容にある場合は、従来どおり bytes に含め、行数から先頭 BOM のみを除く。

**実施：** decoder の `ignoreBOM` を有効化し、valid path の重複 invariant と手計算 regression を追加。

## SR-05：UTF-8 BOM と NUL の判定を揃える

- binary signature、明示 encoding と BOM の整合、UTF-16 として扱う根拠、NUL、strict decode の優先順を固定する。
- UTF-8 BOM は NUL の binary 判定を免除する根拠にしない。UTF-16LE/BE は BOM または明示 encoding の根拠があるときに decode する。
- signature で確定した binary を encoding 指定で強制的に text としない。その他の decode failure は従来どおり error とし、binary へ一律変換しない。

**受入条件：** `61 00` と `EF BB BF 61 00` はともに binary、行数 null、bytes は元 bytes 分を計上。BOM のみ、正常な UTF-8/UTF-16、encoding/BOM 不一致、不正 encoding の既存契約も維持する。

**実施：** UTF-8 BOM の有無に依存しない NUL 判定と regression を追加。

## SR-04：Shell の language と dialect を分ける

- 設定の `shell-sh` / `shell-bash` / `shell-zsh` を受け取り、集計 language を `shell` に正規化する。dialect は内部で保持し、入力 config には利用者の指定を残す。
- 明示 role/category がなければ implementation と通常の source 分類を適用する。test/generated の優先順位と、各属性で最初の指定値を採用する ordered rules を維持する。
- M1 では `comment_analysis: unsupported` と警告を返し、comment/code 値を null にする。dialect 指定によって not_requested に変えない。
- 元の RSC-05 にある known basename と shebang の識別を接続する。複雑な interpreter form や拡張子/dialect の矛盾は診断し、明示 config を優先する。

**受入条件：** 3 dialect それぞれで language=shell、既定 role=implementation、通常 path の category=source、source_composition への加算が一致する。拡張子なし、明示 role/category、test/generated の各ケースも確認する。

**実施：** `shell-sh` / `shell-bash` / `shell-zsh` を `shell` 集計へ正規化し、dialect を分類内部で保持。config input は指定値のまま返す。3 dialect、拡張子なし、role/category override、test/generated を regression 化。known shell basenames、単純な env/direct shebang、unsupported form と dialect mismatch の警告も追加。

## SR-06：summary からも不正パスを識別できる診断

- `PATH_ENCODING_UNSUPPORTED` の `details.path_bytes_base64` に元 bytes を保存する。files 側の値と一致させ、置換文字を含む偽の path を作らない。
- 複数の不正 path は元 bytes で区別し、診断順の tie-breaker も固定する。
- detail=summary は files だけを省き、集計・diagnostics は files 版と同値にする。schema と診断資料へこの契約を記録する。

**受入条件：** raw bytes を持つ一時 Git index から、不正パス2件を区別できる base64 付き診断が得られる。summary/files 間で診断が一致し、不正名のファイル内容は読まれない。

**実施：** file と diagnostic.details の両方へ base64 identity を保存し、base64 を診断 tie-breaker に追加。raw-byte Git index と summary/files parity を regression 化。

## SR-03：タグ push 起点の配布

- 起動条件を `push.tags: ["v*"]` とし、tag 名を `github.ref_name` から既存の版数検査へ渡す。release published との二重起動は設けない。
- 当該 tag の commit を checkout し、`0.2.0` と既存の正整数 suffix 規則を検査する。Node.js 26 build、Node.js 22 による最終 staged bytes の検査、CLI/runtime/source の3成果物を維持する。
- 成果物を tag に対応する GitHub Release へ添付する。README/development/reference-check の起動条件を実装と同時に更新し、過去の published workflow の検証結果を tag workflow の成功として書き換えない。

**受入条件：** workflow が v tag push を対象とし、通常 branch push や Release published だけでは起動しない。版不一致 tag は staging/upload 前に停止する。actionlint とローカルの版数・構成・隔離 smoke を確認する。GitHub 上の実行結果は、実際の tag push 後に別途記録する。

**実施：** workflow trigger / checkout / release asset tag を `github.ref` / `github.ref_name` へ変更。actionlint と再build後の local staging / final-byte smoke を実施。

## 統合検証と完了判定

- source、dist、単体 CLI/runtime で同じ fixture を計測し、ok/partial/error と exit 0/2/1、ファイル別結果、summary 投影が一致することを確認する。schema の検証は JSON を parse しただけの確認と区別する。
- Node.js 26.12.1 で build と全25件、生成済み成果物で Node.js 22.23.4 の全25件、隔離 release smoke を実行。競合注入と symlink ケースは macOS で実施し、Windows/Linux と hosted runner は未実行。
- 成果物に新しい regression fixture と必要な schema を含め、開発環境に依存しないことを確認する。既存の版付き配布物の成功を、修正後 bytes の成功に流用しない。
- 修正により意味が変わるため、`ruleset_version` は `1.0.1` に更新し、runtime metadata と result の識別子を同じ定義から参照する。製品版 `0.2.0`、result/config schema の v1 は維持する。新たに構造変更が必要になった場合は互換性を先に評価する。
- 5件（SR-02/03/04/05/06）は regression / artifact evidence を記録。SR-01 は path-based API と all/output audit が未解決のため未完了。件数や合計だけでなく、読取境界・元 path 対応・診断 identity を確認する。
- M1 全体の完了判定では元の RSC-01/03〜07/13 と実装・受入証拠を照合する。atomic filesystem 境界と output path 安全性等の残件を含め、未達を黙って削除して完了にしない。

実施時は [TODO](../TODO.md)、[元の実装計画](implementation-plan.md)、[開発記録](development.md) を更新する。GitHub 操作、tag push、公開、commit は今回の作業依頼には含まれていないため行わない。
