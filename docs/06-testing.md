# JobHunt Testing

JobHuntのテストが何を守っているか、どう実行するか、どこに限界があるかを説明します。
件数は 2026年10月時点のものです。

## 1. 方針

- **壊れると困るものから守る**: URL取込のSSRF対策、ユーザー間のデータ分離、APIの入力検証と返却形式、主要な画面操作(登録・ステータス変更・メモ・並び順・デモ)を重点的にテストしています。
- **外部に依存しない**: テストは実際のDB・DNS・外部サイトに接続しません。DBはメモリ上のSQLite、DNSとHTTPは偽物に差し替えます。
- **ローカルとCIで同じコマンド**: 開発中に実行するコマンドを、GitHub Actionsでもそのまま実行します。

## 2. 全体像

| 対象 | フレームワーク | 件数 | 実行環境 |
|---|---|---|---|
| Frontend | Vitest 4 + Testing Library(React) | 289件 / 16ファイル | jsdom(ブラウザを模したNode.js上の環境) |
| Backend | PHPUnit 12 | 420件(Feature 228件 / Unit 192件) | Laravelのテスト環境 + メモリ上のSQLite |
| 型 | TypeScript(`tsc --noEmit`) | — | — |
| ビルド | Vite(`npm run build`) | — | — |

件数は、PHPUnitのdata providerで展開された組み合わせを含みます。

## 3. 実行方法

```bash
npm run test          # Frontend(Vitest)
npx tsc --noEmit      # 型チェック
npm run build         # 本番ビルド
php artisan test      # Backend(PHPUnit)
```

- Backendのテスト設定は `phpunit.xml` にあり、`DB_CONNECTION=sqlite`・`DB_DATABASE=:memory:` で動きます。`.env` のDB設定や本番のDBは使いません。
- 一部のテスト(SPAのHTMLを返す `/app`)は、ビルド済みのフロントエンド(`public/build/manifest.json`)を読み込みます。クリーンな環境では、先に `npm run build` が必要です。
- 判定は、出力の要約ではなく**終了コード**で行います。PHPUnitは警告があると、テストがすべて通っていても終了コードが1になります(CIでの失敗はこれで分かります)。

## 4. Backend(PHPUnit)

### テストの土台

| 仕組み | 役割 |
|---|---|
| `RefreshDatabase` | テストごとに、メモリ上のSQLiteにmigrationを適用した状態から始める |
| `tests/Feature/AuthenticatedApiTestCase.php` | ログイン済みのユーザーを用意し、そのユーザーの案件を作る補助メソッドを持つ |
| `tests/Support/FakeHostResolver.php` | DNSの代わりに、指定したホスト名とIPの対応表を返す |
| `Http::fake()` | 外部サイトへのHTTPを差し替え、送られたURLを検査する(`Http::assertSent`) |

### 何をテストしているか

| 領域 | 主なテストクラス | 件数 | 主な確認内容 |
|---|---|---|---|
| URL取込とSSRF対策 | `UrlImportPreviewApiTest`、`UrlSafetyValidatorTest`、`SafeHtmlFetcherTest`、`PinnedConnectionOptionsTest`、`UrlImportTimeoutTest` | 167 | 非公開IPの拒否、DNSの解決結果、リダイレクトごとの再検証、接続先の固定、送信URLのホスト名、時間・サイズ・Content-Typeの上限、エラーの分類 |
| 求人ページの解析 | `GenericHtmlExtractorTest`、`CrowdWorksExtractorTest`、`RewardTextExtractorTest`、`SideJobAllowedExtractorTest`、`TextNormalizerTest`、`ManualEntryUrlDetectorTest` | 97 | JSON-LD・OGPの読み取り、報酬の表記、副業可否の判定、装飾の除去、ログインが必要なURLの判定 |
| ユーザー間のデータ分離 | `ProjectOwnershipApiTest` | 22 | 他人の案件は404、未ログインは401、所有者を書き換えられない |
| 案件API | `ProjectApiTest`、`ProjectTypeAwareApiTest`、`SideJobAllowedApiTest`、`ImportPreviewDuplicateTest` | 50 | 登録・更新・検索、種別ごとのステータス検証、旧ステータス名の読み替え、重複URLの検出 |
| ゴミ箱 | `ProjectTrashApiTest` | 21 | 一覧・復元・完全削除、409・404 |
| ステータス履歴 | `ProjectStatusHistoryTest` | 17 | 作成・変更時の記録、同じ値では記録しない、Eloquentを経由しない更新は記録されないこと |
| 認証・アクセス制御 | `AuthApiTest`、`EnsureCrmAccessTest` | 22 | 登録・ログイン・ログアウト、失敗時の文言、Basic認証が `config:cache` 後も無効にならないこと |
| スキーマ・migration | `ProjectSchemaMigrationTest`、`ProjectIndexSchemaTest` | 16 | 既定値、旧ステータス名のデータ移行の up / down、索引の追加と削除 |
| 公開LP・その他 | `LandingPageTest`、`ExampleTest` | 8 | `/` が公開LP、`/app` がSPAのHTMLを返すこと、LP(`/` への GET・HEAD)だけBasic認証の対象外で `/app` とAPIは保護されること |

