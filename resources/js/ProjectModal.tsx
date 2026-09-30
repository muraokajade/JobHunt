import { useState, useEffect, useRef } from 'react';
import { DuplicateProjectCandidate, Project, ProjectFormData, ProjectType, SIDE_JOB_ALLOWED_LABELS, SideJobAllowed } from './types/project';
import { MEDIA_OPTIONS, CATEGORY_OPTIONS, statusOptionsForType } from './constants/projectOptions';
import { emptyFormData, projectToFormData } from './utils/toFormData';
import { formatRewardText } from './utils/rewardDisplay';
import { splitMediaForForm, FALLBACK_MEDIA } from './utils/mediaFromUrl';

export interface ProjectModalNotice {
  fetchStatus: 'success' | 'partial';
  warnings: string[];
  /** 同一URLで既に登録済みの案件。あれば警告を出すが、登録は禁止しない。 */
  duplicates?: DuplicateProjectCandidate[];
}

interface ProjectModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  project: Project | null;
  initialData?: ProjectFormData;
  notice?: ProjectModalNotice | null;
  isSubmitting?: boolean;
  errors?: Record<string, string[]>;
  /** 開いた直後に入力できる状態にする項目。詳細パネルの「メモ」から編集を開いたときに使う。 */
  initialFocus?: 'memo';
  onClose: () => void;
  onSubmit: (data: ProjectFormData) => void;
}

/**
 * 入力欄の共通クラス。
 *
 * 狭幅だけ16px(text-base)にしている。iOS Safariは16px未満の入力欄に
 * フォーカスすると画面を自動で拡大し、`maximum-scale`を指定していないため
 * 拡大したまま戻らない(横スクロールが発生し、保存ボタンへ到達しにくくなる)。
 * `maximum-scale`で拡大を封じる方法は拡大操作そのものを奪うので採らない。
 * PC(sm以上)は従来どおり14pxで、1画面に収まる情報量を維持する。
 *
 * 高さも狭幅では44pxを確保する(タップ領域)。
 */
const FIELD_CLASS =
  'min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:ring-2 focus:ring-slate-400 focus:outline-none sm:min-h-9 sm:text-sm';

