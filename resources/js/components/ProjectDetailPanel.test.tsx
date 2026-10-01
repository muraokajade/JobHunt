import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import ProjectDetailPanel from './ProjectDetailPanel';
import { Project } from '../types/project';
import { CAREER_STATUS_OPTIONS, SIDE_JOB_STATUS_OPTIONS } from '../constants/projectOptions';

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
    created_at: '2026-08-01T00:00:00.000000Z',
    updated_at: '2026-08-01T00:00:00.000000Z',
    ...overrides,
  };
}

/** パネルの中だけを見る(一覧と同じ文字列が画面に出ることがあるため)。 */
const panel = () => within(screen.getByRole('dialog'));

describe('ProjectDetailPanel 開閉', () => {
  it('projectがnullなら何も描画しない', () => {
    const { container } = render(
      <ProjectDetailPanel project={null} variant="active" onClose={() => {}} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('projectを渡すとパネルが開き、案件名を見出しに出す', () => {
    render(<ProjectDetailPanel project={makeProject({ name: 'フロント改修' })} variant="active" onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'フロント改修 の詳細' })).toBeInTheDocument();
    expect(panel().getByRole('heading', { level: 2, name: 'フロント改修' })).toBeInTheDocument();
  });

  it('閉じるボタンでonCloseを呼ぶ', () => {
    const onClose = vi.fn();
    render(<ProjectDetailPanel project={makeProject()} variant="active" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '詳細を閉じる' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('EscapeキーでonCloseを呼ぶ', () => {
    const onClose = vi.fn();
    render(<ProjectDetailPanel project={makeProject()} variant="active" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('閉じているときはEscapeで何も起きない', () => {
    const onClose = vi.fn();
    render(<ProjectDetailPanel project={null} variant="active" onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ProjectDetailPanel 表示項目', () => {
  const detailed = makeProject({
    type: 'career',
    name: '案件',
    description: '一行目\n\n三行目',
    project_url: 'https://type.jp/job-1/0000002_detail/?pathway=116',
    reward_text: '5000000 JPY (YEAR)',
    media: 'type',
    client_name: '株式会社サンプル',
    category: 'Web開発',
    applied_date: '2026-08-01',
    deadline: '2099-12-31',
    next_action: '面談日程を調整',
    next_action_date: '2026-08-20',
    memo: 'メモ本文',
    job_type: 'Webバックエンド',
    location: '東京',
    employment_type: 'FULL_TIME',
  });

  it('保存済みの各項目を表示する', () => {
    render(<ProjectDetailPanel project={detailed} variant="active" onClose={() => {}} />);

    const p = panel();
    for (const label of ['報酬', '応募締切', 'クライアント', '媒体', 'カテゴリ', '応募日',
                         '募集内容', '案件URL', '次アクション', '活動メモ', '職種', '勤務地', '雇用形態']) {
      expect(p.getByText(label)).toBeInTheDocument();
    }
    expect(p.getByText('転職専用項目')).toBeInTheDocument();
  });

  it('募集内容は全文を段落・改行を維持して表示する', () => {
    render(<ProjectDetailPanel project={detailed} variant="active" onClose={() => {}} />);

    const body = panel().getByText(/一行目/);
    expect(body.className).toContain('whitespace-pre-wrap');
    expect(body.textContent).toContain('三行目');
  });

  it('空欄の項目は表示しない', () => {
    render(<ProjectDetailPanel project={makeProject({ memo: null, category: null })} variant="active" onClose={() => {}} />);

    expect(panel().queryByText('カテゴリ')).not.toBeInTheDocument();
    expect(panel().queryByText('次アクション')).not.toBeInTheDocument();
  });

  it('priorityが設定されていても表示しない', () => {
    render(<ProjectDetailPanel project={makeProject({ priority: '3.0' })} variant="active" onClose={() => {}} />);

    expect(panel().queryByText('3.0')).not.toBeInTheDocument();
  });

  it('英語の内部値と取込ノイズを出さない', () => {
    render(<ProjectDetailPanel project={detailed} variant="active" onClose={() => {}} />);

    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toContain('FULL_TIME');
    expect(text).not.toContain('JPY');
    expect(text).toContain('正社員');
    expect(text).toContain('年収500万円');
  });

  it('ステータスは色付きバッジで1つだけ出す', () => {
    render(<ProjectDetailPanel project={makeProject({ status: '内定' })} variant="active" onClose={() => {}} />);

    expect(panel().getByText('内定').className).toContain('bg-green-50');
  });
});

describe('ProjectDetailPanel URL表示', () => {
  it('https URLはリンクとして表示し、折り返せるようにする', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ project_url: 'https://example.com/job/1' })}
        variant="active"
        onClose={() => {}}
      />
    );

    const link = panel().getByRole('link', { name: 'https://example.com/job/1' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.className).toContain('break-all');
  });

  it('http/https以外のスキームはリンク化しない', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ project_url: 'javascript:alert(1)' })}
        variant="active"
        onClose={() => {}}
      />
    );

    expect(panel().queryByRole('link')).not.toBeInTheDocument();
    expect(panel().getByText('javascript:alert(1)')).toBeInTheDocument();
  });
});

describe('ProjectDetailPanel type専用項目', () => {
  it('career用項目(職種)を出し、side_job用項目は出さない', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ type: 'career', job_type: 'エンジニア', contract_type: '業務委託' })}
        variant="active"
        onClose={() => {}}
      />
    );

    const p = panel();
    expect(p.getByText('職種')).toBeInTheDocument();
    expect(p.queryByText('契約形態')).not.toBeInTheDocument();
  });

  it('side_job用項目(契約形態)を出し、career用項目は出さない', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ type: 'side_job', contract_type: '業務委託', job_type: 'エンジニア' })}
        variant="active"
        onClose={() => {}}
      />
    );

    const p = panel();
    expect(p.getByText('契約形態')).toBeInTheDocument();
    expect(p.queryByText('職種')).not.toBeInTheDocument();
  });

  it('副業可否は転職案件でだけ出し、未設定なら「不明」と出す', () => {
    const { rerender } = render(
      <ProjectDetailPanel project={makeProject({ type: 'career' })} variant="active" onClose={() => {}} />
    );

    expect(panel().getByText('副業可否')).toBeInTheDocument();
    expect(panel().getByText('不明')).toBeInTheDocument();

    rerender(
      <ProjectDetailPanel
        project={makeProject({ type: 'career', side_job_allowed: 'ok' })}
        variant="active"
        onClose={() => {}}
      />
    );

    expect(panel().getByText('副業OK')).toBeInTheDocument();
  });
});

