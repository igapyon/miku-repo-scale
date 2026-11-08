---
title: miku-repo-scale Node.js 初期版の実装計画
status: in-progress
created: 2026-11-05
updated: 2026-11-06
---

# miku-repo-scale：Node.js 初期版の実装計画

## 1. 対象と到達点

[初期設計](design.md)を実装可能な作業単位へ分解する。M1 完了判定は自己レビューで再開し、atomic filesystem 境界と `--inventory all` / `--output` path race audit が残る。RSC-02 選定、RSC-08 共通字句行分類、RSC-09〜12 の言語別 lexer、RSC-13 artifact parity はローカルで確認済み。companion repository の RSC-14 と RSC-15a-b も Node.js 22/26 でテストし、installable bundle と local ZIP を確認した。次は hosted RSC-15c matrix と RSC-15d conversation/release review。M1 acceptance は SR-01 と製品側の全体受入が終わるまで保留する。現在利用できるコマンドと成果物は [development.md](development.md) に記載する。

初期版は JavaScript ESM と Node.js に実装を集約する。対象 repository の Git tracked files の現在の内容を読み、形式・役割・用途を分類し、規模と計測範囲を JSON で返す。スキルは固定した同梱 CLI を呼び、結果を説明する。

リポジトリ全体の規模を中心に、全体の集計とソースコード等の部分集合を返す。優先する拡張子は `.txt`、`.html`、`.json`、`.jsonl`、`.md`、`.mjs`、`.yml`、`.yaml`、`.js`、`.ts`、`.py`。TXT / HTML / JSON / JSONL / Markdown / YAML と、未知の拡張子・拡張子なしの読取可能なテキストを M1 の基本計測対象とする。Java / JavaScript / TypeScript / Python / Shell にはコード・コメント行の字句分類を追加する。

| 到達点 | 完了する作業 | 利用できること | 関連 Issue |
| --- | --- | --- | --- |
| M1：基本計測 | RSC-00〜01、03〜07 | TXT・HTML・JSON・JSONL・Markdown・YAML 等のファイル数・bytes・物理行数、全体と指示・実装・定義・文書・データの内訳を CLI で取得 | #319 |
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
  schemas/{result-v1,config-v1}.schema.json
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
| RSC-01 | データ契約と手計算 fixture を固定 | APP `schemas/*-v1.schema.json`、`src/contracts.mjs`、tests | 00 |
| RSC-02 | 字句解析方式の実証と選定 | APP `docs/language-support.md`、`tests/fixtures/lexers/*`、採用依存 | 01 |
| RSC-03 | Git inventory を取得 | APP `src/git-inventory.mjs` | 01 |
| RSC-04 | ファイル読取・decode・物理行数 | APP `src/analyze.mjs`、`src/physical-lines.mjs` | 01、03 |
| RSC-05 | config・形式・role・category を分類 | APP `src/classification.mjs` | 01、04 |
| RSC-06 | 基本計測を集計して core を接続 | APP `src/analyze.mjs`、`src/contracts.mjs` | 03〜05 |
| RSC-07 | CLI・終了状態・保存を完成 | APP `src/cli.mjs`、`src/analyze.mjs` | 06 |
| RSC-08 | 字句解析と元の物理行の共通接続 | APP `src/lexers/index.mjs`、`src/metrics/lexical-lines.mjs` | 02、06 |
| RSC-09 | JavaScript / TypeScript / JSX / TSX | APP `src/lexers/index.mjs`、`tests/lexical-parsers.test.mjs` | 08 |
| RSC-10 | Python | APP `src/lexers/index.mjs`、`tests/python.test.mjs` | 08 |
| RSC-11 | Java | APP `src/lexers/index.mjs`、`src/lexers/java-unicode.mjs` | 08 |
| RSC-12 | Shell と dialect | APP `src/lexers/index.mjs`、`src/lexers/shell-source.mjs`、`tests/shell.test.mjs` | 08 |
| RSC-13 | 製品 runtime / core / source を build | APP `scripts/*`、`dist/*`、artifact tests | 07（lexer parity は08〜12後） |
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
3. decode 成功かつ基本計測に正式対応する TXT / HTML / JSON / JSONL / Markdown / YAML および未知形式のテキストの `comment_analysis` は `not_requested`、計画したプログラム言語で未実装・構文未対応なら `unsupported` とする。schema は未計測値を0へ変換しない。
4. JSON Schema の意味的制約を補う小さな invariant checker を用意する。型定義と実行時の同じルールを別々の手書き一覧へ増殖させない。
5. fixture の入力 bytes と手計算の行数・分類結果を固定する。実装の出力から期待値を自動生成して正解扱いしない。

