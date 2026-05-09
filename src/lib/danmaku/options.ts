import { LunaDanmakuOptions } from './types';

export const LUNA_DANMAKU_OPTIONS_KEY = 'lunatv_danmaku_options';

export const defaultLunaDanmakuOptions: LunaDanmakuOptions = {
  enabled: true,
  opacity: 0.72,
  fontSize: 25,
  speed: 1,
  displayArea: 80,
  offset: 0,
  maxOnScreen: 500,
  interval: 200,
  dedup: true,
  blockTop: false,
  blockBottom: false,
  filters: [],
  source: {
    provider: 'custom',
    providerOrder: ['custom'],
    custom: {
      name: '',
      apiBase: '',
      enableAuth: false,
      headers: [],
    },
  },
};

export function loadLunaDanmakuOptions(): LunaDanmakuOptions {
  if (typeof window === 'undefined') return defaultLunaDanmakuOptions;

  try {
    const raw = localStorage.getItem(LUNA_DANMAKU_OPTIONS_KEY);
    if (!raw) return defaultLunaDanmakuOptions;
    const parsed = JSON.parse(raw) as Partial<LunaDanmakuOptions>;
    return mergeLunaDanmakuOptions(parsed);
  } catch {
    return defaultLunaDanmakuOptions;
  }
}

export function saveLunaDanmakuOptions(options: LunaDanmakuOptions) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LUNA_DANMAKU_OPTIONS_KEY, JSON.stringify(options));
}

export function mergeLunaDanmakuOptions(
  options?: Partial<LunaDanmakuOptions> | null
): LunaDanmakuOptions {
  if (!options) return defaultLunaDanmakuOptions;
  return {
    ...defaultLunaDanmakuOptions,
    ...options,
    filters: Array.isArray(options.filters) ? options.filters : [],
    source: {
      ...defaultLunaDanmakuOptions.source,
      ...(options.source || {}),
      provider: 'custom',
      providerOrder: ['custom'],
      custom: {
        ...defaultLunaDanmakuOptions.source.custom,
        ...(options.source?.custom || {}),
        headers:
          options.source?.custom &&
            Array.isArray(options.source.custom.headers)
            ? options.source.custom.headers
          : [],
      },
    },
  };
}
