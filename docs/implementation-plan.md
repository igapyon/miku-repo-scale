---
title: miku-repo-scale Node.js 初期版の実装計画
status: planned
created: 2026-11-05
updated: 2026-11-05
---

# miku-repo-scale：Node.js 初期版の実装計画

## 1. 対象と到達点

[初期設計](design.md)を実装可能な作業単位へ分解する。状態は計画作成済み、製品実装は未着手。以下の製品ファイル、コマンド、成果物名は実装予定である。

初期版は JavaScript ESM と Node.js に実装を集約する。対象 repository の Git tracked files の現在の内容を読み、形式・役割・用途を分類し、規模と計測範囲を JSON で返す。スキルは固定した同梱 CLI を呼び、結果を説明する。

優先する拡張子は `.md`、`.mjs`、`.json`、`.yml`、`.yaml`、`.js`、`.ts`、`.py`。Markdown / JSON / YAML は初期版から基本計測の正式対応形式とする。Java / JavaScript / TypeScript / Python / Shell にはコード・コメント行の字句分類を実装する。

| 到達点 | 完了する作業 | 利用できること | 関連 Issue |
| --- | --- | --- | --- |
| M1：基本計測 | RSC-00〜01、03〜07 | Markdown・JSON・YAML 等のファイル数・bytes・物理行数、指示・実装・定義の内訳を CLI で取得 | #319 |
| M2：言語別計測 | RSC-02、08〜12 | 5言語群の対応構文を含むコード・コメント行分類、未対応時の診断 | #321 |
| M3：配布可能なスキル | RSC-13〜15 | 開発環境から独立した Node.js runtime と installable skill | #322、親 #72 |

M1 は単独で確認できる開発上の到達点とする。コード・コメント解析を未実装のまま、M2 や初期版全体の完了とは記録しない。

## 2. 作業先と構成

次の2つを別の製品ルートとして扱う。実装開始時に実際のローカル作業先と upstream の有無を確認し、RSC-00 に記録する。APP は `miku-repo-scale`、SKILL は sibling の `miku-repo-scale-skills` として作成・checkout済み。元の計画は `igapyon-agent-skills/docs/plans/` に保存されている。

以下の `APP/` と `SKILL/` は説明用の論理名である。

```text
APP/                                      # miku-repo-scale
  package.json
  package-lock.json                       # 依存を採用する場合
  src/
    cli.mjs
    analyze.mjs
    contracts.mjs
    config.mjs
    glob.mjs
    registry.mjs
    classify.mjs
    aggregate.mjs
    serialize.mjs
    adapters/{git,files,output}.mjs
    metrics/{physical-lines,lexical-lines}.mjs
    lexers/{index,javascript,typescript,python,java,shell}.mjs
  schemas/{result,config}.schema.json
  docs/{cli,metrics,language-support,implementation-record}.md
  scripts/{build-runtime,check-artifacts}.mjs
  tests/
    *.test.mjs
    helpers/
    fixtures/
  dist/                                   # build 出力

SKILL/                                    # sibling miku-repo-scale-skills
  package.json
  scripts/{prepare-runtime,build-bundle}.mjs
  tests/*.test.mjs
  docs/implementation-record.md
  skills/igapyon-miku-repo-scale/
    SKILL.md
    references/{cli,metrics}.md
    lib/run.mjs
    runtime/
      runtime.json
      miku-repo-scale-<version>.mjs
```

brace 記法は予定ファイルの列挙であり、その名前のディレクトリを作る指示ではない。root の README / LICENSE / CI 設定は、製品の利用・配布に必要な段階で追加する。スキル自身の `index.json` は作らず、必要な reference へ直接案内する。

製品 core は `analyze(options, adapters)` として import できる構成にする。Git・filesystem・出力を adapter へ分け、物理行計測、字句分類、分類規則、集計、serializer は CLI に依存させない。CLI を import しただけで process 終了や stdout 出力が発生しない構造にする。

## 3. 作業一覧と依存関係