**検証：** 0行 / null の区別、行数等式、未知の config key、集計型の不正な組合せを検出できる。

**完了条件：** 後続実装が依存する schema と用語が揃い、各受入ケースの観測可能な期待値が存在する。

**現状（2026-11-06）：** schema は Ajv 2020-12 で result/config を実検証する。path identity と diagnostic regression は追加済み。RSC-01 の M1 完了判定は SR-01 と全体再受入を待つ。

### RSC-02：字句解析の可否を先に確認

**完了（2026-11-06）：** SR-01 の atomic filesystem 懸念は未解決のまま計画文書に記録し、独立作業 RSC-02 を先行した。M1 の完了・security acceptance を意味しない。

採用方式、対応 dialect、正確な依存版・license・source、source mapping、代表 fixture、単体 `.mjs` bundle のサイズと実行結果は [language-support.md](language-support.md) に記録した。Java Unicode escape source map と完全な JLS eligibility algorithm は RSC-11 で実装済み。Zsh は明示的に未対応とし、Bash grammar で解析した結果を Zsh の成功として扱わない。

**完了条件：** RSC-09〜12で使う方式が言語ごとに決まり、難しい代表構文を実際に解釈できる証拠がある。検討した方式が不適合なら方式を変更する。対応言語を黙って減らして完了にしない。

### RSC-03：Git の追跡対象一覧

1. 作業ツリールートの解決、Git 不在・bare・非 repository・明示サブディレクトリの診断を実装する。
2. `ls-files --cached --stage -z` をバイト列で読み、通常ファイル・symlink・gitlink・unmerged を分類する。複数 stage を同じファイルとして重複加算しない。
3. 相対 path の `/` 正規化、固定順序、不正 UTF-8 path の診断と元 bytes の保持を実装する。
4. 集計前後の一覧を比較するための inventory 表現を返す。追跡対象の取得で network や GitHub にアクセスしない。
5. バイナリを含む通常ファイルの name / extension / size_bytes と、追跡状態、ignore 判定と規則の根拠を独立に記録する。tracked でも ignore 規則は評価する。
6. `--inventory all` では未追跡・ignored ファイルの metadata を別集合として収集する。内容解析・tracked coverage へ混ぜず、`.git` とリンク先を走査しない。

**検証：** `tests/analysis.test.mjs`。一時 Git repository に tracked / untracked / ignored を作る。空白・タブ・改行入り path は byte parser で確認し、unmerged stage の重複も単体 fixture で確認する。
バイナリの画像・archive、強制追加した ignored file、入れ子の .gitignore、否定規則、info/exclude、global exclude の各根拠も検証する。

**完了条件：** 全 entry の種別と件数が一致し、対象の index / worktree を変更しない。

### RSC-04：読取・文字コード・物理行

1. index の mode と実 filesystem の種類を照合し、リンク・親のリンク化・ルート外への解決を扱う。読取不能・欠損を構造化診断にする。
2. 16 MiB の既定上限を読取前と途中に適用する。binary signature、BOM、NUL、encoding の優先順を設計どおりに実装する。
3. UTF-8 / UTF-16LE / UTF-16BE を厳密 decode し、失敗・BOM 不一致を区別する。置換 decode や推測変換を使わない。
4. 元 bytes、BOM 除去後の text、物理行ごとの元 text offset、総行数・空白・非空白行数を返す。CRLF/LF/CR と末尾改行を仕様どおりに数える。
5. 読取前後の情報を照合し、変更を検出したファイルは完全成功にしない。
6. 形式 registry の登録に依存せず、厳密 decode できる対象ファイルへ基本計測を適用する。JSON/JSONL/HTML の構文解析を計測の前提にせず、JSONL の record 件数や HTML の DOM 要素数へ換算しない。

