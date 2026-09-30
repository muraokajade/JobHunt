import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import AppRoot from './AppRoot';
import { Project } from './types/project';

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

function jsonResponse(status: number, body: unknown): Response {
  return { status, json: async () => body } as Response;
}

const AUTH_USER = { id: 1, name: 'モニターA', email: 'a@example.com' };

describe('AppRoot', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
      // 既存の一覧・検索テストはログイン済みを前提とする。
      if (url.includes('/api/auth/me')) {
        return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      }
      if (url.includes('/api/auth/logout')) {
        return Promise.resolve(jsonResponse(200, { data: null }));
      }
      if (url.includes('/api/projects/trash')) {
        return Promise.resolve(jsonResponse(200, { data: [] }));
      }
      return Promise.resolve(jsonResponse(200, { data: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    // fetchのstubを外す前にアンマウントし、残った取得処理が実fetchへ流れないようにする。
    cleanup();
    vi.unstubAllGlobals();
  });

  // 一覧・フィルタ・検索は案件が1件以上ある状態でのみ表示される。
  function mockExistingProject() {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '既存案件' })] }));
    });
  }

  it('タブ切替で/api/projects?type=careerを呼び出す(type絞り込み)', async () => {
    mockExistingProject();
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('既存案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '転職' }));

    await waitFor(() => {
      const calledWithCareer = fetchMock.mock.calls.some(call => String(call[0]).includes('type=career'));
      expect(calledWithCareer).toBe(true);
    });
  });

  it('検索欄に入力すると、debounce後にkeywordパラメータ付きで検索する', async () => {
    mockExistingProject();
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('既存案件')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('案件名・クライアント・概要・メモを検索'), {
      target: { value: 'Laravel' },
    });

    await waitFor(
      () => {
        const calledWithKeyword = fetchMock.mock.calls.some(call => String(call[0]).includes('keyword=Laravel'));
        expect(calledWithKeyword).toBe(true);
      },
      { timeout: 2000 }
    );
  });

  it('検索クリアボタンで即座に検索条件を解除する', async () => {
    mockExistingProject();
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('既存案件')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('案件名・クライアント・概要・メモを検索');
    fireEvent.change(input, { target: { value: 'Laravel' } });

    await waitFor(() => expect(screen.getByLabelText('検索をクリア')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('検索をクリア'));

    expect((input as HTMLInputElement).value).toBe('');
  });

  it('まだ1件も登録していないときはオンボーディング画面を出す', async () => {
    render(<AppRoot />);

    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());

    expect(screen.getByText('気になる求人を登録して、応募状況をまとめて管理しましょう。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '求人URLから登録' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手入力で登録' })).toBeInTheDocument();
  });

  it('まだ1件も登録していないときは、集計・フィルタ・検索・一覧見出しを出さない', async () => {
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());

    // 操作できる対象が無い状態では、空の管理画面を見せない。
    expect(screen.queryByText(/対応中/)).not.toBeInTheDocument();
    expect(screen.queryByText(/案件一覧/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('案件名・クライアント・概要・メモを検索')).not.toBeInTheDocument();
    for (const name of ['すべて', '転職', '副業', '求人URLを登録', '手入力']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('オンボーディングの「求人URLから登録」は既存のURL取込をそのまま開く', async () => {
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '求人URLから登録' }));

    expect(screen.getByText('案件ページのURL')).toBeInTheDocument();
  });

  it('オンボーディングの「手入力で登録」は既存の登録フォームをそのまま開く', async () => {
    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '手入力で登録' }));

    expect(screen.getByText('案件を登録')).toBeInTheDocument();
  });

  it('絞り込みの結果0件のときは、オンボーディングにせず条件をクリアできる', async () => {
    // 1件ある状態から絞り込んで0件にする(未登録の0件とは別物)。
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('type=career')) return Promise.resolve(jsonResponse(200, { data: [] }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '副業案件' })] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('副業案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '転職' }));

    await waitFor(() => expect(screen.getByText('条件に一致する案件がありません。')).toBeInTheDocument());
    // 条件を外せる必要があるので、オンボーディングには切り替えない。
    expect(screen.queryByText('JobHuntへようこそ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '条件をクリア' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '条件をクリア' }));

    await waitFor(() => expect(screen.getByText('副業案件')).toBeInTheDocument());
  });

  it('詳細パネルでステータスを変えると、statusだけをPATCHし一覧・詳細・集計がそろって更新される', async () => {
    let status = '気になる';
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (options?.method === 'PATCH') {
        status = JSON.parse(String(options.body)).status;
        return Promise.resolve(jsonResponse(200, { data: makeProject({ id: 5, name: '進める案件', status }) }));
      }
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ id: 5, name: '進める案件', status })] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('進める案件')).toBeInTheDocument());
    expect(screen.getByText(/対応中 1 ・ 終了 0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '進める案件 の詳細を開く' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'ステータス' }), { target: { value: '見送り' } });

    await waitFor(() => expect(screen.getByText(/対応中 0 ・ 終了 1/)).toBeInTheDocument());

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(patchCalls).toHaveLength(1);
    expect(String(patchCalls[0][0])).toContain('/api/projects/5');
    expect(JSON.parse(String((patchCalls[0][1] as RequestInit).body))).toEqual({ status: '見送り' });

    const row = screen.getByRole('button', { name: '進める案件 の詳細を開く' });
    expect(within(row).getByText('見送り')).toBeInTheDocument();
    expect((screen.getByRole('combobox', { name: 'ステータス' }) as HTMLSelectElement).value).toBe('見送り');
    // 編集フォームは開かない。
    expect(screen.queryByText('案件を編集')).not.toBeInTheDocument();

    // 成功は alert ではなく、数秒で消える通知で知らせる。
    expect(screen.getByRole('status')).toHaveTextContent('ステータスを「見送り」に更新しました');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 4000 });
  });

  it('ステータスの保存に失敗したら通知し、一覧・詳細は元のステータスのまま', async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (options?.method === 'PATCH') return Promise.resolve(jsonResponse(500, {}));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ id: 5, name: '進める案件' })] }));
    });
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('進める案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '進める案件 の詳細を開く' }));
    const select = screen.getByRole('combobox', { name: 'ステータス' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '応募済み' } });

    await waitFor(() => expect(alertMock).toHaveBeenCalled());
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(select.value).toBe('気になる');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    const row = screen.getByRole('button', { name: '進める案件 の詳細を開く' });
    expect(within(row).getByText('気になる')).toBeInTheDocument();
    expect(screen.getByText(/対応中 1 ・ 終了 0/)).toBeInTheDocument();
  });

  /** 一覧の行(案件名)を、画面に並んでいる順で取り出す。 */
  const rowNames = () =>
    screen
      .getAllByRole('button', { name: /の詳細を開く$/ })
      .map(b => (b.getAttribute('aria-label') ?? '').replace(/ の詳細を開く$/, ''));

  it('一覧は選考の進み具合が大きい順、同じなら更新の新しい順に並ぶ(終了系は下)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      // APIは登録の新しい順で返す。画面側で並べ替えることを確かめる。
      return Promise.resolve(jsonResponse(200, {
        data: [
          makeProject({ id: 6, name: '見送りA', type: 'career', status: '見送り', updated_at: '2026-09-30T09:00:00.000000Z' }),
          makeProject({ id: 5, name: '気になるA', type: 'career', status: '気になる', updated_at: '2026-09-29T00:00:00.000000Z' }),
          makeProject({ id: 4, name: '面接・古い', type: 'career', status: '面接', updated_at: '2026-09-10T00:00:00.000000Z' }),
          makeProject({ id: 3, name: '応募済みA', type: 'career', status: '応募済み', updated_at: '2026-09-28T00:00:00.000000Z' }),
          makeProject({ id: 2, name: '面接・新しい', type: 'career', status: '面接', updated_at: '2026-09-25T00:00:00.000000Z' }),
          makeProject({ id: 1, name: '内定A', type: 'career', status: '内定', updated_at: '2026-09-01T00:00:00.000000Z' }),
        ],
      }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('内定A')).toBeInTheDocument());

    expect(rowNames()).toEqual(['内定A', '面接・新しい', '面接・古い', '応募済みA', '気になるA', '見送りA']);
  });

  it('転職/副業で絞り込んでも、その結果の中で同じ並び順を保つ', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('type=side_job')) {
        return Promise.resolve(jsonResponse(200, {
          data: [
            makeProject({ id: 13, name: '副業・完了', type: 'side_job', status: '完了' }),
            makeProject({ id: 12, name: '副業・応募済み', type: 'side_job', status: '応募済み' }),
            makeProject({ id: 11, name: '副業・作業中', type: 'side_job', status: '作業中' }),
          ],
        }));
      }
      return Promise.resolve(jsonResponse(200, {
        data: [
          makeProject({ id: 2, name: '転職・気になる', type: 'career', status: '気になる' }),
          makeProject({ id: 1, name: '転職・最終面接', type: 'career', status: '最終面接' }),
        ],
      }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('転職・最終面接')).toBeInTheDocument());
    expect(rowNames()).toEqual(['転職・最終面接', '転職・気になる']);

    fireEvent.click(screen.getByRole('button', { name: '副業' }));

    await waitFor(() => expect(screen.getByText('副業・作業中')).toBeInTheDocument());
    expect(rowNames()).toEqual(['副業・作業中', '副業・応募済み', '副業・完了']);
  });

  it('手入力の新規登録は「応募済み」で送信される', async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, { data: makeProject({ id: 9 }) }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '既存案件' })] }));
    });

    const { container } = render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('既存案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '手入力' }));
    expect((screen.getByLabelText('ステータス') as HTMLSelectElement).value).toBe('応募済み');
    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '手入力の案件' } });
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
    fireEvent.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, init]) => String(u) === '/api/projects' && (init as RequestInit)?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String((post![1] as RequestInit).body)).status).toBe('応募済み');
    });
  });

  it('URL取込の新規登録も「応募済み」で送信される', async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('/api/import/preview')) {
        return Promise.resolve(jsonResponse(200, {
          data: {
            project_url: 'https://example.com/job/1', type: 'career', name: '取込した求人', description: null,
            client_name: null, media: null, category: null, reward: null, reward_text: null, working_hours: null,
            applicant_count: null, recruitment_count: null, deadline: null, job_type: null, location: null,
            remote_type: null, employment_type: null, contract_type: null, delivery_date: null,
            fetched_at: '2026-09-30T00:00:00+09:00', fetch_status: 'success', warnings: [],
          },
        }));
      }
      if (options?.method === 'POST') return Promise.resolve(jsonResponse(201, { data: makeProject({ id: 9 }) }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '既存案件' })] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('既存案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '求人URLを登録' }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://example.com/job/1' } });
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
    fireEvent.click(screen.getByRole('button', { name: '求人情報を読み込む' }));

    await waitFor(() => expect(screen.getByText('案件を登録')).toBeInTheDocument());
    // 取込結果がフォームへ入るのを待ってから登録する(取込内容を引き継いだ状態で送信されることを見る)。
    await waitFor(() => expect(screen.getByDisplayValue('取込した求人')).toBeInTheDocument());
    expect((screen.getByLabelText('ステータス') as HTMLSelectElement).value).toBe('応募済み');
    fireEvent.click(screen.getByRole('button', { name: '登録' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([u, init]) => String(u) === '/api/projects' && (init as RequestInit)?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String((post![1] as RequestInit).body));
      expect(body.status).toBe('応募済み');
      expect(body.project_url).toBe('https://example.com/job/1');
    });
  });

  it('詳細パネルの「メモを書く」から活動メモを保存でき、保存後はパネルにそのまま表示される(ステータスは保存済みのまま)', async () => {
    let memo: string | null = null;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (options?.method === 'PATCH') {
        memo = JSON.parse(String(options.body)).memo;
        return Promise.resolve(jsonResponse(200, { data: makeProject({ id: 5, name: 'メモ案件', type: 'career', status: '書類選考', memo }) }));
      }
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ id: 5, name: 'メモ案件', type: 'career', status: '書類選考', memo })] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('メモ案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'メモ案件 の詳細を開く' }));
    fireEvent.click(screen.getByRole('button', { name: 'メモを書く' }));

    const memoField = screen.getByLabelText('活動メモ');
    expect(memoField).toHaveFocus();
    fireEvent.change(memoField, { target: { value: '9/30 面接日程の連絡あり' } });
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => expect(screen.queryByText('案件を編集')).not.toBeInTheDocument());
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    const body = JSON.parse(String((patch![1] as RequestInit).body));
    expect(body.memo).toBe('9/30 面接日程の連絡あり');
    expect(body.status).toBe('書類選考');

    // 詳細パネルは開いたままで、再取得した内容(追記したメモ)がそのまま読める。
    const panel = within(screen.getByRole('dialog'));
    await waitFor(() => expect(panel.getByText('9/30 面接日程の連絡あり')).toBeInTheDocument());
    expect(panel.getByRole('button', { name: 'メモを追記・編集' })).toBeInTheDocument();
  });

  it('削除確認後にDELETE /api/projects/{id}を呼び出し、一覧を再取得する', async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/projects/1') && options?.method === 'DELETE') {
        return Promise.resolve({ status: 204, json: async () => ({}) } as Response);
      }
      if (url.includes('/api/projects/trash')) {
        return Promise.resolve(jsonResponse(200, { data: [] }));
      }
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ id: 1, name: '削除対象案件' })] }));
    });
    vi.stubGlobal('confirm', vi.fn(() => true));

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('削除対象案件')).toBeInTheDocument());

    // 削除は一覧ではなく詳細パネルの中にある。
    fireEvent.click(screen.getByRole('button', { name: '削除対象案件 の詳細を開く' }));
    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱へ移動' }));

    await waitFor(() => {
      const deleteCalled = fetchMock.mock.calls.some(
        call => String(call[0]).includes('/api/projects/1') && (call[1] as RequestInit)?.method === 'DELETE'
      );
      expect(deleteCalled).toBe(true);
    });
    expect(window.confirm).toHaveBeenCalled();
  });

  it('「ゴミ箱」ボタンでゴミ箱一覧(GET /api/projects/trash)を表示する', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/projects/trash')) {
        return Promise.resolve(jsonResponse(200, { data: [makeProject({ id: 2, name: '削除済み案件' })] }));
      }
      return Promise.resolve(jsonResponse(200, { data: [] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'ゴミ箱' }));

    await waitFor(() => expect(screen.getByText('削除済み案件')).toBeInTheDocument());
  });

  it('未ログイン(/api/auth/meが401)ならログイン画面を表示し、案件APIを呼ばない', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(401, { message: 'Unauthenticated.' }));
      return Promise.resolve(jsonResponse(200, { data: [] }));
    });

    render(<AppRoot />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument());

    // 案件一覧APIは一度も呼ばれない。
    const calledProjects = fetchMock.mock.calls.some(call => String(call[0]).includes('/api/projects'));
    expect(calledProjects).toBe(false);
  });

  it('未ログインでは案件データやヘッダー操作を一切表示しない', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(401, { message: 'Unauthenticated.' }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '見えてはいけない案件' })] }));
    });

    render(<AppRoot />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument());

    expect(screen.queryByText('見えてはいけない案件')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '手入力' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ゴミ箱' })).not.toBeInTheDocument();
  });

  it('ログイン済みならログインユーザーのメールとログアウトボタンを表示する', async () => {
    render(<AppRoot />);

    await waitFor(() => expect(screen.getByText('a@example.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument();
  });

  it('ログアウトするとログイン画面へ戻り、前ユーザーの案件が画面に残らない', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('/api/auth/logout')) return Promise.resolve(jsonResponse(200, { data: null }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: 'Aの案件' })] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('Aの案件')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument());
    expect(screen.queryByText('Aの案件')).not.toBeInTheDocument();
  });

  it('一覧取得が401になった場合はログイン画面へ戻す(セッション切れ)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('/api/projects')) return Promise.resolve(jsonResponse(401, { message: 'Unauthenticated.' }));
      return Promise.resolve(jsonResponse(200, { data: [] }));
    });

    render(<AppRoot />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument());
  });

  it('URL取込で手入力へ進むと、URLと種別を保持した登録フォームが開く', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      if (url.includes('/api/import/preview')) {
        return Promise.resolve(jsonResponse(422, {
          message: 'このURLはログインが必要なページのため、求人情報を自動取得できません。',
          error_code: 'requires_manual_entry',
          requires_manual_entry: true,
        }));
      }
      return Promise.resolve(jsonResponse(200, { data: [] }));
    });

    render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '求人URLから登録' }));
    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://type.jp/entry_history/entry_message_list/12345/' },
    });
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
    fireEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));

    // 登録フォームへ遷移し、URLと種別が引き継がれている。
    await waitFor(() => expect(screen.getByText('案件を登録')).toBeInTheDocument());
    expect((screen.getByLabelText('案件URL') as HTMLInputElement).value)
      .toBe('https://type.jp/entry_history/entry_message_list/12345/');
    expect((screen.getByLabelText('種別') as HTMLSelectElement).value).toBe('career');
  });
  // ---- デモ表示（ポートフォリオ用の架空案件） ----------------------------

  /** オンボーディング画面から「先にデモを見る」を押す。 */
  const startDemo = async () => {
    await waitFor(() => expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '先にデモを見る' }));
  };

  /** GET以外(＝DBを変える通信)だけを取り出す。 */
  const writeRequests = () =>
    fetchMock.mock.calls.filter(([, init]) => {
      const method = String((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      return method !== 'GET';
    });

  it('「デモを見る」で架空案件を表示し、デモ中であることと終了導線を出す', async () => {
    render(<AppRoot />);
    await startDemo();

    expect(screen.getByText('デモ表示中')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'デモを終了' })).toBeInTheDocument();

    // 空状態は消え、架空案件が一覧に並ぶ。
    expect(screen.queryByText('JobHuntへようこそ')).not.toBeInTheDocument();
    expect(screen.getByText('バックエンドエンジニア（Go / 決済基盤）')).toBeInTheDocument();
    expect(screen.getByText('コーポレートサイトのリニューアル')).toBeInTheDocument();
    // 見出しの件数もデモ案件の件数になる（実データの0件と取り違えない）。
    expect(screen.getByText(/案件一覧/)).toBeInTheDocument();
    expect(screen.getByText('4件')).toBeInTheDocument();
  });

  it('デモ案件では転職/副業・会社名・報酬・締切・ステータスが既存UIのまま読める', async () => {
    render(<AppRoot />);
    await startDemo();

    // 種別
    expect(screen.getAllByText('転職').length).toBeGreaterThan(0);
    expect(screen.getAllByText('副業').length).toBeGreaterThan(0);
    // 会社名
    expect(screen.getByText('架空テック株式会社')).toBeInTheDocument();
    // 報酬（年収レンジ・固定額・未掲載の3通り）
    expect(screen.getByText('年収600万円〜900万円')).toBeInTheDocument();
    expect(screen.getByText('180,000円')).toBeInTheDocument();
    expect(screen.getByText('未掲載')).toBeInTheDocument();
    // ステータス
    expect(screen.getByText('面接')).toBeInTheDocument();
    expect(screen.getByText('作業中')).toBeInTheDocument();
    // 応募締切（ラベルが出ていること。日付は今日基準で変わるので文言だけ見る）
    expect(screen.getAllByText('締切').length).toBeGreaterThan(0);
  });

  it('デモ案件の詳細を開くと副業可否が読め、編集・削除の導線は出さない', async () => {
    render(<AppRoot />);
    await startDemo();

    expect(screen.getAllByRole('button', { name: /の詳細を開く$/ })).toHaveLength(4);

    // 詳細パネルは1件ずつ。転職3件を開き、副業OK/NG/不明がそろうことを見る。
    // (一覧は進み具合順に並ぶので、位置ではなく案件名で開く)
    const expected: [string, string][] = [
      ['バックエンドエンジニア（Go / 決済基盤）', '副業OK'],
      ['フロントエンドエンジニア（React / 自社SaaS）', '副業NG'],
      ['社内DXエンジニア（業務システム改善）', '不明'],
    ];
    for (const [name, allowed] of expected) {
      fireEvent.click(screen.getByRole('button', { name: `${name} の詳細を開く` }));
      const panel = within(screen.getByRole('dialog'));
      expect(panel.getByText(allowed)).toBeInTheDocument();

      // 閲覧だけ。DBを変える操作はパネルにも存在しない。
      expect(screen.queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ゴミ箱へ移動' })).not.toBeInTheDocument();
    }
  });

  it('デモ案件も同じ並び順(進み具合 → 更新日時)で表示される', async () => {
    render(<AppRoot />);
    await startDemo();

    const names = screen
      .getAllByRole('button', { name: /の詳細を開く$/ })
      .map(b => (b.getAttribute('aria-label') ?? '').replace(/ の詳細を開く$/, ''));
    expect(names).toEqual([
      'コーポレートサイトのリニューアル', // 副業・作業中
      'バックエンドエンジニア（Go / 決済基盤）', // 面接
      'フロントエンドエンジニア（React / 自社SaaS）', // 書類選考
      '社内DXエンジニア（業務システム改善）', // 応募済み
    ]);
  });

  it('デモ中でも詳細パネルは開き、閉じれば一覧だけに戻る', async () => {
    render(<AppRoot />);
    await startDemo();

    fireEvent.click(screen.getAllByRole('button', { name: /の詳細を開く$/ })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '詳細を閉じる' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 一覧はそのまま残る(パネルは一覧を置き換えない)。
    expect(screen.getByText('バックエンドエンジニア（Go / 決済基盤）')).toBeInTheDocument();
  });

  it('デモ中はDBを変える通信を一切行わない', async () => {
    render(<AppRoot />);
    await startDemo();

    fireEvent.click(screen.getAllByRole('button', { name: /の詳細を開く$/ })[0]);

    // 一覧取得(GET)以外は発生しない＝APIへデモ案件を作成していない。
    expect(writeRequests()).toHaveLength(0);
    // デモ案件のURLがAPIへ渡っていないことも直接確かめる。
    const requestedUrls = fetchMock.mock.calls.map(([url]) => String(url)).join(' ');
    expect(requestedUrls).not.toContain('example.com');
  });

  it('「デモを終了」で架空案件が消え、元の0件の空状態へ戻る', async () => {
    render(<AppRoot />);
    await startDemo();

    fireEvent.click(screen.getByRole('button', { name: 'デモを終了' }));

    expect(screen.queryByText('バックエンドエンジニア（Go / 決済基盤）')).not.toBeInTheDocument();
    expect(screen.queryByText('デモ表示中')).not.toBeInTheDocument();
    // デモを終えると、まだ登録していない人の画面へ戻る。
    expect(screen.getByText('JobHuntへようこそ')).toBeInTheDocument();
    expect(writeRequests()).toHaveLength(0);
  });

  it('デモ中に実データの登録を始めると、デモは自動で終了する(実案件と混ざらない)', async () => {
    render(<AppRoot />);
    await startDemo();

    fireEvent.click(screen.getAllByRole('button', { name: '求人URLを登録' })[0]);

    expect(screen.getByText('案件ページのURL')).toBeInTheDocument();
    expect(screen.queryByText('デモ表示中')).not.toBeInTheDocument();
    expect(screen.queryByText('バックエンドエンジニア（Go / 決済基盤）')).not.toBeInTheDocument();
  });

  it('実案件が1件でもあればオンボーディングにならず、デモの導線も出さない', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      return Promise.resolve(jsonResponse(200, { data: [makeProject({ name: '実案件' })] }));
    });

    render(<AppRoot />);

    await waitFor(() => expect(screen.getByText('実案件')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '先にデモを見る' })).not.toBeInTheDocument();
  });
  // ---- 一覧の情報設計（PC/スマホ共通の土台） --------------------------

  const threeProjects = [
    makeProject({ id: 1, name: '案件A', status: '面接', type: 'career' }),
    makeProject({ id: 2, name: '案件B', status: '完了', type: 'side_job' }),
    makeProject({ id: 3, name: '案件C', status: '気になる', type: 'career', is_favorite: true }),
  ];

  const renderWithProjects = async (items = threeProjects) => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/me')) return Promise.resolve(jsonResponse(200, { data: AUTH_USER }));
      return Promise.resolve(jsonResponse(200, { data: items }));
    });
    const view = render(<AppRoot />);
    await waitFor(() => expect(screen.getByText('案件A')).toBeInTheDocument());
    return view;
  };

  it('案件が1件でもあれば、集計・フィルタ・検索・一覧見出しは従来どおり出す', async () => {
    await renderWithProjects();

    expect(screen.queryByText('JobHuntへようこそ')).not.toBeInTheDocument();
    expect(screen.getByText(/案件一覧/)).toBeInTheDocument();
    expect(screen.getByText(/対応中/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('案件名・クライアント・概要・メモを検索')).toBeInTheDocument();
    for (const name of ['すべて', '転職', '副業', '求人URLを登録', '手入力']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('一覧は1件ごとの箱にせず、枠1つの中へ行として並べる', async () => {
    const { container } = await renderWithProjects();

    // 案件名の祖先をたどり、枠を持つ要素が一覧全体で1つであることを確認する。
    const framed = container.querySelectorAll('div.rounded-lg.border.border-slate-200.bg-white');
    expect(framed).toHaveLength(1);
    expect(framed[0].textContent).toContain('案件A');
    expect(framed[0].textContent).toContain('案件C');
  });

  it('件数の内訳は主CTAと並べず、一覧見出しの脇へ小さく添える', async () => {
    await renderWithProjects();

    // 見出し行に内訳が出る。
    expect(screen.getByText(/対応中 2 ・ 終了 1 ・ お気に入り 1/)).toBeInTheDocument();
    // ツールバー側の「総数」ラベル付きサマリーは廃止した。
    expect(screen.queryByText('総数')).not.toBeInTheDocument();
  });

  it('一覧の主要操作は狭幅で44pxのタップ領域を持つ', async () => {
    await renderWithProjects();

    // min-h-11 = 44px。PC(sm以上)では従来の高さへ戻す。
    for (const name of ['求人URLを登録', '手入力']) {
      const button = screen.getAllByRole('button', { name })[0];
      expect(button.className).toContain('min-h-11');
      expect(button.className).toContain('sm:min-h-9');
    }

    const search = screen.getByPlaceholderText('案件名・クライアント・概要・メモを検索');
    expect(search.className).toContain('min-h-11');
  });

  it('検索欄は狭幅で16pxにして、iOS Safariの自動拡大を避ける', async () => {
    await renderWithProjects();

    const search = screen.getByPlaceholderText('案件名・クライアント・概要・メモを検索');
    // text-base = 16px。PCでは情報量を保つため14pxへ戻す。
    expect(search.className).toContain('text-base');
    expect(search.className).toContain('sm:text-sm');
  });

  it('ヘッダーのゴミ箱・ログアウトは狭幅で44px確保し、誤タップを防ぐ', async () => {
    await renderWithProjects();

    for (const name of ['ゴミ箱', 'ログアウト']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
  });

  it('UI改修後もデモ案件は同じ一覧の枠の中に並ぶ', async () => {
    const { container } = render(<AppRoot />);
    await startDemo();

    const framed = container.querySelectorAll('div.rounded-lg.border.border-slate-200.bg-white');
    expect(framed).toHaveLength(1);
    expect(framed[0].textContent).toContain('バックエンドエンジニア（Go / 決済基盤）');
    // 実データのAPIは呼ばれていない(デモは表示だけ)。
    expect(writeRequests()).toHaveLength(0);
  });
});
