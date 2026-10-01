import { useEffect, useState, type ReactNode } from 'react';
import { Project, SIDE_JOB_ALLOWED_LABELS } from '../types/project';
import { statusOptionsForType, statusStyle } from '../constants/projectOptions';
import { rewardDisplay } from '../utils/rewardDisplay';
import { resolveMediaForDisplay } from '../utils/mediaFromUrl';
import { employmentTypeDisplay } from '../utils/employmentType';

/**
 * 案件の詳細。
 *
 * 一覧の行を展開すると、行そのものが巨大化して一覧の位置が失われる。
 * 20〜100件をスキャンする画面では、これが一番の邪魔になる。
 * そこで詳細は一覧から切り離し、
 *   PC   : 右から出るパネル(一覧はそのまま見えている。次の案件へ乗り換えても位置が動かない)
 *   スマホ: 下から出るシート(横幅が足りないので右パネルにはしない)
 * として出す。
 */

interface ProjectDetailPanelProps {
  /** null なら閉じている。 */
  project: Project | null;
  /**
   * active … 通常の一覧。編集・ゴミ箱へ移動を出す。
   * trash  … ゴミ箱。復元・完全削除を出す。
   * demo   … デモ表示中の架空案件。DBを変える操作は一切出さない。
   */
  variant: 'active' | 'trash' | 'demo';
  onClose: () => void;
  /** focus='memo' は「メモを書く」から開いたとき(編集フォームでメモ欄へ直接移る)。 */
  onEdit?: (project: Project, focus?: 'memo') => void;
  /**
   * ステータスだけを保存する(variant="active"のときだけ使う)。
   * 保存が終わる(成功・失敗どちらでも)までPromiseを解決しないこと。
   * 画面の表示値は、その後に渡ってくる project.status に従う。
   */
  onStatusChange?: (project: Project, status: string) => Promise<void>;
  onDelete?: (id: number) => void;
  deleting?: boolean;
  onRestore?: (id: number) => void;
  onForceDelete?: (id: number) => void;
  restoring?: boolean;
  forceDeleting?: boolean;
}

const TYPE_LABELS: Record<Project['type'], string> = {
  career: '転職',
  side_job: '副業',
};

/** http/https以外のスキームは外部リンクとして開かない(安全な表示のための最小限のガード)。 */
function isSafeExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * 「項目名 + 値」。値が無い項目は出さない。
 * 募集内容の段落・改行は whitespace-pre-wrap で維持し、長い値は折り返す。
 */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="mb-0.5 text-xs text-slate-400">{label}</dt>
      <dd className="text-sm break-words whitespace-pre-wrap text-slate-700">{value}</dd>
    </div>
  );
}

/** パネル内の区切り。見出しは付けず、線と余白だけで段落を分ける。 */
function Section({ children }: { children: ReactNode }) {
  return <div className="border-t border-slate-100 px-4 py-4 md:px-5">{children}</div>;
}

