<?php

namespace Tests\Unit\Services\UrlImport;

use App\Exceptions\UrlImport\UrlSafetyException;
use App\Services\UrlImport\SafeHtmlFetcher;
use App\Services\UrlImport\UrlSafetyValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\FakeHostResolver;

class SafeHtmlFetcherTest extends TestCase
{
    private function fetcher(): SafeHtmlFetcher
    {
        return new SafeHtmlFetcher(new UrlSafetyValidator(new FakeHostResolver()));
    }

    public function test_connection_options_pin_to_the_verified_ip(): void
    {
        $options = $this->fetcher()->buildConnectionOptions([
            'scheme' => 'https',
            'host' => 'example.com',
            'port' => 443,
            'ips' => ['93.184.216.34'],
        ]);

        $this->assertSame(['example.com:443:93.184.216.34'], $options['curl'][CURLOPT_RESOLVE]);
    }

    public function test_connection_options_pin_to_verified_ipv6_address(): void
    {
        $options = $this->fetcher()->buildConnectionOptions([
            'scheme' => 'https',
            'host' => 'example.com',
            'port' => 443,
            'ips' => ['2606:4700:4700::1111'],
        ]);

        $this->assertSame(['example.com:443:2606:4700:4700::1111'], $options['curl'][CURLOPT_RESOLVE]);
    }

    public function test_connection_options_disable_client_side_redirects(): void
    {
        $options = $this->fetcher()->buildConnectionOptions([
            'scheme' => 'https',
            'host' => 'example.com',
            'port' => 443,
            'ips' => ['93.184.216.34'],
        ]);

        $this->assertFalse($options['allow_redirects']);
    }

    public function test_empty_ip_list_does_not_produce_connection_options(): void
    {
        $this->expectException(UrlSafetyException::class);

        $this->fetcher()->buildConnectionOptions([
            'scheme' => 'https',
            'host' => 'example.com',
            'port' => 443,
            'ips' => [],
        ]);
    }

    // ---- 送信するURLと、接続先を固定したホスト名の一致 ------------------------
    //
    // CURLOPT_RESOLVEは、cURLが使うホスト名と固定したホスト名が文字列として一致したときだけ効く。
    // 入力の表記(末尾ドット・大文字・Unicode/全角)のまま送ると固定が外れ、cURLがDNSを引き直して
    // 検証していないIPへ接続しうる(DNS rebinding)。送信URLは必ず検証済みのホスト名で組み立てる。

    /**
     * 本番と同じUrlSafetyValidatorで検証し、その結果(正規化済みhost・検証済みIP)を返す。
     *
     * @return array{scheme: string, host: string, port: int, ips: list<string>}
     */
    private function verify(string $url, array $dnsMap): array
    {
        return (new UrlSafetyValidator(new FakeHostResolver($dnsMap)))->assertSafe($url);
    }

    /**
     * @return array<string, array{string, array<string, list<string>>, string}>
     */
    public static function urlsWhoseHostnameIsNormalizedBeforeSending(): array
    {
        $public = ['93.184.216.34'];

        return [
            'trailing dot' => ['https://example.com./job?id=1', ['example.com' => $public], 'https://example.com/job?id=1'],
            'multiple trailing dots' => ['https://example.com../job?id=1', ['example.com' => $public], 'https://example.com/job?id=1'],
            'uppercase hostname (path/query keep their case)' => ['https://EXAMPLE.COM/Job?Q=A', ['example.com' => $public], 'https://example.com/Job?Q=A'],
            'unicode (IDN) hostname' => ['https://日本語.example/job?id=1', ['xn--wgv71a119e.example' => $public], 'https://xn--wgv71a119e.example/job?id=1'],
            'fullwidth hostname' => ['https://ｅｘａｍｐｌｅ.com/job', ['example.com' => $public], 'https://example.com/job'],
            'explicit default port (https)' => ['https://example.com.:443/a/b?x=1&y=2', ['example.com' => $public], 'https://example.com/a/b?x=1&y=2'],
            'explicit default port (http)' => ['http://example.com.:80/a', ['example.com' => $public], 'http://example.com/a'],
            'fragment is not sent' => ['https://example.com/job?id=1#apply', ['example.com' => $public], 'https://example.com/job?id=1'],
            'public IPv4 literal' => ['http://93.184.216.34/x', [], 'http://93.184.216.34/x'],
            'public IPv6 literal' => ['http://[2606:4700:4700::1111]/x', [], 'http://[2606:4700:4700::1111]/x'],
        ];
    }

