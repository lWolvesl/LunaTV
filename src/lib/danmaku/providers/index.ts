import {
  LunaDanmakuCommentsResponse,
  LunaDanmakuContext,
  LunaDanmakuProvider,
  LunaDanmakuSearchCandidate,
  LunaDanmakuSourceOptions,
} from '../types';
import { fetchDdpComments, searchDdpDanmaku } from './ddp';

const implementedProviders = new Set<LunaDanmakuProvider>(['ddp', 'custom']);

export async function searchDanmakuProviders(
  context: LunaDanmakuContext,
  source: LunaDanmakuSourceOptions,
  includeAllEpisodes = false
): Promise<LunaDanmakuSearchCandidate[]> {
  const providers = resolveProviderOrder(source);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const candidates = await searchProvider(
        provider,
        context,
        source,
        includeAllEpisodes
      );
      if (candidates.length > 0) return candidates;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `${provider} 匹配失败`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  return [];
}

export async function fetchDanmakuFromCandidate(
  candidate: LunaDanmakuSearchCandidate,
  source: LunaDanmakuSourceOptions
): Promise<LunaDanmakuCommentsResponse> {
  if (candidate.provider === 'ddp') {
    const comments = await fetchDdpComments(candidate.episodeId);
    return {
      comments,
      sourceName: '弹弹Play',
      matchName: candidate.title,
    };
  }

  if (candidate.provider === 'custom') {
    const comments = await fetchDdpComments(
      candidate.episodeId,
      source.custom
    );
    return {
      comments,
      sourceName: source.custom.name || '第三方接口',
      matchName: candidate.title,
    };
  }

  return {
    comments: [],
    sourceName: candidate.providerName,
    matchName: candidate.title,
  };
}

function resolveProviderOrder(source: LunaDanmakuSourceOptions) {
  if (source.provider !== 'auto') return [source.provider];
  return source.providerOrder.filter((provider) =>
    implementedProviders.has(provider)
  );
}

async function searchProvider(
  provider: Exclude<LunaDanmakuProvider, 'auto'>,
  context: LunaDanmakuContext,
  source: LunaDanmakuSourceOptions,
  includeAllEpisodes = false
) {
  if (provider === 'ddp') return searchDdpDanmaku(context, undefined, includeAllEpisodes);
  if (provider === 'custom') {
    if (!source.custom.apiBase.trim()) return [];
    return searchDdpDanmaku(
      context,
      source.custom,
      includeAllEpisodes
    ).then((candidates) =>
      candidates.map((candidate) => ({
        ...candidate,
        provider: 'custom',
        providerName: source.custom.name || '第三方接口',
      }))
    );
  }
  return [];
}
