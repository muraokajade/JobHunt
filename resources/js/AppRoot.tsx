import { useState, useEffect, useMemo, useRef } from 'react';
import { Project, ProjectFormData, ApiValidationErrors, ProjectType } from './types/project';
import { computeStatusSummary } from './utils/projectSummary';
import { sortProjectsForList } from './utils/projectSort';
import { listProjects, createProject, updateProject, deleteProject } from './api/projects';
import ProjectModal, { ProjectModalNotice } from './ProjectModal';
import ProjectCard, { ProjectListHeader } from './components/ProjectCard';
import ProjectDetailPanel from './components/ProjectDetailPanel';
import UrlImportModal from './components/UrlImportModal';
import TrashView from './components/TrashView';
import AuthScreen from './components/AuthScreen';
import { AuthUser, fetchMe, logout as logoutRequest } from './api/auth';
import { emptyFormData } from './utils/toFormData';
import { mergeMediaFromForm } from './utils/mediaFromUrl';
import { buildDemoProjects } from './constants/demoProjects';

type TypeFilter = 'all' | ProjectType;

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'career', label: '転職' },
  { value: 'side_job', label: '副業' },
];

const SEARCH_DEBOUNCE_MS = 400;
const STATUS_NOTICE_MS = 3000;

function AppRoot() {
  // 認証状態が確定するまでは案件データを一切取得・描画しない。
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [view, setView] = useState<'list' | 'trash'>('list');
  const [projects, setProjects] = useState<Project[]>([]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [createInitialData, setCreateInitialData] = useState<ProjectFormData | undefined>(undefined);
  const [createNotice, setCreateNotice] = useState<ProjectModalNotice | null>(null);
  /** 編集フォームを開いたときに最初に入力できる状態にする項目(詳細パネルの「メモ」から開いたとき)。 */
  const [editFocus, setEditFocus] = useState<'memo' | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalErrors, setModalErrors] = useState<Record<string, string[]> | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** ステータス更新成功の通知。keyは同じ文言が続いても表示し直すための通し番号。 */
  const [statusNotice, setStatusNotice] = useState<{ key: number; text: string } | null>(null);

  /**
   * デモ表示。初めて見る人にJobHuntの使い方を伝えるための、架空案件の表示モード。
   * ここがtrueの間だけ一覧を架空案件に差し替える。保存も通信も一切行わない。
   */
  const [demoMode, setDemoMode] = useState(false);

  /**
   * 詳細パネルで開いている案件のid。
   * Project本体ではなくidで持つ。一覧を再取得すると別オブジェクトになるので、
   * 実体を握っていると更新・削除のあとに古い内容が残ってしまう。
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // isSubmitting/deletingId (state) はボタンのdisabled表示用。
  // 以下のrefは、Reactのstate反映(再レンダリング)を待たずに二重送信を同期的に拒否するためのガード。
  const isSubmittingRef = useRef(false);
  const deletingIdsRef = useRef<Set<number>>(new Set());
  const statusUpdatingIdsRef = useRef<Set<number>>(new Set());

  // 初回マウント時にログイン状態を確認する。
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchMe();
        setAuthUser(res.status === 200 ? (await res.json()).data : null);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const fetchProjects = async () => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.set('type', typeFilter);
    if (appliedSearch) params.set('keyword', appliedSearch);
    const res = await listProjects(params);

    // セッション切れ(ログアウト・期限切れ)の場合はログイン画面へ戻す。
    if (res.status === 401) {
      setAuthUser(null);
      setProjects([]);
      return;
    }

    const json = await res.json();
    setProjects(json.data ?? []);
  };

  useEffect(() => {
    if (!authUser) return;
    fetchProjects();
  }, [authUser, typeFilter, appliedSearch]);

  const handleLogout = async () => {
    try {
      await logoutRequest();
    } finally {
      // 前ユーザーのデータが画面に残らないよう、状態を明示的に空へ戻す。
      setAuthUser(null);
      setProjects([]);
      setView('list');
      setSearchInput('');
      setAppliedSearch('');
    }
  };

  // 入力のたびに毎回APIへ問い合わせない(過剰通信防止)ためのdebounce。
  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // 更新通知は数秒で消す。続けて更新したときは、新しい通知から数え直す。
  useEffect(() => {
    if (!statusNotice) return;
    const handle = setTimeout(() => setStatusNotice(null), STATUS_NOTICE_MS);
    return () => clearTimeout(handle);
  }, [statusNotice]);

  const clearSearch = () => {
    setSearchInput('');
    setAppliedSearch('');
  };

  /**
   * デモ案件。デモを開始したときだけ作る。
   * 締切は今日基準で作るので、開始のたびに作り直して「締切間近」の色分けを保つ。
   */
  const demoProjects = useMemo(() => (demoMode ? buildDemoProjects() : []), [demoMode]);

  /**
   * 一覧に出す案件。デモ中は架空案件だけを出し、APIから取得した実データ(projects)とは混ぜない。
   * projects自体はデモ中も一切書き換えないので、デモを終了すれば元の状態へそのまま戻る。
   *
   * 並び順は「選考の進み具合 → 更新日時」(sortProjectsForList)。
   * 種別・検索の絞り込みはAPI側で済んでいるので、その結果に対して同じ順序を適用する。
   */
  const displayProjects = useMemo(
    () => sortProjectsForList(demoMode ? demoProjects : projects),
    [demoMode, demoProjects, projects],
  );

  const summary = useMemo(() => computeStatusSummary(displayProjects), [displayProjects]);

  /**
   * パネルに出す案件。毎回いまの一覧から引き直す。
   * 削除やフィルターで一覧から消えたら null になり、パネルは自動的に閉じる。
   */
  const selectedProject = useMemo(
    () => displayProjects.find(p => p.id === selectedId) ?? null,
    [displayProjects, selectedId],
  );

  // 0件の理由が「まだ登録していない」のか「絞り込みの結果」なのかで空状態を出し分ける。
  const hasActiveFilter = typeFilter !== 'all' || appliedSearch !== '';

  /**
   * まだ1件も登録していない人に出す画面かどうか。
   *
   * 「0件」には2種類ある。まだ登録していない0件と、絞り込んだ結果の0件。
   * 後者は条件を解除する必要があるので、集計・フィルタ・検索をそのまま残す。
   * ここで切り替えるのは前者だけで、案件が1件でもあれば従来の一覧画面になる。
   */
  const isOnboarding = !demoMode && projects.length === 0 && !hasActiveFilter;

  const startDemo = () => {
    setSelectedId(null);
    setDemoMode(true);
  };

  const endDemo = () => {
    setSelectedId(null);
    setDemoMode(false);
  };

  /**
   * URL取込を開く。
   * デモ中に本物の登録を始めると架空案件と実案件が同じ一覧に並ぶので、先にデモを終える。
   */
  const openImport = () => {
    setDemoMode(false);
    setSelectedId(null);
    setImportOpen(true);
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setSearchInput('');
    setAppliedSearch('');
  };

  const buildSubmitBody = (data: ProjectFormData, isCreate: boolean) => {
    const body: Record<string, unknown> = { ...data };

    // 「その他」+自由入力の媒体名は、mediaへ統合して保存する(media_otherは送らない)。
    body.media = mergeMediaFromForm(data.media, data.media_other);
    delete body.media_other;
    const numericFields: (keyof ProjectFormData)[] = ['reward', 'applicant_count', 'recruitment_count'];
    numericFields.forEach(key => {
      const value = data[key] as string;
      if (value) body[key] = Number(value);
      else if (isCreate) delete body[key];
      else body[key] = null;
    });
    Object.keys(body).forEach(k => {
      if (body[k] === '') body[k] = isCreate ? undefined : null;
    });
    Object.keys(body).forEach(k => { if (body[k] === undefined) delete body[k]; });
    return body;
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProject(null);
    setModalErrors(undefined);
    setCreateInitialData(undefined);
    setCreateNotice(null);
    setEditFocus(undefined);
  };

  const handleCreate = async (data: ProjectFormData) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const body = buildSubmitBody(data, true);

    setIsSubmitting(true);
    setModalErrors(undefined);
    try {
      const res = await createProject(body);
      if (res.status === 201) {
        closeModal();
        setView('list');
        await fetchProjects();
      } else if (res.status === 422) {
        const json: ApiValidationErrors = await res.json();
        setModalErrors(json.errors);
      } else {
        window.alert('保存に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (data: ProjectFormData) => {
    if (!editingProject) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const body = buildSubmitBody(data, false);
    body.name = data.name;
    body.status = data.status;
    body.type = data.type;

    setIsSubmitting(true);
    setModalErrors(undefined);
    try {
      const res = await updateProject(editingProject.id, body);
      if (res.status === 200) {
        closeModal();
        await fetchProjects();
      } else if (res.status === 422) {
        const json: ApiValidationErrors = await res.json();
        setModalErrors(json.errors);
      } else {
        window.alert('保存に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * 詳細パネルからステータスだけを変える。送るのはstatusのみ(部分更新)。
   * 成功したら一覧を再取得し、一覧・詳細パネル・集計を同じデータへ揃える。
   * 失敗したら何も書き換えない(パネルは元のステータス表示へ戻る)。
   */
  const handleStatusChange = async (project: Project, status: string) => {
    if (statusUpdatingIdsRef.current.has(project.id)) return;
    statusUpdatingIdsRef.current.add(project.id);
    try {
      const res = await updateProject(project.id, { status });
      if (res.status === 200) {
        await fetchProjects();
        setStatusNotice(prev => ({ key: (prev?.key ?? 0) + 1, text: `ステータスを「${status}」に更新しました` }));
      } else {
        window.alert('ステータスの変更に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      statusUpdatingIdsRef.current.delete(project.id);
    }
  };

  const handleDelete = async (id: number) => {
    // window.confirm()自体が同期的にブロックするため単独でも同一idの多重実行は起きないが、
    // confirm()をモックする(テスト等)環境も想定し、refで同期的に二重削除を防ぐ。
    if (deletingIdsRef.current.has(id)) return;
    if (!window.confirm('この案件を削除しますか？')) return;
    deletingIdsRef.current.add(id);
    setDeletingId(id);
    try {
      const res = await deleteProject(id);
      if (res.status === 204) {
        await fetchProjects();
      } else {
        window.alert('削除に失敗しました。もう一度お試しください。');
      }
    } catch {
      window.alert('通信に失敗しました。ネットワーク状態を確認してください。');
    } finally {
      deletingIdsRef.current.delete(id);
      setDeletingId(null);
    }
  };

  const openCreate = () => {
    // デモ中に実案件を作ると一覧で混ざるため、登録を始める時点でデモを終える。
    setDemoMode(false);
    setSelectedId(null);
    setEditingProject(null);
    setCreateInitialData(undefined);
    setCreateNotice(null);
    setModalErrors(undefined);
    setView('list');
    setModalOpen(true);
  };

  const openEdit = (p: Project, focus?: 'memo') => {
    setEditingProject(p);
    setEditFocus(focus);
    setCreateInitialData(undefined);
    setCreateNotice(null);
    setModalErrors(undefined);
    setModalOpen(true);
  };

  /**
   * URL取込を諦めて手入力へ進む。入力済みのURLと種別だけを引き継ぎ、
   * 残りは空欄の登録フォームを開く(取得できなかった項目を利用者が埋められるようにする)。
   */
  const handleManualEntry = (url: string, projectType: ProjectType) => {
    setImportOpen(false);
    setEditingProject(null);
    setCreateInitialData({ ...emptyFormData(projectType), project_url: url });
    setCreateNotice({
      fetchStatus: 'partial',
      warnings: ['このURLはログインが必要なページのため自動取得できませんでした。内容を入力してください。'],
    });
    setModalErrors(undefined);
    setView('list');
    setModalOpen(true);
  };

  const handlePreviewReady = (formData: ProjectFormData, notice: ProjectModalNotice) => {
    setImportOpen(false);
    setEditingProject(null);
    setCreateInitialData(formData);
    setCreateNotice(notice);
    setModalErrors(undefined);
    setView('list');
    setModalOpen(true);
  };

  // ログイン状態の確認が終わるまでは何も出さない(未ログイン時に一瞬でも一覧を見せないため)。
  if (!authChecked) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!authUser) {
    return <AuthScreen onAuthenticated={setAuthUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/*
        ヘッダーは「今どのアカウントか」と離脱系だけに絞る。
        毎日20〜100件を上下にたどる画面なので、常時見える帯は薄くして
        一覧の開始位置を上げる。スクロール中も現在地が残るようstickyにする。
      */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <h1 className="text-sm font-semibold tracking-wide text-slate-800">JobHunt</h1>

          <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
            <span className="hidden max-w-[12rem] truncate sm:inline">{authUser.email}</span>
            {/*
              ゴミ箱とログアウトは隣り合うので、狭幅では44pxずつ離して
              誤タップでログアウトしないようにする。
            */}
            <button
              onClick={() => setView('trash')}
              className="flex min-h-11 items-center rounded-md px-2.5 hover:bg-slate-100 hover:text-slate-700 md:min-h-8"
            >
              ゴミ箱
            </button>
            <button
              onClick={handleLogout}
              className="flex min-h-11 items-center rounded-md px-2.5 hover:bg-slate-100 hover:text-slate-700 md:min-h-8"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {view === 'trash' ? (
        <TrashView onClose={() => setView('list')} />
      ) : (
        /*
          PCで詳細パネルを開いている間は、本文の右側にパネルぶんの余白を作る。
          一覧が隠れないので、詳細を読みながら次の案件へ乗り換えられる。
          md幅(768〜1023px)では余白を作らず、パネルを一覧の上に重ねる。
          ここで27rem空けると本文が約310pxになり、一覧の固定列(約450px)が収まらず右側が切れるため。
        */
        <main
          className={`mx-auto max-w-6xl px-4 py-4 transition-[padding] md:px-6 ${
            isOnboarding ? '' : 'space-y-3'
          } ${selectedProject !== null ? 'lg:pr-[31rem]' : ''}`}
        >
          {isOnboarding ? (
            /*
              まだ1件も登録していない人の画面。
              集計・フィルタ・検索・「案件一覧 0件」は、操作できる対象が無い状態では
              空の管理画面を見せているだけなので出さない。
              代わりに、何をする道具で、最初に何を押せばいいかだけを置く。
            */
            <div className="flex min-h-[60vh] items-center justify-center py-8">
              <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-6 py-12 text-center sm:px-10 sm:py-14">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  JobHuntへようこそ
                </h2>

                <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
                  気になる求人を登録して、応募状況をまとめて管理しましょう。
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  求人ページのURLを貼り付けるだけで、案件名や報酬などを取り込んで登録できます。
                </p>

                {/* 登録処理はどちらも一覧画面と同じものを呼ぶ(新しい経路は作らない)。 */}
                <div className="mt-8 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={openImport}
                    className="min-h-11 rounded-lg bg-slate-800 px-6 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                  >
                    求人URLから登録
                  </button>
                  <button
                    type="button"
                    onClick={openCreate}
                    className="min-h-11 rounded-lg border border-slate-300 px-6 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    手入力で登録
                  </button>
                </div>

                {/*
                  デモはこの画面が唯一の入口なので残す。
                  ただし登録より前に出す案内ではないので、主・副CTAより弱く置く。
                */}
                <button
                  type="button"
                  onClick={startDemo}
                  className="mt-6 min-h-11 px-2 text-xs text-slate-500 underline underline-offset-4 hover:text-slate-700"
                >
                  先にデモを見る
                </button>
              </div>
            </div>
          ) : (
          <>
          {/*
            ツールバー: 主CTA(求人URLを登録) + 絞り込み + 検索。
            強い要素は主CTA1つだけにして、他は面も影も持たせない。
            件数サマリーはここから外し、一覧見出しの脇へ小さく添えた
            (毎回見る情報ではないのに、主CTAと同じ高さで存在感が並んでいたため)。
          */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={openImport}
                className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-slate-800 px-4 text-sm font-medium whitespace-nowrap text-white hover:bg-slate-700 sm:min-h-9 sm:flex-none"
              >
                求人URLを登録
              </button>
              <button
                onClick={openCreate}
                className="flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm whitespace-nowrap text-slate-600 hover:bg-slate-50 sm:min-h-9"
              >
                手入力
              </button>
            </div>

            {/*
              種別の絞り込み。主CTAと色で競合させないため、
              選択中は淡い面と文字の濃さだけで示す。
            */}
            <div className="flex shrink-0 gap-1 rounded-md bg-slate-100 p-0.5">
              {TYPE_TABS.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setTypeFilter(tab.value)}
                  aria-pressed={typeFilter === tab.value}
                  className={`min-h-10 flex-1 rounded px-3 text-sm sm:min-h-8 sm:flex-none ${
                    typeFilter === tab.value
                      ? 'bg-white font-medium text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                placeholder="案件名・クライアント・概要・メモを検索"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                /* 狭幅は16px。iOS Safariは16px未満の入力欄でフォーカス時に自動拡大するため。 */
                className="min-h-11 w-full rounded-md border border-slate-300 bg-white pl-3 pr-11 text-base focus:ring-2 focus:ring-slate-400 focus:outline-none sm:min-h-9 sm:pr-10 sm:text-sm"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="検索をクリア"
                  className="absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 sm:right-1 sm:h-9 sm:w-9 items-center justify-center rounded text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* 一覧。1件ごとの箱をやめ、境界線で区切った1つの面にする。 */}
          <div className="space-y-2">
            {/*
              見出し行。件数と内訳をここへ集約する。
              内訳は「毎回見る情報ではないが、無いと全体像が分からない」ものなので、
              主CTAと同じ強さでは置かず、見出しの脇に1行で添える。
            */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
              <h2 className="text-sm font-semibold text-slate-700">
                案件一覧 <span className="font-normal text-slate-400">{displayProjects.length}件</span>
              </h2>
              {displayProjects.length > 0 && (
                <p className="text-xs text-slate-400 tabular-nums">
                  対応中 {summary.open} ・ 終了 {summary.closed} ・ お気に入り {summary.favorite}
                </p>
              )}
              {demoMode && (
                <span className="ml-auto flex items-center gap-2">
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">デモ表示中</span>
                  <span className="hidden text-xs text-slate-400 sm:inline">保存されません</span>
                  <button
                    type="button"
                    onClick={endDemo}
                    className="flex min-h-11 items-center rounded-md px-2 text-xs text-slate-600 underline hover:bg-slate-100 hover:text-slate-800 md:min-h-8"
                  >
                    デモを終了
                  </button>
                </span>
              )}
            </div>

            {/*
              絞り込んだ結果の0件。まだ登録していない0件とは別物なので、
              条件を解除できるようフィルタ・検索は残したまま案内だけ出す。
              (まだ登録していない0件は、この一覧ブロックごとオンボーディングへ差し替わる)
            */}
            {!demoMode && projects.length === 0 && hasActiveFilter && (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
                <p className="text-sm text-slate-600">条件に一致する案件がありません。</p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 min-h-11 rounded-md border border-slate-300 px-4 text-sm text-slate-700 hover:bg-slate-50 md:min-h-9"
                >
                  条件をクリア
                </button>
              </div>
            )}

            {/*
              デモ中は詳細パネル側をvariant="demo"で描く。
              編集・削除の導線自体が出ないため、
              架空案件からDBを変える操作へ進む経路が存在しない。
            */}
            {displayProjects.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <ProjectListHeader />
                {displayProjects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    selected={p.id === selectedId}
                    onOpen={project => setSelectedId(project.id)}
                  />
                ))}
              </div>
            )}
          </div>
          </>
          )}
        </main>
      )}

      {/*
        詳細。一覧の行を展開するのをやめ、PCは右パネル・スマホは下シートで出す。
        表示している項目はこれまでの展開部と同じで、新しい情報は足していない。
      */}
      <ProjectDetailPanel
        project={selectedProject}
        variant={demoMode ? 'demo' : 'active'}
        onClose={() => setSelectedId(null)}
        /*
          編集中も詳細パネルは閉じない。保存後の再取得で、追記したメモや修正内容が
          そのままパネルに反映されて見える(編集フォームはパネルより手前に重なる)。
        */
        onEdit={(project, focus) => openEdit(project, focus)}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        deleting={selectedProject !== null && deletingId === selectedProject.id}
      />

      <ProjectModal
        open={modalOpen}
        mode={editingProject ? 'edit' : 'create'}
        project={editingProject}
        initialData={editingProject ? undefined : createInitialData}
        notice={editingProject ? null : createNotice}
        initialFocus={editingProject ? editFocus : undefined}
        isSubmitting={isSubmitting}
        errors={modalErrors}
        onClose={closeModal}
        onSubmit={editingProject ? handleUpdate : handleCreate}
      />

      <UrlImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onPreviewReady={handlePreviewReady}
        onManualEntry={handleManualEntry}
      />

      {/*
        ステータス更新の完了通知。数秒で自動的に消える。
        操作の邪魔をしないよう、押せない(pointer-events-none)小さな帯としてヘッダーの下に出す。
        スマホの詳細シートは下から出るので、上に出せば重ならない。
      */}
      {statusNotice && (
        <div
          key={statusNotice.key}
          role="status"
          className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
        >
          <p className="flex max-w-full items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4 shrink-0 text-green-400">
              <path d="M4.5 10.5l3.5 3.5 7.5-8" />
            </svg>
            <span className="truncate">{statusNotice.text}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export default AppRoot;
