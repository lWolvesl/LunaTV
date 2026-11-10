import {
  LunaDanmakuComment,
  LunaDanmakuOptions,
  LunaDanmakuState,
} from './types';

interface DanmakuNode {
  el: HTMLDivElement;
  track: number;
  mode: 'rtl' | 'ltr' | 'top' | 'bottom';
  animations: Animation[];
}

interface CreateParams {
  container: HTMLElement;
  video: HTMLVideoElement;
  comments: LunaDanmakuComment[];
  options: LunaDanmakuOptions;
}

const DEFAULT_DURATION = 8000;

export class LunaDanmakuController {
  private host?: HTMLDivElement;
  private video?: HTMLVideoElement;
  private comments: LunaDanmakuComment[] = [];
  private options?: LunaDanmakuOptions;
  private cursor = 0;
  private timer?: number;
  private running = false;
  private buffering = false;
  private activeNodes: DanmakuNode[] = [];
  private lastEmitAt = -Infinity;
  private height = 0;
  private resizeObserver?: ResizeObserver;
  private listeners: Array<() => void> = [];

  create({ container, video, comments, options }: CreateParams) {
    this.destroy();
    this.video = video;
    this.options = options;
    this.comments = this.prepareComments(comments, options);
    this.cursor = 0;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const host = document.createElement('div');
    host.className = 'luna-danmaku-layer';
    host.setAttribute('aria-hidden', 'true');
    host.style.setProperty(
      '--luna-danmaku-width',
      `${container.clientWidth}px`
    );
    container.appendChild(host);
    this.host = host;

    this.bindVideo(video);
    this.resize();
    this.seekTo(video.currentTime || 0);
    this.updateOptions(options);
  }

  reload(comments: LunaDanmakuComment[], options?: LunaDanmakuOptions) {
    this.stop();
    if (options) this.options = options;
    if (!this.options) return;

    this.comments = this.prepareComments(comments, this.options);
    this.clear();
    this.seekTo(this.video?.currentTime || 0);
    this.updateOptions(this.options);
  }

  updateOptions(options: LunaDanmakuOptions) {
    const previous = this.options;
    this.options = options;
    if (!this.host) return;

    this.host.style.opacity = String(options.opacity);
    this.host.style.setProperty(
      '--luna-danmaku-font-size',
      `${options.fontSize}px`
    );
    this.host.style.setProperty(
      '--luna-danmaku-area',
      `${options.displayArea}%`
    );

    if (previous?.offset !== options.offset) {
      this.clear();
      this.seekTo(this.video?.currentTime || 0);
    }

    if (options.enabled) {
      if (!previous?.enabled) this.seekTo(this.video?.currentTime || 0);
      this.stop();
      this.show();
    } else {
      this.hide();
    }
  }

  getState(): LunaDanmakuState {
    return {
      status: this.comments.length > 0 ? 'ready' : 'empty',
      count: this.comments.length,
    };
  }

  destroy() {
    this.stop();
    this.listeners.forEach((dispose) => dispose());
    this.listeners = [];
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.clear();
    this.host?.remove();
    this.host = undefined;
    this.video = undefined;
    this.comments = [];
    this.cursor = 0;
    this.buffering = false;
    this.lastEmitAt = -Infinity;
  }

  show() {
    if (!this.host) return;
    this.host.style.display = 'block';
    this.play();
  }

  hide() {
    if (!this.host) return;
    this.host.style.display = 'none';
    this.stop();
    this.clear();
  }

  clear() {
    this.activeNodes.forEach((node) => node.el.remove());
    this.activeNodes = [];
  }

  resize() {
    if (this.host) {
      this.height = this.host.clientHeight;
      this.host.style.setProperty(
        '--luna-danmaku-width',
        `${this.host.clientWidth}px`
      );
    }
  }