**検証：** `tests/analysis.test.mjs`。空・改行各種・UTF-16 BOM・不正 encoding・PNG binary・size limit を手計算 fixture で検証する。
TXT、HTML 内の script/style、空行や不正 record を含む JSONL、未知拡張子、拡張子なしのテキストでも物理行の定義を共通に検証する。

**完了条件：** 読取済み bytes と `observed_bytes` を区別し、測れない値は null。物理行の mapping を後続 lexer へ渡せる。

**現状（2026-11-06）：** UTF-16 code-unit の physical line offset helper と手計算 regression を追加。読取境界 adapter と3時点の symlink race 注入も確認したが、portable path-based `lstat` / `open` で全競合順序を原子的に閉じる証明はできていないため、RSC-04 は未完了。

### RSC-05：config と3軸の分類

1. 明示 JSON config を読み、ordered rules の各属性で最初の指定値を採用する。category / role / language / encoding の未知値を拒否する。
2. glob の `*` / `**` / `?` と include 和集合・exclude 優先を実装する。`**` が0階層にも一致することを確認する。
3. language と extension を識別する。TypeScript の `.ts` / `.mts` / `.cts` / `.tsx` と、TXT / HTML / JSON / JSONL / Markdown / YAML を初期 registry に含める。未知の形式も拡張子を保持し、基本計測へ渡す。
4. `role` を決めてから `category` を決め、各理由を返す。`SKILL.md` / `AGENTS.md` は instruction/source、指定した JSON 定義は definition/source とする。
5. test / generated の優先順、Shell の既知 basename・shebang・dialect、JSON のデータと定義の明示指定を接続する。

**検証：** `tests/analysis.test.mjs`。README/Markdown 指示、JSONL、実装、ignored 設定を並べ、各軸・ordered rules・`**/` glob・未知 key の結果を確認する。

**完了条件：** 拡張子だけで全 Markdown を文書、全 JSON を定義に決めず、明示規則による修正と同一入力の固定結果が成立する。

**現状（2026-11-06）：** 明示 Shell dialect、`.bashrc` 等の basename、direct/env shebang、unsupported form と dialect mismatch の分類・診断を回帰確認済み。

### RSC-06：基本集計と core の接続

1. inventory → include/exclude → 読取 → 分類 → metrics → aggregate を `analyze()` へ接続する。
2. summary、category / language / extension / role、source composition の集計を実装する。異なる軸同士を合算しない。
3. inventory、bytes / text / lexical の coverage、診断件数を照合する。字句解析器未接続のプログラムでは basic metrics と `unsupported` を返す。
4. serializer のキー順・配列順・indent・終端 LF を固定し、絶対 path・時刻・所要時間・OS の生エラー文言を除く。
5. `detail: summary` の投影でファイル配列だけを省き、他の集計・診断を維持する。

**検証：** `tests/analysis.test.mjs`。TXT/HTML/JSON/JSONL/Markdown、未知拡張子・拡張子なしのテキスト、バイナリの混在 repository を使い、軸別集計・source subset・同一入力の JSON byte 一致を確認する。

**完了条件：** import API から基本計測を取得でき、各軸の合計と coverage が一致。コード行数未計測のファイルを0行で埋めない。

### RSC-07：CLI と保存

1. `analyze [root]`、`--include`、`--exclude`、`--config`、`--encoding`、`--max-file-bytes`、`--detail`、`--output`、help / version を実装する。
2. 通常 stdout を1個の result JSON に固定する。help / version は別契約とし、対象 repository がなくても動かす。
3. exit 0 / 2 / 1 と `ok` / `partial` / `error` を結び付ける。捕捉可能な失敗は envelope を返し、runtime 自体の失敗は stderr と process 終了で識別する。
4. 計測後の `--output` は新規作成で保存する。既存 path、Git 管理領域、収集済み tracked path を拒否する。stdout と保存 bytes を一致させ、保存失敗は error とする。