| ID | 作業 | 主なファイル（APP / SKILL からの相対 path） | 前提 |
| --- | --- | --- | --- |
| RSC-00 | 作業先・環境・開発の入口を確定 | APP `package.json`、`docs/implementation-record.md` | なし |
| RSC-01 | データ契約と手計算 fixture を固定 | APP `schemas/*`、`src/contracts.mjs`、`tests/fixtures/*` | 00 |
| RSC-02 | 字句解析方式の実証と選定 | APP `docs/language-support.md`、`tests/fixtures/lexers/*`、採用依存 | 01 |
| RSC-03 | Git inventory を取得 | APP `src/adapters/git.mjs` | 01 |
| RSC-04 | ファイル読取・decode・物理行数 | APP `src/adapters/files.mjs`、`src/metrics/physical-lines.mjs` | 01、03 |
| RSC-05 | config・形式・role・category を分類 | APP `src/{config,glob,registry,classify}.mjs` | 01、04 |
| RSC-06 | 基本計測を集計して core を接続 | APP `src/{analyze,aggregate,serialize}.mjs` | 03〜05 |
| RSC-07 | CLI・終了状態・保存を完成 | APP `src/cli.mjs`、`src/adapters/output.mjs` | 06 |
| RSC-08 | 字句解析と元の物理行の共通接続 | APP `src/lexers/index.mjs`、`src/metrics/lexical-lines.mjs` | 02、06 |
| RSC-09 | JavaScript / TypeScript / JSX / TSX | APP `src/lexers/{javascript,typescript}.mjs` | 08 |
| RSC-10 | Python | APP `src/lexers/python.mjs` | 08 |
| RSC-11 | Java | APP `src/lexers/java.mjs` | 08 |
| RSC-12 | Shell と dialect | APP `src/lexers/shell.mjs` | 08 |
| RSC-13 | 製品 runtime / core / source を build | APP `scripts/*`、`dist/*`、artifact tests | 07、09〜12 |
| RSC-14 | 固定 runtime を使うスキルを作成 | SKILL `skills/igapyon-miku-repo-scale/**`、`scripts/*` | 13 |
| RSC-15 | isolated bundle と全体受入を確認 | 両製品の tests / CI / docs、実施記録 | 14 |

推奨順は表の上から下。RSC-02 は難所の可否を早く判断するため RSC-01 の直後に着手する。調査で時間を要しても RSC-03〜07 の基本計測は進められる。言語 scanner は RSC-08 の共通契約を確定してから、1言語群ずつ実装する。

各作業では、入力と期待結果を固定し、実装、対象テスト、差分確認、実施記録までを完了する。全体 suite は統合段階で実行する。毎回、無関係なスキルの full suite を実行する必要はない。

## 4. 作業ごとの実装内容

### RSC-00：作業先と開発の入口

1. 適用される repository 指示と現在の Git 状態を確認し、先行差分を記録する。過去の branch 名や文書の HEAD へ切り替えない。
2. APP / SKILL のローカル作業先、製品名、初期製品版0.1.0、`ruleset_version`、Node.js 最低版22、build に用いる版26を記録する。upstream が未作成ならその事実も記録する。
3. APP に ESM の `package.json` を用意し、`npm test` を Node.js の標準 test runner へ接続する。Node.js 以外の言語処理系を build / test の必須依存にしない。
4. 実施記録には作業ID、変更、実行コマンド、結果、残件を追記する。依存の採用版・ライセンス・source はその採用時に残す。

**完了条件：** 実際の作業先と実行環境が一意で、空の開発基盤を再現できる。stub を「計測成功」の実装として数えない。

### RSC-01：データ契約と期待値

1. result / config の schema を設計書のフィールドへ対応させる。ファイル単位の shape、集計型、coverage、診断型、`detail`、`comment_analysis` を省略せず定義する。
2. `measurement` と `comment_analysis`、`status` と exit code の組合せを表にする。symlink / gitlink / unmerged / 不正 path / 文字コード不一致の扱いと stable diagnostic code もここで固定する。
3. decode 成功かつ基本計測に正式対応する Markdown / JSON / YAML の `comment_analysis` は `not_requested`、計画した言語で未実装・構文未対応なら `unsupported` とする。schema は未計測値を0へ変換しない。
4. JSON Schema の意味的制約を補う小さな invariant checker を用意する。型定義と実行時の同じルールを別々の手書き一覧へ増殖させない。
5. fixture の入力 bytes と手計算の行数・分類結果を固定する。実装の出力から期待値を自動生成して正解扱いしない。

**検証：** 0行 / null の区別、行数等式、未知の config key、集計型の不正な組合せを検出できる。

**完了条件：** 後続実装が依存する schema と用語が揃い、各受入ケースの観測可能な期待値が存在する。

