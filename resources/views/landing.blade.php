<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>JobHunt | 転職活動を、ひとつの画面で整理する</title>
    <meta name="description" content="JobHuntは、求人の登録から選考状況・次のアクションまでをひとつの画面で管理する、転職活動のための個人向けWebアプリです。">
    <meta property="og:type" content="website">
    <meta property="og:title" content="JobHunt | 転職活動を、ひとつの画面で整理する">
    <meta property="og:description" content="求人URLから登録し、応募した案件の選考状況と次のアクションをまとめて管理できます。">
    {{-- 公開LP。Reactは読み込まず、アプリと同じTailwindのCSSだけを使う(API・DBにも触れない)。 --}}
    @vite(['resources/css/app.css'])
</head>
<body class="bg-slate-50 text-slate-800 antialiased">
    @php
        $githubUrl = 'https://github.com/muraokajade/JobHunt';
        // アプリ本体がBasic認証で保護されている環境では、CTAの先で認証を求められることを先に伝える。
        $appIsRestricted = (string) config('access.password', '') !== '';
    @endphp

    <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-6">
            <span class="text-sm font-semibold tracking-wide text-slate-800">JobHunt</span>
            <nav class="ml-auto flex items-center gap-1 text-sm">
                <a href="{{ $githubUrl }}" class="flex min-h-11 items-center rounded-md px-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">GitHub</a>
                <a href="/app" class="flex min-h-11 items-center rounded-md px-2.5 font-medium text-slate-700 hover:bg-slate-100">ログイン</a>
            </nav>
        </div>
    </header>

    <main>
        {{-- 1. Hero --}}
        <section class="border-b border-slate-200 bg-white">
            <div class="mx-auto max-w-5xl px-4 py-14 md:px-6 md:py-20">
                <p class="text-sm font-medium text-slate-500">転職活動のための応募管理アプリ</p>
                {{-- 語句の途中(「整理す/る。」など)で折り返さないよう、区切りごとにまとめる --}}
                <h1 class="mt-3 text-3xl leading-tight font-semibold tracking-tight text-slate-900 md:text-5xl">
                    <span class="inline-block">転職活動を、</span><span class="inline-block">ひとつの画面で</span><span class="inline-block">整理する。</span>
                </h1>
                <p class="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
                    JobHuntは、応募する求人の登録から、選考状況・次にやることの管理までをまとめるWebアプリです。
                    求人が複数のサイトに散らばっていても、どの企業がどの段階にいるかを1か所で確認できます。
                </p>
                <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <a href="/app" class="flex min-h-12 items-center justify-center rounded-lg bg-slate-800 px-7 text-base font-medium text-white transition-colors hover:bg-slate-700">
                        JobHuntを使う
                    </a>
                    <a href="{{ $githubUrl }}" class="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-base text-slate-700 transition-colors hover:bg-slate-50">
                        GitHubでソースを見る
                    </a>
                </div>
                <p class="mt-6 text-xs leading-relaxed text-slate-400">Laravel・React・TypeScript・PostgreSQL で開発し、自分の転職活動で使いながら改善している個人開発のアプリです。</p>
            </div>
        </section>

        {{-- 2. 求人URLから登録 --}}
        <section class="mx-auto max-w-5xl px-4 py-14 md:px-6 md:py-20" aria-labelledby="lp-import">
            <p class="text-sm font-medium text-slate-500">機能 1</p>
            <h2 id="lp-import" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">求人URLから登録</h2>
            <p class="mt-4 max-w-2xl leading-relaxed text-slate-600">
                求人ページのURLを貼るだけで、案件名・報酬・締切などを読み取り、登録フォームの下書きを作ります。
                読み取った内容は保存する前に確認・修正できます。
            </p>

            <ol class="mt-8 grid gap-3 md:grid-cols-3">
                <li class="rounded-xl border border-slate-200 bg-white p-5">
                    <span class="text-xs font-semibold text-slate-400">STEP 1</span>
                    <p class="mt-1 font-medium text-slate-900">URLを入力</p>
                    <p class="mt-1 text-sm leading-relaxed text-slate-500">求人ページのURLと、転職・副業の種別を選びます。</p>
                </li>
                <li class="rounded-xl border border-slate-200 bg-white p-5">
                    <span class="text-xs font-semibold text-slate-400">STEP 2</span>
                    <p class="mt-1 font-medium text-slate-900">情報を取得</p>
                    <p class="mt-1 text-sm leading-relaxed text-slate-500">サーバー側でページを読み取り、構造化データなどから項目を取り出します。</p>
                </li>
                <li class="rounded-xl border border-slate-200 bg-white p-5">
                    <span class="text-xs font-semibold text-slate-400">STEP 3</span>
                    <p class="mt-1 font-medium text-slate-900">確認して登録</p>
                    <p class="mt-1 text-sm leading-relaxed text-slate-500">取得できなかった項目は案内が出るので、補ってから登録します。</p>
                </li>
            </ol>

            <div class="mt-8 grid items-start gap-6 md:grid-cols-2">
                <figure class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src="/images/lp/url-import.png" width="756" height="485" loading="lazy"
                         alt="URLから登録の画面。求人ページのURLと種別を入力する" class="block h-auto w-full">
                    <figcaption class="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">URLと種別を入力して読み込む</figcaption>
                </figure>
                <figure class="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src="/images/lp/url-import-result.png" width="661" height="841" loading="lazy"
                         alt="URLから取得した内容が入った登録フォーム" class="block h-auto w-full">
                    <figcaption class="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">取得した内容を確認して登録する</figcaption>
                </figure>
            </div>
        </section>

        {{-- 3. 応募案件を一覧管理 --}}
        <section class="border-y border-slate-200 bg-white" aria-labelledby="lp-list">
            <div class="mx-auto grid max-w-5xl gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-20">
                <div>
                    <p class="text-sm font-medium text-slate-500">機能 2</p>
                    <h2 id="lp-list" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">応募案件を一覧で管理</h2>
                    <p class="mt-4 leading-relaxed text-slate-600">
                        登録した案件は1つの一覧にまとまり、選考が進んでいる順に並びます。
                        状況をひと目で比べられるよう、一覧には比較に必要な項目だけを出します。
                    </p>
                    <ul class="mt-6 space-y-3 text-sm leading-relaxed text-slate-600">
                        <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400"></span>転職・副業の切り替えと、キーワード検索</li>
                        <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400"></span>会社名・報酬・締切・ステータス・種別を1行で表示</li>
                        <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400"></span>締切が近い案件は色で分かる</li>
                    </ul>
                </div>

                {{--
                    一覧のイメージ。公開できる一覧のスクリーンショットがまだ無いため、
                    実在の企業名や案件は使わず、選考の段階(ステータス)の並びだけを示す。
                    架空データのスクリーンショットを用意したら、このfigureを<img>に差し替える。
                --}}
                <figure class="rounded-xl border border-slate-200 bg-slate-50 p-5" aria-label="選考の段階の例">
                    <p class="text-xs font-semibold text-slate-400">選考が進んでいる順に並ぶ(転職の場合)</p>
                    <ol class="mt-4 space-y-2">
                        @foreach ([
                            ['内定', 'border-green-200 bg-green-50 text-green-700', 'bg-green-500'],
                            ['最終面接', 'border-blue-200 bg-blue-50 text-blue-700', 'bg-blue-500'],
                            ['面接', 'border-blue-200 bg-blue-50 text-blue-700', 'bg-blue-500'],
                            ['書類選考', 'border-blue-200 bg-blue-50 text-blue-700', 'bg-blue-500'],
                            ['応募済み', 'border-blue-200 bg-blue-50 text-blue-700', 'bg-blue-500'],
                            ['気になる', 'border-slate-200 bg-white text-slate-700', 'bg-slate-400'],
                        ] as [$status, $pill, $dot])
                            <li class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                                <span class="h-2 flex-1 rounded-full bg-slate-100" aria-hidden="true"></span>
                                <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium {{ $pill }}">
                                    <span class="size-1.5 rounded-full {{ $dot }}" aria-hidden="true"></span>{{ $status }}
                                </span>
                            </li>
                        @endforeach
                    </ol>
                    <figcaption class="mt-3 text-xs text-slate-400">ステータスの例。実際の画面では案件名・会社名などと並びます。</figcaption>
                </figure>
            </div>
        </section>

        {{-- 4. 個別に選考を管理 --}}
        <section class="mx-auto max-w-5xl px-4 py-14 md:px-6 md:py-20" aria-labelledby="lp-detail">
            <p class="text-sm font-medium text-slate-500">機能 3</p>
            <h2 id="lp-detail" class="mt-2 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">案件ごとに選考を管理</h2>
            <p class="mt-4 max-w-2xl leading-relaxed text-slate-600">
                一覧から案件を選ぶと、詳細を開いてそのまま更新できます。応募したあとの動きを、案件ごとに残せます。
            </p>
            <dl class="mt-8 grid gap-3 sm:grid-cols-2">
                <div class="rounded-xl border border-slate-200 bg-white p-5">
                    <dt class="font-medium text-slate-900">ステータス</dt>
                    <dd class="mt-1 text-sm leading-relaxed text-slate-500">応募済み → 書類選考 → 面接 のように、詳細画面から直接変更できます。変更は履歴として記録されます。</dd>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-5">
                    <dt class="font-medium text-slate-900">次のアクション</dt>
                    <dd class="mt-1 text-sm leading-relaxed text-slate-500">「面接の日程調整」など、次にやることと予定日を案件ごとに持てます。</dd>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-5">
                    <dt class="font-medium text-slate-900">活動メモ</dt>
                    <dd class="mt-1 text-sm leading-relaxed text-slate-500">企業から後で届いた情報や、自分の判断を書き足していけます。</dd>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white p-5">
                    <dt class="font-medium text-slate-900">編集</dt>
                    <dd class="mt-1 text-sm leading-relaxed text-slate-500">登録と同じフォームで、あとから内容を直せます。</dd>
                </div>
            </dl>
        </section>

        {{-- 5. 最後のCTA --}}
        <section class="border-t border-slate-200 bg-white">
            <div class="mx-auto max-w-5xl px-4 py-14 text-center md:px-6 md:py-16">
                <h2 class="text-2xl font-semibold tracking-tight text-slate-900">応募の管理を、JobHuntで。</h2>
                <div class="mt-6 flex justify-center">
                    <a href="/app" class="flex min-h-12 w-full items-center justify-center rounded-lg bg-slate-800 px-7 text-base font-medium text-white transition-colors hover:bg-slate-700 sm:w-auto">
                        JobHuntを使う
                    </a>
                </div>
                @if ($appIsRestricted)
                    <p class="mt-4 text-xs leading-relaxed text-slate-400">現在は限定公開のため、アプリを開くとアクセス用のIDとパスワードを求められます。</p>
                @endif
            </div>
        </section>
    </main>

    <footer class="border-t border-slate-200">
        <div class="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <span>JobHunt</span>
            <a href="{{ $githubUrl }}" class="flex min-h-11 items-center hover:text-slate-600 sm:min-h-0">GitHub: muraokajade/JobHunt</a>
        </div>
    </footer>
</body>
</html>
