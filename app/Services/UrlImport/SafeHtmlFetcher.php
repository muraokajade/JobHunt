<?php

namespace App\Services\UrlImport;

use App\Exceptions\UrlImport\UrlFetchException;
use App\Exceptions\UrlImport\UrlSafetyException;
use GuzzleHttp\Psr7\Uri;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * URLを1件だけ安全に取得する。
 *
 * 責務: HTTP取得(リダイレクトの手動追跡・ステータス/Content-Type/サイズの検証・
 * 検証済みIPへの接続固定)のみ。URLそのものの安全性判定(SSRF対策)はUrlSafetyValidatorへ
 * 委譲し、初回URLと各リダイレクト先の両方に対して必ず同じ検証を通す
 * (HTTPクライアントにリダイレクト追跡やDNS解決を任せない)。
 *
 * DNS rebinding/TOCTOU対策: UrlSafetyValidator::assertSafe()が返す検証済みIPを
 * PinnedConnectionOptionsでcURLのCURLOPT_RESOLVEへ渡し、実際の接続先をそのIPへ固定する。
 *
 * CURLOPT_RESOLVEは「cURLが使うホスト名」と「固定したホスト名」が文字列として一致したときだけ効き、
 * 一致しなければcURLは黙って自分でDNSを引き直す。そこで送信するURLのホスト名は、入力URLの表記
 * (末尾ドット・大文字・Unicode/全角など)ではなく、検証済み・正規化済みのホスト名へ置き換える
 * (buildRequestUrl)。さらに送信直前に両者の一致を確かめ、食い違えば送信せずに拒否する
 * (assertRequestTargetsVerifiedHost)。Hostヘッダー・TLSのSNI/証明書検証もこのホスト名で行われる。
 * これにより「検証したIP」と「実際に接続するIP」が分離しない。
 */
class SafeHtmlFetcher
{
    private const USER_AGENT = 'SideProjectCrmPreviewBot/1.0 (+personal local use; single URL fetch)';

    private const MAX_REDIRECTS = 3;

    private const MAX_BYTES = 2 * 1024 * 1024; // 2MB (Content-Encodingによる展開後のサイズに適用)

    private const CONNECT_TIMEOUT_SECONDS = 3;

    private const REQUEST_TIMEOUT_SECONDS = 6;

    /**
     * リダイレクト追跡を含めた取得全体の上限秒数。
     * 1リクエストごとの上限だけでは、リダイレクトの数だけ時間が積み上がってしまうため、
     * 全体にも締め切りを設けて「いつまでも終わらない」状態を防ぐ。
     */
    private const MAX_TOTAL_SECONDS = 15;

    private const REDIRECT_STATUSES = [301, 302, 303, 307, 308];

    public function __construct(private readonly UrlSafetyValidator $safetyValidator)
    {
    }

    /**
     * @return array{html: string, final_url: string}
     */
    public function fetch(string $url): array
    {
        $currentUrl = $url;
        $deadline = microtime(true) + self::MAX_TOTAL_SECONDS;

        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            // リダイレクト先でも毎回: URL検証→DNS解決→公開IP判定を必ずやり直す。
            $safety = $this->safetyValidator->assertSafe($currentUrl);

            // 送信するURLのホスト名は、接続先を固定したホスト名と同じ(検証済み・正規化済み)ものにする。
            // リダイレクト先の解決(相対パス等)は、利用者・取得先が示した元のURLを基準に行う。
            $response = $this->send(
                $this->buildRequestUrl($currentUrl, $safety),
                $safety,
                $this->remainingSeconds($deadline)
            );

            if (in_array($response->status(), self::REDIRECT_STATUSES, true)) {
                if ($hop === self::MAX_REDIRECTS) {
                    throw new UrlSafetyException('too_many_redirects', 'リダイレクトの回数が上限を超えました。');
                }

                $location = $response->header('Location');

                if (! is_string($location) || $location === '') {
                    throw new UrlFetchException('unexpected_http_status', 'リダイレクト応答にLocationヘッダーがありません。');
                }

                $currentUrl = $this->resolveRedirectLocation($currentUrl, $location);

                // ログイン画面へ飛ばされた場合、これ以上たどっても求人情報は得られない。
                if ($this->looksLikeLoginUrl($currentUrl)) {
                    throw new UrlFetchException('redirected_to_login', 'ログインページへリダイレクトされました。');
                }

                continue;
            }

            $this->assertSuccessfulStatus($response);
            $this->assertHtmlContentType($response);

            return [
                'html' => $this->readBodyWithLimit($response),
                'final_url' => $currentUrl,
            ];
        }