**検証：** `tests/artifacts.test.mjs`。実子 process で help/version、ok/partial/error の exit と JSON、保存 bytes の一致、既存・tracked・Git 管理領域への保存拒否を確認する。

**完了条件：** M1。Node.js + Git で基本集計の一連の操作が動作する。TXT / HTML / JSON / JSONL / Markdown / YAML と未知形式の読取可能なテキストの基本計測を未対応 warning にしない。

### RSC-08：字句解析から物理行へ接続

**完了（2026-11-06）：** `src/lexical-lines.mjs` に UTF-16 half-open comment range の共通 classifier を実装。物理空白行を優先し、範囲外・空・重複 span を拒否する。`aggregateResults()` は lexical subset を総計と各分類軸へ集計し、schema と runtime invariants で小計の等式を確認する。`tests/lexical-lines.test.mjs` を追加し、full `npm test` が31件成功した。各言語 parser との接続と invalid parse 時の状態遷移は RSC-09〜12 に残る。

1. lexer の共通返却型を「利用可能な comment 範囲と元 text への mapping、または unsupported / error」とする。offset の単位は Node.js の string と揃えた UTF-16 code unit で固定する。
2. RSC-04 の物理行表に comment 範囲を重ね、blank / comment only / code / mixed / with comments を数える。複数行 comment の内部の物理的空白行は blank を優先する。
3. Java 等で text を前処理した場合は元 text へ範囲を戻す。前処理後の改行数をそのまま元ファイルの行数として使わない。
4. 途中の字句結果が失敗したら、そのファイル全体の code/comment 値を null に戻す。物理行数と bytes は保持する。
5. aggregate の `classified_lines` を同じ集合の小計として接続する。

**検証：** `tests/lexical-lines.test.mjs`。短い手指定 comment 範囲と元 text を使い、行の分類と等式を確認する。実言語の tokenizer は後続作業で検証する。

**完了条件：** 全言語が同じ行数・失敗・coverage の意味を共有し、重なった comment 範囲や不正 offset を成功扱いしない。

### RSC-09：JavaScript と TypeScript

**完了（2026-11-06）：** pinned Tree-sitter JavaScript、TypeScript、TSX grammars を共通 lexer と `analyze()` へ接続した。`.js` / `.mjs` / `.cjs` / `.jsx` と `.ts` / `.mts` / `.cts` / `.d.ts` / `.tsx` の実入力、regex、文字列、template 埋込式、JSX、TSX、宣言形式、壊れた構文、shebang を `tests/lexical-parsers.test.mjs` で確認する。standalone CLI/runtime は parser と grammar を埋め込む。構文エラーでは basic metrics を保持し、lexical 値を null にして `LEXICAL_ERROR` warning を返す。ruleset version は `1.1.0`。

1. RSC-02 の方式を language registry と共通 lexer に接続する。JS/TS の構文モードと JSX/TSX の切替を拡張子から固定する。
2. string、template・式補間、regex と division、行末・block comment、JSX text と埋込式、TS の型表現を処理する。
3. `.ts` / `.mts` / `.cts` / `.tsx` を同じ language 集計と個別 extension 集計へ接続する。`.d.ts` も実装形式として扱い、手書き・生成物の区分は path/config に従う。

**検証：** focused parser tests と全体 suite で、comment 記号を含む regex/string、template、JSX の文字列と comment、TSX と generic、型宣言、壊れた構文を固定する。ファイル別と集計の両方、配布 bundle の隔離実行を確認する。

**完了条件：** JS/TS/JSX/TSX の要求構文を Node.js だけで分類でき、未対応構文は null と診断になる。

### RSC-10：Python

