import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, previewImportUrl, PREVIEW_TIMEOUT_MS } from './projects';

describe('apiFetch のタイムアウト', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('timeoutMs未指定ならsignalを付けず、打ち切らない', async () => {
    fetchMock.mockResolvedValue({ status: 200 } as Response);

    await apiFetch('/api/projects');

    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  it('timeoutMs指定時はsignalを渡す', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    apiFetch('/api/import/preview', { method: 'POST' }, 1000);

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('応答が返らないまま時間が過ぎるとabortされる', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    apiFetch('/api/import/preview', { method: 'POST' }, 1000);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1000);

    // fetchが解決しなくても必ず打ち切られる(画面が「取得中…」のまま残らない)。
    expect(signal.aborted).toBe(true);
  });

  it('応答が返った場合はタイマーを解除し、abortしない', async () => {
    fetchMock.mockResolvedValue({ status: 200 } as Response);

    await apiFetch('/api/import/preview', { method: 'POST' }, 1000);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    vi.advanceTimersByTime(5000);

    expect(signal.aborted).toBe(false);
  });

  it('URL取込は上限つきで呼び出される', () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));

    previewImportUrl('https://type.jp/job-1/0000002_detail/?pathway=116', 'career');

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/api/import/preview');
    expect((options as RequestInit).signal).toBeInstanceOf(AbortSignal);

    // 無期限にはならない。
    expect(PREVIEW_TIMEOUT_MS).toBeGreaterThan(0);
    vi.advanceTimersByTime(PREVIEW_TIMEOUT_MS);
    expect(((options as RequestInit).signal as AbortSignal).aborted).toBe(true);
  });
});
