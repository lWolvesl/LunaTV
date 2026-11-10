/* eslint-env jest */
import { LunaDanmakuController } from './controller';
import { defaultLunaDanmakuOptions } from './options';
import { LunaDanmakuComment, LunaDanmakuOptions } from './types';

describe('LunaDanmakuController scheduling', () => {
  let controller: LunaDanmakuController;
  let container: HTMLDivElement;
  let video: HTMLVideoElement;
  let state: {
    paused: boolean;
    ended: boolean;
    seeking: boolean;
    currentTime: number;
    playbackRate: number;
  };
  let hidden: boolean;
  let animations: Array<{
    playbackRate: number;
    play: jest.Mock;
    pause: jest.Mock;
  }>;
  let getAnimations: jest.Mock;
  let originalGetAnimations: PropertyDescriptor | undefined;
  let originalHidden: PropertyDescriptor | undefined;
  let originalResizeObserver: typeof ResizeObserver;

  const items = () => container.querySelectorAll('.luna-danmaku-item');
  const emit = (name: string) => video.dispatchEvent(new Event(name));
  const create = (
    comments: LunaDanmakuComment[] = [{ time: 10, text: 'first' }],
    options: Partial<LunaDanmakuOptions> = {}
  ) => {
    controller.create({
      container,
      video,
      comments,
      options: { ...defaultLunaDanmakuOptions, ...options },
    });
  };
  const advancePlayback = (milliseconds: number) => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
      const step = Math.min(100, milliseconds - elapsed);
      state.currentTime += (step / 1000) * state.playbackRate;
      jest.advanceTimersByTime(step);
    }
  };

  beforeEach(() => {
    jest.useFakeTimers();
    hidden = false;
    animations = [];
    state = {
      paused: false,
      ended: false,
      seeking: false,
      currentTime: 10,
      playbackRate: 1,
    };
    originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    originalGetAnimations = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'getAnimations'
    );
    getAnimations = jest.fn(() => {
      const animation = {
        playbackRate: 1,
        play: jest.fn(),
        pause: jest.fn(),
      };
      animations.push(animation);
      return [animation];
    });
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: getAnimations,
    });
    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = jest.fn(() => ({
      observe: jest.fn(),
      unobserve: jest.fn(),
      disconnect: jest.fn(),
    }));
    container = document.createElement('div');
    video = document.createElement('video');
    Object.keys(state).forEach((key) => {
      Object.defineProperty(video, key, {
        configurable: true,
        get: () => state[key as keyof typeof state],
      });
    });
    document.body.appendChild(container);
    controller = new LunaDanmakuController();
  });

  afterEach(() => {
    controller.destroy();
    container.remove();
    global.ResizeObserver = originalResizeObserver;
    if (originalGetAnimations) {
      Object.defineProperty(
        HTMLElement.prototype,
        'getAnimations',
        originalGetAnimations
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations');
    }
    if (originalHidden) {
      Object.defineProperty(document, 'hidden', originalHidden);
    } else {
      Reflect.deleteProperty(document, 'hidden');
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('lets CSS animate without frame polling or repeated animation queries', () => {
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    create([
      { time: 10, text: 'first' },
      { time: 30, text: 'later' },
    ]);
    expect(items()).toHaveLength(1);
    advancePlayback(2000);
    expect(raf).not.toHaveBeenCalled();
    expect(getAnimations).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('has no timer when empty or after the last comment is emitted', () => {
    create([]);
    expect(jest.getTimerCount()).toBe(0);
    controller.reload([{ time: 10, text: 'last' }]);
    expect(items()).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    items()[0].dispatchEvent(new Event('animationend'));
    expect(items()).toHaveLength(0);
  });

  it('reclaims an animation on completion so the screen limit admits new comments', () => {
    create(
      [
        { time: 10, text: 'first' },
        { time: 10.3, text: 'second' },
      ],
      { maxOnScreen: 1 }
    );
    items()[0].dispatchEvent(new Event('animationend'));
    advancePlayback(400);
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toBe('second');
  });

  it('keeps a paused animation alive and does not resume when settings change', () => {
    create([
      { time: 10, text: 'first' },
      { time: 20, text: 'later' },
    ]);
    state.paused = true;
    emit('pause');
    const plays = animations[0].play.mock.calls.length;
    controller.updateOptions({ ...defaultLunaDanmakuOptions, opacity: 0.5 });
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(20000);
    expect(items()).toHaveLength(1);
    expect(animations[0].play).toHaveBeenCalledTimes(plays);
    state.paused = false;
    emit('playing');
    expect(animations[0].play).toHaveBeenCalledTimes(plays + 1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it('stays stopped while buffering, even when settings change', () => {
    create([
      { time: 10, text: 'first' },
      { time: 20, text: 'later' },
    ]);
    emit('waiting');
    controller.updateOptions({ ...defaultLunaDanmakuOptions, opacity: 0.4 });
    expect(jest.getTimerCount()).toBe(0);
    emit('playing');
    expect(jest.getTimerCount()).toBe(1);
  });

  it('stops in the background and skips comments missed while hidden', () => {
    create([
      { time: 10, text: 'first' },
      { time: 12, text: 'hidden' },
      { time: 20, text: 'visible again' },
    ]);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(items()).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
    state.currentTime = 20;
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toBe('visible again');
  });

  it('reschedules emissions and animation speed on playback rate changes', () => {
    create([
      { time: 10, text: 'first' },
      { time: 12, text: 'second' },
    ]);
    state.playbackRate = 2;
    emit('ratechange');
    expect(animations[0].playbackRate).toBe(2);
    advancePlayback(1100);
    expect(items()).toHaveLength(2);
    expect(animations[1].playbackRate).toBe(2);
    expect(getAnimations).toHaveBeenCalledTimes(2);
  });

  it('cleans timers, nodes and video listeners on destroy', () => {
    create([{ time: 20, text: 'future' }]);
    controller.destroy();
    expect(jest.getTimerCount()).toBe(0);
    expect(container.childElementCount).toBe(0);
    emit('playing');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('applies saved options at creation and skips disabled playback when enabled again', () => {
    create(
      [
        { time: 10, text: 'disabled' },
        { time: 20, text: 'enabled again' },
      ],
      { enabled: false, opacity: 0.3, fontSize: 32 }
    );
    const host = container.firstElementChild as HTMLElement;
    expect(host.style.display).toBe('none');
    expect(host.style.opacity).toBe('0.3');
    expect(host.style.getPropertyValue('--luna-danmaku-font-size')).toBe(
      '32px'
    );
    expect(jest.getTimerCount()).toBe(0);
    state.currentTime = 20;
    controller.updateOptions(defaultLunaDanmakuOptions);
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toBe('enabled again');
  });

  it('stops during a seek and resynchronizes without replaying the skipped comments', () => {
    create([
      { time: 10, text: 'before seek' },
      { time: 12, text: 'skipped' },
      { time: 30, text: 'seek target' },
    ]);
    state.seeking = true;
    state.currentTime = 30;
    emit('seeking');
    expect(items()).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
    state.seeking = false;
    emit('seeked');
    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toBe('seek target');
  });
});
