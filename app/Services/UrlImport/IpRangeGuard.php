<?php

namespace App\Services\UrlImport;

/**
 * IPアドレスがループバック・プライベート・リンクローカル・予約済み・マルチキャスト等の
 * 「非公開」範囲に該当するかどうかを判定する。
 *
 * UrlSafetyValidator(DNS解決結果/リテラルIPの検査)とPinnedConnectionOptions
 * (接続直前の再検査、多層防御)の両方から同じ判定ロジックを共有するために分離している。
 */
final class IpRangeGuard
{
    /**
     * ループバック・プライベート・リンクローカル・予約済み・マルチキャスト等のIPv4 CIDR。
     *
     * @var list<string>
     */
    private const BLOCKED_IPV4_CIDRS = [
        '0.0.0.0/8',       // "this network"
        '10.0.0.0/8',      // private
        '100.64.0.0/10',   // shared address space (CGNAT)
        '127.0.0.0/8',     // loopback
        '169.254.0.0/16',  // link-local
        '172.16.0.0/12',   // private
        '192.0.0.0/24',    // IETF protocol assignments
        '192.0.2.0/24',    // TEST-NET-1
        '192.88.99.0/24',  // 6to4 relay anycast
        '192.168.0.0/16',  // private
        '198.18.0.0/15',   // benchmark testing
        '198.51.100.0/24', // TEST-NET-2
        '203.0.113.0/24',  // TEST-NET-3
        '224.0.0.0/4',     // multicast
        '240.0.0.0/4',     // reserved
    ];

    /**
     * ループバック・ユニークローカル・リンクローカル・マルチキャスト等のIPv6 CIDR。
     *
     * @var list<string>
     */
    private const BLOCKED_IPV6_CIDRS = [
        '::1/128',        // loopback
        '::/128',         // unspecified
        '::/96',          // IPv4-compatible (非推奨, RFC 4291)。::127.0.0.1 等の埋め込みIPv4を通さない
        '64:ff9b::/96',   // NAT64
        '100::/64',       // discard-only
        '2001:db8::/32',  // documentation
        'fc00::/7',       // unique local (ULA)
        'fe80::/10',       // link-local
        'ff00::/8',        // multicast
    ];

    public static function isBlocked(string $ip): bool
    {
        $binary = @inet_pton($ip);

        if ($binary === false) {
            return true; // 解釈できないIPは安全側に倒して拒否する
        }

        if (strlen($binary) === 16) {
            $isIpv4Mapped = substr($binary, 0, 12) === "\0\0\0\0\0\0\0\0\0\0\xff\xff";

            if ($isIpv4Mapped) {
                $embeddedIpv4 = inet_ntop(substr($binary, 12, 4));

                if ($embeddedIpv4 !== false && self::isBlocked($embeddedIpv4)) {
                    return true;
                }
            }
        }

        $cidrs = strlen($binary) === 4 ? self::BLOCKED_IPV4_CIDRS : self::BLOCKED_IPV6_CIDRS;

        foreach ($cidrs as $cidr) {
            if (self::ipInCidr($binary, $cidr)) {
                return true;
            }
        }

        return false;
    }

    private static function ipInCidr(string $binaryIp, string $cidr): bool
    {
        [$subnet, $prefixLength] = explode('/', $cidr);
        $binarySubnet = @inet_pton($subnet);

        if ($binarySubnet === false || strlen($binarySubnet) !== strlen($binaryIp)) {
            return false;
        }

        $prefixLength = (int) $prefixLength;
        $fullBytes = intdiv($prefixLength, 8);
        $remainingBits = $prefixLength % 8;

        if ($fullBytes > 0 && substr($binaryIp, 0, $fullBytes) !== substr($binarySubnet, 0, $fullBytes)) {
            return false;
        }

        if ($remainingBits === 0) {
            return true;
        }

        $mask = chr((0xFF << (8 - $remainingBits)) & 0xFF);

        return (substr($binaryIp, $fullBytes, 1) & $mask) === (substr($binarySubnet, $fullBytes, 1) & $mask);
    }
}
