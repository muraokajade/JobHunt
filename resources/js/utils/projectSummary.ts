import { Project } from '../types/project';

export interface ProjectStatusSummary {
  total: number;
  open: number;
  closed: number;
  favorite: number;
}

/**
 * career/side_job共通の正規ステータスラベルに基づく最低限のサマリー。
 * 「対応が終わった」とみなすステータス(内定・完了・見送り)以外はopenとして数える。
 * typeごとの集計は、呼び出し側が事前にtypeで絞り込んだ配列を渡すことで実現する
 * (このAPI自体はtypeを意識しない)。
 */
const CLOSED_STATUSES = ['内定', '完了', '見送り'];

export function computeStatusSummary(projects: Project[]): ProjectStatusSummary {
  const closed = projects.filter(p => CLOSED_STATUSES.includes(p.status)).length;

  return {
    total: projects.length,
    open: projects.length - closed,
    closed,
    favorite: projects.filter(p => p.is_favorite).length,
  };
}
