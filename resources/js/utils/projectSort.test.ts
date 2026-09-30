import { describe, it, expect } from 'vitest';
import { sortProjectsForList } from './projectSort';
import { statusSortRank, CAREER_STATUS_OPTIONS, SIDE_JOB_STATUS_OPTIONS } from '../constants/projectOptions';
import { Project } from '../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    type: 'career',
    name: '案件',
    project_url: null,
    client_name: null,
    media: null,
    category: null,
    description: null,
    applied_date: null,
    deadline: null,
    status: '応募済み',
    reward: null,
    reward_text: null,
    working_hours: null,
    applicant_count: null,
    recruitment_count: null,
    application_text: null,
    next_action: null,
    next_action_date: null,
    memo: null,
    priority: null,
    is_favorite: false,
    job_type: null,
    location: null,
    remote_type: null,
    employment_type: null,
    contract_type: null,
    delivery_date: null,
    fetched_at: null,
    deleted_at: null,
    created_at: '2026-09-01T00:00:00.000000Z',
    updated_at: '2026-09-01T00:00:00.000000Z',
    ...overrides,
  };
}

const names = (projects: Project[]) => sortProjectsForList(projects).map(p => p.name);

describe('statusSortRank', () => {
  it('転職は 内定 > 最終面接 > 面接 > 書類選考 > 応募済み > 応募準備 > 気になる > 見送り', () => {
    const ranks = CAREER_STATUS_OPTIONS.map(s => statusSortRank('career', s));
    const byRank = [...CAREER_STATUS_OPTIONS].sort((a, b) => statusSortRank('career', b) - statusSortRank('career', a));

    expect(byRank).toEqual(['内定', '最終面接', '面接', '書類選考', '応募済み', '応募準備', '気になる', '見送り']);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('副業は 検収待ち > 納品 > 作業中 > 契約 > 選考中 > 面談 > 返信待ち > 応募済み > 応募準備 > 気になる > 完了 > 見送り', () => {
    const byRank = [...SIDE_JOB_STATUS_OPTIONS].sort(
      (a, b) => statusSortRank('side_job', b) - statusSortRank('side_job', a)
    );

    expect(byRank).toEqual([
      '検収待ち', '納品', '作業中', '契約', '選考中', '面談', '返信待ち', '応募済み', '応募準備', '気になる', '完了', '見送り',
    ]);
  });

  it('定義に無いステータスは「気になる」と同じ扱いにする', () => {
    expect(statusSortRank('career', '旧ステータス')).toBe(statusSortRank('career', '気になる'));
  });
});

describe('sortProjectsForList', () => {
  it('選考の進み具合が大きい案件ほど上に並ぶ', () => {
    expect(
      names([
        makeProject({ id: 1, name: '気になる', status: '気になる' }),
        makeProject({ id: 2, name: '面接', status: '面接' }),
        makeProject({ id: 3, name: '応募済み', status: '応募済み' }),
        makeProject({ id: 4, name: '内定', status: '内定' }),
        makeProject({ id: 5, name: '書類選考', status: '書類選考' }),
        makeProject({ id: 6, name: '最終面接', status: '最終面接' }),
      ])
    ).toEqual(['内定', '最終面接', '面接', '書類選考', '応募済み', '気になる']);
  });

  it('同じ進み具合なら、更新日時の新しい案件が上に並ぶ', () => {
    expect(
      names([
        makeProject({ id: 1, name: '古い', status: '面接', updated_at: '2026-09-01T00:00:00.000000Z' }),
        makeProject({ id: 2, name: '最新', status: '面接', updated_at: '2026-09-29T10:00:00.000000Z' }),
        makeProject({ id: 3, name: '中間', status: '面接', updated_at: '2026-09-15T00:00:00.000000Z' }),
      ])
    ).toEqual(['最新', '中間', '古い']);
  });

  it('更新日時も同じなら、後から登録した(idの大きい)案件が上に並ぶ', () => {
    expect(
      names([
        makeProject({ id: 1, name: '先', status: '応募済み' }),
        makeProject({ id: 2, name: '後', status: '応募済み' }),
      ])
    ).toEqual(['後', '先']);
  });

  it('終了した案件(見送り・副業の完了)は、更新が新しくても進行中の案件より上に来ない', () => {
    expect(
      names([
        makeProject({ id: 1, name: '見送り', status: '見送り', updated_at: '2026-09-30T00:00:00.000000Z' }),
        makeProject({ id: 2, name: '完了', type: 'side_job', status: '完了', updated_at: '2026-09-30T00:00:00.000000Z' }),
        makeProject({ id: 3, name: '気になる', status: '気になる', updated_at: '2026-09-01T00:00:00.000000Z' }),
        makeProject({ id: 4, name: '応募済み', status: '応募済み', updated_at: '2026-09-01T00:00:00.000000Z' }),
      ])
    ).toEqual(['応募済み', '気になる', '完了', '見送り']);
  });

  it('転職と副業が混ざっても同じ尺度で並ぶ(内定が最上位、副業の作業中は面接より上)', () => {
    expect(
      names([
        makeProject({ id: 1, name: '転職:面接', status: '面接' }),
        makeProject({ id: 2, name: '副業:応募済み', type: 'side_job', status: '応募済み' }),
        makeProject({ id: 3, name: '副業:作業中', type: 'side_job', status: '作業中' }),
        makeProject({ id: 4, name: '転職:内定', status: '内定' }),
      ])
    ).toEqual(['転職:内定', '副業:作業中', '転職:面接', '副業:応募済み']);
  });

  it('元の配列は並べ替えない', () => {
    const original = [
      makeProject({ id: 1, name: '気になる', status: '気になる' }),
      makeProject({ id: 2, name: '内定', status: '内定' }),
    ];
    sortProjectsForList(original);

    expect(original.map(p => p.name)).toEqual(['気になる', '内定']);
  });
});
