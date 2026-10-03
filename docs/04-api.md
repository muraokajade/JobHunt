# JobHunt API

JobHuntのJSON APIの設計と、主要なAPIを説明します。
内容は `routes/api.php`・各Controller・FormRequest・`ProjectResource` と、フロントエンドの呼び出し(`resources/js/api/`)の現在の実装に基づいています。
全体の構成は [02-architecture.md](02-architecture.md)、データの定義は [03-database.md](03-database.md) を参照してください。

## 1. 共通仕様

| 項目 | 内容 |
|---|---|
| ベースパス | `/api`(SPAと同じオリジン) |
| 形式 | リクエスト・レスポンスともJSON(`Content-Type` / `Accept: application/json`) |
| 認証 | セッションCookie(Laravelの `web` ガード)。トークン方式ではない |
| CSRF | 更新系は `X-CSRF-TOKEN` ヘッダー(SPAのHTMLの `<meta name="csrf-token">` の値)、またはブラウザの `Sec-Fetch-Site: same-origin` で検証 |
| 成功時の形 | `{ "data": ... }`。削除系は本文なしの `204` |
| 所有者 | 案件のAPIは、すべてログインユーザー自身の案件だけを対象にする |

フロントエンドはすべて `apiFetch`(`resources/js/api/projects.ts`)から呼び出し、Cookieの送信・CSRFトークン・JSONヘッダーを共通で付けています。

### エラーの形

| ステータス | 本文 | 発生する場面 |
|---|---|---|
| 401 | `{ "message": "Unauthenticated." }` | ログインしていない状態で、認証が必要なAPIを呼んだ |
| 404 | `{ "message": "..." }` | 案件が無い、または他のユーザーの案件(存在を隠すため403ではなく404) |
| 409 | `{ "message": "...", "error_code": "not_trashed" }` | ゴミ箱に入っていない案件を、復元・完全削除しようとした |
| 419 | `{ "message": "CSRF token mismatch." }` | CSRFの検証に失敗した |
| 422 | `{ "message": "...", "errors": { "項目名": ["..."] } }` | 入力検証の失敗(Laravel標準の形) |
| 422 / 502 / 500 | `{ "message": "...", "error_code": "..." }` | URL取込の失敗(6章) |
| 429 | `{ "message": "Too Many Attempts." }` | ログイン・登録の回数制限を超えた |

`api/*` への例外は、`bootstrap/app.php` の設定によりHTMLではなくJSONで返ります。
サイト全体のBasic認証(`APP_ACCESS_PASSWORD` を設定したときだけ有効)で拒否された場合は、APIに届く前に `401` と `WWW-Authenticate` ヘッダーが返ります。

## 2. API一覧

| Method | Path | 用途 | 認証 |
|---|---|---|---|
| POST | `/api/auth/register` | ユーザー登録(そのままログイン) | 不要(1分6回まで) |
| POST | `/api/auth/login` | ログイン | 不要(1分6回まで) |
| GET | `/api/auth/me` | ログイン中のユーザー | 必要 |
| POST | `/api/auth/logout` | ログアウト | 必要 |
| GET | `/api/projects` | 案件の一覧 | 必要 |
| POST | `/api/projects` | 案件の登録 | 必要 |
| PATCH | `/api/projects/{id}` | 案件の更新(部分更新) | 必要 |
| DELETE | `/api/projects/{id}` | ゴミ箱へ移動(論理削除) | 必要 |
| GET | `/api/projects/trash` | ゴミ箱の一覧 | 必要 |
| POST | `/api/projects/{id}/restore` | ゴミ箱から復元 | 必要 |
| DELETE | `/api/projects/{id}/force` | 完全削除 | 必要 |
| POST | `/api/import/preview` | URLから求人情報を読み取る(保存しない) | 必要 |

`PUT /api/projects/{id}` もルートとしては存在しますが、フロントエンドは `PATCH` だけを使っています。

## 3. 認証API

| API | 主なRequest | Response | 主な検証・エラー |
|---|---|---|---|
| `POST /auth/register` | `name`, `email`, `password`, `password_confirmation` | `201` `{ data: { id, name, email } }` | `email` は一意、`password` は8文字以上で確認入力と一致。422 |
| `POST /auth/login` | `email`, `password` | `200` `{ data: { id, name, email } }` | 失敗時は `email` 項目に「メールアドレスまたはパスワードが正しくありません。」(422)。アカウントの有無は区別しない |
| `GET /auth/me` | — | `200` `{ data: { id, name, email } }` | 未ログインは401 |
| `POST /auth/logout` | — | `200` `{ data: null }` | セッションを破棄し、CSRFトークンを作り直す |

