<?php

namespace Tests\Unit\Services\UrlImport;

use App\Exceptions\UrlImport\UrlSafetyException;
use App\Services\UrlImport\HostResolver;
use App\Services\UrlImport\UrlSafetyValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Tests\Support\FakeHostResolver;

class UrlSafetyValidatorTest extends TestCase
{
    private function validator(array $dnsMap = []): UrlSafetyValidator
    {
        return new UrlSafetyValidator(new FakeHostResolver($dnsMap));
    }

    public function test_valid_public_https_url_passes(): void
    {
        $validator = $this->validator(['example.com' => ['8.8.8.8']]);

        $result = $validator->assertSafe('https://example.com/public/jobs/1');

        $this->assertSame('https', $result['scheme']);
        $this->assertSame('example.com', $result['host']);
        $this->assertSame(['8.8.8.8'], $result['ips']);
    }

    public function test_http_scheme_is_allowed(): void
    {
        $validator = $this->validator(['example.com' => ['8.8.8.8']]);

        $result = $validator->assertSafe('http://example.com/');

        $this->assertSame('http', $result['scheme']);
    }

    #[DataProvider('unsupportedSchemeUrls')]
    public function test_unsupported_scheme_is_rejected(string $url): void
    {
        $validator = $this->validator();

        try {
            $validator->assertSafe($url);
            $this->fail('UrlSafetyExceptionが発生しませんでした。');
        } catch (UrlSafetyException $e) {
            $this->assertSame('unsupported_scheme', $e->errorCode());
        }
    }

    public static function unsupportedSchemeUrls(): array
    {
        return [
            'file scheme' => ['file:///etc/passwd'],
            'ftp scheme' => ['ftp://example.com/file'],
        ];
    }

    public function test_credentials_in_url_are_rejected(): void
    {
        $validator = $this->validator(['example.com' => ['8.8.8.8']]);

        $this->expectSafetyRejection($validator, 'https://user:pass@example.com/', 'credentials_in_url');
    }

