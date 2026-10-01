<?php

namespace App\Services\UrlImport;

use App\Exceptions\UrlImport\UrlSafetyException;

/**
 * URLがSSRFの踏み台にならないことを検証する。
 *
 * HTTP取得やリダイレクト追跡には関与せず、「このURL(1件)は安全に接続してよいか」だけを判定する。
 * 初回URLだけでなく、各リダイレクト先にも必ずこの同じ検証を通す(呼び出し側であるSafeHtmlFetcherの責務)。
 *
 * assertSafe()が返す`ips`(検証済みの公開IP一覧)は、SafeHtmlFetcherが実際の接続先を
 * このIPへ固定する(PinnedConnectionOptions)ために使う。検証時と接続時が別々にDNS解決を行い
 * 異なるIPへ到達してしまう、いわゆるDNS rebinding/TOCTOUを防ぐための設計。
 */
class UrlSafetyValidator
{
    private const ALLOWED_SCHEMES = ['http', 'https'];

    private const BLOCKED_HOSTNAMES = ['localhost'];

    private const BLOCKED_HOSTNAME_SUFFIXES = ['.local'];

    public function __construct(private readonly HostResolver $resolver)
    {
    }

    /**
     * @return array{scheme: string, host: string, port: int, ips: list<string>}
     */
    public function assertSafe(string $url): array
    {
        $parts = parse_url($url);

        if ($parts === false) {
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }

        $scheme = strtolower($parts['scheme'] ?? '');

        if ($scheme === '') {
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }

        if (! in_array($scheme, self::ALLOWED_SCHEMES, true)) {
            throw new UrlSafetyException('unsupported_scheme', 'httpまたはhttps以外のURLは許可されていません。');
        }

        if (! isset($parts['host']) || $parts['host'] === '') {
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            throw new UrlSafetyException('credentials_in_url', 'URLに認証情報を含めることは許可されていません。');
        }

        $host = $this->normalizeHost($parts['host']);
        $defaultPort = $scheme === 'https' ? 443 : 80;

        if (isset($parts['port']) && (int) $parts['port'] !== $defaultPort) {
            throw new UrlSafetyException('invalid_port', '許可されていないポートが指定されています。');
        }

        if (in_array($host, self::BLOCKED_HOSTNAMES, true)) {
            throw new UrlSafetyException('blocked_host', 'アクセスが許可されていないホストです。');
        }

        foreach (self::BLOCKED_HOSTNAME_SUFFIXES as $suffix) {
            if (str_ends_with($host, $suffix)) {
                throw new UrlSafetyException('blocked_host', 'アクセスが許可されていないホストです。');
            }
        }

        // 標準形式のIP以外で「最後のラベルが数値」のホスト名(2130706433・0x7f.1・127.1・0177.0.0.1等)は、
        // DNS解決より前に拒否する。cURL/ブラウザ(WHATWG URL)はこれらをIPv4アドレスとして解釈し直して
        // 直接接続するため、ここでDNS名として検証すると、検証した接続先と実際の接続先が食い違う。
        // 数値のみのTLDは存在しないので、正規のホスト名(123.example.com等)はこの条件に当たらない。
        if (filter_var($host, FILTER_VALIDATE_IP) === false && self::endsInNumber($host)) {
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }

        $ips = filter_var($host, FILTER_VALIDATE_IP) !== false
            ? [$host]
            : $this->resolver->resolve($host);

        if ($ips === []) {
            throw new UrlSafetyException('dns_resolution_failed', 'ホスト名を解決できませんでした。');
        }

        foreach ($ips as $ip) {
            if (IpRangeGuard::isBlocked($ip)) {
                throw new UrlSafetyException('blocked_host', 'アクセスが許可されていないIPアドレスへ到達するホストです。');
            }
        }

        return ['scheme' => $scheme, 'host' => $host, 'port' => $defaultPort, 'ips' => $ips];
    }

    /**
     * WHATWG URL Standardの「ends in a number」判定。最後のラベルが10進数字だけ、または
     * 0x/0Xで始まる16進数のとき真。真ならURLパーサはホスト全体をIPv4アドレスとして解釈する。
     * (末尾ドットはnormalizeHostで除去済み)
     */
    private static function endsInNumber(string $host): bool
    {
        $labels = explode('.', $host);
        $last = end($labels);

        return $last !== '' && preg_match('/\A(?:[0-9]+|0x[0-9a-f]*)\z/i', $last) === 1;
    }

    /**
     * ホスト名の末尾ドット(FQDN表記、"localhost."等)を除去し、
     * 国際化ドメイン名(IDN)はASCII(punycode)へ正規化してから比較・DNS解決を行う。
     * これにより、末尾ドット付与やIDN表記による拒否リストの回避を防ぐ。
     */
    private function normalizeHost(string $host): string
    {
        $host = strtolower(trim($host, '[]'));
        $host = rtrim($host, '.');

        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return $host;
        }

        if (function_exists('idn_to_ascii')) {
            $ascii = idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);

            if ($ascii !== false) {
                return $ascii;
            }
        }

        return $host;
    }
}
