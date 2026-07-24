/**
 * ViewportController — 뷰포트 상태의 유일한 소유자.
 *
 * ── 왜 React state 가 아닌가 (ARCHITECTURE.md 상태 3계층)
 * 뷰포트는 60fps 로 갱신된다. 이것을 `useState` 에 넣으면 매 프레임 전체 트리
 * 재조정이 일어나고 MacBook Air 에서 즉시 프레임을 놓친다.
 *
 * 그래서 값은 이 클래스가 명령형으로 소유하고, React 는 `useSyncExternalStore`
 * 로 **구독을 선택한 컴포넌트만** 다시 그린다. 마크 위치처럼 매 프레임 바뀌는
 * 것은 아예 React 를 거치지 않고 DOM transform 을 직접 쓴다.
 *
 * ── React·DOM 을 import 하지 않는다
 * 순수 TS 이므로 jsdom 없이 단위 테스트가 된다. `requestAnimationFrame` 은
 * 주입 가능하게 두어 테스트에서 시간을 직접 제어한다.
 */

import { clampTimePoint } from "@/engine/time/TimePoint";
import {
  clampSpanAt,
  interpolateViewport,
  panByPixels,
  zoomAt,
} from "@/engine/time/TimeScale";
import type { Viewport } from "@/engine/types/timeline";

export type ViewportListener = (viewport: Viewport) => void;

export interface ViewportControllerOptions {
  initial: Viewport;
  /** 초기 화면 폭(px). 마운트 후 `setWidth` 로 갱신한다. */
  width: number;
  /** 테스트 주입용. 기본값은 브라우저 rAF, 서버에서는 즉시 실행 없음. */
  scheduleFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
  /** 테스트 주입용 시계. */
  now?: () => number;
}

/** 뷰포트 이동에 쓰는 이징. 시작과 끝을 모두 부드럽게 한다. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

const noopSchedule = () => 0;
const noopCancel = () => {};

function defaultSchedule(): (cb: (t: number) => void) => number {
  return typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : noopSchedule;
}

function defaultCancel(): (handle: number) => void {
  return typeof cancelAnimationFrame === "function"
    ? (h) => cancelAnimationFrame(h)
    : noopCancel;
}

interface Animation {
  from: Viewport;
  to: Viewport;
  startedAt: number;
  duration: number;
  onDone?: () => void;
}

export class ViewportController {
  private current: Viewport;
  private width: number;
  private readonly listeners = new Set<ViewportListener>();
  private animation: Animation | null = null;
  private frameHandle: number | null = null;

  private readonly scheduleFrame: (cb: (t: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;

  constructor(options: ViewportControllerOptions) {
    this.width = Math.max(1, options.width);
    this.scheduleFrame = options.scheduleFrame ?? defaultSchedule();
    this.cancelFrame = options.cancelFrame ?? defaultCancel();
    this.now = options.now ?? (() => performance.now());
    this.current = this.normalize(options.initial);
  }

  // ── 읽기 ───────────────────────────────────────────────────

  /**
   * `useSyncExternalStore` 용 스냅샷.
   *
   * 값이 바뀌지 않으면 **같은 객체 참조**를 돌려준다. 이것이 깨지면
   * React 가 무한 렌더 루프에 빠진다.
   */
  getSnapshot = (): Viewport => this.current;

  get pixelWidth(): number {
    return this.width;
  }

  get isAnimating(): boolean {
    return this.animation !== null;
  }

  // ── 구독 ───────────────────────────────────────────────────

  subscribe = (listener: ViewportListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }

  // ── 쓰기 ───────────────────────────────────────────────────

  private normalize(viewport: Viewport): Viewport {
    const center = clampTimePoint(viewport.center);
    return { center, span: clampSpanAt(viewport.span, center, this.width) };
  }

  /**
   * 값이 실제로 달라졌을 때만 객체를 교체하고 알린다.
   * 같은 값으로 반복 호출해도 리스너가 깨어나지 않는다.
   */
  private commit(next: Viewport): void {
    const normalized = this.normalize(next);
    if (
      normalized.center === this.current.center &&
      normalized.span === this.current.span
    ) {
      return;
    }
    this.current = normalized;
    this.emit();
  }

  /** 화면 폭 변경(리사이즈). 폭은 정밀도 하한 계산에 쓰이므로 재정규화한다. */
  setWidth(width: number): void {
    const next = Math.max(1, width);
    if (next === this.width) return;
    this.width = next;
    this.commit(this.current);
  }

  /** 직접 설정. 진행 중인 애니메이션을 취소한다. */
  set(viewport: Viewport): void {
    this.stop();
    this.commit(viewport);
  }

  /** 커서 앵커 줌. `factor < 1` 이 확대. */
  zoomAt(anchorPx: number, factor: number): void {
    this.stop();
    this.commit(zoomAt(this.current, anchorPx, factor, this.width));
  }

  /** 픽셀 단위 팬. 오른쪽으로 끌면 과거로 이동한다. */
  panBy(deltaPx: number): void {
    this.stop();
    this.commit(panByPixels(this.current, deltaPx, this.width));
  }

  // ── 애니메이션 ─────────────────────────────────────────────

  /**
   * 목표 뷰포트로 부드럽게 이동한다.
   *
   * 폭은 `interpolateViewport` 가 로그 보간하므로 줌이 등속으로 느껴진다.
   * 선형 보간이면 줌 아웃이 처음에만 빠르고 끝에서 멈춘 것처럼 보인다.
   */
  animateTo(target: Viewport, durationMs = 320, onDone?: () => void): void {
    if (durationMs <= 0) {
      this.set(target);
      onDone?.();
      return;
    }
    this.stop();
    this.animation = {
      from: this.current,
      to: this.normalize(target),
      startedAt: this.now(),
      duration: durationMs,
      onDone,
    };
    this.requestFrame();
  }

  /** 진행 중인 애니메이션 취소. 현재 위치에 머문다. */
  stop(): void {
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.animation = null;
  }

  private requestFrame(): void {
    if (this.frameHandle !== null) return;
    this.frameHandle = this.scheduleFrame(() => {
      this.frameHandle = null;
      this.tick();
    });
  }

  /**
   * 한 프레임 진행. 테스트에서는 이것을 직접 호출해 시간을 제어한다.
   */
  tick(): void {
    const animation = this.animation;
    if (!animation) return;

    const elapsed = this.now() - animation.startedAt;
    const progress = Math.min(1, Math.max(0, elapsed / animation.duration));
    const eased = easeInOutCubic(progress);

    this.commit(interpolateViewport(animation.from, animation.to, eased));

    if (progress >= 1) {
      this.animation = null;
      animation.onDone?.();
      return;
    }
    this.requestFrame();
  }

  /** 리스너와 예약된 프레임을 모두 정리한다. 언마운트 시 반드시 호출한다. */
  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}