**完了（2026-11-06）：** pinned Python grammar を共通 lexer と `analyze()` に接続した。PEP 701 f-string expression comments、同じ quote の f-string expression、triple/docstring・raw・bytes string、shebang、`# type: ignore`、CRLF、壊れた構文を `tests/python.test.mjs` で確認する。shebang は code、docstring と文字列本文も code、構文上の comment は commentとして分類する。構文エラーは basic metrics と `LEXICAL_ERROR` warning に fallback する。ruleset version は `1.2.0`。

1. quote / triple quote、raw / bytes / f-string と式補間、`#` comment を扱う。
2. docstring と複数行 literal は code、shebang は code、comment 構文上の directive は comment とする。
3. Python 本体を実行せず、固定した文法版の能力と未対応時の返却を確認する。

**検証：** `tests/python.test.mjs`。string 中の `#`、triple quote、raw/f-string、埋込式中の comment、docstring、壊れた入力、CRLF を含める。

**完了条件：** 文字列・指示・comment の取り違えがなく、物理行への mapping と集計が一致する。

### RSC-11：Java

**完了（2026-11-06）：** pinned Java grammar を共通 lexer と `analyze()` に接続。JLS §3.3 の eligible backslash 判定、1個以上の `u`、4桁 hex、変換文字を再走査しない規則を実装し、変換後 UTF-16 range を元 source へ戻す。text block・string・char、Unicode escape が生成する block / line comment と改行、CRLF raw line、malformed escape、syntax error を `tests/java.test.mjs` で確認。変換後改行を元の物理行数へ加えない。構文・変換エラーは basic metrics と `LEXICAL_ERROR` warning へ fallback する。ruleset version は `1.3.0`。

1. string / char / text block、行・block comment を扱う。
2. Unicode escape の変換結果から comment を認識し、元の物理行へ mapping する。変換で生じる行終端も前処理として扱う。
3. 未完了文字列・未完了 comment・文法対応外を共通の失敗契約へ接続する。

**検証：** `tests/java.test.mjs`。文字列中の comment 記号、char escape、text block、Unicode escape が作る comment/改行、comment 終了後の code を固定する。

**完了条件：** raw source の物理行数と変換後の字句解釈を混同しない。

### RSC-12：Shell

1. `.sh` / `.bash` / `.zsh`、既知 basename、shebang、明示 dialect の優先規則を接続する。対応は [language-support.md](language-support.md) の範囲に従い、Zsh は unsupported 診断とする。
2. token 境界の `#` と `word#text`、quote、escape、`${x#prefix}`、command substitution、heredoc を区別する。
3. quoted delimiter、`<<-`、複数 heredoc、入れ子の式を、RSC-02 で固定した各 dialect の対応範囲で扱う。heredoc の本文は code とする。

**完了（2026-11-06）：** pinned Bash grammar を `sh` / Bash dialect と共通 lexer に接続した。token境界の `#`、word中の `#`、quote、`${x#prefix}`、command substitution、quoted / unquoted heredoc、`<<-`、複数 heredoc、CRLF source mapping、shebang、dialect conflict、Zsh unsupported、壊れた構文を `tests/shell.test.mjs` で確認する。`sh` は Bash grammar が受け付ける共通構文を計測し、`[[ ]]`、array、arithmetic command、C-style `for`、process substitution、here-string、coproc、ANSI-C quote、`function` keyword などASTで識別できる明白な Bash-only 構文では unsupported にする。Shell source は実行しない。CLI/runtime artifact smoke に Bash と POSIX `sh` の入力を追加し、ruleset version は `1.4.0` に更新した。Product version は `0.2.1` のまま。

**完了条件：** M2。RSC-09〜12の各 fixture、全体 aggregate、unknown / unsupported / lexical error の coverage が整合する。

### RSC-13：Main Application の配布 artifact

2026-11-06追記：M1 core 接続後に source/dist/standalone CLI の正常・partial・error 結果 parity、runtime API、隔離 smoke を確認した。自己レビュー後、trigger を `release: published` から `push.tags: ["v*"]` へ修正した。修正 bytes は Node.js 26.12.1 / 22.23.4 で全25件と release smoke を確認し、workflow は actionlint 1.7.12 を通過した。GitHub tag push と hosted run は未実施。

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