### RSC-02：字句解析の可否を先に確認

1. 各言語で採用する文法版・dialect・対応構文を `docs/language-support.md` に固定する。仕様と依存の能力は実装時点の公式資料で確認する。
2. Node.js 上で利用できる tokenizer の再利用と専用 scanner を比較する。JS/TS/TSX、Python f-string、Java Unicode escape、Shell heredoc / substitution を小さな入力で実証する。
3. 元の文字位置を取得できるか、unsupported / syntax error を検出できるか、単体 CLI へ bundle できるか、実行時に追加のファイルや処理系を必要としないかを確認する。
4. 採用方式、依存の正確な版とライセンス、bundle サイズ、代表入力の結果を記録する。検討用入力は以後の受入 fixture として残し、使い捨て prototype を製品 runtime と混同しない。

**完了条件：** RSC-09〜12で使う方式が言語ごとに決まり、難しい代表構文を実際に解釈できる証拠がある。検討した方式が不適合なら方式を変更する。対応言語を黙って減らして完了にしない。

### RSC-03：Git の追跡対象一覧

1. 作業ツリールートの解決、Git 不在・bare・非 repository・明示サブディレクトリの診断を実装する。
2. `ls-files --cached --stage -z` をバイト列で読み、通常ファイル・symlink・gitlink・unmerged を分類する。複数 stage を同じファイルとして重複加算しない。
3. 相対 path の `/` 正規化、固定順序、不正 UTF-8 path の診断と元 bytes の保持を実装する。
4. 集計前後の一覧を比較するための inventory 表現を返す。追跡対象の取得で network や GitHub にアクセスしない。

**検証：** `tests/git-inventory.test.mjs`。一時 Git repository に tracked / staged new / untracked / ignored / deleted / unmerged / gitlink を作る。空白・タブ・改行入り path は対応 OS の実 fixture と byte parser 単体の両方で確認する。

**完了条件：** 全 entry の種別と件数が一致し、対象の index / worktree を変更しない。

### RSC-04：読取・文字コード・物理行

1. index の mode と実 filesystem の種類を照合し、リンク・親のリンク化・ルート外への解決を扱う。読取不能・欠損を構造化診断にする。
2. 16 MiB の既定上限を読取前と途中に適用する。binary signature、BOM、NUL、encoding の優先順を設計どおりに実装する。
3. UTF-8 / UTF-16LE / UTF-16BE を厳密 decode し、失敗・BOM 不一致を区別する。置換 decode や推測変換を使わない。
4. 元 bytes、BOM 除去後の text、物理行ごとの元 text offset、総行数・空白・非空白行数を返す。CRLF/LF/CR と末尾改行を仕様どおりに数える。
5. 読取前後の情報を照合し、変更を検出したファイルは完全成功にしない。

**検証：** `tests/physical-lines.test.mjs`、`tests/file-reader.test.mjs`。空・BOM のみ・改行各種・不正 encoding・binary・境界サイズを手計算 fixture で検証する。権限エラーや読取中の変更は adapter 境界への失敗注入も使い、OS の権限設定だけに依存させない。

**完了条件：** 読取済み bytes と `observed_bytes` を区別し、測れない値は null。物理行の mapping を後続 lexer へ渡せる。

### RSC-05：config と3軸の分類

1. 明示 JSON config を読み、ordered rules の各属性で最初の指定値を採用する。category / role / language / encoding の未知値を拒否する。
2. glob の `*` / `**` / `?` と include 和集合・exclude 優先を実装する。`**` が0階層にも一致することを確認する。
3. language と extension を識別する。TypeScript の `.ts` / `.mts` / `.cts` / `.tsx` と、Markdown / JSON / YAML を初期 registry に含める。
4. `role` を決めてから `category` を決め、各理由を返す。`SKILL.md` / `AGENTS.md` は instruction/source、指定した JSON 定義は definition/source とする。
5. test / generated の優先順、Shell の既知 basename・shebang・dialect、JSON のデータと定義の明示指定を接続する。

**検証：** `tests/classification.test.mjs`、`tests/config.test.mjs`。README、prompt、JSON tool schema、JSON 評価データ、TS本体、test内のSKILL.md、生成物内の指示を並べ、各軸と理由を確認する。

**完了条件：** 拡張子だけで全 Markdown を文書、全 JSON を定義に決めず、明示規則による修正と同一入力の固定結果が成立する。

