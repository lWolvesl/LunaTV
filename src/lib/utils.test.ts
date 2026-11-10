/* eslint-env jest */
import Hls from 'hls.js';

import { getVideoResolutionFromM3u8 } from './utils';

jest.mock('hls.js', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    Events: {
      FRAG_LOADING: 'fragLoading',
      FRAG_LOADED: 'fragLoaded',
      ERROR: 'error',
    },
  }),
}));

describe('HLS source probe resource cleanup', () => {
  let callbacks: Map<string, (event: string, data: unknown) => void>;
  let hls: {
    on: jest.Mock;
    loadSource: jest.Mock;
    attachMedia: jest.Mock;
    destroy: jest.Mock;
  };
  let originalFetch: typeof fetch;
  let fetchMock: jest.Mock;
  let load: jest.SpyInstance;

  const emitHls = (event: string, data: unknown = {}) => {
    callbacks.get(event)?.(event, data);
  };
  const start = (width = 1920) => {
    const result = getVideoResolutionFromM3u8('https://example.com/video.m3u8');
    const video = hls.attachMedia.mock.calls[0][0] as HTMLVideoElement;
    Object.defineProperty(video, 'videoWidth', { value: width });
    return { result, video };
  };
  const loadFragment = () => {
    jest.advanceTimersByTime(10);
    emitHls(Hls.Events.FRAG_LOADING);
    jest.advanceTimersByTime(100);
    emitHls(Hls.Events.FRAG_LOADED, {
      payload: new Uint8Array(1024),
    });
  };
  const expectCleanedUp = () => {
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    callbacks = new Map();
    hls = {
      on: jest.fn((event, callback) => callbacks.set(event, callback)),
      loadSource: jest.fn(),
      attachMedia: jest.fn(),
      destroy: jest.fn(),
    };
    (Hls as unknown as jest.Mock).mockImplementation(() => hls);
    originalFetch = global.fetch;
    fetchMock = jest.fn().mockResolvedValue({});
    global.fetch = fetchMock;
    load = jest
      .spyOn(HTMLMediaElement.prototype, 'load')
      .mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('releases the temporary player even when metadata has no video width', async () => {
    const { result, video } = start(0);
    video.dispatchEvent(new Event('loadedmetadata'));
    loadFragment();
    await expect(result).resolves.toMatchObject({
      quality: '未知',
      loadSpeed: '10.0 KB/s',
    });
    expectCleanedUp();
    expect(video.onloadedmetadata).toBeNull();
    expect(video.onerror).toBeNull();
  });

  it.each(['metadata first', 'fragment first'])(
    'returns quality and releases resources with %s',
    async (order) => {
      const { result, video } = start();
      if (order === 'metadata first') {
        video.dispatchEvent(new Event('loadedmetadata'));
        loadFragment();
      } else {
        loadFragment();
        video.dispatchEvent(new Event('loadedmetadata'));
      }
      await expect(result).resolves.toMatchObject({ quality: '1080p' });
      expectCleanedUp();
    }
  );

  it('aborts pending requests and releases resources on timeout', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { result } = start();
    const rejected = expect(result).rejects.toThrow('Timeout');
    jest.advanceTimersByTime(4000);
    await rejected;
    expectCleanedUp();
  });

  it('releases resources on media errors', async () => {
    const { result, video } = start();
    const rejected = expect(result).rejects.toThrow('Failed to load');
    video.dispatchEvent(new Event('error'));
    await rejected;
    expectCleanedUp();
  });

  it('cleans up once if HLS reports more than one fatal error', async () => {
    const { result } = start();
    const rejected = expect(result).rejects.toThrow('networkError');
    emitHls(Hls.Events.ERROR, { fatal: true, type: 'networkError' });
    emitHls(Hls.Events.ERROR, { fatal: true, type: 'networkError' });
    await rejected;
    expectCleanedUp();
  });

  it('cleans up if attaching the media fails synchronously', async () => {
    hls.attachMedia.mockImplementation(() => {
      throw new Error('attach failed');
    });
    await expect(
      getVideoResolutionFromM3u8('https://example.com/video.m3u8')
    ).rejects.toThrow('attach failed');
    expectCleanedUp();
  });
});
