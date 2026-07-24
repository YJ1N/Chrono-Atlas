import { describe, expect, it, vi } from "vitest";

import { ViewportController, easeInOutCubic } from "./ViewportController";
import { MIN_VIEWPORT_SPAN, PRESENT_EPOCH } from "@/engine/time/TimePoint";
import { createTimeScale } from "@/engine/time/TimeScale";
import type { Viewport } from "@/engine/types/timeline";

const WIDTH = 1440;

/** 시간과 프레임을 완전히 제어하는 컨트롤러. rAF 도 jsdom 도 필요 없다. */
function makeController(initial: Viewport = { center: 1000, span: 2000 }) {
  let clock = 0;
  const pending: Array<(t: number) => void> = [];

  const controller = new ViewportController({
    initial,
    width: WIDTH,
    now: () => clock,
    scheduleFrame: (cb) => pending.push(cb),
    cancelFrame: () => {
      pending.length = 0;
    },
  });

  return {
    controller,
    advance(ms: number) {
      clock += ms;
      const due = pending.splice(0, pending.length);
      for (const cb of due) cb(clock);
    },
    get pendingFrames() {
      return pending.length;
    },
  };
}

describe("스냅샷 안정성 — useSyncExternalStore 의 전제", () => {
  it("값이 그대로면 같은 객체 참조를 돌려준다", () => {
    const { controller } = makeController();
    const a = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(a);

    // 같은 값으로 다시 설정해도 참조가 바뀌지 않아야 한다.
    controller.set({ ...a });
    expect(controller.getSnapshot()).toBe(a);
  });

  it("값이 바뀌면 새 객체를 돌려준다", () => {
    const { controller } = makeController();
    const before = controller.getSnapshot();
    controller.panBy(100);
    expect(controller.getSnapshot()).not.toBe(before);
  });

  it("변화가 없으면 리스너를 깨우지 않는다", () => {
    const { controller } = makeController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.set(controller.getSnapshot());
    controller.panBy(0);
    expect(listener).not.toHaveBeenCalled();

    controller.panBy(50);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("구독", () => {
  it("변경 시 현재 뷰포트를 전달한다", () => {
    const { controller } = makeController();
    const seen: Viewport[] = [];
    controller.subscribe((v) => seen.push(v));

    controller.panBy(100);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(controller.getSnapshot());
  });

  it("해지하면 더 이상 호출되지 않는다", () => {
    const { controller } = makeController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.panBy(10);
    unsubscribe();
    controller.panBy(10);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("여러 리스너가 모두 호출된다", () => {
    const { controller } = makeController();
    const a = vi.fn();
    const b = vi.fn();
    controller.subscribe(a);
    controller.subscribe(b);
    controller.panBy(10);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("줌 · 팬", () => {
  it("앵커 아래 시점이 줌 후에도 같은 픽셀에 남는다", () => {
    const { controller } = makeController();
    const anchorPx = 400;
    const before = createTimeScale(controller.getSnapshot(), WIDTH).toTime(anchorPx);

    controller.zoomAt(anchorPx, 0.5);

    const after = createTimeScale(controller.getSnapshot(), WIDTH).toTime(anchorPx);
    expect(after).toBeCloseTo(before, 6);
  });

  it("팬은 폭을 바꾸지 않는다", () => {
    const { controller } = makeController();
    const span = controller.getSnapshot().span;
    controller.panBy(250);
    expect(controller.getSnapshot().span).toBe(span);
  });

  it("우주 범위를 벗어나지 않는다", () => {
    const { controller } = makeController();
    controller.panBy(-1e9); // 미래로 크게 이동 시도
    expect(controller.getSnapshot().center).toBeLessThanOrEqual(PRESENT_EPOCH);
  });

  it("줌 한계를 넘지 않는다", () => {
    const { controller } = makeController({ center: 2000, span: 100 });
    for (let i = 0; i < 100; i += 1) controller.zoomAt(WIDTH / 2, 0.5);
    expect(controller.getSnapshot().span).toBeGreaterThanOrEqual(MIN_VIEWPORT_SPAN);
  });
});

describe("setWidth — 리사이즈", () => {
  it("폭이 같으면 아무 일도 없다", () => {
    const { controller } = makeController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setWidth(WIDTH);
    expect(listener).not.toHaveBeenCalled();
  });

  it("폭을 갱신한다", () => {
    const { controller } = makeController();
    controller.setWidth(800);
    expect(controller.pixelWidth).toBe(800);
  });

  it("0 이하 폭을 방어한다 (0 나눗셈 → NaN 전파 차단)", () => {
    const { controller } = makeController();
    controller.setWidth(0);
    expect(controller.pixelWidth).toBeGreaterThan(0);
    expect(Number.isFinite(controller.getSnapshot().span)).toBe(true);
  });
});

describe("animateTo", () => {
  const target: Viewport = { center: 1900, span: 200 };

  it("프레임을 진행하면 목표에 도달한다", () => {
    const { controller, advance } = makeController();
    controller.animateTo(target, 300);

    expect(controller.isAnimating).toBe(true);
    advance(150);
    expect(controller.isAnimating).toBe(true);

    advance(150);
    expect(controller.isAnimating).toBe(false);
    expect(controller.getSnapshot().center).toBeCloseTo(target.center, 6);
    expect(controller.getSnapshot().span).toBeCloseTo(target.span, 6);
  });

  it("진행 중에는 중간 상태를 지난다", () => {
    const { controller, advance } = makeController();
    const start = controller.getSnapshot();
    controller.animateTo(target, 400);

    advance(200);
    const mid = controller.getSnapshot();
    expect(mid.center).toBeGreaterThan(start.center);
    expect(mid.center).toBeLessThan(target.center);
    expect(mid.span).toBeLessThan(start.span);
    expect(mid.span).toBeGreaterThan(target.span);
  });

  it("폭을 로그 보간한다 — 중간에서 기하평균에 가깝다", () => {
    const { controller, advance } = makeController({ center: 0, span: 1e8 });
    const from = controller.getSnapshot().span;
    controller.animateTo({ center: 0, span: 1e2 }, 400);
    advance(200); // easeInOutCubic(0.5) === 0.5

    const geometric = Math.sqrt(from * 1e2);
    expect(controller.getSnapshot().span / geometric).toBeCloseTo(1, 3);
  });

  it("완료 콜백을 정확히 한 번 호출한다", () => {
    const { controller, advance } = makeController();
    const done = vi.fn();
    controller.animateTo(target, 200, done);

    advance(100);
    expect(done).not.toHaveBeenCalled();
    advance(100);
    expect(done).toHaveBeenCalledTimes(1);

    advance(100);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("duration 0 이면 즉시 도달한다", () => {
    const { controller } = makeController();
    const done = vi.fn();
    controller.animateTo(target, 0, done);
    expect(controller.isAnimating).toBe(false);
    expect(controller.getSnapshot().center).toBeCloseTo(target.center, 6);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("사용자 조작이 애니메이션을 즉시 취소한다", () => {
    const { controller, advance } = makeController();
    controller.animateTo(target, 400);
    advance(100);

    controller.panBy(10); // 사용자가 끼어든다
    expect(controller.isAnimating).toBe(false);

    const afterInterrupt = controller.getSnapshot();
    advance(1000);
    expect(controller.getSnapshot()).toBe(afterInterrupt);
  });

  it("프레임을 예약해두고 남기지 않는다", () => {
    const { controller, advance, pendingFrames } = makeController();
    expect(pendingFrames).toBe(0);
    controller.animateTo(target, 200);
    advance(200);
    expect(controller.isAnimating).toBe(false);
  });
});

describe("destroy", () => {
  it("리스너와 애니메이션을 정리한다", () => {
    const { controller, advance } = makeController();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.animateTo({ center: 1900, span: 200 }, 400);

    controller.destroy();
    expect(controller.isAnimating).toBe(false);

    advance(1000);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("easeInOutCubic", () => {
  it("양 끝점과 중간점이 고정되어 있다", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("단조 증가한다", () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
