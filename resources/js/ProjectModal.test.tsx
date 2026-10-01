import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectModal from './ProjectModal';
import { emptyFormData } from './utils/toFormData';

describe('ProjectModal', () => {
  it('errorsで渡されたフィールド別エラーを対応する項目の下に表示する', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        errors={{ reward_text: ['The reward text field must not be greater than 255 characters.'] }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByText('The reward text field must not be greater than 255 characters.')).toBeInTheDocument();
  });

  it('複数フィールドのエラーをそれぞれ表示する', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        errors={{
          name: ['The name field is required.'],
          project_url: ['The project url field must be a valid URL.'],
        }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByText('The name field is required.')).toBeInTheDocument();
    expect(screen.getByText('The project url field must be a valid URL.')).toBeInTheDocument();
  });

  it('errorsが未指定の場合はエラー表示が出ない', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    expect(screen.queryByText(/field/)).not.toBeInTheDocument();
  });

  it('isSubmitting=trueのとき送信ボタンがdisabledになる', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        isSubmitting
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '登録中...' })).toBeDisabled();
  });

  it('isSubmitting=falseのとき送信ボタンは有効', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        isSubmitting={false}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '登録' })).not.toBeDisabled();
  });

  it('mode=createで送信中は「登録中...」を表示する', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        isSubmitting
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '登録中...' })).toBeInTheDocument();
  });

  it('mode=editで送信中は「更新中...」を表示する', () => {
    render(
      <ProjectModal
        open
        mode="edit"
        project={null}
        isSubmitting
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '更新中...' })).toBeInTheDocument();
  });

  it('mode=editで送信中でない場合は「更新」を表示する', () => {
    render(
      <ProjectModal
        open
        mode="edit"
        project={null}
        isSubmitting={false}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
  });

  it('open=falseのときは何も表示しない', () => {
    const { container } = render(
      <ProjectModal open={false} mode="create" project={null} onClose={() => {}} onSubmit={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('新規登録では種別が未選択で、「選ぶ」を案内として出す', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );

    const type = screen.getByLabelText('種別') as HTMLSelectElement;

    expect(type.value).toBe('');
    expect(Array.from(type.options).map(o => o.textContent)).toEqual(['選ぶ', '転職', '副業']);
    // 「選ぶ」は保存値ではないため選び直せないこと。
    expect((type.options[0] as HTMLOptionElement).disabled).toBe(true);
  });

  it('編集では保存済みの種別を選択状態で表示する', () => {
    const project = {
      id: 1, type: 'career' as const, name: '案件', project_url: null, client_name: null,
      media: null, category: null, description: null, applied_date: null, deadline: null,
      status: '気になる', reward: null, reward_text: null,
      working_hours: null, applicant_count: null, recruitment_count: null, application_text: null,
      next_action: null, next_action_date: null, memo: null, priority: null, is_favorite: false,
      job_type: null, location: null, remote_type: null, employment_type: null,
      contract_type: null, delivery_date: null, fetched_at: null, deleted_at: null,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    };

    render(
      <ProjectModal open mode="edit" project={project} onClose={() => {}} onSubmit={() => {}} />
    );

    expect((screen.getByLabelText('種別') as HTMLSelectElement).value).toBe('career');
  });

  it('種別が未選択のまま登録しようとすると選択を促し、送信しない', () => {
    const onSubmit = vi.fn();

    // 案件名のlabelはhtmlForを持たないため、name属性で入力欄を取得する。
    const { container } = render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={onSubmit} />
    );

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '種別未選択の案件' } });
    fireEvent.click(screen.getByRole('button', { name: '登録' }));

    expect(screen.getByText('種別を選んでください')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('種別を選べば登録できる', () => {
    const onSubmit = vi.fn();

    const { container } = render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={onSubmit} />
    );

    fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: '種別を選んだ案件' } });
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
    fireEvent.click(screen.getByRole('button', { name: '登録' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].type).toBe('career');
  });

  it('種別が未選択の間もステータス選択肢を表示する', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    const status = screen.getByLabelText('ステータス') as HTMLSelectElement;
    const optionValues = Array.from(status.options).map(o => o.value);
    expect(optionValues).toContain('契約');
    expect(optionValues).toContain('納品');
    expect(optionValues).not.toContain('書類選考');
  });

  it('種別を転職へ切り替えるとcareer用のステータス選択肢に変わる', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });

    const status = screen.getByLabelText('ステータス') as HTMLSelectElement;
    const optionValues = Array.from(status.options).map(o => o.value);
    expect(optionValues).toContain('書類選考');
    expect(optionValues).toContain('内定');
    expect(optionValues).not.toContain('契約');
  });

  it('種別=副業では副業専用項目(契約形態)を表示し、転職専用項目は表示しない', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    // 新規登録の種別は未選択から始まるため、副業を明示的に選んでから確認する。
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'side_job' } });

    expect(screen.getByLabelText('契約形態')).toBeInTheDocument();
    expect(screen.queryByLabelText('職種')).not.toBeInTheDocument();
  });

  it('種別を転職へ切り替えると転職専用項目(職種)を表示し、副業専用項目は消える', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });

    expect(screen.getByLabelText('職種')).toBeInTheDocument();
    expect(screen.queryByLabelText('契約形態')).not.toBeInTheDocument();
  });

  it('優先度(priority)の入力項目は表示しない', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    expect(screen.queryByText('優先度')).not.toBeInTheDocument();
  });

  it('報酬はreward_textを自由テキストで編集できる', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    const rewardInput = screen.getByLabelText('報酬') as HTMLInputElement;
    fireEvent.change(rewardInput, { target: { value: '応相談' } });
    expect(rewardInput.value).toBe('応相談');
  });

  it('募集内容の入力欄ラベルは「募集内容（抜粋）」である', () => {
    render(
      <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
    );
    expect(screen.getByLabelText('募集内容（抜粋）')).toBeInTheDocument();
  });

  it('fetch_status=partialとwarningsがある場合、注意バナーを表示する', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        notice={{ fetchStatus: 'partial', warnings: ['報酬をレンジ表記等のため自動入力できませんでした。'] }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );
    expect(screen.getByText(/一部の項目を自動取得できませんでした/)).toBeInTheDocument();
    expect(screen.getByText('報酬をレンジ表記等のため自動入力できませんでした。')).toBeInTheDocument();
  });

  it('報酬欄は原文を保持し、整形後の見え方を補助表示する', () => {
    const project = {
      id: 1, type: 'career' as const, name: '案件', project_url: null, client_name: null,
      media: null, category: null, description: null, applied_date: null, deadline: null,
      status: '気になる', reward: null, reward_text: '5000000〜15000000 JPY (YEAR)',
      working_hours: null, applicant_count: null, recruitment_count: null, application_text: null,
      next_action: null, next_action_date: null, memo: null, priority: null, is_favorite: false,
      job_type: null, location: null, remote_type: null, employment_type: null,
      contract_type: null, delivery_date: null, fetched_at: null, deleted_at: null,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    };

    render(
      <ProjectModal open mode="edit" project={project} onClose={() => {}} onSubmit={() => {}} />
    );

    // 保存対象の入力欄は原文のまま。
    expect((screen.getByLabelText('報酬') as HTMLInputElement).value)
      .toBe('5000000〜15000000 JPY (YEAR)');
    // 整形後の見え方は補助表示として添える。
    expect(screen.getByText('表示: 年収500万円〜1,500万円')).toBeInTheDocument();
  });

  it('加工対象外の報酬表記では補助表示を出さない', () => {
    render(
      <ProjectModal open mode="create" project={null}
        initialData={{ ...emptyFormData('side_job'), reward_text: '応相談' }}
        onClose={() => {}} onSubmit={() => {}} />
    );

    expect((screen.getByLabelText('報酬') as HTMLInputElement).value).toBe('応相談');
    expect(screen.queryByText(/^表示: /)).not.toBeInTheDocument();
  });

  it('既存type.jp案件を編集で開くと媒体がtypeで選択済みになる', () => {
    const project = {
      id: 1, type: 'career' as const, name: '案件',
      project_url: 'https://type.jp/job-1/0000001_detail/', client_name: null,
      media: 'その他', category: null, description: null, applied_date: null, deadline: null,
      status: '気になる', reward: null, reward_text: null,
      working_hours: null, applicant_count: null, recruitment_count: null, application_text: null,
      next_action: null, next_action_date: null, memo: null, priority: null, is_favorite: false,
      job_type: null, location: null, remote_type: null, employment_type: null,
      contract_type: null, delivery_date: null, fetched_at: null, deleted_at: null,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    };

    render(<ProjectModal open mode="edit" project={project} onClose={() => {}} onSubmit={() => {}} />);

    const media = document.querySelector('[name="media"]') as HTMLSelectElement;
    expect(media.value).toBe('type');
  });

  it('媒体プルダウンにtypeとフリーランスハブが選択肢として並ぶ', () => {
    render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

    const media = document.querySelector('[name="media"]') as HTMLSelectElement;
    const labels = [...media.options].map(o => o.textContent);

    expect(labels).toContain('type');
    expect(labels).toContain('フリーランスハブ');
    // 既存の選択肢は残っている。
    expect(labels).toContain('CrowdWorks');
    expect(labels).toContain('MENTA');
    expect(labels).toContain('Lancers');
    expect(labels).toContain('その他');
  });

  const baseProject = (overrides: Record<string, unknown> = {}) => ({
    id: 1, type: 'career' as const, name: '案件', project_url: null, client_name: null,
    media: null, category: null, description: null, applied_date: null, deadline: null,
    status: '気になる', reward: null, reward_text: null,
    working_hours: null, applicant_count: null, recruitment_count: null, application_text: null,
    next_action: null, next_action_date: null, memo: null, priority: null, is_favorite: false,
    job_type: null, location: null, remote_type: null, employment_type: null,
    contract_type: null, delivery_date: null, fetched_at: null, deleted_at: null,
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  });

  // ---- 媒体「その他」の自由入力 -----------------------------------------

  it('媒体で「その他」を選ぶと媒体名の自由入力欄が出る', () => {
    render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.queryByLabelText('媒体名')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('媒体'), { target: { value: 'その他' } });

    expect(screen.getByLabelText('媒体名')).toBeInTheDocument();
  });

  it('「その他」以外を選ぶと自由入力欄は出ない', () => {
    render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

    fireEvent.change(screen.getByLabelText('媒体'), { target: { value: 'type' } });

    expect(screen.queryByLabelText('媒体名')).not.toBeInTheDocument();
  });

  it('「その他」+自由入力した媒体名がonSubmitへ渡る', () => {
    const onSubmit = vi.fn();
    render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={onSubmit} />);

    fireEvent.change(document.querySelector('[name="name"]')!, { target: { value: '案件' } });
    // 種別が未選択だと送信前の確認で止まるため、媒体の検証前に有効な種別を選ぶ。
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'side_job' } });
    fireEvent.change(screen.getByLabelText('媒体'), { target: { value: 'その他' } });
    fireEvent.change(screen.getByLabelText('媒体名'), { target: { value: 'Green' } });
    fireEvent.click(screen.getByRole('button', { name: '登録' }));

    expect(onSubmit).toHaveBeenCalled();
    expect(onSubmit.mock.calls[0][0].media).toBe('その他');
    expect(onSubmit.mock.calls[0][0].media_other).toBe('Green');
  });

  it('未知の媒体名が保存済みの案件を編集で開くと、その他+自由入力に復元される', () => {
    render(
      <ProjectModal open mode="edit" project={baseProject({ media: 'Green' })}
        onClose={() => {}} onSubmit={() => {}} />
    );

    expect((screen.getByLabelText('媒体') as HTMLSelectElement).value).toBe('その他');
    expect((screen.getByLabelText('媒体名') as HTMLInputElement).value).toBe('Green');
  });

  it('未知の媒体名は編集して保存しても消えない', () => {
    const onSubmit = vi.fn();
    render(
      <ProjectModal open mode="edit" project={baseProject({ media: 'エン転職' })}
        onClose={() => {}} onSubmit={onSubmit} />
    );

    // 媒体には触れず、他の項目だけ編集して保存する。
    fireEvent.change(document.querySelector('[name="name"]')!, { target: { value: '案件(更新)' } });
    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    expect(onSubmit.mock.calls[0][0].media).toBe('その他');
    expect(onSubmit.mock.calls[0][0].media_other).toBe('エン転職');
  });

  // ---- 英語の内部値を出さない -------------------------------------------

  it('雇用形態の英語内部値は日本語で表示される', () => {
    render(
      <ProjectModal open mode="edit" project={baseProject({ employment_type: 'FULL_TIME,CONTRACTOR' })}
        onClose={() => {}} onSubmit={() => {}} />
    );

    const input = document.querySelector('[name="employment_type"]') as HTMLInputElement;
    expect(input.value).toBe('正社員/契約社員');
    expect(document.body.textContent).not.toContain('FULL_TIME');
    expect(document.body.textContent).not.toContain('CONTRACTOR');
  });

  it('報酬のJPY/YEN表記は補助表示が日本語になる', () => {
    render(
      <ProjectModal open mode="edit" project={baseProject({ reward_text: '350000 YEN (MONTH)' })}
        onClose={() => {}} onSubmit={() => {}} />
    );

    expect(screen.getByText('表示: 月給35万円')).toBeInTheDocument();
  });

  it('重複候補がある場合、警告と案件名・ステータスを表示する', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        notice={{
          fetchStatus: 'success',
          warnings: [],
          duplicates: [
            { id: 1, name: '株式会社サンプル バックエンド', status: '応募済み' },
            { id: 2, name: '株式会社サンプル バックエンド', status: '気になる' },
          ],
        }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(screen.getByText(/この求人はすでに登録されています/)).toBeInTheDocument();
    expect(screen.getByText('「株式会社サンプル バックエンド」（応募済み）')).toBeInTheDocument();
    expect(screen.getByText('「株式会社サンプル バックエンド」（気になる）')).toBeInTheDocument();
    expect(screen.getByText('必要な場合はそのまま登録できます。')).toBeInTheDocument();
  });

  it('重複候補がない場合、重複警告を表示しない', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        notice={{ fetchStatus: 'success', warnings: [], duplicates: [] }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(screen.queryByText(/この求人はすでに登録されています/)).not.toBeInTheDocument();
  });

  it('重複警告が出ていても登録ボタンは押せる(登録を禁止しない)', () => {
    render(
      <ProjectModal
        open
        mode="create"
        project={null}
        notice={{
          fetchStatus: 'success',
          warnings: [],
          duplicates: [{ id: 1, name: '重複案件', status: '気になる' }],
        }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: '登録' })).not.toBeDisabled();
  });

  it('重複警告は取得成功バナーより前に表示される', () => {
    const { container } = render(
      <ProjectModal
        open
        mode="create"
        project={null}
        notice={{
          fetchStatus: 'success',
          warnings: [],
          duplicates: [{ id: 1, name: '重複案件', status: '気になる' }],
        }}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    );

    const duplicate = screen.getByText(/この求人はすでに登録されています/);
    const success = screen.getByText(/URLからの取得に成功しました/);

    // 成功バナーだけを見てそのまま登録するのを防ぐため、重複警告が先に来ること。
    expect(duplicate.compareDocumentPosition(success) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });

  describe('ステータスの初期値', () => {
    const savedProject = (status: string) => ({
      id: 1, type: 'career' as const, name: '案件', project_url: null, client_name: null,
      media: null, category: null, description: null, applied_date: null, deadline: null,
      status, reward: null, reward_text: null,
      working_hours: null, applicant_count: null, recruitment_count: null, application_text: null,
      next_action: null, next_action_date: null, memo: null, priority: null, is_favorite: false,
      job_type: null, location: null, remote_type: null, employment_type: null,
      contract_type: null, delivery_date: null, fetched_at: null, deleted_at: null,
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    });
    const statusSelect = () => screen.getByLabelText('ステータス') as HTMLSelectElement;

    it('新規登録は「応募済み」から始まり、種別を切り替えても保たれる', () => {
      render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

      expect(statusSelect().value).toBe('応募済み');
      fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
      expect(statusSelect().value).toBe('応募済み');
      fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'side_job' } });
      expect(statusSelect().value).toBe('応募済み');
    });

    it('登録時に別のステータスを選べば、その値で送信する', () => {
      const onSubmit = vi.fn();
      const { container } = render(
        <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={onSubmit} />
      );

      fireEvent.change(container.querySelector('input[name="name"]')!, { target: { value: 'まだ応募していない案件' } });
      fireEvent.change(screen.getByLabelText('種別'), { target: { value: 'career' } });
      fireEvent.change(statusSelect(), { target: { value: '気になる' } });
      fireEvent.click(screen.getByRole('button', { name: '登録' }));

      expect(onSubmit.mock.calls[0][0].status).toBe('気になる');
    });

    it('編集は保存済みのステータスのまま開く(応募済みで上書きしない)', () => {
      render(<ProjectModal open mode="edit" project={savedProject('気になる')} onClose={() => {}} onSubmit={() => {}} />);

      expect(statusSelect().value).toBe('気になる');
    });
  });

  describe('活動メモ', () => {
    it('「活動メモ」として、後から届いた情報を記録できる欄だと分かるようにする', () => {
      render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

      const memo = screen.getByLabelText('活動メモ');
      expect(memo.tagName).toBe('TEXTAREA');
      expect(memo).toHaveAccessibleDescription('ここに後から届いた情報や選考メモを記録できます。');
      expect(memo.getAttribute('placeholder')).toContain('面接日程の連絡あり');
    });

    it('メモを書くために開いたときは、メモ欄へ直接フォーカスする', () => {
      render(
        <ProjectModal open mode="create" project={null} initialFocus="memo" onClose={() => {}} onSubmit={() => {}} />
      );

      expect(screen.getByLabelText('活動メモ')).toHaveFocus();
    });

    it('通常の編集ではメモ欄へ勝手にフォーカスしない', () => {
      render(<ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />);

      expect(screen.getByLabelText('活動メモ')).not.toHaveFocus();
    });
  });

  // jsdomはCSSを適用しないため、レイアウトは付与しているクラスと構造で確認する。
  describe('スマホ向けレイアウト', () => {
    const renderCreate = () =>
      render(
        <ProjectModal open mode="create" project={null} onClose={() => {}} onSubmit={() => {}} />
      );

    it('狭幅は下寄せのシート型、sm以上は従来の中央モーダルになる', () => {
      renderCreate();
      const panel = screen.getByRole('heading', { name: '案件を登録' }).parentElement!;

      expect(panel.parentElement).toHaveClass('items-end', 'sm:items-center');
      expect(panel).toHaveClass('rounded-t-xl', 'sm:rounded-lg', 'sm:mx-4', 'max-w-2xl');
    });

    it('高さはdvhで制限し、vhをフォールバックに持つ', () => {
      renderCreate();
      const panel = screen.getByRole('heading', { name: '案件を登録' }).parentElement!;

      expect(panel).toHaveClass('max-h-[90vh]');
      expect(panel.style.maxHeight).toBe('90dvh');
    });

    it('見出しは固定し、本文だけをスクロールさせる', () => {
      const { container } = renderCreate();
      const heading = screen.getByRole('heading', { name: '案件を登録' });
      const body = container.querySelector('form')!.parentElement!;

      expect(heading).toHaveClass('shrink-0');
      expect(heading.parentElement).toHaveClass('overflow-hidden', 'flex-col');
      expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    });

    it('保存・キャンセルは本文末尾に埋もれず、スクロール領域の下端に固定される', () => {
      renderCreate();
      const footer = screen.getByRole('button', { name: '登録' }).parentElement!;

      expect(footer).toBe(screen.getByRole('button', { name: 'キャンセル' }).parentElement);
      expect(footer).toHaveClass('sticky', 'bottom-0', 'bg-white');
    });

    it('入力欄は狭幅で16px・高さ44px、sm以上で従来の14pxに戻る', () => {
      const { container } = renderCreate();
      const fields = container.querySelectorAll('input:not([type="checkbox"]), select, textarea');

      expect(fields.length).toBeGreaterThan(0);
      fields.forEach(field => {
        expect(field).toHaveClass('text-base', 'min-h-11', 'sm:text-sm');
      });
    });

    it('保存・キャンセルは狭幅で高さ44pxを確保する', () => {
      renderCreate();

      for (const name of ['登録', 'キャンセル']) {
        expect(screen.getByRole('button', { name })).toHaveClass('min-h-11', 'sm:min-h-9');
      }
    });
  });
});