**実績（2026-11-07）：** RSC-14a-d は companion の runtime manifest/resolver、CLI adapter、instructions/references、license-aware bundle tests で完了。実 CLI を含む bundle を生成した。

### RSC-15：隔離実行と最終受入

1. bundle を一時ディレクトリへ展開し、元の APP / SKILL source に依存せず `--version`、help、代表 analyze を実行する。
2. Agent を模した混在 repository を使い、`SKILL.md`、`AGENTS.md`、prompt `.md`、`.mjs/.js/.ts/.py`、TXT/HTML 文書、JSON 定義・JSONL 評価データ、YAML workflow、README、test、generated、バイナリの内訳と全体を手計算結果と照合する。
3. CLI と bundle の全体 suite を実行する。Node.js 最低版と採用 build 版、macOS / Windows / Linux の CI を構成し、実行結果を記録する。改行 fixture は明示 bytes から生成する。
4. symlink・権限・特殊 path の OS 固有ケースは実環境と byte parser / adapter 注入を使い分ける。未実行の環境・skip を全環境成功とまとめない。
5. スキルの会話確認は、通常の計測、指示ソース規模、JSON/TSを含む内訳、partial、runtime不在、単なる名前言及のケースを用いる。対話確認は静的な文言一致テストと区別して記録する。
6. 両製品の README と実施記録へ、実際の対応版・利用コマンド・受入結果・制約を記載する。この計画の作業IDと root TODO は実施したものだけ完了へ更新する。

**完了条件：** M3。独立した配布物から Node.js + Git だけで計測でき、JSON / TypeScript を含む初期対象と指示ソースの規模を正しく説明できる。未確認事項は具体的に残す。

**実績（2026-11-07）：** RSC-15a-b の isolated runtime smoke と metric acceptance は Node.js 22/26 で通過。RSC-15c hosted OS/Node matrix と RSC-15d conversation/release review は未完了。

## 5. 検証コマンドと記録の扱い

計画時の標準コマンドは次の通り。現在の実行結果は [development.md](development.md) と companion の開発記録に記す。

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

## 6. 次に実装へ渡す単位

**次は companion の RSC-15c hosted matrix と RSC-15d release-readiness を進める。** RSC-14 と RSC-15a-b は実装済みだが、GitHub Actions の結果はまだない。SR-01 は unresolved concern として[対応計画](self-review-remediation-plan.md)に残し、製品 M1 acceptance は保留する。M1 完了前に `--inventory all` / `--output` の安全境界も再検討する。

この順序により、TXT/HTML/JSON/JSONL/Markdown/YAML とその他のテキストの基本計測、TypeScript の形式識別、指示ソースの分類を初期の成果に含めつつ、後続のコード・コメント解析と配布に同じ契約を使える。

## 7. 初期配置の実績と次の作業（2026-11-05）

- APP: `/Users/igapyon/Documents/git/miku-repo-scale`、branch `devel-tiga1105wch`。
- SKILL: `/Users/igapyon/Documents/git/miku-repo-scale-skills`、branch `devel-tiga1105wcg`。
- README、package metadata、repository 規約、設計・作業計画・参照記録を配置した。
- RSC-00〜01、03〜07 の M1 と RSC-13 の基本 artifact parity を実装した。現行コマンド・検証は [development.md](development.md) に記録。
- 自己レビュー後、SR-01 は未解決事項として維持したまま RSC-02 の方式選定と RSC-08 共通 classifier を実装した。その後 RSC-09 で JavaScript/TypeScript、RSC-10 で Python、RSC-11 で Java grammar を接続した。
- RSC-14〜15 の skill 固有作業は companion の [計画](https://github.com/igapyon/miku-repo-scale-skills/blob/devel/docs/implementation-plan.md)が担当する。ローカル作業中は sibling の同名ファイルを読む。
- product build/test/CI と配布 artifact の成功は、初期ファイル配置の成功と分けて記録する。
