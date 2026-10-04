<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 公開LP(/)とアプリ本体(/app)の出し分け。
 *
 * LPはログイン前の閲覧者(採用担当など)が見る説明ページなので、Basic認証を有効にしていても見られる。
 * アプリ本体とAPIは、これまでどおりBasic認証の対象のまま。
 */
class LandingPageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    private function enableBasicAuth(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);
    }

    public function test_landing_page_is_served_at_root(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
        $response->assertSee('転職活動を、');
        $response->assertSee('求人URLから登録');
        // LPはReactのSPAではない(アプリの入れ物を返していない)
        $response->assertDontSee('<div id="app"></div>', false);
    }

    public function test_landing_page_links_to_the_app(): void
    {
        $this->get('/')->assertSee('href="/app"', false);
    }

    public function test_landing_page_is_public_even_when_basic_auth_is_enabled(): void
    {
        $this->enableBasicAuth();

        $this->get('/')->assertStatus(200);
        // アプリを開くと認証を求められることを、LPで先に伝える
        $this->get('/')->assertSee('アクセス用のIDとパスワード');
    }

    public function test_landing_page_does_not_mention_access_restriction_when_basic_auth_is_disabled(): void
    {
        config(['access.password' => '']);

        $this->get('/')->assertDontSee('アクセス用のIDとパスワード');
    }

    public function test_only_reading_the_landing_page_is_exempt_from_basic_auth(): void
    {
        $this->enableBasicAuth();

        // 同じ / でも、読み取り以外は保護したまま
        $this->post('/')->assertStatus(401);
    }

    public function test_app_still_requires_basic_auth(): void
    {
        $this->enableBasicAuth();

        $this->get('/app')->assertStatus(401);
        $this->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_app_serves_the_spa_shell(): void
    {
        $response = $this->get('/app');

        $response->assertStatus(200);
        $response->assertSee('<div id="app"></div>', false);
        $response->assertSee('<meta name="csrf-token"', false);
    }
}