    /**
     * @param array<string, list<string>> $dnsMap
     */
    #[DataProvider('urlsWhoseHostnameIsNormalizedBeforeSending')]
    public function test_request_url_uses_the_verified_hostname(string $input, array $dnsMap, string $expected): void
    {
        $safety = $this->verify($input, $dnsMap);

        $requestUrl = $this->fetcher()->buildRequestUrl($input, $safety);

        $this->assertSame($expected, $requestUrl);
    }

    /**
     * @param array<string, list<string>> $dnsMap
     */
    #[DataProvider('urlsWhoseHostnameIsNormalizedBeforeSending')]
    public function test_request_url_hostname_matches_the_pinned_hostname(string $input, array $dnsMap): void
    {
        $fetcher = $this->fetcher();
        $safety = $this->verify($input, $dnsMap);

        $requestUrl = $fetcher->buildRequestUrl($input, $safety);
        $pinnedEntries = $fetcher->buildConnectionOptions($safety)['curl'][CURLOPT_RESOLVE];

        // 送信URLのホスト名と、CURLOPT_RESOLVEに登録した「ホスト名:ポート:IP」のホスト名が一致する。
        $requestHost = trim((string) parse_url($requestUrl, PHP_URL_HOST), '[]');
        $this->assertSame($safety['host'], $requestHost);
        foreach ($pinnedEntries as $entry) {
            $this->assertStringStartsWith("{$requestHost}:{$safety['port']}:", $entry);
        }

        // 送信直前の最終確認も通る(例外にならない)。
        $fetcher->assertRequestTargetsVerifiedHost($requestUrl, $safety);
    }

    /**
     * @return array<string, array{string, array<string, list<string>>}>
     */
    public static function inputUrlsThatWouldBypassThePin(): array
    {
        $public = ['93.184.216.34'];

        return [
            'trailing dot' => ['https://example.com./job', ['example.com' => $public]],
            'unicode (IDN) hostname' => ['https://日本語.example/job', ['xn--wgv71a119e.example' => $public]],
            'fullwidth hostname' => ['https://ｅｘａｍｐｌｅ.com/job', ['example.com' => $public]],
        ];
    }

    /**
     * 入力の表記のまま送ろうとした場合(=修正前の挙動)は、送信せずに拒否する。
     *
     * @param array<string, list<string>> $dnsMap
     */
    #[DataProvider('inputUrlsThatWouldBypassThePin')]
    public function test_sending_the_raw_input_url_is_refused_before_any_request(string $input, array $dnsMap): void
    {
        $safety = $this->verify($input, $dnsMap);

        try {
            $this->fetcher()->assertRequestTargetsVerifiedHost($input, $safety);
            $this->fail('検証済みのホスト名と異なるURLの送信を拒否しませんでした。');
        } catch (UrlSafetyException $e) {
            $this->assertSame('invalid_url', $e->errorCode());
        }
    }

    public function test_request_to_a_different_host_than_the_verified_one_is_refused(): void
    {
        $safety = $this->verify('https://example.com/job', ['example.com' => ['93.184.216.34']]);

        $this->expectException(UrlSafetyException::class);

        $this->fetcher()->assertRequestTargetsVerifiedHost('https://internal.example.com/job', $safety);
    }
}
