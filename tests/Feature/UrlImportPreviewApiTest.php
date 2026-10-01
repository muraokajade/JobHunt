<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Services\UrlImport\HostResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeHostResolver;

class UrlImportPreviewApiTest extends AuthenticatedApiTestCase
{
    use RefreshDatabase;


    /**
     * @param array<string, list<string>> $map
     */
    private function fakeDns(array $map): void
    {
        $this->app->bind(HostResolver::class, fn () => new FakeHostResolver($map));
    }

    // ---- 入力検証 -----------------------------------------------------

    public function test_url_is_required(): void
    {
        $response = $this->postJson('/api/import/preview', []);

        $response->assertStatus(422)->assertJsonValidationErrors(['url']);
    }

    public function test_invalid_type_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://example.com/',
            'type' => 'not_a_type',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['type']);
    }

    public function test_type_omitted_defaults_to_side_job(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="タイトル"></head></html>',
            200,
            ['Content-Type' => 'text/html; charset=UTF-8']
        )]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(200)->assertJsonPath('data.type', 'side_job');
    }

    public function test_type_career_is_echoed_back(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><title>タイトル</title></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://example.com/',
            'type' => 'career',
        ]);

        $response->assertStatus(200)->assertJsonPath('data.type', 'career');
    }

    // ---- SSRF対策(初回URL) --------------------------------------------

    public function test_file_scheme_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'file:///etc/passwd']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'unsupported_scheme');
    }

    public function test_ftp_scheme_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'ftp://example.com/file']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'unsupported_scheme');
    }

    public function test_localhost_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://localhost/']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_ipv4_loopback_literal_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://127.0.0.1/admin']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_ipv6_loopback_literal_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://[::1]/admin']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_private_ip_literal_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://192.168.1.1/']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_link_local_ip_literal_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://169.254.169.254/metadata']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_reserved_ip_literal_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://240.0.0.1/']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_credentials_in_url_are_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'https://user:pass@example.com/']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'credentials_in_url');
    }

    public function test_unusual_port_is_rejected(): void
    {
        $response = $this->postJson('/api/import/preview', ['url' => 'http://example.com:8080/']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'invalid_port');
    }

    public function test_hostname_resolving_to_private_ip_is_rejected(): void
    {
        $this->fakeDns(['internal.example.com' => ['10.0.0.5']]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://internal.example.com/page']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
        // エラーレスポンスに解決済みの内部IPを含めない。
        $this->assertStringNotContainsString('10.0.0.5', $response->getContent());
    }

    public function test_original_hostname_is_preserved_for_the_actual_request(): void
    {
        // 検証済みIPへ接続を固定しても、実際に送信されるリクエストのURL(Host/SNIの元)は
        // 元のホスト名のままであることを確認する(IPアドレスへ書き換えない)。
        $this->fakeDns(['example.com' => ['93.184.216.34']]);
        Http::fake(['*' => Http::response(
            '<html><head><title>タイトル</title></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/job/1']);

        $response->assertStatus(200);
        Http::assertSent(function (Request $request) {
            return $request->url() === 'https://example.com/job/1';
        });
    }

    public function test_unresolvable_hostname_is_rejected(): void
    {
        $this->fakeDns([]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://does-not-resolve.example/page']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'dns_resolution_failed');
    }

    // ---- リダイレクト ---------------------------------------------------

    public function test_safe_redirect_is_followed_and_final_content_is_used(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake([
            'https://example.com/start' => Http::response('', 302, ['Location' => 'https://example.com/final']),
            'https://example.com/final' => Http::response(
                '<html><head><title>最終ページ</title></head></html>',
                200,
                ['Content-Type' => 'text/html']
            ),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/start']);

        $response->assertStatus(200)->assertJsonPath('data.name', '最終ページ');
    }

    public function test_redirect_to_private_ip_is_rejected(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake([
            'https://example.com/start' => Http::response('', 302, ['Location' => 'http://169.254.169.254/metadata']),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/start']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
    }

    public function test_too_many_redirects_is_rejected(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake([
            'https://example.com/a' => Http::response('', 302, ['Location' => 'https://example.com/b']),
            'https://example.com/b' => Http::response('', 302, ['Location' => 'https://example.com/c']),
            'https://example.com/c' => Http::response('', 302, ['Location' => 'https://example.com/d']),
            'https://example.com/d' => Http::response('', 302, ['Location' => 'https://example.com/e']),
            'https://example.com/e' => Http::response('<html></html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/a']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'too_many_redirects');
    }

    public function test_redirect_target_hostname_is_independently_dns_validated_and_rejected(): void
    {
        // リダイレクト元(example.com)は公開IPだが、リダイレクト先のホスト名は
        // 別途DNS解決され、その結果がprivate IPであれば個別に拒否されることを確認する
        // (リダイレクト先でも毎回、URL検証→DNS解決→公開IP判定をやり直す設計)。
        $this->fakeDns([
            'example.com' => ['8.8.8.8'],
            'internal-redirect-target.example.com' => ['10.0.0.9'],
        ]);
        Http::fake([
            'https://example.com/start' => Http::response('', 302, [
                'Location' => 'https://internal-redirect-target.example.com/next',
            ]),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/start']);

        $response->assertStatus(422)->assertJsonPath('error_code', 'blocked_host');
        $this->assertStringNotContainsString('10.0.0.9', $response->getContent());
    }

    public function test_protocol_relative_redirect_is_resolved_using_current_scheme(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake([
            'https://example.com/start' => Http::response('', 302, ['Location' => '//example.com/final']),
            'https://example.com/final' => Http::response(
                '<html><head><title>プロトコル相対リダイレクト先</title></head></html>',
                200,
                ['Content-Type' => 'text/html']
            ),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/start']);

        $response->assertStatus(200)->assertJsonPath('data.name', 'プロトコル相対リダイレクト先');
    }

    // ---- 取得失敗の分類 --------------------------------------------------

    public function test_remote_403_leads_to_manual_entry_instead_of_a_raw_error(): void
    {
        // 403はログインが必要なページである可能性が高いため、失敗ではなく手入力誘導として扱う。
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('forbidden', 403)]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(422)
            ->assertJsonPath('error_code', 'requires_manual_entry')
            ->assertJsonPath('requires_manual_entry', true)
            ->assertJsonPath('project_url', 'https://example.com/');
    }

    public function test_remote_404_is_mapped_to_not_found(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('not found', 404)]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'not_found');
    }

    public function test_remote_429_is_mapped_to_rate_limited(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('too many requests', 429)]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'rate_limited');
    }

    public function test_remote_5xx_is_mapped_to_upstream_server_error(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('server error', 503)]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'upstream_server_error');
    }

    public function test_connection_failure_is_mapped_to_connection_failed(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(function (Request $request) {
            throw new ConnectionException('Could not resolve host');
        });

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'connection_failed');
    }

    public function test_connection_failure_with_multiple_pinned_candidate_ips_is_still_mapped_safely(): void
    {
        // 検証済みIPが複数(IPv4+IPv6)ある場合でも、全候補への接続に失敗した際は
        // 内部情報を含まない安全なエラーへ変換されることを確認する。
        $this->fakeDns(['example.com' => ['93.184.216.34', '2606:4700:4700::1111']]);
        Http::fake(function (Request $request) {
            throw new ConnectionException('cURL error 7: Failed to connect to 93.184.216.34 port 443: Connection refused');
        });

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'connection_failed');
        $this->assertStringNotContainsString('93.184.216.34', $response->getContent());
        $this->assertStringNotContainsString('2606:4700:4700::1111', $response->getContent());
    }

    public function test_timeout_is_mapped_to_timeout(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(function (Request $request) {
            throw new ConnectionException('cURL error 28: Operation timed out');
        });

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'timeout');
    }

    public function test_non_html_content_type_is_rejected(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('%PDF-1.4 ...', 200, ['Content-Type' => 'application/pdf'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/file.pdf']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'unsupported_content_type');
    }

    public function test_content_type_with_charset_parameter_is_accepted(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><title>charset付きページ</title></head></html>',
            200,
            ['Content-Type' => 'text/html; charset=Shift_JIS']
        )]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(200)->assertJsonPath('data.name', 'charset付きページ');
    }

    public function test_oversized_response_is_rejected(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        $hugeBody = '<html><body>' . str_repeat('a', 3 * 1024 * 1024) . '</body></html>';
        Http::fake(['*' => Http::response($hugeBody, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(502)->assertJsonPath('error_code', 'response_too_large');
    }

    // ---- 抽出結果の組み立て -----------------------------------------------

    public function test_ogp_title_is_used_but_ogp_description_is_not(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head>'
                . '<meta property="og:title" content="OGP案件タイトル">'
                . '<meta property="og:description" content="サイト共通の宣伝文(採用されないはず)">'
                . '</head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/job/1']);

        $response->assertStatus(200)
            ->assertJsonPath('data.name', 'OGP案件タイトル')
            ->assertJsonPath('data.description', null)
            ->assertJsonPath('data.fetch_status', 'success');

        $this->assertContains(
            '募集内容を取得できませんでした。確認して入力してください。',
            $response->json('data.warnings')
        );
    }

    public function test_description_is_excerpted_to_160_characters(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        $longBody = str_repeat('あ', 200);
        $html = '<html><head><script type="application/ld+json">'
            . json_encode(['@type' => 'JobPosting', 'title' => '長文案件', 'description' => $longBody])
            . '</script></head></html>';

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/job/2']);

        $description = $response->json('data.description');

        $response->assertStatus(200);
        $this->assertSame(161, mb_strlen($description)); // 160文字 + 省略記号'…'
        $this->assertStringEndsWith('…', $description);
    }

    public function test_zero_reward_from_json_ld_is_not_saved_end_to_end(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        $html = '<html><head><script type="application/ld+json">'
            . json_encode(['@type' => 'JobPosting', 'title' => '案件', 'baseSalary' => 0])
            . '</script></head></html>';

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/job/3']);

        $response->assertStatus(200)
            ->assertJsonPath('data.reward', null)
            ->assertJsonPath('data.reward_text', null);
    }

    public function test_json_ld_job_posting_extraction_end_to_end(): void
    {
        $this->fakeDns(['jobs.example.com' => ['8.8.8.8']]);
        $html = '<html><head><script type="application/ld+json">'
            . json_encode([
                '@type' => 'JobPosting',
                'title' => 'JSON-LD案件タイトル',
                'description' => 'JSON-LD経由の説明文',
                'hiringOrganization' => ['name' => '株式会社サンプル'],
                'validThrough' => '2026-10-01',
            ])
            . '</script></head></html>';

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://jobs.example.com/postings/1']);

        $response->assertStatus(200)
            ->assertJsonPath('data.name', 'JSON-LD案件タイトル')
            ->assertJsonPath('data.client_name', '株式会社サンプル')
            ->assertJsonPath('data.deadline', '2026-10-01');
    }

    public function test_crowdworks_job_detail_extraction_end_to_end(): void
    {
        $this->fakeDns(['crowdworks.jp' => ['8.8.8.8']]);
        $html = <<<'HTML'
            <html><body>
                <article class="job-detail">
                    <h1 class="job-detail__title">CrowdWorks案件</h1>
                    <div class="job-detail__reward">固定報酬制 60,000円</div>
                    <div class="job-detail__category">Web開発</div>
                    <div class="job-detail__body">案件本文です。</div>
                </article>
                <aside class="related-jobs">
                    <div class="job-card"><h2>関連案件(混入してはいけない)</h2></div>
                </aside>
            </body></html>
            HTML;

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://crowdworks.jp/public/jobs/123456',
            'type' => 'side_job',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.name', 'CrowdWorks案件')
            ->assertJsonPath('data.media', 'CrowdWorks')
            ->assertJsonPath('data.reward', 60000)
            ->assertJsonPath('data.reward_text', '固定報酬制 60,000円')
            ->assertJsonPath('data.description', '案件本文です。')
            ->assertJsonPath('data.category', 'Web開発');

        $this->assertStringNotContainsString('関連案件', $response->json('data.name'));
    }

    public function test_crowdworks_negotiable_reward_is_preserved_as_reward_text_end_to_end(): void
    {
        $this->fakeDns(['crowdworks.jp' => ['8.8.8.8']]);
        $html = <<<'HTML'
            <html><body>
                <article class="job-detail">
                    <h1 class="job-detail__title">CrowdWorks応相談案件</h1>
                    <div class="job-detail__reward">応相談</div>
                    <div class="job-detail__body">案件本文です。</div>
                </article>
            </body></html>
            HTML;

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://crowdworks.jp/public/jobs/999999',
            'type' => 'side_job',
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.reward', null)
            ->assertJsonPath('data.reward_text', '応相談');
    }

    public function test_insufficient_extraction_returns_partial_with_warnings(): void
    {
        $this->fakeDns(['blank.example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('<html><body><p>何もメタ情報がないページ</p></body></html>', 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://blank.example.com/']);

        $response->assertStatus(200)
            ->assertJsonPath('data.fetch_status', 'partial')
            ->assertJsonPath('data.name', null);

        $this->assertNotEmpty($response->json('data.warnings'));
    }

    public function test_malformed_html_does_not_error(): void
    {
        $this->fakeDns(['broken.example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('<html><head><title>壊れたページ<body><div><p>閉じタグ不足', 200, ['Content-Type' => 'text/html'])]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://broken.example.com/']);

        $response->assertStatus(200)->assertJsonPath('data.name', '壊れたページ');
    }

    // ---- DB非保存の確認 --------------------------------------------------

    public function test_preview_does_not_change_project_count(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><title>プレビュー確認</title></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $before = Project::count();

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/']);

        $response->assertStatus(200);
        $this->assertSame($before, Project::count());
    }

    public function test_rejected_preview_does_not_change_project_count(): void
    {
        $before = Project::count();

        $response = $this->postJson('/api/import/preview', ['url' => 'http://127.0.0.1/']);

        $response->assertStatus(422);
        $this->assertSame($before, Project::count());
    }

    // ---- ログイン必須ページの手入力誘導 -----------------------------------

    public function test_type_entry_history_url_is_routed_to_manual_entry_without_fetching(): void
    {
        // 応募履歴URLは利用者のCookieが必要なため、取得を試みずに手入力誘導とする。
        Http::fake();

        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/entry_history/entry_message_list/12345/',
            'type' => 'career',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('error_code', 'requires_manual_entry')
            ->assertJsonPath('requires_manual_entry', true)
            ->assertJsonPath('project_url', 'https://type.jp/entry_history/entry_message_list/12345/')
            ->assertJsonPath('type', 'career');

        // 外部への取得は一切行わない。
        Http::assertNothingSent();
    }

    public function test_manual_entry_message_explains_the_reason_without_internal_details(): void
    {
        Http::fake();

        $response = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/entry_history/list',
        ]);

        $message = $response->json('message');

        $this->assertStringContainsString('ログインが必要なページ', $message);
        $this->assertStringContainsString('手入力', $message);
        // 生のエラー文言・内部情報を含めない。
        $this->assertStringNotContainsString('Unauthenticated', $message);
        $this->assertStringNotContainsString('401', $message);
        $this->assertStringNotContainsString('Exception', $message);
    }

    public function test_remote_401_leads_to_manual_entry(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('unauthorized', 401)]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/private/1']);

        $response->assertStatus(422)
            ->assertJsonPath('error_code', 'requires_manual_entry')
            ->assertJsonPath('requires_manual_entry', true)
            ->assertJsonPath('project_url', 'https://example.com/private/1');
    }

    public function test_redirect_to_login_page_leads_to_manual_entry(): void
    {
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake([
            'https://example.com/jobs/1' => Http::response('', 302, ['Location' => 'https://example.com/login?next=/jobs/1']),
            '*' => Http::response('<html></html>', 200, ['Content-Type' => 'text/html']),
        ]);

        $response = $this->postJson('/api/import/preview', ['url' => 'https://example.com/jobs/1']);

        $response->assertStatus(422)
            ->assertJsonPath('error_code', 'requires_manual_entry')
            ->assertJsonPath('requires_manual_entry', true);
    }

    public function test_manual_entry_response_preserves_the_default_type_when_omitted(): void
    {
        Http::fake();

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/entry_history/1'])
            ->assertStatus(422)
            ->assertJsonPath('type', 'side_job');
    }

    public function test_non_login_failures_are_still_reported_as_fetch_errors(): void
    {
        // 404等は手入力誘導にせず、従来どおり取得失敗として返す(再試行の余地があるため)。
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response('not found', 404)]);

        $this->postJson('/api/import/preview', ['url' => 'https://example.com/'])
            ->assertStatus(502)
            ->assertJsonPath('error_code', 'not_found');
    }

    public function test_public_type_job_url_is_still_fetched_normally(): void
    {
        // 公開求人URLの自動取得は壊さない。
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="公開求人タイトル"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/0000001_detail/'])
            ->assertStatus(200)
            ->assertJsonPath('data.name', '公開求人タイトル');
    }

    // ---- type.jp: 装飾・抽出ノイズの除去と媒体の自動設定 -------------------

    /**
     * 実際のtype.jp求人ページに相当する構造(JSON-LDの本文が罫線と■で区切られ、
     * og:site_nameが媒体プルダウンに無い長い文言)のfixture。
     */
    private function fakeTypeJobPage(): void
    {
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);

        $description = '----------------■仕事内容----------------'
            . '業務系・Web系などの各種システム開発全般を担当頂きます。'
            . '----------------■応募資格----------------'
            . '■学歴不問 ■業務未経験OK（プログラミング経験必須）'
            . '=====■想定給与====='
            . '★想定年収450万〜1050万円 ■正社員月給37.5万〜87.5万円'
            . '※給与は経験・スキルを考慮の上、決定します。'
            . ' END';

        $html = '<html><head>'
            . '<meta property="og:title" content="■Webアプリ開発エンジニア／フルリモート可">'
            . '<meta property="og:site_name" content="転職type - マッチする求人情報が分かる、探せる、転職サイト">'
            . '<script type="application/ld+json">'
            . json_encode([
                '@type' => 'JobPosting',
                'title' => '■Webアプリ開発エンジニア／フルリモート可',
                'description' => $description,
                'hiringOrganization' => ['name' => '架空システム株式会社'],
            ], JSON_UNESCAPED_UNICODE)
            . '</script></head></html>';

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);
    }

    public function test_type_job_name_has_no_decoration_symbols(): void
    {
        $this->fakeTypeJobPage();

        $name = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/job-1/0000001_detail/',
            'type' => 'career',
        ])->assertStatus(200)->json('data.name');

        $this->assertStringNotContainsString('■', $name);
        $this->assertSame('Webアプリ開発エンジニア／フルリモート可', $name);
    }

    public function test_type_job_description_has_no_decoration_or_extraction_noise(): void
    {
        $this->fakeTypeJobPage();

        $description = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/job-1/0000001_detail/',
        ])->assertStatus(200)->json('data.description');

        $this->assertNotNull($description);
        $this->assertStringNotContainsString('■', $description);
        $this->assertStringNotContainsString('=====', $description);
        $this->assertStringNotContainsString('----', $description);
        // 見出しの語自体は残り、前後が連結していない。
        $this->assertStringContainsString('仕事内容', $description);
        $this->assertStringContainsString('応募資格', $description);
        $this->assertStringNotContainsString('仕事内容業務系', $description);
    }

    public function test_type_job_description_keeps_meaningful_content(): void
    {
        $this->fakeTypeJobPage();

        $description = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/job-1/0000001_detail/',
        ])->assertStatus(200)->json('data.description');

        // 金額・注記など有効な本文は削らない(抜粋長の範囲内で確認する)。
        $this->assertStringContainsString('業務系・Web系', $description);
        $this->assertStringContainsString('プログラミング経験必須', $description);
    }

    public function test_type_job_media_is_set_to_type(): void
    {
        $this->fakeTypeJobPage();

        $media = $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/job-1/0000001_detail/',
        ])->assertStatus(200)->json('data.media');

        // 媒体プルダウンの選択肢に無い og:site_name をそのまま入れると未選択に見えるため、
        // 選択肢の値へ寄せる。
        $this->assertSame('type', $media);
    }

    public function test_freelance_hub_media_is_set_to_freelance_hub(): void
    {
        $this->fakeDns(['freelance-hub.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件">'
            . '<meta property="og:site_name" content="フリーランスエンジニアの案件・求人情報なら【フリーランスHub】"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://freelance-hub.jp/project/detail/12345/'])
            ->assertStatus(200)
            ->assertJsonPath('data.media', 'フリーランスハブ');
    }

    public function test_www_prefixed_host_is_also_resolved(): void
    {
        $this->fakeDns(['www.type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://www.type.jp/job-1/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.media', 'type');
    }

    public function test_crowdworks_media_is_unchanged(): void
    {
        $this->fakeDns(['crowdworks.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://crowdworks.jp/public/jobs/1'])
            ->assertStatus(200)
            ->assertJsonPath('data.media', 'CrowdWorks');
    }

    public function test_unknown_host_media_falls_back_to_other(): void
    {
        // 既知ホスト以外は「その他」にする(選択肢に無い長いサイト名を入れない)。
        // 実際の媒体名は、画面の「その他」自由入力欄で補える。
        $this->fakeDns(['example.com' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件">'
            . '<meta property="og:site_name" content="サンプルサイト"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://example.com/job/1'])
            ->assertStatus(200)
            ->assertJsonPath('data.media', 'その他');
    }


    // ---- 本文からの報酬抽出 -----------------------------------------------

    public function test_reward_is_extracted_from_page_table_when_json_ld_has_none(): void
    {
        // 構造化データに報酬が無くても、求人詳細の表から取りこぼさない。
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="Webエンジニア"></head>'
            . '<body><table><tr><th>給与</th><td>月給35万円〜75万円</td></tr></table></body></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/1/', 'type' => 'career'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', '月給35万円〜75万円')
            // 数値へ無理に変換して0円へ落とさない。
            ->assertJsonPath('data.reward', null);
    }

    public function test_reward_is_extracted_from_page_title(): void
    {
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="【Webエンジニア】月給35万円〜 リモート可"></head>'
            . '<body><p>詳細は面談にてご説明します。</p></body></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', '月給35万円〜');
    }

    public function test_json_ld_reward_takes_priority_over_page_text(): void
    {
        // 構造化データに報酬がある場合は、そちらを優先する(本文で上書きしない)。
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        $html = '<html><head><script type="application/ld+json">'
            . json_encode([
                '@type' => 'JobPosting',
                'title' => '案件',
                'baseSalary' => ['currency' => 'JPY', 'value' => ['value' => 5000000, 'unitText' => 'YEAR']],
            ], JSON_UNESCAPED_UNICODE)
            . '</script></head><body><table><tr><th>給与</th><td>月給20万円</td></tr></table></body></html>';

        Http::fake(['*' => Http::response($html, 200, ['Content-Type' => 'text/html'])]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', '5000000 JPY (YEAR)');
    }

    public function test_no_reward_is_invented_when_page_has_none(): void
    {
        // 報酬の記載が無いページで、金額や0円を作らない。
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head>'
            . '<body><p>年間休日145日。従業員数120名。リモート可。</p></body></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', null)
            ->assertJsonPath('data.reward', null);
    }

    public function test_negotiable_page_does_not_produce_an_amount(): void
    {
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head>'
            . '<body><table><tr><th>給与</th><td>応相談</td></tr></table></body></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://type.jp/job-1/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', null)
            ->assertJsonPath('data.reward', null);
    }

    public function test_hourly_wage_page_keeps_the_original_text(): void
    {
        $this->fakeDns(['crowdworks.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head>'
            . '<body><dl><dt>報酬</dt><dd>時給2,000円〜</dd></dl></body></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://crowdworks.jp/public/jobs/1'])
            ->assertStatus(200)
            ->assertJsonPath('data.reward_text', '時給2,000円〜')
            ->assertJsonPath('data.reward', null);
    }

    public function test_freelance_hub_subdomain_resolves_to_freelance_hub(): void
    {
        $this->fakeDns(['pro.freelance-hub.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="案件"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', ['url' => 'https://pro.freelance-hub.jp/project/1/'])
            ->assertStatus(200)
            ->assertJsonPath('data.media', 'フリーランスハブ');
    }
}