describe('ProjectDetailPanel 報酬・媒体の表示', () => {
  it('reward_textを優先し、数値へ丸めない', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ reward: 50000, reward_text: '時給2,000円〜' })}
        variant="active"
        onClose={() => {}}
      />
    );

    expect(panel().getByText('時給2,000円〜')).toBeInTheDocument();
  });

  it('reward_textが無ければ数値から整形する', () => {
    render(<ProjectDetailPanel project={makeProject({ reward: 80000 })} variant="active" onClose={() => {}} />);

    expect(panel().getByText('80,000円')).toBeInTheDocument();
  });

  it('どちらも無ければ「未掲載」とし、0円にしない', () => {
    render(<ProjectDetailPanel project={makeProject()} variant="active" onClose={() => {}} />);

    expect(panel().getByText('未掲載')).toBeInTheDocument();
  });

  it('既存type.jp案件(媒体=その他)はURLから判定してtypeと出す', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ media: 'その他', project_url: 'https://type.jp/job-1/0000001_detail/' })}
        variant="active"
        onClose={() => {}}
      />
    );

    expect(panel().getByText('type')).toBeInTheDocument();
  });

  it('利用者が選んだ媒体はURLで上書きしない', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ media: 'Green', project_url: 'https://type.jp/job-1/0000001_detail/' })}
        variant="active"
        onClose={() => {}}
      />
    );

    expect(panel().getByText('Green')).toBeInTheDocument();
  });
});