### RSC-06：基本集計と core の接続

1. inventory → include/exclude → 読取 → 分類 → metrics → aggregate を `analyze()` へ接続する。
2. summary、category / language / extension / role、source composition の集計を実装する。異なる軸同士を合算しない。
3. inventory、bytes / text / lexical の coverage、診断件数を照合する。字句解析器未接続のプログラムでは basic metrics と `unsupported` を返す。
4. serializer のキー順・配列順・indent・終端 LF を固定し、絶対 path・時刻・所要時間・OS の生エラー文言を除く。
5. `detail: summary` の投影でファイル配列だけを省き、他の集計・診断を維持する。

**検証：** `tests/analyze-basic.test.mjs`、`tests/aggregate.test.mjs`、`tests/determinism.test.mjs`。`.md/.mjs/.json/.yml/.yaml/.js/.ts/.py` の小さな混在 repository を使う。同じ bytes の別 path の作業先、一覧順の変更、繰返し実行で同じ JSON になることを確認する。

**完了条件：** import API から基本計測を取得でき、各軸の合計と coverage が一致。コード行数未計測のファイルを0行で埋めない。

### RSC-07：CLI と保存

1. `analyze [root]`、`--include`、`--exclude`、`--config`、`--encoding`、`--max-file-bytes`、`--detail`、`--output`、help / version を実装する。
2. 通常 stdout を1個の result JSON に固定する。help / version は別契約とし、対象 repository がなくても動かす。
3. exit 0 / 2 / 1 と `ok` / `partial` / `error` を結び付ける。捕捉可能な失敗は envelope を返し、runtime 自体の失敗は stderr と process 終了で識別する。
4. 計測後の `--output` は新規作成で保存する。既存 path、Git 管理領域、収集済み tracked path を拒否する。stdout と保存 bytes を一致させ、保存失敗は error とする。

**検証：** `tests/cli.test.mjs`、`tests/output.test.mjs`。実子 process で引数、stdout/stderr、終了値、空・部分失敗・不正設定、保存成功・重複・書込失敗を確認する。

**完了条件：** M1。Node.js + Git で基本集計の一連の操作が動作する。Markdown / JSON / YAML の基本計測を未対応 warning にしない。

### RSC-08：字句解析から物理行へ接続

1. lexer の共通返却型を「利用可能な comment 範囲と元 text への mapping、または unsupported / error」とする。offset の単位は Node.js の string と揃えた UTF-16 code unit で固定する。
2. RSC-04 の物理行表に comment 範囲を重ね、blank / comment only / code / mixed / with comments を数える。複数行 comment の内部の物理的空白行は blank を優先する。
3. Java 等で text を前処理した場合は元 text へ範囲を戻す。前処理後の改行数をそのまま元ファイルの行数として使わない。
4. 途中の字句結果が失敗したら、そのファイル全体の code/comment 値を null に戻す。物理行数と bytes は保持する。
5. aggregate の `classified_lines` を同じ集合の小計として接続する。

**検証：** `tests/lexical-lines.test.mjs`。短い手指定 comment 範囲と元 text を使い、行の分類と等式を確認する。実言語の tokenizer は後続作業で検証する。

**完了条件：** 全言語が同じ行数・失敗・coverage の意味を共有し、重なった comment 範囲や不正 offset を成功扱いしない。

### RSC-09：JavaScript と TypeScript

1. RSC-02 の方式を language registry と共通 lexer に接続する。JS/TS の構文モードと JSX/TSX の切替を拡張子から固定する。
2. string、template・式補間、regex と division、行末・block comment、JSX text と埋込式、TS の型表現を処理する。
3. `.ts` / `.mts` / `.cts` / `.tsx` を同じ language 集計と個別 extension 集計へ接続する。`.d.ts` も実装形式として扱い、手書き・生成物の区分は path/config に従う。

**検証：** `tests/javascript.test.mjs`、`tests/typescript.test.mjs`。comment 記号を含む regex/string、入れ子 template、JSX の文字列と comment、TSX と generic、型宣言、壊れた構文を固定する。ファイル別と集計の両方を確認する。

**完了条件：** JS/TS/JSX/TSX の要求構文を Node.js だけで分類でき、未対応構文は null と診断になる。

### RSC-10：Python

