<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 環境全体のBasic認証(EnsureCrmAccess)。
 *
 * 設定値はconfig('access.*')から読む必要がある。ミドルウェアが直接env()を読むと
 * config:cache 実行後にnullが返り、Basic認証が無言で無効化される
 * (=誰でも到達できてしまう)ため、その退行をここで検出する。
 *
 * 保護対象の代表としてアプリ本体(/app)を使う。公開LP(/)が対象外であることは LandingPageTest で確認する。
 */
class EnsureCrmAccessTest extends TestCase
{
    use RefreshDatabase;

    // ---- 無効時(パスワード未設定) ----------------------------------------

    public function test_access_is_not_restricted_when_password_is_not_configured(): void
    {
        config(['access.password' => '']);

        $this->get('/app')->assertStatus(200);
    }

    // ---- 有効時 -----------------------------------------------------------

    public function test_request_without_credentials_is_rejected(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        $response = $this->get('/app');

        $response->assertStatus(401);
        $response->assertHeader('WWW-Authenticate', 'Basic realm="Side Project CRM", charset="UTF-8"');
    }

    public function test_request_with_wrong_password_is_rejected(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        $this->withBasicAuth('monitor', 'wrong-password')
            ->get('/app')
            ->assertStatus(401);
    }

    public function test_request_with_wrong_user_is_rejected(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        $this->withBasicAuth('someone-else', 'beta-secret')
            ->get('/app')
            ->assertStatus(401);
    }

    public function test_request_with_correct_credentials_is_allowed(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        $this->withBasicAuth('monitor', 'beta-secret')
            ->get('/app')
            ->assertStatus(200);
    }

    public function test_api_routes_are_also_protected(): void
    {
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        // Basic認証を通らない限り、アプリ内ログインの前段で弾かれる。
        $this->getJson('/api/auth/me')->assertStatus(401);

        // Basic認証を通した場合は、アプリ内認証の判定(未ログインなので401)に到達する。
        $this->withBasicAuth('monitor', 'beta-secret')
            ->getJson('/api/auth/me')
            ->assertStatus(401);
    }

    // ---- config:cache 後の退行検出 ----------------------------------------

    public function test_basic_auth_still_applies_when_env_is_unavailable_as_after_config_cache(): void
    {
        // config:cache 後は env() がnullを返す状態と等価になる。
        // ミドルウェアがenv()を直接読んでいると、ここでBasic認証が素通り(200)になり失敗する。
        config(['access.user' => 'monitor', 'access.password' => 'beta-secret']);

        $originalUser = $_ENV['APP_ACCESS_USER'] ?? null;
        $originalPassword = $_ENV['APP_ACCESS_PASSWORD'] ?? null;
        unset($_ENV['APP_ACCESS_USER'], $_ENV['APP_ACCESS_PASSWORD']);
        putenv('APP_ACCESS_USER');
        putenv('APP_ACCESS_PASSWORD');

        try {
            $this->get('/app')->assertStatus(401);

            $this->withBasicAuth('monitor', 'beta-secret')
                ->get('/app')
                ->assertStatus(200);
        } finally {
            if ($originalUser !== null) {
                $_ENV['APP_ACCESS_USER'] = $originalUser;
            }
            if ($originalPassword !== null) {
                $_ENV['APP_ACCESS_PASSWORD'] = $originalPassword;
            }
        }
    }

    public function test_config_values_come_from_the_access_config_file(): void
    {
        // 設定の置き場所が config/access.php であること(ミドルウェアの参照先と一致すること)。
        $this->assertSame('admin', config('access.user'));
        $this->assertSame('', config('access.password'));
    }
}
