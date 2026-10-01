import { describe, it, expect } from 'vitest';
import { mediaFromUrl, resolveMediaForDisplay, splitMediaForForm, mergeMediaFromForm } from './mediaFromUrl';
import { MEDIA_OPTIONS } from '../constants/projectOptions';

describe('mediaFromUrl URLからの媒体判定', () => {
  it('type.jpのURLはtypeと判定する', () => {
    expect(mediaFromUrl('https://type.jp/job-1/0000001_detail/')).toBe('type');
  });

  it('フリーランスハブのURLはフリーランスハブと判定する', () => {
    expect(mediaFromUrl('https://freelance-hub.jp/project/detail/12345/')).toBe('フリーランスハブ');
  });

  it('www付きでも判定する', () => {
    expect(mediaFromUrl('https://www.type.jp/job-1/1/')).toBe('type');
    expect(mediaFromUrl('https://www.freelance-hub.jp/project/')).toBe('フリーランスハブ');
  });

  it('サブドメインも同じ媒体として判定する', () => {
    expect(mediaFromUrl('https://pro.freelance-hub.jp/project/1/')).toBe('フリーランスハブ');
    expect(mediaFromUrl('https://career.type.jp/job/1/')).toBe('type');
  });

  it('既存の媒体も従来どおり判定する', () => {
    expect(mediaFromUrl('https://crowdworks.jp/public/jobs/1')).toBe('CrowdWorks');
    expect(mediaFromUrl('https://menta.work/plan/1')).toBe('MENTA');
    expect(mediaFromUrl('https://lancers.jp/work/detail/1')).toBe('Lancers');
  });

  it('未知のホスト・空・不正URLはnullを返す', () => {
    expect(mediaFromUrl('https://example.com/job/1')).toBeNull();
    expect(mediaFromUrl('')).toBeNull();
    expect(mediaFromUrl(null)).toBeNull();
    expect(mediaFromUrl('not-a-url')).toBeNull();
  });

  it('判定結果は必ず媒体プルダウンの選択肢に含まれる', () => {
    const urls = [
      'https://type.jp/job-1/1/',
      'https://freelance-hub.jp/project/1/',
      'https://crowdworks.jp/public/jobs/1',
      'https://menta.work/plan/1',
      'https://lancers.jp/work/detail/1',
    ];
    for (const url of urls) {
      expect(MEDIA_OPTIONS as readonly string[]).toContain(mediaFromUrl(url)!);
    }
  });
});

describe('resolveMediaForDisplay 表示用の媒体', () => {
  it('既存type.jp案件の「その他」はURL判定でtypeになる', () => {
    expect(resolveMediaForDisplay({
      media: 'その他',
      project_url: 'https://type.jp/job-1/0000001_detail/',
    })).toBe('type');
  });

  it('選択肢に無い媒体名(古い取込値を含む)は保持し、URL判定で上書きしない', () => {
    // 「未知媒体名が保存されている案件が、編集や表示で消えない」ことを優先する。
    // 直したい場合は、編集画面の「その他」自由入力欄で利用者が変更できる。
    expect(resolveMediaForDisplay({
      media: '転職type - マッチする求人情報が分かる、探せる、転職サイト',
      project_url: 'https://type.jp/job-1/1/',
    })).toBe('転職type - マッチする求人情報が分かる、探せる、転職サイト');
  });

  it('媒体が「その他」の場合はURL判定で具体的な媒体名に寄せる', () => {
    expect(resolveMediaForDisplay({
      media: 'その他',
      project_url: 'https://type.jp/job-1/1/',
    })).toBe('type');
  });

  it('媒体が未設定でもURLから補う', () => {
    expect(resolveMediaForDisplay({
      media: null,
      project_url: 'https://freelance-hub.jp/project/1/',
    })).toBe('フリーランスハブ');
  });

  it('利用者が選んだ特定の媒体はURLで上書きしない', () => {
    expect(resolveMediaForDisplay({
      media: 'MENTA',
      project_url: 'https://type.jp/job-1/1/',
    })).toBe('MENTA');
  });

  it('自由入力された媒体名はURL判定で上書きしない', () => {
    expect(resolveMediaForDisplay({
      media: 'Green',
      project_url: 'https://type.jp/job-1/1/',
    })).toBe('Green');
  });

  it('URLから判定できない場合はDBの値をそのまま使う', () => {
    expect(resolveMediaForDisplay({ media: 'その他', project_url: 'https://example.com/1' })).toBe('その他');
    expect(resolveMediaForDisplay({ media: 'その他', project_url: null })).toBe('その他');
  });

  it('媒体もURLも無ければnull', () => {
    expect(resolveMediaForDisplay({ media: null, project_url: null })).toBeNull();
  });
});
describe('splitMediaForForm 保存値の分解', () => {
  it('選択肢にある媒体はそのまま選択値になる', () => {
    expect(splitMediaForForm('type')).toEqual({ media: 'type', mediaOther: '' });
    expect(splitMediaForForm('CrowdWorks')).toEqual({ media: 'CrowdWorks', mediaOther: '' });
  });

  it('選択肢に無い媒体名は「その他」+自由入力へ分解する', () => {
    expect(splitMediaForForm('Green')).toEqual({ media: 'その他', mediaOther: 'Green' });
    expect(splitMediaForForm('エン転職')).toEqual({ media: 'その他', mediaOther: 'エン転職' });
  });

  it('「その他」そのものは自由入力を空にする', () => {
    expect(splitMediaForForm('その他')).toEqual({ media: 'その他', mediaOther: '' });
  });

  it('未設定は両方空', () => {
    expect(splitMediaForForm(null)).toEqual({ media: '', mediaOther: '' });
    expect(splitMediaForForm('')).toEqual({ media: '', mediaOther: '' });
  });
});

describe('mergeMediaFromForm 保存値の組み立て', () => {
  it('「その他」+自由入力なら入力した媒体名を保存する', () => {
    expect(mergeMediaFromForm('その他', 'Green')).toBe('Green');
    expect(mergeMediaFromForm('その他', '  Wantedly  ')).toBe('Wantedly');
  });

  it('「その他」で自由入力が空なら「その他」を保存する', () => {
    expect(mergeMediaFromForm('その他', '')).toBe('その他');
    expect(mergeMediaFromForm('その他', '   ')).toBe('その他');
  });

  it('「その他」以外は選択値をそのまま保存する', () => {
    expect(mergeMediaFromForm('type', 'Green')).toBe('type');
    expect(mergeMediaFromForm('', '')).toBe('');
  });

  it('未知媒体は分解→再統合しても失われない', () => {
    const split = splitMediaForForm('Indeed');
    expect(mergeMediaFromForm(split.media, split.mediaOther)).toBe('Indeed');
  });
});