describe('ProjectDetailPanel variant別の操作', () => {
  it('variant=activeでは編集・ゴミ箱へ移動を出す', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const project = makeProject();
    render(
      <ProjectDetailPanel project={project} variant="active" onClose={() => {}} onEdit={onEdit} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱へ移動' }));

    expect(onEdit).toHaveBeenCalledWith(project);
    expect(onDelete).toHaveBeenCalledWith(project.id);
  });

  it('variant=trashでは復元・完全削除を出す', () => {
    render(
      <ProjectDetailPanel
        project={makeProject()}
        variant="trash"
        onClose={() => {}}
        onRestore={() => {}}
        onForceDelete={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: '復元' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '完全削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
  });

  it('variant=demoではDBを変える操作を一切出さない(閲覧のみ)', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ type: 'career', side_job_allowed: 'ok', job_type: 'エンジニア' })}
        variant="demo"
        onClose={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );

    // 閲覧はできる。
    expect(panel().getByText('副業OK')).toBeInTheDocument();
    expect(panel().getByText('エンジニア')).toBeInTheDocument();

    // 押せないのではなく、存在しない。
    for (const name of ['編集', 'ゴミ箱へ移動', '復元', '完全削除']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('variant=trash・demoではステータスを変更できない(表示のみ)', () => {
    for (const variant of ['trash', 'demo'] as const) {
      const { unmount } = render(
        <ProjectDetailPanel project={makeProject()} variant={variant} onClose={() => {}} onStatusChange={async () => {}} />
      );
      expect(screen.queryByRole('combobox', { name: 'ステータス' })).not.toBeInTheDocument();
      expect(panel().getByText('気になる')).toBeInTheDocument();
      unmount();
    }
  });

  it('操作は狭幅で44pxのタップ領域を確保する', () => {
    render(
      <ProjectDetailPanel project={makeProject()} variant="active" onClose={() => {}} onEdit={() => {}} onDelete={() => {}} />
    );

    expect(screen.getByRole('button', { name: '編集' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: '詳細を閉じる' }).className).toContain('h-11');
  });
});

describe('ProjectDetailPanel ステータスの直接変更', () => {
  const statusSelect = () => screen.getByRole('combobox', { name: 'ステータス' }) as HTMLSelectElement;
  const optionValues = () => Array.from(statusSelect().options).map(o => o.value);

  /** 保存の完了をテスト側から制御するためのPromise。 */
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
  }

  it('転職案件はcareer用、副業案件はside_job用のステータスだけを選択肢に出す', () => {
    const { unmount } = render(
      <ProjectDetailPanel project={makeProject({ type: 'career' })} variant="active" onClose={() => {}} onStatusChange={async () => {}} />
    );
    expect(optionValues()).toEqual([...CAREER_STATUS_OPTIONS]);
    unmount();

    render(
      <ProjectDetailPanel project={makeProject({ type: 'side_job' })} variant="active" onClose={() => {}} onStatusChange={async () => {}} />
    );
    expect(optionValues()).toEqual([...SIDE_JOB_STATUS_OPTIONS]);
  });

  it('現在のステータスが選択された状態で出る', () => {
    render(
      <ProjectDetailPanel project={makeProject({ status: '応募済み' })} variant="active" onClose={() => {}} onStatusChange={async () => {}} />
    );
    expect(statusSelect().value).toBe('応募済み');
  });

  it('選んだ時点で案件と新しいステータスを渡し、保存中は再変更できない', async () => {
    const save = deferred();
    const onStatusChange = vi.fn(() => save.promise);
    const project = makeProject({ status: '気になる' });
    render(<ProjectDetailPanel project={project} variant="active" onClose={() => {}} onStatusChange={onStatusChange} />);

    fireEvent.change(statusSelect(), { target: { value: '応募準備' } });

    expect(onStatusChange).toHaveBeenCalledWith(project, '応募準備');
    expect(statusSelect()).toBeDisabled();
    expect(statusSelect().value).toBe('応募準備');
    expect(screen.getByText('保存中...')).toBeInTheDocument();

    save.resolve();
    await waitFor(() => expect(statusSelect()).not.toBeDisabled());
  });

  it('保存に失敗して案件が変わらなければ、元のステータス表示へ戻る', async () => {
    const save = deferred();
    render(
      <ProjectDetailPanel
        project={makeProject({ status: '気になる' })}
        variant="active"
        onClose={() => {}}
        onStatusChange={() => save.promise}
      />
    );

    fireEvent.change(statusSelect(), { target: { value: '応募済み' } });
    save.resolve();

    await waitFor(() => expect(statusSelect().value).toBe('気になる'));
    expect(screen.queryByText('保存中...')).not.toBeInTheDocument();
  });

  it('定義外のステータスが保存されていても、別の値に化けずにそのまま出す', () => {
    render(
      <ProjectDetailPanel project={makeProject({ status: '旧ステータス' })} variant="active" onClose={() => {}} onStatusChange={async () => {}} />
    );
    expect(statusSelect().value).toBe('旧ステータス');
  });

  it('狭幅では44px・16px(iOSの自動拡大を防ぐ)を確保する', () => {
    render(<ProjectDetailPanel project={makeProject()} variant="active" onClose={() => {}} onStatusChange={async () => {}} />);
    expect(statusSelect()).toHaveClass('min-h-11', 'text-base', 'md:text-sm');
  });

  it('現在の状態は、進捗の意味に応じた色の札(点・背景・枠)で出し、標準の矢印は使わない', () => {
    render(
      <ProjectDetailPanel project={makeProject({ status: '応募済み' })} variant="active" onClose={() => {}} onStatusChange={async () => {}} />
    );

    expect(statusSelect()).toHaveClass('appearance-none', 'rounded-full', 'border', 'border-blue-200', 'bg-blue-50', 'text-blue-700');
    const dot = statusSelect().parentElement!.querySelector('span[aria-hidden="true"]');
    expect(dot).toHaveClass('bg-blue-500');
  });

  it('選び直すと、保存中も札の色が選んだ状態のものに変わる', () => {
    render(
      <ProjectDetailPanel
        project={makeProject({ status: '応募済み' })}
        variant="active"
        onClose={() => {}}
        onStatusChange={() => new Promise<void>(() => {})}
      />
    );

    fireEvent.change(statusSelect(), { target: { value: '見送り' } });

    expect(statusSelect()).toHaveClass('text-slate-400');
    expect(statusSelect()).not.toHaveClass('bg-blue-50');
  });
});

