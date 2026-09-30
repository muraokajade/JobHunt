import { describe, it, expect } from 'vitest';
import { emptyFormData, projectToFormData, previewToFormData } from './toFormData';
import { Project, ProjectPreviewData } from '../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 1,
    type: 'side_job',
    name: 'テスト案件',
    project_url: null,
    client_name: null,
    media: null,
    category: null,
    description: null,
    applied_date: null,
    deadline: null,
    status: '気になる',
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
    created_at: '2026-08-29T00:00:00+09:00',
    updated_at: '2026-08-29T00:00:00+09:00',
    ...overrides,
  };
}

describe('projectToFormData 報酬表記', () => {
  it('reward_textがあれば一切加工せずそのまま使う', () => {
    const form = projectToFormData(makeProject({ reward_text: '応相談', reward: null }));
    expect(form.reward_text).toBe('応相談');
  });

  it('reward_textとrewardが両方あってもreward_textを加工せず優先する', () => {
    const form = projectToFormData(makeProject({ reward_text: '時給 2,000円', reward: 2000 }));
    expect(form.reward_text).toBe('時給 2,000円');
  });

  it('reward_textが空の旧データはrewardから桁区切り付きで補完する(表記が退行しない)', () => {
    const form = projectToFormData(makeProject({ reward_text: null, reward: 80000 }));
    expect(form.reward_text).toBe('80,000円');
  });

  it('補完時の桁区切りは4桁以上でも表示と一致する', () => {
    expect(projectToFormData(makeProject({ reward: 1234567 })).reward_text).toBe('1,234,567円');
    expect(projectToFormData(makeProject({ reward: 500 })).reward_text).toBe('500円');
  });

  it('reward_textもrewardも無ければ空欄のままにする(0円で埋めない)', () => {
    const form = projectToFormData(makeProject({ reward_text: null, reward: null }));
    expect(form.reward_text).toBe('');
  });

  it('旧rewardの数値そのものはフォーム上も保持される(API互換のため)', () => {
    const form = projectToFormData(makeProject({ reward: 80000 }));
    expect(form.reward).toBe('80000');
  });
});

describe('previewToFormData 報酬表記', () => {
  const basePreview: ProjectPreviewData = {
    project_url: 'https://example.com/job/1',
    type: 'side_job',
    name: '取込案件',
    description: null,
    client_name: null,
    media: null,
    category: null,
    reward: null,
    reward_text: null,
    working_hours: null,
    applicant_count: null,
    recruitment_count: null,
    deadline: null,
    job_type: null,
    location: null,
    remote_type: null,
    employment_type: null,
    contract_type: null,
    delivery_date: null,
    fetched_at: '2026-08-29T00:00:00+09:00',
    fetch_status: 'success',
    warnings: [],
  };

  it('取込結果のreward_textをそのまま引き継ぐ', () => {
    const form = previewToFormData({ ...basePreview, reward_text: '応相談', reward: null });
    expect(form.reward_text).toBe('応相談');
    expect(form.reward).toBe('');
  });

  it('報酬を取得できなかった場合は空欄にする(0円で埋めない)', () => {
    const form = previewToFormData({ ...basePreview, reward_text: null, reward: null });
    expect(form.reward_text).toBe('');
    expect(form.reward).toBe('');
  });
});

describe('新規登録・編集のステータス初期値', () => {
  it('手入力の新規登録は「応募済み」から始まる(種別の指定有無にかかわらず)', () => {
    expect(emptyFormData().status).toBe('応募済み');
    expect(emptyFormData('career').status).toBe('応募済み');
    expect(emptyFormData('side_job').status).toBe('応募済み');
  });

  it('URL取込の新規登録も「応募済み」から始まる(転職・副業とも)', () => {
    const base = {
      project_url: 'https://example.com/job/1', name: '取込案件', description: null, client_name: null, media: null,
      category: null, reward: null, reward_text: null, working_hours: null, applicant_count: null,
      recruitment_count: null, deadline: null, job_type: null, location: null, remote_type: null,
      employment_type: null, contract_type: null, delivery_date: null, fetched_at: '2026-09-30T00:00:00+09:00',
      fetch_status: 'success', warnings: [],
    } as const;

    expect(previewToFormData({ ...base, type: 'career', warnings: [] }).status).toBe('応募済み');
    expect(previewToFormData({ ...base, type: 'side_job', warnings: [] }).status).toBe('応募済み');
  });

  it('既存案件の編集は保存済みのステータスをそのまま使う(既定値で上書きしない)', () => {
    expect(projectToFormData(makeProject({ status: '気になる' })).status).toBe('気になる');
    expect(projectToFormData(makeProject({ type: 'career', status: '最終面接' })).status).toBe('最終面接');
  });
});
