import { MEDIA_OPTIONS } from '../constants/projectOptions';

/**
 * 案件URLのホストから媒体を判定する。
 * サーバー側の App\Services\UrlImport\MediaResolver と同じ対応表を持つ。
 *
 * 取込より前に登録された案件はDB上の媒体が古い値のままなので、
 * DBを書き換えずに、URLから判定できる場合だけ表示・選択をそろえる。
 */
const HOST_TO_MEDIA: Record<string, string> = {
  'crowdworks.jp': 'CrowdWorks',
  'menta.work': 'MENTA',
  'lancers.jp': 'Lancers',
  'type.jp': 'type',
  'freelance-hub.jp': 'フリーランスハブ',
};

/** 既知の媒体に当てはまらない場合の受け皿。 */
export const FALLBACK_MEDIA = 'その他';

/** URLのホストから媒体名を返す。判定できなければnull(=既知媒体ではない)。 */
export function mediaFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  if (HOST_TO_MEDIA[host]) return HOST_TO_MEDIA[host];

  // サブドメイン(例: pro.freelance-hub.jp)も同じ媒体として扱う。
  for (const [knownHost, media] of Object.entries(HOST_TO_MEDIA)) {
    if (host.endsWith(`.${knownHost}`)) return media;
  }

  return null;
}

/**
 * 画面(一覧・詳細)で使う媒体。DBの値は書き換えず、表示のときだけURL判定を反映する。
 *
 * 利用者が入力した媒体名(「Green」等、選択肢に無い自由入力値)は尊重し、
 * URL判定で上書きしない。上書きするのは「その他」や未設定のときだけ。
 */
export function resolveMediaForDisplay(
  project: { media: string | null; project_url: string | null }
): string | null {
  const media = project.media?.trim() ?? '';

  // 自由入力された媒体名(選択肢に無い値)はそのまま尊重する。
  if (media !== '' && media !== FALLBACK_MEDIA) return project.media;

  return mediaFromUrl(project.project_url) ?? (media !== '' ? project.media : null);
}

/**
 * 保存済みの媒体を、プルダウンの選択値と自由入力欄へ分解する。
 * 選択肢に無い値(「Green」等)は「その他」を選択したうえで自由入力欄へ入れ、
 * 編集して保存しても媒体名が消えないようにする。
 */
export function splitMediaForForm(media: string | null | undefined): {
  media: string;
  mediaOther: string;
} {
  const value = media?.trim() ?? '';

  if (value === '') return { media: '', mediaOther: '' };
  if ((MEDIA_OPTIONS as readonly string[]).includes(value)) return { media: value, mediaOther: '' };

  return { media: FALLBACK_MEDIA, mediaOther: value };
}

/**
 * フォームの選択値と自由入力欄から、保存する媒体名を決める。
 * 「その他」＋自由入力があればその名前を保存し、空欄なら「その他」を保存する。
 */
export function mergeMediaFromForm(media: string, mediaOther: string): string {
  if (media !== FALLBACK_MEDIA) return media;

  const name = mediaOther.trim();

  return name !== '' ? name : FALLBACK_MEDIA;
}
