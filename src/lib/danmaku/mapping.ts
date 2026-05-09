import { LunaDanmakuContext, LunaDanmakuManualMapping } from './types';

const LUNA_DANMAKU_MAPPING_KEY = 'lunatv_danmaku_manual_mappings';

type MappingStore = Record<string, LunaDanmakuManualMapping>;

export function getDanmakuMappingKey(context: LunaDanmakuContext) {
  return [
    context.source,
    context.sourceId,
    context.episodeIndex,
    context.title || context.searchTitle,
  ].join('|');
}

export function loadDanmakuMapping(
  context: LunaDanmakuContext
): LunaDanmakuManualMapping | null {
  if (typeof window === 'undefined') return null;
  try {
    const store = readStore();
    return store[getDanmakuMappingKey(context)] || null;
  } catch {
    return null;
  }
}

export function saveDanmakuMapping(
  context: LunaDanmakuContext,
  mapping: LunaDanmakuManualMapping
) {
  if (typeof window === 'undefined') return;
  const store = readStore();
  store[getDanmakuMappingKey(context)] = mapping;
  localStorage.setItem(LUNA_DANMAKU_MAPPING_KEY, JSON.stringify(store));
}

export function deleteDanmakuMapping(context: LunaDanmakuContext) {
  if (typeof window === 'undefined') return;
  const store = readStore();
  delete store[getDanmakuMappingKey(context)];
  localStorage.setItem(LUNA_DANMAKU_MAPPING_KEY, JSON.stringify(store));
}

function readStore(): MappingStore {
  const raw = localStorage.getItem(LUNA_DANMAKU_MAPPING_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}