- ログインと登録の成功時に、セッションIDを振り直します(セッション固定攻撃の対策)。
- 画面は起動時に `GET /auth/me` を呼び、200ならログイン済み、それ以外ならログイン画面を表示します。

## 4. 案件API

### GET /api/projects

| 項目 | 内容 |
|---|---|
| Query | `type`(`career` / `side_job`)、`keyword`(案件名・会社名・募集内容・メモの部分一致)。APIは `status`・`media` での絞り込みにも対応しているが、画面からは使っていない |
| Response | `200` `{ data: [ProjectResource, ...] }`。ゴミ箱の案件は含まない。登録の新しい順 |
| 検証 | `type` だけを検証(不正な値は422) |

画面側は受け取った配列を「選考の進み具合 → 更新日時」の順に並べ替えて表示します。ページングはありません。

### POST /api/projects

| 項目 | 内容 |
|---|---|
| 主なRequest | `type`, `name`, `status`, `project_url`, `client_name`, `media`, `reward_text`, `deadline`, `memo`, `is_favorite`, 種別専用の項目(`job_type`, `employment_type`, `side_job_allowed`, `contract_type` など) |
| Response | `201` `{ data: ProjectResource }` |
| 検証 | `name` 必須(255文字まで)。`status` 必須で、その種別で許可された値だけ。`type` は `career` / `side_job`。`project_url` はURL形式(2048文字まで)。日付は日付形式、件数・報酬は0以上の整数、`side_job_allowed` は `ok` / `ng` / `unknown` |
| 代表的なError | 422(項目ごとのエラー) |

- 所有者は、リクエストの値ではなくログインユーザーに決まります(`user_id` は受け付けない)。
- 副業の案件に旧ステータス名(未応募・不採用など)が送られた場合は、新しい名前に読み替えてから検証します。

### PATCH /api/projects/{id}

| 項目 | 内容 |
|---|---|
| Request | 変更する項目だけ(すべての項目が省略可能) |
| Response | `200` `{ data: ProjectResource }`(保存後の最新の内容) |
| 検証 | 登録と同じ規則を、送られた項目にだけ適用する。`status` は、送られた `type`、無ければ保存済みの種別で許可された値かを検証する |
| 代表的なError | 404(他のユーザーの案件・ゴミ箱の案件)、422 |

画面では、次の2通りの使い方をしています。

- ステータスの直接変更: `{ "status": "書類選考" }` だけを送る
- 編集フォーム: フォームの全項目を送る(空欄はNULLとして送る)

### DELETE /api/projects/{id}

ゴミ箱へ移動します(論理削除)。成功は `204`、他のユーザーの案件は404です。

### ProjectResource(案件の返却形式)

案件を返すAPIは、すべて `app/Http/Resources/ProjectResource.php` の形にそろえています。

```json
{
  "id": 12,
  "type": "career",
  "name": "バックエンドエンジニア",
  "status": "書類選考",
  "project_url": "https://example.com/jobs/1",
  "client_name": "サンプル株式会社",
  "media": "type",
  "reward_text": "年収600万円〜900万円",
  "deadline": "2026-10-31T00:00:00.000000Z",
  "memo": "10/2 19:00 一次面接",
  "is_favorite": false,
  "side_job_allowed": "ok",
  "deleted_at": null,
  "created_at": "2026-09-28T10:00:00.000000Z",
  "updated_at": "2026-09-30T12:00:00.000000Z"
}
```

(実際には、ここに載せていない列も含め、案件の全項目を返します。値は説明用の例です。)

日付の列も、時刻付きの文字列で返ります。画面は先頭の10文字(`YYYY-MM-DD`)を使います。

## 5. ゴミ箱API

| API | Response | 主なError |
|---|---|---|
| `GET /api/projects/trash` | `200` `{ data: [ProjectResource, ...] }`。ゴミ箱に入れた日時の新しい順 | 422(`type` が不正) |
| `POST /api/projects/{id}/restore` | `200` `{ data: ProjectResource }` | 404(無い・他人の案件)、409 `not_trashed` |
| `DELETE /api/projects/{id}/force` | `204` | 404、409 `not_trashed` |