1. quote / triple quote、raw / bytes / f-string と式補間、`#` comment を扱う。
2. docstring と複数行 literal は code、shebang は code、comment 構文上の directive は comment とする。
3. Python 本体を実行せず、固定した文法版の能力と未対応時の返却を確認する。

**検証：** `tests/python.test.mjs`。string 中の `#`、triple quote、raw/f-string、埋込式中の comment、docstring、壊れた入力、CRLF を含める。

**完了条件：** 文字列・指示・comment の取り違えがなく、物理行への mapping と集計が一致する。

### RSC-11：Java

1. string / char / text block、行・block comment を扱う。
2. Unicode escape の変換結果から comment を認識し、元の物理行へ mapping する。変換で生じる行終端も前処理として扱う。
3. 未完了文字列・未完了 comment・文法対応外を共通の失敗契約へ接続する。

**検証：** `tests/java.test.mjs`。文字列中の comment 記号、char escape、text block、Unicode escape が作る comment/改行、comment 終了後の code を固定する。

**完了条件：** raw source の物理行数と変換後の字句解釈を混同しない。

### RSC-12：Shell

1. `.sh` / `.bash` / `.zsh`、既知 basename、shebang、明示 dialect の優先規則を接続する。
2. token 境界の `#` と `word#text`、quote、escape、`${x#prefix}`、command substitution、heredoc を区別する。
3. quoted delimiter、`<<-`、複数 heredoc、入れ子の式を、RSC-02 で固定した各 dialect の対応範囲で扱う。heredoc の本文は code とする。

**検証：** `tests/shell.test.mjs`。引用あり・なし heredoc、タブ除去、途中の `#`、substitution、shebang矛盾、対応外dialect を含める。shell 自体は実行しない。

**完了条件：** M2。RSC-09〜12の各 fixture、全体 aggregate、unknown / unsupported / lexical error の coverage が整合する。

### RSC-13：Main Application の配布 artifact

1. source CLI と同じ core から単体 CLI `.mjs` と import 用 core bundle を生成する。source archive と必要なライセンスも作成する。
2. runtime 依存を bundle し、利用時の source tree / `node_modules` / ネットワークを不要にする。製品版・ruleset・schema の identity を固定する。
3. `npm run build`、`node scripts/check-artifacts.mjs` を用意する。artifact 検査では CLI を一時ディレクトリへ単独コピーして実行し、core bundle は副作用なく import する。
4. 最低 Node.js 版で、source と artifact の help / version / 正常・partial・error 結果を確認する。source と bundle の同じ fixture の結果は byte 一致を要求する。

**検証：** `tests/artifact.test.mjs`。日本語や空白を含む作業先、読取専用にできる範囲の runtime 配置、依存のない展開先で実行する。

**完了条件：** artifact の version と checksum が確認でき、開発環境に依存せず M1/M2 の計測が再現する。リモート公開の成否とは分けて記録する。

### RSC-14：Agent Skill と installable bundle

1. RSC-13 の正確な version / source revision / artifact / SHA-256 を受領記録に固定する。`prepare-runtime.mjs` は明示指定したローカル artifact を検査して取り込み、通常利用時に download しない。
2. `runtime.json` と小さな `lib/run.mjs` を実装する。manifest の exact basename、存在、digest、version、対応 result schema を検査して同梱 CLI を呼ぶ。ファイル解析を adapter に再実装しない。
3. `SKILL.md` は起動条件・実行・報告・reference の入口を持つ。`references/cli.md` に CLI/診断、`metrics.md` に role と coverage の読み方を置く。
4. summary を既定とし、指示・実装・定義と拡張子の内訳を説明する。部分結果、null、process failure を正しく報告する。runtime 不在・digest/version/schema 不一致で別 runtime を探し回らない。
5. `skills/` rooted の bundle を Node.js の build script で生成し、runtime と必要なライセンス・reference・adapter を含める。開発 docs、tests、`node_modules`、workplace を除く。

**検証：** SKILL 側の `tests/runtime.test.mjs`、`tests/bundle.test.mjs`。同じディレクトリに別versionのartifactがあってもmanifestの1ファイルを選ぶこと、欠損・改変・schema不一致を検出することを確認する。

**完了条件：** installable skill に必要なファイルが揃い、CLI と skill-local adapter の責務境界が維持される。

### RSC-15：隔離実行と最終受入

