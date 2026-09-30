import { ProjectType } from '../types/project';

export const CAREER_STATUS_OPTIONS = [
  '気になる', '応募準備', '応募済み', '書類選考', '面接', '最終面接', '内定', '見送り',
] as const;

export const SIDE_JOB_STATUS_OPTIONS = [
  '気になる', '応募準備', '応募済み', '返信待ち', '面談', '選考中',
  '契約', '作業中', '納品', '検収待ち', '完了', '見送り',
] as const;

export function statusOptionsForType(type: ProjectType): readonly string[] {
  return type === 'career' ? CAREER_STATUS_OPTIONS : SIDE_JOB_STATUS_OPTIONS;
}

// 「その他」は受け皿として末尾に置く。既存の選択肢は削除・改名しない。
export const MEDIA_OPTIONS = ['CrowdWorks', 'MENTA', 'Lancers', 'type', 'フリーランスハブ', 'その他'] as const;

export const CATEGORY_OPTIONS = ['Web開発', 'AI', 'DX・業務改善', 'システム開発', 'コンサル', 'その他'] as const;

/**
 * ステータスの見た目は、ラベルごとではなく「進捗の意味」の4グループで決める。
 * 8〜12色を並べると、20件以上の一覧で「どれがどの段階か」を色から読み取れないため。
 * ラベル自体(app/Support/ProjectStatus.php と上の *_STATUS_OPTIONS)は変えない。
 *
 *   todo    … まだ応募していない(気になる・応募準備)。最頻出なので色を持たせない。
 *   active  … 応募後〜進行中。一覧で一番目で追いたい状態なので青で示す。
 *   success … 内定・完了。
 *   closed  … 見送り。いちばん淡くして一覧の中で沈ませる。
 *
 * 集計(utils/projectSummary.ts の CLOSED_STATUSES)とは独立した見た目の定義。
 * side_jobの契約〜検収待ちは仕事が続いている状態なので active に入れる(集計でも対応中)。
 */
export type StatusGroup = 'todo' | 'active' | 'success' | 'closed';

const STATUS_GROUPS: Record<string, StatusGroup> = {
  '気になる': 'todo',
  '応募準備': 'todo',
  '応募済み': 'active',
  // career専用
  '書類選考': 'active',
  '面接': 'active',
  '最終面接': 'active',
  '内定': 'success',
  // side_job専用
  '返信待ち': 'active',
  '面談': 'active',
  '選考中': 'active',
  '契約': 'active',
  '作業中': 'active',
  '納品': 'active',
  '検収待ち': 'active',
  '完了': 'success',
  '見送り': 'closed',
};

/** 未知のステータス(旧データ等)は色で意味を作らず、未着手と同じ中立の見た目にする。 */
export function statusGroupOf(status: string): StatusGroup {
  return STATUS_GROUPS[status] ?? 'todo';
}

/**
 * グループごとの色。一覧(点+文字)と詳細パネル(枠付きの札)の両方がここだけを参照する。
 *   dot  … 状態を示す点
 *   text … 一覧の文字色
 *   pill … 詳細パネルの札(背景・枠・文字)
 */
export const STATUS_GROUP_STYLES: Record<StatusGroup, { dot: string; text: string; pill: string }> = {
  todo: { dot: 'bg-slate-400', text: 'text-slate-600', pill: 'border-slate-200 bg-slate-50 text-slate-700' },
  active: { dot: 'bg-blue-500', text: 'text-blue-700', pill: 'border-blue-200 bg-blue-50 text-blue-700' },
  success: { dot: 'bg-green-500', text: 'text-green-700', pill: 'border-green-200 bg-green-50 text-green-700' },
  closed: { dot: 'bg-slate-300', text: 'text-slate-400', pill: 'border-slate-200 bg-white text-slate-400' },
};

export function statusStyle(status: string) {
  return STATUS_GROUP_STYLES[statusGroupOf(status)];
}

/**
 * 一覧の既定の並び順に使う「選考の進み具合」。大きいほど上に出す。
 *
 * 転職と副業が混ざった一覧でも比べられるよう、同じ尺度に置いている
 * (例: 副業の契約は、転職の面接と同じ段)。同じ値どうしは更新日時の新しい順に並べる。
 *
 * 終了した案件は進行中の案件より上に出さない。
 * 例外は内定で、承諾・辞退の判断が残る最重要の状態なので最上位に置く。
 * 副業の完了と見送りは「対応中 / 終了」の集計でも終了側なので、一覧の最後へ回す。
 * 定義に無いステータス(旧データ等)は「気になる」と同じ0として扱う。
 */
const CAREER_STATUS_SORT_RANKS: Record<string, number> = {
  '内定': 60,
  '最終面接': 50,
  '面接': 40,
  '書類選考': 30,
  '応募済み': 20,
  '応募準備': 10,
  '気になる': 0,
  '見送り': -20,
};

const SIDE_JOB_STATUS_SORT_RANKS: Record<string, number> = {
  '検収待ち': 52,
  '納品': 51,
  '作業中': 50,
  '契約': 40,
  '選考中': 31,
  '面談': 30,
  '返信待ち': 21,
  '応募済み': 20,
  '応募準備': 10,
  '気になる': 0,
  '完了': -10,
  '見送り': -20,
};

export function statusSortRank(type: ProjectType, status: string): number {
  const ranks = type === 'career' ? CAREER_STATUS_SORT_RANKS : SIDE_JOB_STATUS_SORT_RANKS;
  return ranks[status] ?? 0;
}
