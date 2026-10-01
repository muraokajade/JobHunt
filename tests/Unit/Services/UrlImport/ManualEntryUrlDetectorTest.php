<?php

namespace Tests\Unit\Services\UrlImport;

use App\Services\UrlImport\ManualEntryUrlDetector;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * ログイン必須ページ(応募履歴等)の判定。
 * JobHuntのサーバーは利用者のCookieを持たないため、これらは自動取得できない。
 */
class ManualEntryUrlDetectorTest extends TestCase
{
    private function detector(): ManualEntryUrlDetector
    {
        return new ManualEntryUrlDetector();
    }

    /**
     * @return list<array{0: string}>
     */
    public static function loginRequiredUrlProvider(): array
    {
        return [
            'type 応募履歴' => ['https://type.jp/entry_history/entry_message_list/12345/'],
            'type 応募履歴(短い形)' => ['https://type.jp/entry_history/'],
            'type メッセージ一覧' => ['https://type.jp/entry_message_list/999'],
            'www あり' => ['https://www.type.jp/entry_history/entry_message_list/1'],
            'クエリ付き' => ['https://type.jp/entry_history/list?page=2'],
        ];
    }

    #[DataProvider('loginRequiredUrlProvider')]
    public function test_login_required_urls_are_detected(string $url): void
    {
        $this->assertTrue($this->detector()->requiresManualEntry($url));
    }

    /**
     * @return list<array{0: string}>
     */
    public static function publicUrlProvider(): array
    {
        return [
            'type 公開求人' => ['https://type.jp/job-1/0000001_detail/'],
            'type トップ' => ['https://type.jp/'],
            '別サイトで似たパス' => ['https://example.com/entry_history/1'],
            'CrowdWorks' => ['https://crowdworks.jp/public/jobs/123'],
        ];
    }

    #[DataProvider('publicUrlProvider')]
    public function test_public_urls_are_not_detected(string $url): void
    {
        $this->assertFalse($this->detector()->requiresManualEntry($url));
    }

    public function test_login_required_error_codes_are_recognised(): void
    {
        $detector = $this->detector();

        $this->assertTrue($detector->isLoginRequiredErrorCode('requires_login'));
        $this->assertTrue($detector->isLoginRequiredErrorCode('forbidden'));
        $this->assertTrue($detector->isLoginRequiredErrorCode('redirected_to_login'));
    }

    public function test_other_error_codes_are_not_treated_as_login_required(): void
    {
        $detector = $this->detector();

        foreach (['not_found', 'timeout', 'connection_failed', 'rate_limited', 'upstream_server_error'] as $code) {
            $this->assertFalse($detector->isLoginRequiredErrorCode($code), $code);
        }
    }
}
