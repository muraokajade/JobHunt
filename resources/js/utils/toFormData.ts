import { Project, ProjectFormData, ProjectPreviewData, ProjectType } from '../types/project';
import { splitMediaForForm, resolveMediaForDisplay } from './mediaFromUrl';
import { employmentTypeDisplay } from './employmentType';

/**
 * reward_text導入前の旧データ用に、数値rewardから表示用の報酬表記を組み立てる。
 * ProjectCardの表示と同じ桁区切り(ja-JP)を使い、編集・保存で表記が退行しないようにする。
 */
function formatRewardText(reward: number | null): string {
  if (reward === null) return '';
  return `${Number(reward).toLocaleString('ja-JP')}円`;
}

/**
 * 空の登録フォーム。種別は既定で未選択にし、利用者に転職/副業を選ばせる。
 * URL取込のように種別が既に決まっている場合は、引数で渡して選択済みにする。
 */
export const emptyFormData = (type: ProjectType | '' = ''): ProjectFormData => ({
  type,
  side_job_allowed: 'unknown',
  name: '',
  project_url: '',
  client_name: '',
  media: '',
  media_other: '',
  category: '',
  description: '',
  applied_date: '',
  deadline: '',
  // 新規登録の既定は「応募済み」(応募した求人を管理する使い方が中心のため)。
  // 転職・副業のどちらにもある値なので、種別を切り替えても保たれる。
  // URL取込(previewToFormData)も手入力もここを通る。編集は保存済みの値を使う(projectToFormData)。
  status: '応募済み',
  reward: '',
  reward_text: '',
  working_hours: '',
  applicant_count: '',
  recruitment_count: '',
  application_text: '',
  next_action: '',
  next_action_date: '',
  memo: '',
  is_favorite: false,
  job_type: '',
  location: '',
  remote_type: '',
  employment_type: '',
  contract_type: '',
  delivery_date: '',
});

/**
 * 編集フォームの初期値。日付/日時はinput[type=date]用に先頭10文字(YYYY-MM-DD)へ切り詰める。
 */
export function projectToFormData(project: Project): ProjectFormData {
  // 「その他」や未設定のときはURLから媒体を補い、
  // 利用者が入力した未知の媒体名(Green等)は「その他」+自由入力として保持する。
  const media = splitMediaForForm(resolveMediaForDisplay(project));

  return {
    type: project.type,
    name: project.name,
    project_url: project.project_url || '',
    client_name: project.client_name || '',
    media: media.media,
    media_other: media.mediaOther,
    category: project.category || '',
    description: project.description || '',
    applied_date: project.applied_date ? project.applied_date.slice(0, 10) : '',
    deadline: project.deadline ? project.deadline.slice(0, 10) : '',
    status: project.status,
    reward: project.reward !== null ? String(project.reward) : '',
    // reward_textがあれば一切加工せず優先する。未設定(reward_text導入前の旧データ)の場合のみ、
    // 既存のreward(数値)から表示と同じ桁区切り表記を補い、保存しても表記が退行しないようにする。
    reward_text: project.reward_text || formatRewardText(project.reward),
    working_hours: project.working_hours || '',
    applicant_count: project.applicant_count !== null ? String(project.applicant_count) : '',
    recruitment_count: project.recruitment_count !== null ? String(project.recruitment_count) : '',
    application_text: project.application_text || '',
    next_action: project.next_action || '',
    next_action_date: project.next_action_date ? project.next_action_date.slice(0, 10) : '',
    memo: project.memo || '',
    is_favorite: project.is_favorite,
    job_type: project.job_type || '',
    location: project.location || '',
    remote_type: project.remote_type || '',
    employment_type: employmentTypeDisplay(project.employment_type) || '',
    contract_type: project.contract_type || '',
    delivery_date: project.delivery_date ? project.delivery_date.slice(0, 10) : '',
    side_job_allowed: project.side_job_allowed ?? 'unknown',
  };
}

/**
 * URL取込プレビュー結果(POST /api/import/preview)を、登録フォームの初期値へ変換する。
 * プレビューはprojectsテーブルへ未保存のため、取得できなかった項目はempty(手入力可能)にする。
 */
export function previewToFormData(preview: ProjectPreviewData): ProjectFormData {
  const media = splitMediaForForm(preview.media);

  return {
    ...emptyFormData(preview.type),
    project_url: preview.project_url,
    name: preview.name || '',
    description: preview.description || '',
    client_name: preview.client_name || '',
    media: media.media,
    media_other: media.mediaOther,
    category: preview.category || '',
    reward: preview.reward !== null ? String(preview.reward) : '',
    reward_text: preview.reward_text || '',
    working_hours: preview.working_hours || '',
    applicant_count: preview.applicant_count !== null ? String(preview.applicant_count) : '',
    recruitment_count: preview.recruitment_count !== null ? String(preview.recruitment_count) : '',
    deadline: preview.deadline ? preview.deadline.slice(0, 10) : '',
    job_type: preview.job_type || '',
    location: preview.location || '',
    remote_type: preview.remote_type || '',
    employment_type: employmentTypeDisplay(preview.employment_type) || '',
    contract_type: preview.contract_type || '',
    delivery_date: preview.delivery_date ? preview.delivery_date.slice(0, 10) : '',
    side_job_allowed: preview.side_job_allowed ?? 'unknown',
  };
}