URL取込のSSRF対策で何を防いでいるかは、[05-url-import-security.md](05-url-import-security.md) にまとめています。

## 5. Frontend(Vitest + Testing Library)

### テストの書き方

- 画面は jsdom 上で描画し、ボタンのラベルや役割(`getByRole`)など、**利用者に見えるもの**で要素を探して操作します。
- APIは `vi.stubGlobal('fetch', ...)` で差し替え、送られたリクエスト(メソッド・URL・本文)と、応答に対する画面の変化を確認します。
- 締切の色分けなど日付に依存するものは、`vi.useFakeTimers()` で日付を固定します。
- jsdomはCSSを適用しないため、レスポンシブやタップ領域は、付与しているクラス(例: `min-h-11`)と要素の構造で確認しています。

### 何をテストしているか

| ファイル | 件数 | 主な確認内容 |
|---|---|---|
| `AppRoot.test.tsx` | 41 | 画面全体の流れ: ログイン状態、0件時の案内、デモ、検索・絞り込み、並び順、ステータスの直接変更(成功・失敗)、URL取込や手入力での登録(初期ステータス「応募済み」)、活動メモの保存と再表示 |
| `ProjectModal.test.tsx` | 48 | 登録・編集フォーム: 入力検証の表示、種別ごとの項目、ステータスの初期値、活動メモ欄、スマートフォン向けの表示 |
| `ProjectDetailPanel.test.tsx` | 39 | 詳細表示: 表示する項目、ステータスの選択肢と保存中の表示、活動メモの追加・編集ボタン、ゴミ箱・デモでは操作を出さないこと |
| `ProjectCard.test.tsx` | 35 | 一覧の行: 表示する項目、PCとスマートフォンでの並び、ステータスの表示、締切の色分け |
| `UrlImportModal.test.tsx` | 22 | URL取込: 取込結果のフォームへの受け渡し、失敗時の案内、手入力への切り替え、多重送信の防止、時間切れ |
| `AuthScreen.test.tsx`、`TrashView.test.tsx` | 15 | ログイン・登録画面、ゴミ箱の操作 |
| `utils/`・`constants/`・`api/` の各テスト | 89 | 並び順の規則、報酬・媒体・雇用形態の表示、フォームとの変換、デモ用データ、ステータスのグループ、`apiFetch` の時間切れ |

## 6. CI

`.github/workflows/ci.yml` で、mainへのpushとpull requestごとに実行します。GitHub Secretsは使いません。

| ジョブ | 実行内容 |
|---|---|
| Frontend | `npm ci` → `npm run test` → `npx tsc --noEmit` → `npm run build`(Node 24) |
| Backend | PHP 8.4 → `npm ci` と `npm run build` → `composer install` → `.env` の用意と鍵の生成(テスト専用の使い捨て) → `php artisan test` |

## 7. CIの導入で見つかった環境差

CIを初めて実行したとき、ローカルでは通っていたテストが2か所で失敗しました(commit `0c05c99` で修正)。

| 失敗 | 原因 | 対応 |
|---|---|---|
| Frontendのテストが起動しない | VitestはVite設定を開発サーバーと同じモードで読み込む。laravel-vite-pluginの「CI環境で開発サーバーを起動しない」検査が、GitHubが設定する `CI` 環境変数に反応していた | テスト実行中(`VITEST`)だけ laravel-vite-plugin を読み込まないようにした。本番ビルドと開発サーバーの検査はそのまま |
| BackendのPHPUnitが失敗 | テストメソッドの引数(2つ)より、data providerの値(3つ)が多く、PHPUnitが警告を出していた。ローカルでは要約表示のため警告に気づいていなかった | テスト専用のdata providerに分けた。以後は終了コードで判定している |

また、SPAのHTMLを返すテストがビルド済みのフロントエンドを必要とすることも、クリーンな環境で確かめて分かったため、CIのBackendジョブでも先にビルドするようにしています。

## 8. 現状の限界

- **実際のブラウザでのテストは無い**: E2Eテスト(Playwrightなど)や見た目の差分テストは無く、レスポンシブはクラスと構造でしか確認していません。375pxなどの実際の表示は、実画面での手動確認に頼っています。
- **cURLの実際の接続の動き**: SSRF対策のうち、cURLが接続先の固定をどう扱うかは単体テストでは再現できません。送信URLのホスト名が固定したホスト名と一致することをテストで保証し、cURLの挙動そのものはローカルでの実測で確認しました。
- **カバレッジは測っていない**: CIでもカバレッジは計測していません(`coverage: none`)。
- **静的解析・コード整形はCIに入っていない**: ESLint・PHPStanは導入しておらず、Laravel Pint はインストールされていますがCIでは実行していません。
