import {
  LunaDanmakuComment,
  LunaDanmakuContext,
  LunaDanmakuCustomProviderOptions,
  LunaDanmakuSearchCandidate,
} from '../types';

interface DdpEpisode {
  episodeId: number;
  episodeTitle: string;
}

interface DdpAnime {
  animeId: number;
  bangumiId?: string;
  animeTitle: string;
  type: string;
  typeDescription: string;
  imageUrl?: string;
  startDate?: string;
  episodeCount?: number;
  episodes: DdpEpisode[];
}

interface DdpAnimeSearchItem {
  animeId: number;
  bangumiId: string;
  animeTitle: string;
  type: string;
  typeDescription: string;
  imageUrl: string;
  startDate: string;
  episodeCount: number;
}

interface DdpSearchEpisodesResponse {
  animes?: DdpAnime[];
  hasMore?: boolean;
  success?: boolean;
  errorMessage?: string;
}

interface DdpSearchAnimeResponse {
  animes?: DdpAnimeSearchItem[];
  success?: boolean;
  errorMessage?: string;
}

interface DdpBangumiResponse {
  bangumi?: DdpAnime;
  success?: boolean;
  errorMessage?: string;
}

interface DdpComment {
  cid?: number;
  p: string;
  m: string;
}

interface DdpCommentResponse {
  count: number;
  comments: DdpComment[];
}

const DDP_PROXY_BASE =
  process.env.DANMAKU_DDP_PROXY_BASE ||
  'https://api.danmaku.weeblify.app/ddp/v1';

const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[!！?？《》「」『』【】()[\]\s:：·・,，.。_-]/g, '');

const unique = (items: string[]) =>
  Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));

const toDdpUrl = (
  path: string,
  apiBase = DDP_PROXY_BASE,
  useProxyPath = true
) => {
  const url = new URL(apiBase);
  if (useProxyPath) {
    url.searchParams.set('path', path);
    return url.toString();
  }

  const base = apiBase.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
};

const usesProxyPath = (options?: LunaDanmakuCustomProviderOptions) => {
  if (options?.apiBase?.trim()) return false;
  return true;
};

const fetchDdp = async <T>(
  path: string,
  options?: LunaDanmakuCustomProviderOptions,
  cacheMode: 'cache' | 'no-store' = 'cache'
): Promise<T> => {
  const apiBase = options?.apiBase?.trim() || DDP_PROXY_BASE;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options?.enableAuth) {
    for (const header of options.headers) {
      if (header.key.trim()) headers[header.key.trim()] = header.value;
    }
  }

  const response = await fetch(toDdpUrl(path, apiBase, usesProxyPath(options)), {
    headers,
    ...(cacheMode === 'no-store'
      ? { cache: 'no-store' as const }
      : { next: { revalidate: 60 * 60 } }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `DanDanPlay 请求失败：${response.status}${text ? ` ${text.slice(0, 120)}` : ''
      }`
    );
  }

  return (await response.json()) as T;
};

const scoreAnime = (anime: DdpAnime, context: LunaDanmakuContext) => {
  const title = normalizeTitle(context.title);
  const searchTitle = normalizeTitle(context.searchTitle);
  const animeTitle = normalizeTitle(anime.animeTitle);

  let score = 40;
  if (title && animeTitle === title) score += 45;
  else if (searchTitle && animeTitle === searchTitle) score += 40;
  else if (title && animeTitle.includes(title)) score += 28;
  else if (searchTitle && animeTitle.includes(searchTitle)) score += 24;
  else if (title && title.includes(animeTitle)) score += 16;

  if (context.type === 'movie' && anime.type === 'movie') score += 12;
  if (context.type === 'tv' && anime.type !== 'movie') score += 12;
  if (context.totalEpisodes > 1 && anime.episodes.length > 1) score += 8;
  if (context.totalEpisodes === 1 && anime.episodes.length === 1) score += 8;

  const episodeDelta = Math.abs(anime.episodes.length - context.totalEpisodes);
  if (context.totalEpisodes > 1 && episodeDelta === 0) score += 10;
  else if (context.totalEpisodes > 1 && episodeDelta <= 2) score += 5;

  return score;
};

