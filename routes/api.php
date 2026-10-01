<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ImportPreviewController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectTrashController;

/*
 * 認証はセッション(webガード)で行うため、APIルートにも`web`ミドルウェアグループを適用する
 * (セッション開始・CSRF検証)。SPAは同一オリジンのwelcome.blade.phpから配信されるため、
 * セッションCookieとCSRFトークンをそのまま利用できる。
 */

Route::middleware('web')->group(function () {
    // 未ログインでも到達する必要があるもの。ログイン試行はブルートフォース対策で回数制限する。
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

    Route::middleware('auth')->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);

        // apiResource('projects', ...)の`{project}`より先に解決させるため、静的パス(trash)と
        // 追加セグメント付きパス(restore/force)を先に登録する。
        Route::get('/projects/trash', [ProjectTrashController::class, 'index']);
        Route::post('/projects/{id}/restore', [ProjectTrashController::class, 'restore'])->whereNumber('id');
        Route::delete('/projects/{id}/force', [ProjectTrashController::class, 'forceDelete'])->whereNumber('id');

        Route::apiResource('projects', ProjectController::class)->only(['index', 'store', 'update', 'destroy']);

        Route::post('/import/preview', ImportPreviewController::class);
    });
});
