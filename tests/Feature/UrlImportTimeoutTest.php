<?php

namespace Tests\Feature;

use App\Services\UrlImport\HostResolver;
use App\Services\UrlImport\SafeHtmlFetcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use ReflectionClass;
use Tests\Support\FakeHostResolver;

/**
 * URL取込が「取得中…」のまま終わらなくならないための、取得側の時間上限。
 *
 * 1リクエストごとの上限だけではリダイレクトの数だけ時間が積み上がるため、
 * 取得全体にも締め切りを設けている。
 */
class UrlImportTimeoutTest extends AuthenticatedApiTestCase
{
    use RefreshDatabase;

    /**
     * @param array<string, list<string>> $map
     */
    private function fakeDns(array $map): void
    {
        $this->app->bind(HostResolver::class, fn () => new FakeHostResolver($map));
    }

    /**
     * @return array<string, mixed>
     */
    private function fetcherConstants(): array
    {
        return (new ReflectionClass(SafeHtmlFetcher::class))->getConstants();
    }

    public function test_connect_and_request_timeouts_are_configured(): void
    {
        // 応答が返らないケースに備え、接続・リクエスト双方に上限があること。
        $constants = $this->fetcherConstants();

        $this->assertArrayHasKey('CONNECT_TIMEOUT_SECONDS', $constants);
        $this->assertArrayHasKey('REQUEST_TIMEOUT_SECONDS', $constants);
        $this->assertGreaterThan(0, $constants['CONNECT_TIMEOUT_SECONDS']);
        $this->assertGreaterThan(0, $constants['REQUEST_TIMEOUT_SECONDS']);
    }

    public function test_total_fetch_time_is_bounded_across_redirects(): void
    {
        $constants = $this->fetcherConstants();

        $this->assertArrayHasKey('MAX_TOTAL_SECONDS', $constants);
        $this->assertGreaterThan(0, $constants['MAX_TOTAL_SECONDS']);

        // 全体上限が「1リクエスト上限 × 追跡しうる回数」より小さいこと(=積み上がりを防いでいる)。
        $worstCaseWithoutTotalLimit =
            $constants['REQUEST_TIMEOUT_SECONDS'] * ($constants['MAX_REDIRECTS'] + 1);

        $this->assertLessThan($worstCaseWithoutTotalLimit, $constants['MAX_TOTAL_SECONDS']);
    }

    public function test_reported_query_string_url_is_fetched_normally(): void
    {
        // 報告された再現URL(クエリ付き)が、止まらず通常どおり取得できること。
        $this->fakeDns(['type.jp' => ['8.8.8.8']]);
        Http::fake(['*' => Http::response(
            '<html><head><meta property="og:title" content="Webエンジニア"></head></html>',
            200,
            ['Content-Type' => 'text/html']
        )]);

        $this->postJson('/api/import/preview', [
            'url' => 'https://type.jp/job-1/0000002_detail/?pathway=116',
            'type' => 'career',
        ])
            ->assertStatus(200)
            ->assertJsonPath('data.name', 'Webエンジニア');
    }
}