        throw new UrlSafetyException('too_many_redirects', 'リダイレクトの回数が上限を超えました。');
    }

    /**
     * UrlSafetyValidatorの検証結果(host/port/検証済みIP)から、
     * 実際の接続先をそのIPへ固定するHTTPクライアントオプションを組み立てる。
     * (DNS rebinding対策の中核。テストで直接確認できるよう独立したメソッドにしている)
     *
     * @param array{scheme: string, host: string, port: int, ips: list<string>} $safety
     * @return array<string, mixed>
     */
    public function buildConnectionOptions(array $safety): array
    {
        if ($safety['ips'] === []) {
            // assertSafe()が空配列を返すことは無いはずだが、多層防御として明示的に拒否する。
            throw new UrlSafetyException('dns_resolution_failed', 'ホスト名を解決できませんでした。');
        }

        return array_merge(
            [
                'allow_redirects' => false,
                'stream' => true,
                // Content-Encoding(gzip等)は展開してから読み込む。
                // サイズ上限(readBodyWithLimit)は展開後のバイト数に適用されるため、
                // 圧縮された小さいペイロードが展開後に巨大化する(gzip bomb)攻撃にも対応できる。
                'decode_content' => true,
            ],
            PinnedConnectionOptions::build($safety['host'], $safety['port'], $safety['ips'])
        );
    }

    /**
     * 実際に送信するURLを作る。ホスト名だけを、UrlSafetyValidatorが検証・正規化したもの
     * (小文字・末尾ドットなし・IDNはpunycode)へ置き換え、scheme・path・query・portはそのまま保つ。
     * fragmentはサーバーへ送られないため落とす。
     * (テストで直接確認できるよう独立したメソッドにしている)
     *
     * @param array{scheme: string, host: string, port: int, ips: list<string>} $safety
     */
    public function buildRequestUrl(string $url, array $safety): string
    {
        $host = filter_var($safety['host'], FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false
            ? "[{$safety['host']}]"
            : $safety['host'];

        try {
            return (string) (new Uri($url))->withHost($host)->withFragment('');
        } catch (\InvalidArgumentException) {
            // 検証は通ったがURLとして組み立て直せない場合も、送信せずに拒否する。
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }
    }

    /**
     * 送信直前の最終確認: 送信するURLのホスト名が、接続先を固定した(検証済みの)ホスト名と一致すること。
     * 一致しなければCURLOPT_RESOLVEが効かずcURLがDNSを引き直すため、送信せずに拒否する。
     *
     * buildRequestUrlで同じ値から組み立てているので通常は必ず一致するが、送信の入口(send)で
     * 不変条件として確かめておくことで、将来の変更で元のURLを渡してしまっても安全側に倒れる。
     *
     * @param array{scheme: string, host: string, port: int, ips: list<string>} $safety
     */
    public function assertRequestTargetsVerifiedHost(string $url, array $safety): void
    {
        try {
            $host = strtolower(trim((new Uri($url))->getHost(), '[]'));
        } catch (\InvalidArgumentException) {
            $host = null;
        }

        if ($host !== $safety['host']) {
            throw new UrlSafetyException('invalid_url', 'URLを解釈できませんでした。');
        }
    }

    /**
     * 全体の締め切りまでの残り秒数。使い切っていればタイムアウトとして中断する。
     */
    private function remainingSeconds(float $deadline): int
    {
        $remaining = $deadline - microtime(true);

        if ($remaining <= 0) {
            throw new UrlFetchException('timeout', '接続がタイムアウトしました。');
        }

        // 1リクエストの上限と、全体の残り時間の短いほうを採用する。
        return max(1, (int) ceil(min((float) self::REQUEST_TIMEOUT_SECONDS, $remaining)));
    }

    private function send(string $url, array $safety, int $timeoutSeconds): Response
    {
        $this->assertRequestTargetsVerifiedHost($url, $safety);

        try {
            return Http::withHeaders(['User-Agent' => self::USER_AGENT])
                ->connectTimeout(min(self::CONNECT_TIMEOUT_SECONDS, $timeoutSeconds))
                ->timeout($timeoutSeconds)
                ->withOptions($this->buildConnectionOptions($safety))
                ->get($url);
        } catch (ConnectionException $e) {
            // $e->getMessage()の内容(接続先IP等を含む場合がある)はそのまま利用者へ返さない。
            $message = strtolower($e->getMessage());

            if (str_contains($message, 'timed out') || str_contains($message, 'timeout')) {
                throw new UrlFetchException('timeout', '接続がタイムアウトしました。');
            }

            throw new UrlFetchException('connection_failed', '接続に失敗しました。');
        }
    }

    /**
     * リダイレクト先がログイン画面とみられるか(パスの断片で判定する)。
     */
    private function looksLikeLoginUrl(string $url): bool
    {
        $path = strtolower((string) (parse_url($url, PHP_URL_PATH) ?? ''));

        foreach (['/login', '/signin', '/sign_in', '/auth/', '/session/new'] as $fragment) {
            if (str_contains($path, $fragment)) {
                return true;
            }
        }

        return false;
    }

    private function assertSuccessfulStatus(Response $response): void
    {
        $status = $response->status();

        if ($status >= 200 && $status < 300) {
            return;
        }

        throw new UrlFetchException(...match (true) {
            // 401/403は、利用者のログインが必要なページである可能性が高い。
            // 呼び出し側(ImportPreviewController)が手入力誘導へ振り分ける。
            $status === 401 => ['requires_login', 'ログインが必要なページです(401)。'],
            $status === 403 => ['forbidden', 'アクセスが拒否されました(403)。'],
            $status === 404 => ['not_found', 'ページが見つかりませんでした(404)。'],
            $status === 429 => ['rate_limited', 'リクエストが制限されました(429)。'],
            $status >= 500 => ['upstream_server_error', '取得先でサーバーエラーが発生しました。'],
            default => ['unexpected_http_status', "予期しないステータスコードでした({$status})。"],
        });
    }

    private function assertHtmlContentType(Response $response): void
    {
        // "text/html; charset=UTF-8" のようにcharsetが付与されていてもtext/htmlとして扱う。
        $contentType = strtolower((string) $response->header('Content-Type'));

        if (! str_starts_with($contentType, 'text/html')) {
            throw new UrlFetchException('unsupported_content_type', 'HTML以外のコンテンツは取得できません。');
        }
    }

    private function readBodyWithLimit(Response $response): string
    {
        $stream = $response->toPsrResponse()->getBody();

        $contents = '';

        while (! $stream->eof()) {
            $contents .= $stream->read(8192);

            if (strlen($contents) > self::MAX_BYTES) {
                throw new UrlFetchException('response_too_large', '応答サイズが上限を超えました。');
            }
        }

        return $contents;
    }

    /**
     * リダイレクト先を絶対URLへ解決する。以下の形式に対応する。
     * - 絶対URL("https://example.com/path")
     * - プロトコル相対URL("//example.com/path") … 現在のリクエストのschemeを継承する
     * - ルート相対パス("/path")
     * - 相対パス("path")
     *
     * scheme(http↔https)が変わる場合も、次のループでUrlSafetyValidatorが
     * 新しいschemeを含めて改めて検証するため、ここでは変換のみを行う。
     */
    private function resolveRedirectLocation(string $baseUrl, string $location): string
    {
        if (preg_match('#^https?://#i', $location) === 1) {
            return $location;
        }

        $base = parse_url($baseUrl);
        $scheme = $base['scheme'] ?? 'https';

        if (str_starts_with($location, '//')) {
            return "{$scheme}:{$location}";
        }

        $host = $base['host'] ?? '';
        $port = isset($base['port']) ? ':' . $base['port'] : '';
        $origin = "{$scheme}://{$host}{$port}";

        if (str_starts_with($location, '/')) {
            return $origin . $location;
        }

        $basePath = $base['path'] ?? '/';
        $lastSlash = strrpos($basePath, '/');
        $baseDir = $lastSlash !== false ? substr($basePath, 0, $lastSlash) : '';

        return $origin . $baseDir . '/' . $location;
    }
}