export default function ProjectDetailPanel({
  project: p,
  variant,
  onClose,
  onEdit,
  onStatusChange,
  onDelete,
  deleting,
  onRestore,
  onForceDelete,
  restoring,
  forceDeleting,
}: ProjectDetailPanelProps) {
  /**
   * 保存中のステータス。保存が終わるまでは選んだ値を見せ、終わったら捨てる。
   * 失敗時はそのまま元の project.status の表示へ戻る(成功したように見せない)。
   * 別の案件へ切り替えても持ち越さないよう、案件idと組で持つ。
   */
  const [pendingStatus, setPendingStatus] = useState<{ id: number; status: string } | null>(null);


  // Escapeで閉じる。スマホのシートでも、PCのパネルでも同じ挙動にする。
  useEffect(() => {
    if (p === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [p, onClose]);

  if (p === null) return null;

  // DBの媒体が古い値でも、案件URLから判定できる場合はそちらで表示する(DBは書き換えない)。
  const media = resolveMediaForDisplay(p);
  const deadline = p.deadline?.slice(0, 10) ?? null;

  const canChangeStatus = variant === 'active' && onStatusChange !== undefined;
  const savingStatus = pendingStatus?.id === p.id ? pendingStatus.status : null;
  const statusSaving = savingStatus !== null;
  const shownStatus = savingStatus ?? p.status;
  const shownStyle = statusStyle(shownStatus);
  // 定義外の値(旧データ等)が保存されていても、先頭の選択肢に化けて見えないよう選択肢に残す。
  const typeStatuses = statusOptionsForType(p.type);
  const statusOptions = typeStatuses.includes(p.status) ? typeStatuses : [p.status, ...typeStatuses];

  const changeStatus = async (status: string) => {
    if (statusSaving || status === p.status || !onStatusChange) return;
    setPendingStatus({ id: p.id, status });
    try {
      await onStatusChange(p, status);
    } finally {
      setPendingStatus(null);
    }
  };

  return (
    <>
      {/*
        背景。スマホのシートでは本文を覆って前後関係をはっきりさせる。
        PCの右パネルでは覆わない ─ 一覧を見比べながら詳細を読めることが、
        この形にした理由そのものなので、一覧を暗くしてしまうと意味が無い。
      */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        スマホは下からのシート、PC(md以上)は右のパネル。
        高さは上下のinsetかmax-heightのどちらかで必ず決まるようにしてある
        (決まらないと中身のoverflow-y-autoが効かず、長い募集内容で操作不能になる)。
        スマホの85vhは、iOS Safariでツールバーが出ている間でも
        下端の操作列が可視領域に残る余裕を見込んだ値。
      */}
      <aside
        role="dialog"
        aria-label={`${p.name} の詳細`}
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-xl bg-white shadow-xl md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[26rem] md:rounded-none md:border-l md:border-slate-200 lg:w-[30rem]"
      >
        {/* 見出し。閉じる操作は常に見える位置に固定する。 */}
        <header className="flex shrink-0 items-start gap-3 px-4 py-3 md:px-5 md:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                通常一覧では、ステータスをここで直接変える(選んだ時点で保存する)。
                編集フォームを開かずに段階を進められるようにするため。
                ゴミ箱・デモはDBを変えられないので、従来どおり表示だけにする。
              */}
              {canChangeStatus ? (
                /*
                  見た目は「点 + 状態名 + ▼」の札。ブラウザ標準の矢印は消し(appearance-none)、
                  点と矢印は select の上に重ねて描く(押しても select が反応するよう pointer-events-none)。
                */
                <span className={`relative inline-flex items-center ${shownStyle.text}`}>
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-3 h-2 w-2 rounded-full ${shownStyle.dot}`}
                  />
                  <select
                    aria-label="ステータス"
                    value={shownStatus}
                    onChange={e => changeStatus(e.target.value)}
                    disabled={statusSaving}
                    aria-busy={statusSaving}
                    className={`min-h-11 cursor-pointer appearance-none rounded-full border pr-8 pl-7 text-base font-medium hover:brightness-[0.97] focus:ring-2 focus:ring-slate-300 focus:outline-none disabled:cursor-wait disabled:opacity-60 md:min-h-8 md:text-sm ${shownStyle.pill}`}
                  >
                    {statusOptions.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 opacity-60"
                  >
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyle(p.status).pill}`}
                >
                  <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${statusStyle(p.status).dot}`} />
                  {p.status}
                </span>
              )}
              {statusSaving && <span className="text-xs text-slate-400">保存中...</span>}
              <span className="text-xs text-slate-400">{TYPE_LABELS[p.type]}</span>
              {p.is_favorite && (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-400" role="img" aria-label="お気に入り">
                  <path d="M10 1.5l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z" />
                </svg>
              )}
            </div>
            <h2 className="mt-1.5 text-base leading-snug font-semibold break-words text-slate-800">{p.name}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="詳細を閉じる"
            className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:h-9 md:w-9"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* 比較に使う値を先頭にまとめる。一覧で見えていた4項目と同じ並び。 */}
          <Section>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="報酬" value={rewardDisplay(p)} />
              <Field label="応募締切" value={deadline} />
              <Field label="クライアント" value={p.client_name} />
              <Field label="媒体" value={media} />
              <Field label="カテゴリ" value={p.category} />
              <Field label="応募日" value={p.applied_date?.slice(0, 10)} />
            </dl>
          </Section>

          {/*
            活動メモ(保存先はmemo)。登録後に企業から届いた情報や、自分の判断を書き足していく場所。
            通常一覧では空でも枠を出し、ここに記録できることと、書き始める入口を示す。
            ゴミ箱・デモは書き込めないので、中身があるときだけ出す。
          */}
          {(variant === 'active' || p.memo) && (
            <Section>
              <section aria-labelledby="activity-memo-heading">
                {/* 見出しは他の項目名(薄い小さな文字)より一段強くして、独立した枠だと分かるようにする。 */}
                <div className="flex items-center justify-between gap-2">
                  <h3 id="activity-memo-heading" className="text-sm font-medium text-slate-800">活動メモ</h3>
                  {p.memo && variant === 'active' && onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(p, 'memo')}
                      aria-label="活動メモを編集"
                      className="flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 md:min-h-8"
                    >
                      編集
                    </button>
                  )}
                </div>

                {p.memo ? (
                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-700">
                    {p.memo}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-slate-500">企業から届いた追加情報や、面接・選考のメモを残せます。</p>
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(p, 'memo')}
                        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto md:min-h-9"
                      >
                        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="h-4 w-4">
                          <path d="M10 4.5v11M4.5 10h11" />
                        </svg>
                        活動メモを追加
                      </button>
                    )}
                  </>
                )}
              </section>
            </Section>
          )}

          {p.description && (
            <Section>
              <dl>
                <Field label="募集内容" value={p.description} />
              </dl>
            </Section>
          )}

          {p.project_url && (
            <Section>
              <dl>
                <dt className="mb-0.5 text-xs text-slate-400">案件URL</dt>
                <dd className="min-w-0">
                  {isSafeExternalUrl(p.project_url) ? (
                    <a
                      href={p.project_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm break-all text-blue-600 underline"
                    >
                      {p.project_url}
                    </a>
                  ) : (
                    <span className="text-sm break-all text-slate-700">{p.project_url}</span>
                  )}
                </dd>
              </dl>
            </Section>
          )}

          {(p.next_action || p.next_action_date) && (
            <Section>
              <dl className="space-y-3">
                <Field label="次アクション" value={p.next_action} />
                <Field label="次アクション日" value={p.next_action_date?.slice(0, 10)} />
              </dl>
            </Section>
          )}

          {p.type === 'career' && (
            <Section>
              <p className="mb-2 text-xs font-medium text-slate-500">転職専用項目</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="職種" value={p.job_type} />
                <Field label="勤務地" value={p.location} />
                <Field label="リモート区分" value={p.remote_type} />
                <Field label="雇用形態" value={employmentTypeDisplay(p.employment_type)} />
                {/* 明示が無ければ「不明」。値が確定していないことも情報なので常に出す。 */}
                <Field label="副業可否" value={SIDE_JOB_ALLOWED_LABELS[p.side_job_allowed ?? 'unknown']} />
              </dl>
            </Section>
          )}

          {p.type === 'side_job' && (p.contract_type || p.delivery_date) && (
            <Section>
              <p className="mb-2 text-xs font-medium text-slate-500">副業専用項目</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="契約形態" value={p.contract_type} />
                <Field label="納品日" value={p.delivery_date?.slice(0, 10)} />
              </dl>
            </Section>
          )}
        </div>

        {/*
          操作。パネルの末尾ではなく下端に固定して、長い募集内容を読んだあとでも
          スクロールせずに編集へ移れるようにする。
          デモ案件はDBに存在しないので、操作の一覧ごと出さない。
        */}
        {variant !== 'demo' && (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3 md:px-5">
            <div className="flex flex-wrap gap-2">
              {variant === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit?.(p)}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 md:min-h-9"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(p.id)}
                    disabled={deleting}
                    className="min-h-11 rounded-md border border-red-200 bg-white px-4 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 md:min-h-9"
                  >
                    {deleting ? '削除中...' : 'ゴミ箱へ移動'}
                  </button>
                </>
              )}
              {variant === 'trash' && (
                <>
                  <button
                    type="button"
                    onClick={() => onRestore?.(p.id)}
                    disabled={restoring}
                    className="min-h-11 rounded-md border border-blue-200 bg-white px-4 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50 md:min-h-9"
                  >
                    {restoring ? '復元中...' : '復元'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onForceDelete?.(p.id)}
                    disabled={forceDeleting}
                    className="min-h-11 rounded-md border border-red-200 bg-white px-4 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 md:min-h-9"
                  >
                    {forceDeleting ? '完全削除中...' : '完全削除'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
