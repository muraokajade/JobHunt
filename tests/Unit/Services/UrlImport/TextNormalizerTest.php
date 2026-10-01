<?php

namespace Tests\Unit\Services\UrlImport;

use App\Services\UrlImport\TextNormalizer;
use PHPUnit\Framework\TestCase;

/**
 * 求人ページの装飾・抽出ノイズの除去。
 * 本文(URL・金額・会社名・求人条件・日付)を削らないことを重視して検証する。
 */
class TextNormalizerTest extends TestCase
{
    // ---- 装飾の除去 -------------------------------------------------------

    public function test_heading_symbol_is_replaced_with_a_space_not_deleted(): void
    {
        // 単純削除すると前後の語が連結してしまうため、空白へ置き換える。
        $this->assertSame('仕事内容 応募資格', TextNormalizer::normalize('■仕事内容 ■応募資格'));
    }

    public function test_words_around_a_symbol_are_not_glued_together(): void
    {
        $this->assertSame('前半 後半', TextNormalizer::normalize('前半■後半'));
    }

    public function test_rule_lines_are_removed(): void
    {
        $this->assertSame('仕事内容', TextNormalizer::normalize('----------------■仕事内容----------------'));
        $this->assertSame('見出し', TextNormalizer::normalize('=====見出し====='));
        $this->assertSame('区切り', TextNormalizer::normalize('━━━━━区切り━━━━━'));
    }

    public function test_trailing_end_marker_is_removed(): void
    {
        $this->assertSame('募集内容の本文', TextNormalizer::normalize('募集内容の本文 END'));
        $this->assertSame('募集内容の本文', TextNormalizer::normalize('募集内容の本文 ===== END'));
    }

    public function test_whitespace_and_newlines_are_collapsed(): void
    {
        $this->assertSame('前半 後半', TextNormalizer::normalize("前半\n\n   　後半"));
    }

    public function test_empty_result_becomes_null(): void
    {
        $this->assertNull(TextNormalizer::normalize('■■■'));
        $this->assertNull(TextNormalizer::normalize('  '));
        $this->assertNull(TextNormalizer::normalize(null));
    }

    // ---- 本文を削らないこと -----------------------------------------------

    public function test_amounts_are_preserved(): void
    {
        $this->assertSame(
            '想定年収450万〜1050万円 月給37.5万〜87.5万円',
            TextNormalizer::normalize('■想定年収450万〜1050万円 月給37.5万〜87.5万円')
        );
    }

    public function test_company_and_conditions_are_preserved(): void
    {
        $this->assertSame(
            '架空システム株式会社 正社員/契約社員 年間休日145日',
            TextNormalizer::normalize('■架空システム株式会社 ■正社員/契約社員 ■年間休日145日')
        );
    }

    public function test_urls_are_preserved(): void
    {
        $this->assertSame(
            'https://type.jp/job-1/0000001_detail/?page=2',
            TextNormalizer::normalize('https://type.jp/job-1/0000001_detail/?page=2')
        );
    }

    public function test_single_symbols_used_inside_content_are_preserved(): void
    {
        // 日付のハイフン、クエリの=、中黒はそのまま残す。
        $this->assertSame('2026-09-01', TextNormalizer::normalize('2026-09-01'));
        $this->assertSame('a=1', TextNormalizer::normalize('a=1'));
        $this->assertSame('ミドルウェア・サービス', TextNormalizer::normalize('ミドルウェア・サービス'));
        $this->assertSame('React/TypeScript', TextNormalizer::normalize('React/TypeScript'));
    }

    public function test_words_containing_end_are_not_truncated(): void
    {
        $this->assertSame('BACKEND', TextNormalizer::normalize('BACKEND'));
        $this->assertSame('フロントエンド開発', TextNormalizer::normalize('フロントエンド開発'));
        // 末尾以外のENDは残す。
        $this->assertSame('END の扱い', TextNormalizer::normalize('END の扱い'));
    }

    public function test_note_marker_is_preserved(): void
    {
        // 「※」は注記として意味を持つため残す。
        $this->assertSame('※給与は経験を考慮の上決定します', TextNormalizer::normalize('※給与は経験を考慮の上決定します'));
    }
}