- 一覧は `type`・`status`・`search`(キーワード)での絞り込みに対応していますが、画面からは条件を付けずに呼んでいます。
- 完全削除すると、その案件のステータス履歴も一緒に削除されます。

## 6. URL取込API

`POST /api/import/preview` は、求人ページのURLを受け取り、ページを読み取った結果を返します。
**DBには保存しません。** 利用者が結果をフォームで確認・修正してから、`POST /api/projects` で登録します。

| 項目 | 内容 |
|---|---|
| Request | `url`(必須、2048文字まで)、`type`(`career` / `side_job`) |
| 成功 | `200` `{ data: 読み取った項目 }` |
| 回数制限 | なし |
| 画面側の待ち時間の上限 | 20秒(`AbortController` で打ち切る) |

**処理の流れ**

1. ログインが必要なページ(応募履歴など)かを、URLの形から事前に判定する。該当すれば取得せずに手入力へ案内する
2. URLの安全性を検証し、許可されたページだけをサーバー側で取得する
3. HTMLから、構造化データ(JSON-LD)・OGP・サイト別の解析で項目を読み取る
4. 同じURLの登録済み案件(自分の案件のうち、ゴミ箱以外)を探し、重複候補として添える

**成功時の主な項目**

`name`・`client_name`・`description`・`reward_text`・`deadline`・`media`・`job_type`・`location`・`employment_type`・`side_job_allowed` など、登録フォームと同じ項目に加えて、次を返します。

| 項目 | 内容 |
|---|---|
| `fetch_status` | 案件名を読み取れたら `success`、読み取れなかったら `partial` |
| `warnings` | 読み取れなかった項目などの注意(日本語) |
| `duplicate_candidates` | 同じURLの登録済み案件 `[{ id, name, status }]`。登録を止めはしない |

**失敗時**

| ステータス | `error_code` の例 | 意味 |
|---|---|---|
| 422 | `requires_manual_entry` | ログインが必要なページ。`project_url` と `type` を返し、画面はURLを引き継いだまま手入力へ案内する |
| 422 | `invalid_url`, `blocked_host`, `dns_resolution_failed` など | 安全性の検証で拒否した URL |
| 502 | `timeout`, `not_found`, `upstream_server_error` など | 取得先のページを取得できなかった |
| 500 | `internal_error` | 予期しないエラー(詳細は返さない) |

画面はサーバーのエラー文言をそのまま表示せず、`error_code` を決まった案内文に変換して表示します。
安全性の検証(SSRF対策)の内容は、[05-url-import-security.md](05-url-import-security.md) で説明しています。

## 7. 画面側でのステータスコードの扱い

| 場面 | 扱い |
|---|---|
| 一覧の取得で401 | セッションが切れたものとして、ログイン画面に戻す |
| 登録・編集で422 | `errors` を、フォームの各項目の下に表示する |
| ログイン・登録で422 / 429 | 項目のエラー、または「試行回数が多すぎます」を表示する |
| ゴミ箱の操作で404 / 409 | サーバーの `message` を表示する(成功時だけ一覧を取り直す) |
| その他の失敗・通信エラー | 汎用のエラーメッセージを表示する |

## 8. 設計上の判断と現状の不統一

**判断**

- **セッション認証**: SPAとAPIが同じオリジンなので、トークンを保存・送信する仕組みを持たず、Laravel標準のセッションとCSRF保護をそのまま使っています。
- **他人の案件は404**: 403を返すと「そのidの案件が存在する」ことが分かるため、存在しない場合と同じ404にしています。
- **プレビューと登録の分離**: 取込結果を自動で保存せず、利用者の確認を挟みます。プレビューAPIはDBに書き込みません。
- **部分更新**: 更新APIはすべての項目を省略可能にし、ステータスだけの変更とフォーム全体の保存を同じAPIで扱います。
- **機械可読なエラー**: URL取込などの失敗は `error_code` で種類を返し、画面側の文言とサーバー側の詳細を切り離しています。

**現状の不統一(コードから確認できるもの)**

- キーワード検索の引数名が、一覧は `keyword`、ゴミ箱は `search` で分かれている
- 一覧の `keyword`・`status`・`media` は入力検証をしていない(`type` だけ検証)
- 取得のリダイレクト回数の超過(`too_many_redirects`)だけは、他の取得失敗(502)と違い422で返る
- URL取込APIには回数制限がない(ログイン・登録のみ1分6回)
- `project_url` は検証では2048文字まで許可しているが、DBの列は255文字([03-database.md](03-database.md) 8章)
