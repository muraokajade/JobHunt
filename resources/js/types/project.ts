export type ProjectType = 'career' | 'side_job';

/** 求人ページに明示されていた副業可否。推測はせず、明示が無ければunknown。 */
export type SideJobAllowed = 'ok' | 'ng' | 'unknown';

/** 副業可否の画面表示。 */
export const SIDE_JOB_ALLOWED_LABELS: Record<SideJobAllowed, string> = {
  ok: '副業OK',
  ng: '副業NG',
  unknown: '不明',
};

export interface Project {
  id: number;
  type: ProjectType;
  name: string;
  project_url: string | null;
  client_name: string | null;
  media: string | null;
  category: string | null;
  description: string | null;
  applied_date: string | null;
  deadline: string | null;
  status: string;
  reward: number | null;
  reward_text: string | null;
  working_hours: string | null;
  applicant_count: number | null;
  recruitment_count: number | null;
  application_text: string | null;
  next_action: string | null;
  next_action_date: string | null;
  memo: string | null;
  priority: string | null;
  is_favorite: boolean;
  // career専用項目
  job_type: string | null;
  location: string | null;
  remote_type: string | null;
  employment_type: string | null;
  // side_job専用項目
  contract_type: string | null;
  delivery_date: string | null;
  /** 古いレスポンスにも耐えられるよう任意。未指定はunknownとして扱う。 */
  side_job_allowed?: SideJobAllowed;
  fetched_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiValidationErrors {
  message: string;
  errors: Record<string, string[]>;
}

export interface ProjectFormData {
  /** 新規登録時は未選択('')から始まる。保存前に転職/副業を明示的に選ばせる。 */
  type: ProjectType | '';
  name: string;
  project_url: string;
  client_name: string;
  media: string;
  /** 媒体で「その他」を選んだときの自由入力欄。保存時はmediaへ統合する(送信はしない)。 */
  media_other: string;
  category: string;
  description: string;
  applied_date: string;
  deadline: string;
  status: string;
  reward: string;
  reward_text: string;
  working_hours: string;
  applicant_count: string;
  recruitment_count: string;
  application_text: string;
  next_action: string;
  next_action_date: string;
  memo: string;
  is_favorite: boolean;
  job_type: string;
  location: string;
  remote_type: string;
  employment_type: string;
  contract_type: string;
  delivery_date: string;
  side_job_allowed: SideJobAllowed;
}

/** 取込先URLと同一URLで既に登録済みの案件(重複警告用。同一ユーザー・論理削除済みを除く)。 */
export interface DuplicateProjectCandidate {
  id: number;
  name: string;
  status: string;
}

/**
 * POST /api/import/previewのレスポンス(`data`)。projectsテーブルには未保存の確認用データ。
 */
export interface ProjectPreviewData {
  project_url: string;
  type: ProjectType;
  name: string | null;
  description: string | null;
  client_name: string | null;
  media: string | null;
  category: string | null;
  reward: number | null;
  reward_text: string | null;
  working_hours: string | null;
  applicant_count: number | null;
  recruitment_count: number | null;
  deadline: string | null;
  job_type: string | null;
  location: string | null;
  remote_type: string | null;
  employment_type: string | null;
  contract_type: string | null;
  delivery_date: string | null;
  side_job_allowed?: SideJobAllowed;
  fetched_at: string;
  fetch_status: 'success' | 'partial';
  warnings: string[];
  /** 古いレスポンスにも耐えられるよう任意にしている。未指定は「重複なし」と同義。 */
  duplicate_candidates?: DuplicateProjectCandidate[];
}
