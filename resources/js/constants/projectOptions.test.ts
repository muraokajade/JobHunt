import { describe, it, expect } from 'vitest';
import { CAREER_STATUS_OPTIONS, SIDE_JOB_STATUS_OPTIONS, statusGroupOf } from './projectOptions';

describe('statusGroupOf', () => {
  it('careerの全ステータスを、未着手・選考中・成功・見送りへ振り分ける', () => {
    expect(CAREER_STATUS_OPTIONS.map(s => [s, statusGroupOf(s)])).toEqual([
      ['気になる', 'todo'],
      ['応募準備', 'todo'],
      ['応募済み', 'active'],
      ['書類選考', 'active'],
      ['面接', 'active'],
      ['最終面接', 'active'],
      ['内定', 'success'],
      ['見送り', 'closed'],
    ]);
  });

  it('side_jobの全ステータスを、未着手・進行中・完了・見送りへ振り分ける', () => {
    expect(SIDE_JOB_STATUS_OPTIONS.map(s => [s, statusGroupOf(s)])).toEqual([
      ['気になる', 'todo'],
      ['応募準備', 'todo'],
      ['応募済み', 'active'],
      ['返信待ち', 'active'],
      ['面談', 'active'],
      ['選考中', 'active'],
      ['契約', 'active'],
      ['作業中', 'active'],
      ['納品', 'active'],
      ['検収待ち', 'active'],
      ['完了', 'success'],
      ['見送り', 'closed'],
    ]);
  });

  it('未知のステータスは未着手と同じ中立の扱いにする', () => {
    expect(statusGroupOf('旧ステータス')).toBe('todo');
  });
});
