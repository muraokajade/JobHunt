import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UrlImportModal from './UrlImportModal';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: async () => body,
  } as Response;
}

describe('UrlImportModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 種別は未選択から始まるため、取得前に明示的に選ぶ(既定値では送信できない)。
  const selectType = (value: 'career' | 'side_job') => {
    fireEvent.change(screen.getByLabelText('種別'), { target: { value } });
  };

  const fillUrlAndSubmit = (url: string, type: 'career' | 'side_job' = 'side_job') => {
    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: url } });
    selectType(type);
    fireEvent.click(screen.getByRole('button', { name: '求人情報を読み込む' }));
  };

  it('preview成功時、取得内容をonPreviewReadyへフォームデータとして渡す', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {
      data: {
        project_url: 'https://example.com/job/1',
        type: 'side_job',
        name: 'OGP案件タイトル',
        description: 'OGPの説明文',
        client_name: null,
        media: 'example.com',
        category: null,
        reward: 60000,
        reward_text: '固定報酬制 60,000円',
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
        fetched_at: '2026-08-22T00:00:00+00:00',
        fetch_status: 'success',
        warnings: [],
      },
    }));

    const onPreviewReady = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={onPreviewReady} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/job/1');

    await waitFor(() => expect(onPreviewReady).toHaveBeenCalledTimes(1));
    const [formData, notice] = onPreviewReady.mock.calls[0];
    expect(formData.name).toBe('OGP案件タイトル');
    expect(formData.description).toBe('OGPの説明文');
    expect(formData.reward).toBe('60000');
    expect(formData.reward_text).toBe('固定報酬制 60,000円');
    expect(formData.project_url).toBe('https://example.com/job/1');
    expect(notice).toEqual({ fetchStatus: 'success', warnings: [], duplicates: [] });
  });

  it('fetch_status=partialとwarningsをそのままnoticeへ渡す', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {
      data: {
        project_url: 'https://example.com/',
        type: 'side_job',
        name: null,
        description: null,
        client_name: null,
        media: 'example.com',
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
        fetched_at: '2026-08-22T00:00:00+00:00',
        fetch_status: 'partial',
        warnings: ['ページからタイトルを取得できなかったため、手入力が必要です。'],
      },
    }));

    const onPreviewReady = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={onPreviewReady} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/');

    await waitFor(() => expect(onPreviewReady).toHaveBeenCalledTimes(1));
    const [, notice] = onPreviewReady.mock.calls[0];
    expect(notice.fetchStatus).toBe('partial');
    expect(notice.warnings).toEqual(['ページからタイトルを取得できなかったため、手入力が必要です。']);
  });

  it('取得失敗時(SSRF拒否等)は定型文を表示し、サーバーの生メッセージは出さない', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(422, {
      message: 'アクセスが許可されていないホストです。',
      error_code: 'blocked_host',
    }));

    const onPreviewReady = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={onPreviewReady} onManualEntry={() => {}} />);

    fillUrlAndSubmit('http://127.0.0.1/');

    await waitFor(() =>
      expect(screen.getByText('このURLは取得できません。公開されている求人ページのURLかご確認ください。')).toBeInTheDocument()
    );
    // サーバーが返した文言をそのまま画面へ出さない。
    expect(screen.queryByText('アクセスが許可されていないホストです。')).not.toBeInTheDocument();
    expect(onPreviewReady).not.toHaveBeenCalled();
  });

  it('通信自体に失敗した場合は汎用エラーを表示する', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/');

    await waitFor(() => expect(screen.getByText('通信に失敗しました。ネットワーク状態を確認してください。')).toBeInTheDocument());
  });

  it('取得中に連続でクリックしても取得リクエストは1回だけ送信される', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<Response>(resolve => { resolveFetch = resolve; })
    );

    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://example.com/' } });
    selectType('side_job');
    const button = screen.getByRole('button', { name: '求人情報を読み込む' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(200, {
      data: {
        project_url: 'https://example.com/', type: 'side_job', name: 'タイトル', description: null,
        client_name: null, media: null, category: null, reward: null, reward_text: null, working_hours: null,
        applicant_count: null, recruitment_count: null, deadline: null, job_type: null, location: null,
        remote_type: null, employment_type: null, contract_type: null, delivery_date: null,
        fetched_at: '2026-08-22T00:00:00+00:00', fetch_status: 'success', warnings: [],
      },
    }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  // ---- ログイン必須ページの手入力誘導 -----------------------------------

  const TYPE_ENTRY_URL = 'https://type.jp/entry_history/entry_message_list/12345/';
  const GUIDANCE = 'このURLはログインが必要なページのため、求人情報を自動取得できません。'
    + 'URLを保持したまま、会社名・求人名・年収などを手入力して登録できます。';

  it('type応募履歴URLを入力すると、送信前に案内を出し「手入力で続ける」を主導線にする', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: TYPE_ENTRY_URL } });

    expect(screen.getByText(GUIDANCE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '手入力で続ける' })).toBeInTheDocument();
    // 事前判定の段階では取得も試せるが、主導線ではない。
    expect(screen.getByRole('button', { name: '求人情報を読み込む' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('「手入力で続ける」でURLと種別を引き継いで手入力へ進む', () => {
    const onManualEntry = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={onManualEntry} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: TYPE_ENTRY_URL } });
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
    fireEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));

    expect(onManualEntry).toHaveBeenCalledWith(TYPE_ENTRY_URL, 'career');
  });

  it('requires_manual_entry応答では、URLを保持したまま手入力と再試行を選べる', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(422, {
      message: GUIDANCE,
      error_code: 'requires_manual_entry',
      requires_manual_entry: true,
      project_url: 'https://example.com/private/1',
      type: 'side_job',
    }));

    const onPreviewReady = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={onPreviewReady} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/private/1');

    await waitFor(() => expect(screen.getByText(GUIDANCE)).toBeInTheDocument());

    // 入力済みURLが消えない。
    expect((screen.getByPlaceholderText('https://...') as HTMLInputElement).value)
      .toBe('https://example.com/private/1');
    expect(screen.getByRole('button', { name: '手入力で続ける' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(onPreviewReady).not.toHaveBeenCalled();
  });

  it('401(セッション切れ)でも生の Unauthenticated. を表示しない', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(401, { message: 'Unauthenticated.' }));

    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://type.jp/entry_history/1');

    await waitFor(() =>
      expect(screen.getByText('セッションが切れました。ページを再読み込みしてログインし直してください。')).toBeInTheDocument()
    );
    expect(screen.queryByText('Unauthenticated.')).not.toBeInTheDocument();
  });

  it('取得失敗後もURLを保持し、手入力で続けるとそのURLが引き継がれる', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(502, {
      message: '取得先でサーバーエラーが発生しました。',
      error_code: 'upstream_server_error',
    }));

    const onManualEntry = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={onManualEntry} />);

    fillUrlAndSubmit('https://example.com/job/9');

    await waitFor(() =>
      expect(screen.getByText('取得先でエラーが発生しました。時間をおいて再試行してください。')).toBeInTheDocument()
    );
    // 失敗後は再試行と手入力の両方を選べる。
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));
    expect(onManualEntry).toHaveBeenCalledWith('https://example.com/job/9', 'side_job');
  });

  it('URLを直すと前回の失敗表示は消える', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(502, {
      message: 'x', error_code: 'not_found',
    }));

    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/missing');
    await waitFor(() =>
      expect(screen.getByText('ページが見つかりませんでした。URLをご確認ください。')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://example.com/ok' } });

    expect(screen.queryByText('ページが見つかりませんでした。URLをご確認ください。')).not.toBeInTheDocument();
  });

  it('公開求人URLでは従来どおり取得ボタンのみを出す', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), {
      target: { value: 'https://type.jp/job-1/0000001_detail/' },
    });

    expect(screen.getByRole('button', { name: '求人情報を読み込む' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '手入力で続ける' })).not.toBeInTheDocument();
    expect(screen.queryByText(GUIDANCE)).not.toBeInTheDocument();
  });

  // ---- スマホ向けレイアウト(jsdomはCSSを適用しないため、クラスで確認する) ----

  it('狭幅は下寄せのシート型で、高さをdvhで制限して中身をスクロールさせる', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);
    const panel = screen.getByRole('heading', { name: 'URLから登録' }).parentElement!;

    expect(panel.parentElement).toHaveClass('items-end', 'sm:items-center');
    expect(panel).toHaveClass('rounded-t-xl', 'sm:rounded-lg', 'sm:mx-4', 'max-w-lg');
    expect(panel).toHaveClass('max-h-[90vh]', 'overflow-y-auto');
    expect(panel.style.maxHeight).toBe('90dvh');
  });

  it('入力欄は狭幅で16px・高さ44px、主要ボタンも高さ44pxを確保する', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    for (const field of [screen.getByPlaceholderText('https://...'), screen.getByLabelText('種別')]) {
      expect(field).toHaveClass('text-base', 'min-h-11', 'sm:text-sm');
    }
    for (const name of ['求人情報を読み込む', 'キャンセル']) {
      expect(screen.getByRole('button', { name })).toHaveClass('min-h-11', 'sm:min-h-9');
    }
  });

  // ---- 「取得中…」が残らないこと ----------------------------------------

  it('タイムアウト(中断)時はローディングを解除し、案内と手入力導線を出す', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    });

    const onManualEntry = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={onManualEntry} />);

    fillUrlAndSubmit('https://type.jp/job-1/0000002_detail/?pathway=116');

    await waitFor(() =>
      expect(
        screen.getByText('取得に時間がかかりすぎたため中断しました。もう一度試すか、手入力で続けてください。')
      ).toBeInTheDocument()
    );

    // 「取得中...」が残らず、操作可能な状態へ戻る。
    expect(screen.queryByText('取得中...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '手入力で続ける' })).toBeInTheDocument();

    // URLは保持され、そのまま手入力へ進める。
    fireEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));
    expect(onManualEntry).toHaveBeenCalledWith('https://type.jp/job-1/0000002_detail/?pathway=116', 'side_job');
  });

  it('AbortErrorでも同じ案内を出す', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);
    fillUrlAndSubmit('https://example.com/job/1');

    await waitFor(() =>
      expect(
        screen.getByText('取得に時間がかかりすぎたため中断しました。もう一度試すか、手入力で続けてください。')
      ).toBeInTheDocument()
    );
    expect(screen.queryByText('取得中...')).not.toBeInTheDocument();
  });

  it('取得中にキャンセルしても、開き直したときにローディングが残らない', async () => {
    // 応答が返らないリクエストを再現する。
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise<Response>(() => {}));

    const onClose = vi.fn();
    const { rerender } = render(
      <UrlImportModal open onClose={onClose} onPreviewReady={() => {}} onManualEntry={() => {}} />
    );

    fillUrlAndSubmit('https://example.com/job/1');
    expect(screen.getByText('取得中...')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalled();

    // 閉じて開き直す。
    rerender(<UrlImportModal open={false} onClose={onClose} onPreviewReady={() => {}} onManualEntry={() => {}} />);
    rerender(<UrlImportModal open onClose={onClose} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    // 「取得中...」ではなく通常の取得ボタンに戻っている。
    expect(screen.queryByText('取得中...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '求人情報を読み込む' })).toBeEnabled();
  });

  it('キャンセル後に再度取得できる(多重送信ガードが残らない)', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    const { rerender } = render(
      <UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />
    );

    fillUrlAndSubmit('https://example.com/job/1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    rerender(<UrlImportModal open={false} onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);
    rerender(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    // 再度送信できる(ガードが解除されている)。
    fillUrlAndSubmit('https://example.com/job/2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  // ---- 種別の未選択(選ぶ / 転職 / 副業) ---------------------------------

  it('種別は未選択から始まり、先頭の「選ぶ」はdisabledで保存値にならない', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    const select = screen.getByLabelText('種別') as HTMLSelectElement;
    expect(select.value).toBe('');

    const options = Array.from(select.options).map(o => ({ value: o.value, text: o.text, disabled: o.disabled }));
    expect(options).toEqual([
      { value: '', text: '選ぶ', disabled: true },
      { value: 'career', text: '転職', disabled: false },
      { value: 'side_job', text: '副業', disabled: false },
    ]);
  });

  it('種別が未選択のまま「求人情報を読み込む」を押すと、取得せずに選択を促す', () => {
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: 'https://example.com/job/1' } });
    fireEvent.click(screen.getByRole('button', { name: '求人情報を読み込む' }));

    expect(screen.getByText('種別を選んでください')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('種別が未選択のまま「手入力で続ける」を押しても、手入力へ進まない', () => {
    const onManualEntry = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={() => {}} onManualEntry={onManualEntry} />);

    fireEvent.change(screen.getByPlaceholderText('https://...'), { target: { value: TYPE_ENTRY_URL } });
    fireEvent.click(screen.getByRole('button', { name: '手入力で続ける' }));

    expect(screen.getByText('種別を選んでください')).toBeInTheDocument();
    expect(onManualEntry).not.toHaveBeenCalled();
  });

  it('選んだ種別はpreviewリクエストへそのまま渡る', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(200, {
      data: {
        project_url: 'https://example.com/job/1', type: 'career', name: 'タイトル', description: null,
        client_name: null, media: null, category: null, reward: null, reward_text: null, working_hours: null,
        applicant_count: null, recruitment_count: null, deadline: null, job_type: null, location: null,
        remote_type: null, employment_type: null, contract_type: null, delivery_date: null,
        fetched_at: '2026-08-22T00:00:00+00:00', fetch_status: 'success', warnings: [],
      },
    }));

    const onPreviewReady = vi.fn();
    render(<UrlImportModal open onClose={() => {}} onPreviewReady={onPreviewReady} onManualEntry={() => {}} />);

    fillUrlAndSubmit('https://example.com/job/1', 'career');

    await waitFor(() => expect(onPreviewReady).toHaveBeenCalledTimes(1));
    // 送信ボディに選択した種別が含まれる。
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(init?.body)).toContain('career');
    // preview後の登録フォームにも種別が引き継がれる。
    expect(onPreviewReady.mock.calls[0][0].type).toBe('career');
  });
});