1. bundle を一時ディレクトリへ展開し、元の APP / SKILL source に依存せず `--version`、help、代表 analyze を実行する。
2. Agent を模した混在 repository を使い、`SKILL.md`、`AGENTS.md`、prompt `.md`、`.mjs/.js/.ts/.py`、JSON 定義・評価データ、YAML workflow、README、test、generated の内訳を手計算結果と照合する。
3. CLI と bundle の全体 suite を実行する。Node.js 最低版と採用 build 版、macOS / Windows / Linux の CI を構成し、実行結果を記録する。改行 fixture は明示 bytes から生成する。
4. symlink・権限・特殊 path の OS 固有ケースは実環境と byte parser / adapter 注入を使い分ける。未実行の環境・skip を全環境成功とまとめない。
5. スキルの会話確認は、通常の計測、指示ソース規模、JSON/TSを含む内訳、partial、runtime不在、単なる名前言及のケースを用いる。対話確認は静的な文言一致テストと区別して記録する。
6. 両製品の README と実施記録へ、実際の対応版・利用コマンド・受入結果・制約を記載する。この計画の作業IDと root TODO は実施したものだけ完了へ更新する。

**完了条件：** M3。独立した配布物から Node.js + Git だけで計測でき、JSON / TypeScript を含む初期対象と指示ソースの規模を正しく説明できる。未確認事項は具体的に残す。

## 5. 検証コマンドと記録の扱い

実装時の標準コマンドは次の入口を用意する。現時点では未作成であり、この計画作業で成功した検証とは扱わない。

| 実行場所 | 予定コマンド | 用途 |
| --- | --- | --- |
| APP | `node --test tests/<対象>.test.mjs` | 各作業のfocused test |
| APP | `npm test` | 実装済み製品の全体 suite |
| APP | `npm run build` | CLI / core / source artifact 生成 |
| APP | `node scripts/check-artifacts.mjs` | 生成物の identity・構成・隔離実行 |
| SKILL | `node scripts/prepare-runtime.mjs --artifact <path> --version <version> --sha256 <digest> --source-revision <revision>` | 受領 artifact の固定・同梱 |
| SKILL | `npm test` | resolver / bundle / isolated smoke |
| SKILL | `npm run build` | installable bundle 生成 |

同じテストで実装を丸ごと mock に置き換えない。Git inventory と CLI は実一時 repository / 子 process を使い、失敗注入は Git / filesystem / process の外部境界に限る。artifact の smoke は配布 artifact 自体を実行する。

時間の絶対値だけで CI を失敗させる性能基準は初期版に加えない。ファイル全件の Git subprocess 起動、同じ入力の繰返し decode 等が入っていないかを確認し、代表的な小規模・多数ファイルの入力で所要時間とメモリを記録する。最適化は具体的な問題が確認できた箇所に絞る。

実装開始時に APP / SKILL の実施記録を作り、各IDの確認結果を保存する。Issue の更新・完了や公開は、実際の操作依頼がある場合に別途処理する。計画ファイルの作成だけで GitHub 上の実装状態を変更しない。

## 6. 最初に実装へ渡す単位

最初の作業は **RSC-00〜01**。作業先、開発入口、result/config schema、null と coverage の意味、手計算 fixture を固める。次に **RSC-02** で lexer の難所を実証しながら **RSC-03〜07** を順に進め、M1 の実計測結果を得る。

この順序により、JSON と Markdown の基本計測、TypeScript の形式識別、指示ソースの分類を初期の成果に含めつつ、後続のコード・コメント解析と配布に同じ契約を使える。

## 7. 初期配置の実績と次の作業（2026-11-05）

- APP: `/Users/igapyon/Documents/git/miku-repo-scale`、branch `devel-tiga1105wch`。
- SKILL: `/Users/igapyon/Documents/git/miku-repo-scale-skills`、branch `devel-tiga1105wcg`。
- README、package metadata、repository 規約、設計・作業計画・参照記録を配置した。
- RSC-00 の初期ファイル配置まで完了。CLI・schema・fixture・テスト実装は未着手。
- 次は RSC-00 の開発コマンド整備と RSC-01。RSC-02 の解析方式実証を続ける。
- RSC-14〜15 の skill 固有作業は companion の [計画](https://github.com/igapyon/miku-repo-scale-skills/blob/devel/docs/implementation-plan.md)が担当する。ローカル作業中は sibling の同名ファイルを読む。
- product build/test/CI と配布 artifact の成功は、初期ファイル配置の成功と分けて記録する。