    public function test_localhost_hostname_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'http://localhost/', 'blocked_host');
    }

    public function test_dot_local_hostname_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'http://myhost.local/', 'blocked_host');
    }

    public function test_ipv4_loopback_literal_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'http://127.0.0.1/', 'blocked_host');
    }

    public function test_ipv6_loopback_literal_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'http://[::1]/', 'blocked_host');
    }

    #[DataProvider('blockedIpv4Literals')]
    public function test_private_link_local_and_reserved_ipv4_literals_are_rejected(string $ip): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, "http://{$ip}/", 'blocked_host');
    }

    public static function blockedIpv4Literals(): array
    {
        return [
            'private 10/8' => ['10.1.2.3'],
            'private 172.16/12' => ['172.16.5.5'],
            'private 192.168/16' => ['192.168.1.1'],
            'link-local' => ['169.254.1.1'],
            'cgnat' => ['100.64.1.1'],
            'test-net-1' => ['192.0.2.1'],
            'test-net-2' => ['198.51.100.1'],
            'test-net-3' => ['203.0.113.1'],
            'benchmark' => ['198.18.0.1'],
            'multicast' => ['224.0.0.1'],
            'reserved' => ['240.0.0.1'],
            'this-network' => ['0.0.0.1'],
        ];
    }

    #[DataProvider('blockedIpv6Literals')]
    public function test_private_link_local_and_reserved_ipv6_literals_are_rejected(string $ip): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, "http://[{$ip}]/", 'blocked_host');
    }

    public static function blockedIpv6Literals(): array
    {
        return [
            'unique local' => ['fc00::1'],
            'link-local' => ['fe80::1'],
            'multicast' => ['ff02::1'],
            'ipv4-mapped loopback' => ['::ffff:127.0.0.1'],
            'ipv4-mapped private' => ['::ffff:10.0.0.1'],
        ];
    }

    public function test_invalid_port_is_rejected(): void
    {
        $validator = $this->validator(['example.com' => ['8.8.8.8']]);

        $this->expectSafetyRejection($validator, 'http://example.com:8080/', 'invalid_port');
    }

    public function test_explicit_default_port_is_allowed(): void
    {
        $validator = $this->validator(['example.com' => ['8.8.8.8']]);

        $result = $validator->assertSafe('https://example.com:443/');

        $this->assertSame(443, $result['port']);
    }

    public function test_unresolvable_hostname_is_rejected(): void
    {
        $validator = $this->validator([]); // 解決結果なし

        $this->expectSafetyRejection($validator, 'https://does-not-resolve.example/', 'dns_resolution_failed');
    }

    public function test_hostname_resolving_to_private_ip_is_rejected(): void
    {
        $validator = $this->validator(['internal.example.com' => ['10.0.0.5']]);

        $this->expectSafetyRejection($validator, 'https://internal.example.com/', 'blocked_host');
    }

    public function test_hostname_resolving_to_mixed_public_and_private_ip_is_rejected(): void
    {
        // 1件でも非公開IPを含む場合は全体を拒否する。
        $validator = $this->validator(['mixed.example.com' => ['8.8.8.8', '127.0.0.1']]);

        $this->expectSafetyRejection($validator, 'https://mixed.example.com/', 'blocked_host');
    }

    public function test_invalid_url_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'not a url', 'invalid_url');
    }

    public function test_trailing_dot_fqdn_localhost_is_rejected_like_localhost(): void
    {
        $validator = $this->validator();

        // "localhost."(末尾ドット付きFQDN表記)で拒否リストのテキスト一致を回避できないことを確認する。
        $this->expectSafetyRejection($validator, 'http://localhost./', 'blocked_host');
    }

    public function test_trailing_dot_fqdn_dot_local_suffix_is_rejected(): void
    {
        $validator = $this->validator();

        $this->expectSafetyRejection($validator, 'http://myhost.local./', 'blocked_host');
    }

    public function test_punycode_internationalized_domain_name_is_resolved_normally(): void
    {
        // 実際のHTTPクライアント/ブラウザは国際化ドメイン名(IDN)をpunycode(ASCII)化して
        // 送信するため、"xn--wgv71a119e.example"("日本語.example"のpunycode表現)が
        // 通常のASCIIホスト名と同様にDNS解決・検証されることを確認する。
        $validator = $this->validator(['xn--wgv71a119e.example' => ['8.8.8.8']]);

        $result = $validator->assertSafe('https://xn--wgv71a119e.example/');

        $this->assertSame(['8.8.8.8'], $result['ips']);
    }

    /*
     * ---- Unicode(IDN)ホスト名 ----------------------------------------------
     *
     * UrlSafetyValidatorは、Unicodeのホスト名をidn_to_ascii(UTS46)でpunycode(ASCII)へ正規化してから
     * 拒否リスト照合とDNS解決を行い、解決されたIPは必ずIpRangeGuardで検査する。
     *
     * idn_to_asciiはPHPのintl拡張が無くても使える。laravel/framework → symfony/mime が依存する
     * symfony/polyfill-intl-idn(本番依存)が同名の関数を提供するため。
     * したがってJobHuntでは、intl拡張の有無に関係なくIDN正規化は常に行われる。
     *
     * 保証すべき要件は「Unicodeのホスト名は必ず拒否される」ことではなく(正しいIDNは取得できる)、
     * 「Unicodeのホスト名でも、解決先が非公開・予約済みIPなら必ず拒否され、
     *   解決できなければ安全側(拒否)に倒れる」ことである。
     * 以下の拒否テストは、偽DNSに元の表記とpunycode表記の両方を登録している。
     * 正規化の経路が将来変わっても、IP検査による拒否が成り立つことを同時に確認するため。
     */

    /**
     * @return array<string, array{string}>
     */
    public static function blockedIpsForUnicodeHostname(): array
    {
        return [
            'private (10/8)' => ['10.0.0.1'],
            'loopback' => ['127.0.0.1'],
            'link-local (cloud metadata)' => ['169.254.169.254'],
            'CGNAT (100.64/10)' => ['100.64.0.1'],
            'IPv6 loopback' => ['::1'],
            'IPv6 unique local' => ['fd00::1'],
        ];
    }

    #[DataProvider('blockedIpsForUnicodeHostname')]
    public function test_unicode_hostname_resolving_to_blocked_ip_is_rejected(string $blockedIp): void
    {
        $validator = $this->validator([
            '日本語.example' => [$blockedIp],
            'xn--wgv71a119e.example' => [$blockedIp],
        ]);

        $this->expectSafetyRejection($validator, 'https://日本語.example/', 'blocked_host');
    }

    public function test_unicode_hostname_resolving_to_mixed_public_and_blocked_ips_is_rejected(): void
    {
        // 公開IPが混ざっていても、非公開IPが1つでもあれば拒否する(接続先を選ばせない)。
        $validator = $this->validator([
            '日本語.example' => ['8.8.8.8', '10.0.0.1'],
            'xn--wgv71a119e.example' => ['8.8.8.8', '10.0.0.1'],
        ]);

        $this->expectSafetyRejection($validator, 'https://日本語.example/', 'blocked_host');
    }

    public function test_unresolvable_unicode_hostname_fails_closed(): void
    {
        // どちらの表記でも解決できないホスト名は、検査を素通りさせず拒否する。
        $this->expectSafetyRejection($this->validator(), 'https://日本語.example/', 'dns_resolution_failed');
    }

    public function test_fullwidth_localhost_lookalike_is_rejected(): void
    {
        // 全角の「ｌｏｃａｌｈｏｓｔ」で拒否リストの文字列照合をすり抜けようとしても、
        // UTS46の正規化で"localhost"になり、DNS解決より前に拒否リストで拒否される。
        // (偽DNSは空にしている。正規化されていなければdns_resolution_failedになり、このテストは失敗する)
        $this->expectSafetyRejection($this->validator(), 'http://ｌｏｃａｌｈｏｓｔ/', 'blocked_host');
    }

    public function test_unicode_hostname_is_normalized_to_punycode_before_resolution(): void
    {
        // Unicode表記はpunycodeへ正規化してから解決・検証される(intl拡張が無くてもpolyfillで同じ)。
        // 返すhostもpunycodeになり、接続先の固定(PinnedConnectionOptions)はこのhostで行われる。
        // (偽DNSにはpunycode表記だけを登録し、元の表記では解決できないようにしている)
        $validator = $this->validator(['xn--wgv71a119e.example' => ['8.8.8.8']]);

        $result = $validator->assertSafe('https://日本語.example/');

        $this->assertSame('xn--wgv71a119e.example', $result['host']);
        $this->assertSame(['8.8.8.8'], $result['ips']);
    }

    // ---- 非標準の数値形式ホスト名 ---------------------------------------------
    //
    // cURL/ブラウザ(WHATWG URL)は、最後のラベルが数値のホスト名をIPv4アドレスとして解釈し直し、
    // 接続先の固定(CURLOPT_RESOLVE)を使わずに直接接続する。DNS名として検証すると
    // 「検証した接続先」と「実際の接続先」が食い違うため、DNS解決より前に拒否する。

    /**
     * @return array<string, array{string}>
     */
    public static function nonStandardNumericHostnames(): array
    {
        return [
            'decimal integer' => ['2130706433'],
            'octal integer' => ['017700000001'],
            'hex integer' => ['0x7f000001'],
            'hex + short form' => ['0x7f.1'],
            'two-part short form' => ['127.1'],
            'three-part short form' => ['127.0.1'],
            'octal dotted' => ['0177.0.0.1'],
        ];
    }

    #[DataProvider('nonStandardNumericHostnames')]
    public function test_non_standard_numeric_hostname_is_rejected_before_dns_resolution(string $host): void
    {
        // 最悪の条件: DNSがこの名前に公開IPを返す。それでもDNSへ問い合わせる前に拒否されること。
        $resolver = new class implements HostResolver {
            /** @var list<string> */
            public array $queried = [];

            public function resolve(string $hostname): array
            {
                $this->queried[] = $hostname;

                return ['93.184.216.34'];
            }
        };

        $this->expectSafetyRejection(new UrlSafetyValidator($resolver), "http://{$host}/", 'invalid_url');
        $this->assertSame([], $resolver->queried, 'DNSへ問い合わせてはいけません。');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function ordinaryHostnamesContainingDigits(): array
    {
        return [
            'numeric first label' => ['123.example.com'],
            'digit in label' => ['job-1.example.jp'],
            'second-level domain' => ['example.co.jp'],
        ];
    }

    #[DataProvider('ordinaryHostnamesContainingDigits')]
    public function test_ordinary_hostname_containing_digits_is_not_rejected(string $host): void
    {
        $result = $this->validator([$host => ['93.184.216.34']])->assertSafe("https://{$host}/job?id=1");

        $this->assertSame($host, $result['host']);
        $this->assertSame(['93.184.216.34'], $result['ips']);
    }

    public function test_standard_public_ipv4_literal_is_still_checked_by_ip_range_guard(): void
    {
        // 標準形式のIPv4は従来どおりIPとして扱い、範囲判定で可否を決める(数値形式の拒否とは別経路)。
        $result = $this->validator()->assertSafe('http://93.184.216.34/');
        $this->assertSame(['93.184.216.34'], $result['ips']);

        $this->expectSafetyRejection($this->validator(), 'http://127.0.0.1/', 'blocked_host');
    }

    // ---- IPv4互換IPv6 (::a.b.c.d) ----------------------------------------------

    /**
     * @return array<string, array{string}>
     */
    public static function ipv4CompatibleIpv6Literals(): array
    {
        return [
            'loopback (dotted)' => ['[::127.0.0.1]'],
            'loopback (hex)' => ['[::7f00:1]'],
            'private' => ['[::10.0.0.1]'],
            'public IPv4 embedded' => ['[::93.184.216.34]'],
        ];
    }

    #[DataProvider('ipv4CompatibleIpv6Literals')]
    public function test_ipv4_compatible_ipv6_literal_is_rejected(string $host): void
    {
        $this->expectSafetyRejection($this->validator(), "http://{$host}/", 'blocked_host');
    }

    public function test_ipv4_mapped_ipv6_literal_is_still_rejected(): void
    {
        // 既存のIPv4射影IPv6(::ffff:a.b.c.d)対策が、IPv4互換の追加で壊れていないこと。
        $this->expectSafetyRejection($this->validator(), 'http://[::ffff:127.0.0.1]/', 'blocked_host');
        $this->expectSafetyRejection($this->validator(), 'http://[::ffff:7f00:1]/', 'blocked_host');
    }

    private function expectSafetyRejection(UrlSafetyValidator $validator, string $url, string $expectedCode): void
    {
        try {
            $validator->assertSafe($url);
            $this->fail("UrlSafetyException({$expectedCode})が発生しませんでした。");
        } catch (UrlSafetyException $e) {
            $this->assertSame($expectedCode, $e->errorCode());
        }
    }
}
