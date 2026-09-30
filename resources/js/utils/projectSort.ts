import { Project } from '../types/project';
import { statusSortRank } from '../constants/projectOptions';

function timeOf(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * 一覧の既定の並び順。
 *   1. 選考の進み具合が大きい順(statusSortRank)
 *   2. 同じなら更新日時の新しい順(ステータス変更・メモ追記で上がる)
 *   3. それも同じならidの大きい順(新しく登録した方を上にして、並びを安定させる)
 * 元の配列は変更せず、並べ替えた新しい配列を返す。
 * 絞り込み(種別・検索)はAPI側で済んでいるので、その結果にそのまま適用すれば順序が保たれる。
 */
export function sortProjectsForList(projects: readonly Project[]): Project[] {
  return [...projects].sort(
    (a, b) =>
      statusSortRank(b.type, b.status) - statusSortRank(a.type, a.status) ||
      timeOf(b.updated_at) - timeOf(a.updated_at) ||
      b.id - a.id,
  );
}