export default function ProjectModal({
  open,
  mode,
  project,
  initialData,
  notice,
  isSubmitting,
  errors,
  initialFocus,
  onClose,
  onSubmit,
}: ProjectModalProps) {
  const [form, setForm] = useState<ProjectFormData>(emptyFormData());
  const [error, setError] = useState('');
  const memoRef = useRef<HTMLTextAreaElement>(null);

  const fieldError = (name: string) => errors?.[name]?.[0];

  useEffect(() => {
    if (mode === 'edit' && project) {
      // projectToFormData側で、選択肢に無い媒体名は「その他」+自由入力欄へ分解される。
      setForm(projectToFormData(project));
    } else if (initialData) {
      setForm(initialData);
    } else {
      setForm(emptyFormData());
    }
    setError('');
  }, [mode, project, initialData, open]);

  // メモを書くために開いたときは、長いフォームを下までたどらせず、メモ欄へ直接移る。
  useEffect(() => {
    if (!open || initialFocus !== 'memo') return;
    const memo = memoRef.current;
    memo?.focus();
    memo?.scrollIntoView?.({ block: 'center' });
  }, [open, initialFocus]);

  if (!open) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setForm(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = e.target.value as ProjectType;
    setForm(prev => {
      const nextStatusOptions = statusOptionsForType(nextType);
      const status = nextStatusOptions.includes(prev.status) ? prev.status : nextStatusOptions[0];
      return { ...prev, type: nextType, status };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('案件名は必須です');
      return;
    }
    if (!form.type) {
      setError('種別を選んでください');
      return;
    }
    setError('');
    onSubmit(form);
  };

  const statusOptions = statusOptionsForType(form.type || 'side_job');

  // 「5000000〜15000000 JPY (YEAR)」のような機械的表記のときだけ、整形後の見え方を添える。
  const formattedReward =
    form.reward_text && formatRewardText(form.reward_text) !== form.reward_text
      ? formatRewardText(form.reward_text)
      : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose}></div>
      {/*
        高さはdvh。モバイルSafariのvhはツールバーを展開した高さを指すため、
        vhのままだと可視領域からはみ出し、末尾の保存ボタンへ到達できない。
        dvh非対応ブラウザでは下のstyleの宣言が無効として捨てられ、
        クラス側のvhへ落ちる(順序に依存しないフォールバック)。
        狭幅では下寄せのシート型にして、親指の届く位置から開く。
      */}
      <div
        /* 非対応ブラウザ向けのフォールバック値。dvhは下のstyleで上書きする。 */
        className="relative mx-0 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:mx-4 sm:rounded-lg"
        style={{ maxHeight: '90dvh' }}
      >
        <h2 className="shrink-0 border-b border-slate-200 px-4 py-3 text-base font-semibold text-slate-800 sm:px-6">
          {mode === 'create' ? '案件を登録' : '案件を編集'}
        </h2>
        {/* 本文だけをスクロールさせ、見出しと保存ボタンは常に見える位置に残す。 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 sm:px-6">

        {/*
          重複警告はフォーム最上部に置く。取得成功バナーより先に目へ入らないと
          「取得できた」だけを見て、そのまま重複登録してしまうため。
          登録自体は禁止しない(同じ求人へ再応募する正当なケースがある)。
        */}
        {notice && notice.duplicates && notice.duplicates.length > 0 && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
            <p className="font-semibold">⚠️ この求人はすでに登録されています</p>
            <ul className="mt-1 space-y-0.5">
              {notice.duplicates.map(d => (
                <li key={d.id}>「{d.name}」（{d.status}）</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">必要な場合はそのまま登録できます。</p>
          </div>
        )}

        {notice && (
          <div className={`mb-4 rounded-md p-3 text-sm ${notice.fetchStatus === 'partial' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <p className="font-medium">
              {notice.fetchStatus === 'partial' ? '一部の項目を自動取得できませんでした。内容を確認し、必要な項目を入力してください。' : 'URLからの取得に成功しました。内容を確認してください。'}
            </p>
            {notice.warnings.length > 0 && (
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {notice.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">案件名 <span className="text-red-500">*</span></label>
              <input type="text" name="name" value={form.name} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('name') && <p className="text-red-600 text-xs mt-1">{fieldError('name')}</p>}
            </div>
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-slate-700 mb-1">種別</label>
              {/*
                新規登録では未選択から始め、転職/副業を明示的に選ばせる(既定値で登録させない)。
                「選ぶ」は案内であって保存値ではないため、選び直せないようdisabledにする。
                autoComplete="off": Chromeが住所系ドロップダウンと誤判定し、
                自動入力の案内を値の上に重ねて表示するのを抑止する。
              */}
              <select id="type" name="type" value={form.type} onChange={handleTypeChange} autoComplete="off"
                className={FIELD_CLASS}>
                <option value="" disabled>選ぶ</option>
                <option value="career">転職</option>
                <option value="side_job">副業</option>
              </select>
              {fieldError('type') && <p className="text-red-600 text-xs mt-1">{fieldError('type')}</p>}
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">ステータス</label>
              <select id="status" name="status" value={form.status} onChange={handleChange}
                className={FIELD_CLASS}>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {fieldError('status') && <p className="text-red-600 text-xs mt-1">{fieldError('status')}</p>}
            </div>
            <div>
              <label htmlFor="media" className="block text-sm font-medium text-slate-700 mb-1">媒体</label>
              <select id="media" name="media" value={form.media} onChange={handleChange}
                className={FIELD_CLASS}>
                <option value="">選択なし</option>
                {MEDIA_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {/* 「その他」を選んだときだけ、実際の媒体名を入力できるようにする。 */}
              {form.media === FALLBACK_MEDIA && (
                <input
                  id="media_other"
                  type="text"
                  name="media_other"
                  value={form.media_other}
                  onChange={handleChange}
                  placeholder="例: Green、Indeed、Wantedly、エン転職"
                  aria-label="媒体名"
                  className={`mt-2 ${FIELD_CLASS}`}
                />
              )}
              {fieldError('media') && <p className="text-red-600 text-xs mt-1">{fieldError('media')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">カテゴリ</label>
              <select name="category" value={form.category} onChange={handleChange}
                className={FIELD_CLASS}>
                <option value="">選択なし</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {fieldError('category') && <p className="text-red-600 text-xs mt-1">{fieldError('category')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">クライアント/会社名</label>
              <input type="text" name="client_name" value={form.client_name} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('client_name') && <p className="text-red-600 text-xs mt-1">{fieldError('client_name')}</p>}
            </div>
            <div>
              <label htmlFor="project_url" className="block text-sm font-medium text-slate-700 mb-1">案件URL</label>
              <input id="project_url" type="url" name="project_url" value={form.project_url} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('project_url') && <p className="text-red-600 text-xs mt-1">{fieldError('project_url')}</p>}
            </div>
            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">募集内容（抜粋）</label>
              <textarea id="description" name="description" value={form.description} onChange={handleChange} rows={3}
                className={FIELD_CLASS} />
              {fieldError('description') && <p className="text-red-600 text-xs mt-1">{fieldError('description')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">応募日</label>
              <input type="date" name="applied_date" value={form.applied_date} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('applied_date') && <p className="text-red-600 text-xs mt-1">{fieldError('applied_date')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">応募期限</label>
              <input type="date" name="deadline" value={form.deadline} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('deadline') && <p className="text-red-600 text-xs mt-1">{fieldError('deadline')}</p>}
            </div>
            <div>
              <label htmlFor="reward_text" className="block text-sm font-medium text-slate-700 mb-1">報酬</label>
              <input id="reward_text" type="text" name="reward_text" value={form.reward_text} onChange={handleChange}
                placeholder="例: 80,000円 / 時給2,000円 / 応相談"
                className={FIELD_CLASS} />
              {/* 保存するのは入力欄の原文。整形後の見え方だけを補助的に示す。 */}
              {formattedReward && (
                <p className="text-xs text-slate-500 mt-1">表示: {formattedReward}</p>
              )}
              {fieldError('reward_text') && <p className="text-red-600 text-xs mt-1">{fieldError('reward_text')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">稼働時間</label>
              <input type="text" name="working_hours" value={form.working_hours} onChange={handleChange} placeholder="例: 週10時間"
                className={FIELD_CLASS} />
              {fieldError('working_hours') && <p className="text-red-600 text-xs mt-1">{fieldError('working_hours')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">応募人数</label>
              <input type="number" name="applicant_count" value={form.applicant_count} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('applicant_count') && <p className="text-red-600 text-xs mt-1">{fieldError('applicant_count')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">募集人数</label>
              <input type="number" name="recruitment_count" value={form.recruitment_count} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('recruitment_count') && <p className="text-red-600 text-xs mt-1">{fieldError('recruitment_count')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">次アクション</label>
              <input type="text" name="next_action" value={form.next_action} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('next_action') && <p className="text-red-600 text-xs mt-1">{fieldError('next_action')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">次アクション予定日</label>
              <input type="date" name="next_action_date" value={form.next_action_date} onChange={handleChange}
                className={FIELD_CLASS} />
              {fieldError('next_action_date') && <p className="text-red-600 text-xs mt-1">{fieldError('next_action_date')}</p>}
            </div>

            {form.type === 'career' && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <p className="md:col-span-2 text-xs font-medium text-slate-500">転職専用項目</p>
                <div>
                  <label htmlFor="job_type" className="block text-sm font-medium text-slate-700 mb-1">職種</label>
                  <input id="job_type" type="text" name="job_type" value={form.job_type} onChange={handleChange}
                    className={FIELD_CLASS} />
                  {fieldError('job_type') && <p className="text-red-600 text-xs mt-1">{fieldError('job_type')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">勤務地</label>
                  <input type="text" name="location" value={form.location} onChange={handleChange}
                    className={FIELD_CLASS} />
                  {fieldError('location') && <p className="text-red-600 text-xs mt-1">{fieldError('location')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">リモート区分</label>
                  <input type="text" name="remote_type" value={form.remote_type} onChange={handleChange} placeholder="例: フルリモート"
                    className={FIELD_CLASS} />
                  {fieldError('remote_type') && <p className="text-red-600 text-xs mt-1">{fieldError('remote_type')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">雇用形態</label>
                  <input type="text" name="employment_type" value={form.employment_type} onChange={handleChange} placeholder="例: 正社員"
                    className={FIELD_CLASS} />
                  {fieldError('employment_type') && <p className="text-red-600 text-xs mt-1">{fieldError('employment_type')}</p>}
                </div>
                <div>
                  {/*
                    URL取込では求人ページの明示記載だけを取り込む(記載が無ければ「不明」)。
                    読み取れなかった場合や記載と異なる場合に、ここで手で直せるようにする。
                  */}
                  <label htmlFor="side_job_allowed" className="block text-sm font-medium text-slate-700 mb-1">副業可否</label>
                  <select id="side_job_allowed" name="side_job_allowed" value={form.side_job_allowed} onChange={handleChange} autoComplete="off"
                    className={FIELD_CLASS}>
                    {(Object.keys(SIDE_JOB_ALLOWED_LABELS) as SideJobAllowed[]).map(value => (
                      <option key={value} value={value}>{SIDE_JOB_ALLOWED_LABELS[value]}</option>
                    ))}
                  </select>
                  {fieldError('side_job_allowed') && <p className="text-red-600 text-xs mt-1">{fieldError('side_job_allowed')}</p>}
                </div>
              </div>
            )}

            {form.type === 'side_job' && (
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <p className="md:col-span-2 text-xs font-medium text-slate-500">副業専用項目</p>
                <div>
                  <label htmlFor="contract_type" className="block text-sm font-medium text-slate-700 mb-1">契約形態</label>
                  <input id="contract_type" type="text" name="contract_type" value={form.contract_type} onChange={handleChange} placeholder="例: 業務委託"
                    className={FIELD_CLASS} />
                  {fieldError('contract_type') && <p className="text-red-600 text-xs mt-1">{fieldError('contract_type')}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">納品日</label>
                  <input type="date" name="delivery_date" value={form.delivery_date} onChange={handleChange}
                    className={FIELD_CLASS} />
                  {fieldError('delivery_date') && <p className="text-red-600 text-xs mt-1">{fieldError('delivery_date')}</p>}
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">応募文</label>
              <textarea name="application_text" value={form.application_text} onChange={handleChange} rows={3}
                className={FIELD_CLASS} />
              {fieldError('application_text') && <p className="text-red-600 text-xs mt-1">{fieldError('application_text')}</p>}
            </div>
            <div className="md:col-span-2">
              {/*
                登録後に企業から届いた情報や、自分の判断を書き足していく欄(保存先はmemo)。
                空のときに何を書く場所か分かるよう、用途と例を添える。
              */}
              <label htmlFor="memo" className="block text-sm font-medium text-slate-700 mb-1">活動メモ</label>
              <p id="memo-help" className="mb-1.5 text-xs text-slate-500">
                ここに後から届いた情報や選考メモを記録できます。
              </p>
              <textarea id="memo" ref={memoRef} name="memo" value={form.memo} onChange={handleChange} rows={4}
                aria-describedby="memo-help"
                placeholder={'例: 9/30 面接日程の連絡あり\n10/2 19:00 一次面接'}
                className={FIELD_CLASS} />
              {fieldError('memo') && <p className="text-red-600 text-xs mt-1">{fieldError('memo')}</p>}
            </div>
            <div className="md:col-span-2">
              {/* 狭幅では行ぜんぶ(高さ44px)を押せる範囲にする。チェックボックス単体は小さいため。 */}
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:min-h-0">
                <input type="checkbox" name="is_favorite" checked={form.is_favorite} onChange={handleChange}
                  className="rounded border-slate-300" />
                お気に入り
              </label>
              {fieldError('is_favorite') && <p className="text-red-600 text-xs mt-1">{fieldError('is_favorite')}</p>}
            </div>
          </div>

          {/*
            27項目を縦にたどる画面なので、保存はスクロール末尾ではなく
            常に見える位置に置く。キーボードが出ていても到達できる。
          */}
          <div className="sticky bottom-0 -mx-4 mt-2 flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
            <button type="button" onClick={onClose}
              className="min-h-11 rounded-md border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50 sm:min-h-9">
              キャンセル
            </button>
            <button type="submit" disabled={isSubmitting}
              className="min-h-11 rounded-md bg-slate-800 px-5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9">
              {isSubmitting ? (mode === 'create' ? '登録中...' : '更新中...') : (mode === 'create' ? '登録' : '更新')}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