  private bindVideo(video: HTMLVideoElement) {
    const add = <K extends keyof HTMLVideoElementEventMap>(
      event: K,
      handler: (event: HTMLVideoElementEventMap[K]) => void
    ) => {
      video.addEventListener(event, handler);
      this.listeners.push(() => video.removeEventListener(event, handler));
    };

    add('play', () => {
      this.buffering = false;
      this.play();
    });
    add('playing', () => {
      this.buffering = false;
      this.play();
    });
    add('pause', () => this.stop());
    add('ended', () => this.stop());
    add('waiting', () => {
      this.buffering = true;
      this.stop();
    });
    add('ratechange', () => {
      this.stop();
      this.syncAnimationPlaybackRate();
      this.play();
    });
    add('seeking', () => {
      this.stop();
      this.clear();
      this.seekTo(video.currentTime || 0);
    });
    add('seeked', () => {
      this.seekTo(video.currentTime || 0);
      this.play();
    });

    const onVisibilityChange = () => {
      if (document.hidden) {
        this.stop();
        this.clear();
      } else {
        this.seekTo(video.currentTime || 0);
        this.play();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.listeners.push(() =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
    );

    if (this.host) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
    }
  }

  private play() {
    if (
      !this.options?.enabled ||
      !this.video ||
      !this.host ||
      this.video.paused ||
      this.video.ended ||
      this.video.seeking ||
      this.buffering ||
      document.hidden ||
      this.running
    )
      return;
    this.running = true;
    this.resumeAnimations();
    const tick = () => {
      this.timer = undefined;
      this.emitDueComments();
      if (!this.video || !this.options || this.cursor >= this.comments.length)
        return;

      // CSS handles every animation frame. Only wake JS when a comment is due,
      // checking at most once a second during long gaps to stay in sync.
      const rate = this.getPlaybackRate();
      const timeUntilComment =
        ((this.comments[this.cursor].time -
          this.video.currentTime +
          this.options.offset / 1000) *
          1000) /
        rate;
      const timeUntilInterval =
        this.lastEmitAt + this.options.interval / rate - performance.now();
      const delay = Math.min(
        1000,
        Math.max(16, timeUntilComment, timeUntilInterval)
      );
      this.timer = window.setTimeout(tick, delay);
    };
    tick();
  }

  private stop() {
    this.running = false;
    this.pauseAnimations();
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private seekTo(currentTime: number) {
    const offset = (this.options?.offset || 0) / 1000;
    const target = currentTime - offset;
    let low = 0;
    let high = this.comments.length - 1;
    let result = this.comments.length;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (this.comments[mid].time >= target) {
        result = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    this.cursor = result;
    this.lastEmitAt = -Infinity;
  }

  private emitDueComments() {
    if (!this.video || !this.host || !this.options?.enabled) return;
    const adjustedTime = this.video.currentTime - this.options.offset / 1000;
    const now = performance.now();
    const playbackRate = this.getPlaybackRate();
    const minInterval = this.options.interval / playbackRate;

    // Skip stale comments after a suspended tab or a stalled main thread.
    if (this.comments[this.cursor]?.time < adjustedTime - 1) {
      this.seekTo(this.video.currentTime);
    }

    while (
      this.cursor < this.comments.length &&
      this.comments[this.cursor].time <= adjustedTime
    ) {
      if (now - this.lastEmitAt < minInterval) return;

      const comment = this.comments[this.cursor];
      this.cursor += 1;

      if (this.activeNodes.length >= this.options.maxOnScreen) continue;
      if (!this.shouldShow(comment)) continue;

      this.lastEmitAt = now;
      this.mountComment(comment);
    }
  }

  private mountComment(comment: LunaDanmakuComment) {
    if (!this.host || !this.options) return;

    const mode = comment.mode || 'rtl';
    const el = document.createElement('div');
    el.className = `luna-danmaku-item luna-danmaku-${mode}`;
    el.textContent = comment.text;
    el.style.color = comment.color || '#fff';
    el.style.fontSize = `${this.options.fontSize}px`;
    el.style.animationDuration = `${Math.max(
      4,
      DEFAULT_DURATION / 1000 / this.options.speed
    )}s`;

    const track = this.pickTrack();
    const top = track * Math.max(28, this.options.fontSize + 8);
    el.style.top = `${top}px`;

    this.host.appendChild(el);
    // Read animations once on insertion, never once per node per frame.
    const node: DanmakuNode = {
      el,
      track,
      mode,
      animations: el.getAnimations(),
    };
    el.addEventListener(
      'animationend',
      () => {
        el.remove();
        this.activeNodes = this.activeNodes.filter((active) => active !== node);
      },
      { once: true }
    );
    this.syncNodeAnimation(node);
    this.activeNodes.push(node);
  }

  private pickTrack() {
    if (!this.host || !this.options) return 0;
    const trackHeight = Math.max(28, this.options.fontSize + 8);
    const availableHeight = this.height * (this.options.displayArea / 100);
    const trackCount = Math.max(1, Math.floor(availableHeight / trackHeight));
    const occupied = new Set(this.activeNodes.map((node) => node.track));

    for (let i = 0; i < trackCount; i += 1) {
      if (!occupied.has(i)) return i;
    }
    return Math.floor(Math.random() * trackCount);
  }

  private shouldShow(comment: LunaDanmakuComment) {
    if (!this.options) return true;
    if (this.options.blockTop && comment.mode === 'top') return false;
    if (this.options.blockBottom && comment.mode === 'bottom') return false;

    return !this.options.filters.some((filter) => {
      const value = filter.trim();
      if (!value) return false;
      return comment.text.includes(value);
    });
  }

  private prepareComments(
    comments: LunaDanmakuComment[],
    options: LunaDanmakuOptions
  ) {
    const seen = new Set<string>();
    return comments
      .filter((comment) => {
        if (!comment.text.trim()) return false;
        if (!options.dedup) return true;
        const key = `${Math.round(comment.time * 2) / 2}:${comment.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.time - b.time);
  }

  private getPlaybackRate() {
    const rate = this.video?.playbackRate || 1;
    return Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  private syncAnimationPlaybackRate() {
    const playbackRate = this.getPlaybackRate();
    for (const node of this.activeNodes) {
      for (const animation of node.animations) {
        animation.playbackRate = playbackRate;
      }
    }
  }

  private pauseAnimations() {
    for (const node of this.activeNodes) {
      for (const animation of node.animations) {
        animation.pause();
      }
    }
  }

  private resumeAnimations() {
    for (const node of this.activeNodes) {
      this.syncNodeAnimation(node);
    }
  }

  private syncNodeAnimation(node: DanmakuNode) {
    const playbackRate = this.getPlaybackRate();
    for (const animation of node.animations) {
      animation.playbackRate = playbackRate;
      if (this.video?.paused) {
        animation.pause();
      } else {
        animation.play();
      }
    }
  }
}
