<?php

use Illuminate\Support\Facades\Route;

// 公開LP。ログイン前の閲覧者に、JobHuntが何をするアプリかを説明する静的なページ。
// Basic認証(EnsureCrmAccess)の対象外で、DBやAPIには触れない。
Route::get('/', function () {
    return view('landing');
});

// アプリ本体(React SPA)。ログイン画面とアプリ本体の切り替えはSPA側で行う。
Route::get('/app', function () {
    return view('welcome');
});