describe('ProjectDetailPanel 活動メモ', () => {
  it('「活動メモ」を見出し付きの独立したセクションとして出す', () => {
    render(<ProjectDetailPanel project={makeProject({ memo: null })} variant="active" onClose={() => {}} onEdit={() => {}} />);

    const section = panel().getByRole('region', { name: '活動メモ' });
    expect(within(section).getByRole('heading', { name: '活動メモ' })).toHaveClass('text-sm', 'font-medium');
  });

  it('メモがあれば本文を改行を保って読みやすく表示し、右上に枠付きの「編集」ボタンを出す', () => {
    const onEdit = vi.fn();
    const project = makeProject({ memo: '9/30 面接日程の連絡あり\n10/2 19:00 一次面接\nPHP経験について質問あり' });
    render(<ProjectDetailPanel project={project} variant="active" onClose={() => {}} onEdit={onEdit} />);

    const body = panel().getByText(/9\/30 面接日程の連絡あり/);
    expect(body).toHaveClass('whitespace-pre-wrap', 'bg-slate-50');
    expect(body.textContent).toContain('PHP経験について質問あり');

    const edit = screen.getByRole('button', { name: '活動メモを編集' });
    expect(edit).toHaveTextContent('編集');
    expect(edit).toHaveClass('border', 'bg-white', 'hover:bg-slate-50', 'min-h-11');
    expect(screen.queryByRole('button', { name: '活動メモを追加' })).not.toBeInTheDocument();

    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledWith(project, 'memo');
  });

  it('メモが空なら短い説明と、枠付きの「＋ 活動メモを追加」ボタンを出す', () => {
    const onEdit = vi.fn();
    const project = makeProject({ memo: null });
    render(<ProjectDetailPanel project={project} variant="active" onClose={() => {}} onEdit={onEdit} />);

    expect(panel().getByText('企業から届いた追加情報や、面接・選考のメモを残せます。')).toBeInTheDocument();
    const add = screen.getByRole('button', { name: '活動メモを追加' });
    expect(add).toHaveClass('border', 'bg-white', 'hover:bg-slate-50', 'min-h-11');
    expect(add.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button', { name: '活動メモを編集' })).not.toBeInTheDocument();

    fireEvent.click(add);
    expect(onEdit).toHaveBeenCalledWith(project, 'memo');
  });

  it('既存の「編集」ボタンはそのまま残る', () => {
    const onEdit = vi.fn();
    const project = makeProject();
    render(<ProjectDetailPanel project={project} variant="active" onClose={() => {}} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect(onEdit).toHaveBeenCalledWith(project);
  });

  it('ゴミ箱・デモでは書き込めないので、メモがあるときだけ表示し入口は出さない', () => {
    for (const variant of ['trash', 'demo'] as const) {
      const withMemo = render(
        <ProjectDetailPanel project={makeProject({ memo: '返信済み、結果待ち' })} variant={variant} onClose={() => {}} onEdit={() => {}} />
      );
      expect(panel().getByText('返信済み、結果待ち')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /活動メモを/ })).not.toBeInTheDocument();
      withMemo.unmount();

      const empty = render(
        <ProjectDetailPanel project={makeProject({ memo: null })} variant={variant} onClose={() => {}} onEdit={() => {}} />
      );
      expect(panel().queryByText('活動メモ')).not.toBeInTheDocument();
      empty.unmount();
    }
  });
});