const pickEpisode = (anime: DdpAnime, context: LunaDanmakuContext) => {
  if (anime.episodes.length === 0) return null;
  if (anime.episodes.length === 1) return anime.episodes[0];

  const targetIndex = Math.max(0, context.episodeIndex);
  const byIndex = anime.episodes[targetIndex];
  if (byIndex) return byIndex;

  const targetTitle = normalizeTitle(context.episodeTitle || '');
  if (targetTitle) {
    const byTitle = anime.episodes.find((episode) =>
      normalizeTitle(episode.episodeTitle).includes(targetTitle)
    );
    if (byTitle) return byTitle;
  }

  return anime.episodes[0];
};

export async function searchDdpDanmaku(
  context: LunaDanmakuContext,
  options?: LunaDanmakuCustomProviderOptions,
  includeAllEpisodes = false
): Promise<LunaDanmakuSearchCandidate[]> {
  const keywords = buildSearchKeywords(context);
  const candidates = new Map<string, LunaDanmakuSearchCandidate>();

  for (const keyword of keywords) {
    const fromEpisodes = await searchByEpisodes(
      keyword,
      context,
      options,
      includeAllEpisodes
    );
    for (const candidate of fromEpisodes) {
      mergeCandidate(candidates, candidate);
    }

    if (candidates.size > 0) break;
  }

  if (candidates.size === 0) {
    for (const keyword of keywords) {
      const fromAnime = await searchByAnime(
        keyword,
        context,
        options,
        includeAllEpisodes
      );
      for (const candidate of fromAnime) {
        mergeCandidate(candidates, candidate);
      }

      if (candidates.size > 0) break;
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, includeAllEpisodes ? 80 : 12);
}

async function searchByEpisodes(
  keyword: string,
  context: LunaDanmakuContext,
  options?: LunaDanmakuCustomProviderOptions,
  includeAllEpisodes = false
) {
  const params = new URLSearchParams({ anime: keyword });
  const data = await fetchDdp<DdpSearchEpisodesResponse>(
    `/v2/search/episodes?${params.toString()}`,
    options,
    'no-store'
  );

  if (data.success === false) {
    throw new Error(data.errorMessage || 'DanDanPlay 匹配失败');
  }

  return buildCandidates(data.animes || [], context, options, includeAllEpisodes);
}

async function searchByAnime(
  keyword: string,
  context: LunaDanmakuContext,
  options?: LunaDanmakuCustomProviderOptions,
  includeAllEpisodes = false
) {
  const params = new URLSearchParams({ keyword });
  const data = await fetchDdp<DdpSearchEpisodesResponse>(
    `/v2/search/anime?${params.toString()}`,
    options,
    'no-store'
  );

  if (data.success === false) {
    throw new Error(data.errorMessage || 'DanDanPlay 匹配失败');
  }

  const searchData = data as unknown as DdpSearchAnimeResponse;
  const seasons: DdpAnime[] = [];

  for (const anime of searchData.animes || []) {
    const detail = await getDdpBangumi(
      anime.bangumiId || String(anime.animeId),
      options
    );
    if (detail) {
      seasons.push(detail);
    } else {
      seasons.push({
        animeId: anime.animeId,
        bangumiId: anime.bangumiId,
        animeTitle: anime.animeTitle,
        type: anime.type,
        typeDescription: anime.typeDescription,
        imageUrl: anime.imageUrl,
        startDate: anime.startDate,
        episodeCount: anime.episodeCount,
        episodes: [],
      });
    }
  }

  return buildCandidates(seasons, context, options, includeAllEpisodes);
}

async function getDdpBangumi(
  bangumiId: string,
  options?: LunaDanmakuCustomProviderOptions
) {
  try {
    const data = await fetchDdp<DdpBangumiResponse>(
      `/v2/bangumi/${encodeURIComponent(bangumiId)}`,
      options,
      'no-store'
    );
    return data.bangumi || null;
  } catch {
    return null;
  }
}

function buildCandidates(
  animes: DdpAnime[],
  context: LunaDanmakuContext,
  options?: LunaDanmakuCustomProviderOptions,
  includeAllEpisodes = false
) {
  const candidates: LunaDanmakuSearchCandidate[] = [];

  for (const anime of animes) {
    if (includeAllEpisodes && anime.episodes.length > 0) {
      anime.episodes.forEach((episode, index) => {
        candidates.push({
          provider: 'ddp',
          providerName: options?.name || '弹弹Play',
          episodeId: String(episode.episodeId),
          title: anime.animeTitle,
          animeId: String(anime.animeId),
          typeDescription: anime.typeDescription || anime.type,
          episodeNumber: index + 1,
          episodeTitle: episode.episodeTitle,
          score: scoreAnime(anime, context) - Math.abs(index - context.episodeIndex),
          commentCount: undefined,
        });
      });
      continue;
    }

    const episode = pickEpisode(anime, context);
    const fallbackEpisodeId = computeEpisodeId(anime.animeId, context);
    if (!episode && !fallbackEpisodeId) continue;

    candidates.push({
      provider: 'ddp',
      providerName: options?.name || '弹弹Play',
      episodeId: String(episode?.episodeId || fallbackEpisodeId),
      title: anime.animeTitle,
      animeId: String(anime.animeId),
      typeDescription: anime.typeDescription || anime.type,
      episodeNumber: episode
        ? anime.episodes.findIndex((item) => item.episodeId === episode.episodeId) + 1
        : context.episodeIndex + 1,
      episodeTitle: episode?.episodeTitle || context.episodeTitle,
      score: scoreAnime(anime, context),
      commentCount: undefined,
    });
  }

  return candidates;
}

function buildSearchKeywords(context: LunaDanmakuContext) {
  const baseTitles = unique([
    context.searchTitle,
    context.title,
    stripSeasonSuffix(context.searchTitle),
    stripSeasonSuffix(context.title),
    stripChineseEpisodeSuffix(context.searchTitle),
    stripChineseEpisodeSuffix(context.title),
  ]);

  return baseTitles.length > 0 ? baseTitles : [context.title];
}

function stripSeasonSuffix(value: string) {
  return value
    .replace(/第[一二三四五六七八九十0-9]+季.*$/u, '')
    .replace(/\s*S\d+\s*$/iu, '')
    .trim();
}

function stripChineseEpisodeSuffix(value: string) {
  return value
    .replace(/第?\s*\d+\s*[集话話].*$/u, '')
    .replace(/\s*-\s*\d+\s*$/u, '')
    .trim();
}

function computeEpisodeId(animeId: number, context: LunaDanmakuContext) {
  if (!Number.isFinite(animeId)) return null;
  const episodeNumber = Math.max(1, context.episodeIndex + 1);
  return animeId * 10000 + episodeNumber;
}

function mergeCandidate(
  candidates: Map<string, LunaDanmakuSearchCandidate>,
  candidate: LunaDanmakuSearchCandidate
) {
  const existing = candidates.get(candidate.episodeId);
  if (!existing || candidate.score > existing.score) {
    candidates.set(candidate.episodeId, candidate);
  }
}

export async function fetchDdpComments(
  episodeId: string,
  options?: LunaDanmakuCustomProviderOptions
): Promise<LunaDanmakuComment[]> {
  const data = await fetchDdp<DdpCommentResponse>(
    `/v2/comment/${encodeURIComponent(episodeId)}?${new URLSearchParams({
      withRelated: 'true',
      chConvert: '1',
    }).toString()}`,
    options
  );

  const comments: LunaDanmakuComment[] = [];
  for (const comment of data.comments) {
    const converted = convertDdpComment(comment);
    if (converted) comments.push(converted);
  }
  return comments;
}

function convertDdpComment(comment: DdpComment): LunaDanmakuComment | null {
  const [timeRaw, modeRaw, colorRaw] = comment.p.split(',');
  const time = Number.parseFloat(timeRaw);
  const modeNumber = Number.parseInt(modeRaw, 10);
  const colorNumber = Number.parseInt(colorRaw, 10);

  if (!Number.isFinite(time) || !comment.m) return null;

  return {
    id: comment.cid ? String(comment.cid) : undefined,
    time,
    text: comment.m,
    mode: convertDdpMode(modeNumber),
    color: Number.isFinite(colorNumber) ? rgbNumberToHex(colorNumber) : '#fff',
  };
}

function convertDdpMode(mode: number): LunaDanmakuComment['mode'] {
  if (mode === 4) return 'bottom';
  if (mode === 5) return 'top';
  if (mode === 6) return 'ltr';
  return 'rtl';
}

function rgbNumberToHex(color: number) {
  return `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;
}
