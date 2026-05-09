export type LunaDanmakuMode = 'rtl' | 'ltr' | 'top' | 'bottom';

export type LunaDanmakuProvider = 'auto' | 'ddp' | 'custom';

export interface LunaDanmakuCustomHeader {
  key: string;
  value: string;
}

export interface LunaDanmakuCustomProviderOptions {
  name: string;
  apiBase: string;
  enableAuth: boolean;
  headers: LunaDanmakuCustomHeader[];
}

export interface LunaDanmakuSourceOptions {
  provider: LunaDanmakuProvider;
  providerOrder: Exclude<LunaDanmakuProvider, 'auto'>[];
  custom: LunaDanmakuCustomProviderOptions;
}

export interface LunaDanmakuComment {
  id?: string;
  time: number;
  text: string;
  color?: string;
  mode?: LunaDanmakuMode;
}

export interface LunaDanmakuOptions {
  enabled: boolean;
  opacity: number;
  fontSize: number;
  speed: number;
  displayArea: number;
  offset: number;
  maxOnScreen: number;
  interval: number;
  dedup: boolean;
  blockTop: boolean;
  blockBottom: boolean;
  filters: string[];
  source: LunaDanmakuSourceOptions;
}

export interface LunaDanmakuContext {
  title: string;
  searchTitle: string;
  year: string;
  type: string;
  source: string;
  sourceId: string;
  sourceName?: string;
  episodeIndex: number;
  episodeTitle?: string;
  totalEpisodes: number;
  doubanId?: number;
  poster?: string;
}

export type LunaDanmakuLoadStatus =
  | 'idle'
  | 'matching'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error';

export interface LunaDanmakuState {
  status: LunaDanmakuLoadStatus;
  count: number;
  sourceName?: string;
  matchName?: string;
  currentEpisodeNumber?: number;
  currentEpisodeTitle?: string;
  matchEpisodeId?: string;
  matchEpisodeTitle?: string;
  message?: string;
}

export interface LunaDanmakuSearchCandidate {
  provider: string;
  providerName: string;
  episodeId: string;
  title: string;
  animeId?: string;
  typeDescription?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  score: number;
  commentCount?: number;
}

export interface LunaDanmakuManualMapping extends LunaDanmakuSearchCandidate {
  source: LunaDanmakuSourceOptions;
  savedAt: number;
}

export interface LunaDanmakuSearchResponse {
  candidates: LunaDanmakuSearchCandidate[];
  context: LunaDanmakuContext;
}

export interface LunaDanmakuSearchRequest {
  context: LunaDanmakuContext;
  source: LunaDanmakuSourceOptions;
  includeAllEpisodes?: boolean;
}

export interface LunaDanmakuCommentsRequest {
  context: LunaDanmakuContext;
  source: LunaDanmakuSourceOptions;
  candidate: LunaDanmakuSearchCandidate;
}

export interface LunaDanmakuCommentsResponse {
  comments: LunaDanmakuComment[];
  sourceName?: string;
  matchName?: string;
}
