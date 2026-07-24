import { describe, expect, it } from "vitest";

import {
  REST_VELOCITY,
  VelocityTracker,
  frictionDistance,
  frictionStep,
  rubberBand,
  rubberBandLimit,
  springStep,
} from "./inertia";

describe("VelocityTracker — 던지기 감지", () => {
  it("등속 이동의 속도를 정확히 잡는다", () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 100; t += 10) tracker.record(t * 2, t);
    expect(tracker.velocity()).toBeCloseTo(2, 6);
  });

  it("표본이 부족하면 0 이다", () => {
    const tracker = new VelocityTracker();
    expect(tracker.velocity()).toBe(0);
    tracker.record(10, 0);
    expect(tracker.velocity()).toBe(0);
  });

  it("방향을 유지한다", () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 50; t += 10) tracker.record(-t * 3, t);
    expect(tracker.velocity()).toBeCloseTo(-3, 6);
  });

  it("멈춘 뒤 손을 떼면 관성이 붙지 않는다", () => {
    // 빠르게 끌다가 100ms 정지 후 릴리스. 시간창이 길면 여기서 관성이 붙는다.
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 200; t += 10) tracker.record(t < 100 ? t * 5 : 500, t);
    expect(tracker.velocity()).toBe(0);
  });

  it("계속 끄는 중이면 관성이 붙는다", () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 200; t += 10) tracker.record(t * 5, t);
    expect(tracker.velocity()).toBeCloseTo(5, 6);
  });

  it("시간창 밖의 오래된 표본을 버린다", () => {
    const tracker = new VelocityTracker(100);
    tracker.record(0, 0);
    tracker.record(1000, 500); // 아주 오래된 큰 점프
    tracker.record(1010, 510);
    tracker.record(1020, 520);
    expect(tracker.velocity()).toBeCloseTo(1, 6);
  });

  it("같은 시각의 표본에 0 나눗셈을 하지 않는다", () => {
    const tracker = new VelocityTracker();
    tracker.record(0, 5);
    tracker.record(100, 5);
    expect(tracker.velocity()).toBe(0);
  });

  it("reset 후 처음 상태로 돌아간다", () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 50; t += 10) tracker.record(t * 2, t);
    tracker.reset();
    expect(tracker.velocity()).toBe(0);
  });
});

describe("frictionStep — 프레임률에 의존하지 않아야 한다", () => {
  it("속도가 단조 감소한다", () => {
    let v = 5;
    for (let i = 0; i < 20; i += 1) {
      const next = frictionStep(v, 16);
      expect(Math.abs(next)).toBeLessThanOrEqual(Math.abs(v));
      v = next;
    }
  });

  it("결국 정확히 0 이 된다", () => {
    let v = 5;
    for (let i = 0; i < 500 && v !== 0; i += 1) v = frictionStep(v, 16);
    expect(v).toBe(0);
  });

  it("감쇠 계수가 클수록 빨리 멈춘다", () => {
    expect(Math.abs(frictionStep(5, 16, 10))).toBeLessThan(
      Math.abs(frictionStep(5, 16, 2)),
    );
  });

  it("같은 시간이면 프레임 분할 방식과 무관하게 같은 결과다", () => {
    const oneStep = frictionStep(5, 32);
    let twoSteps = 5;
    twoSteps = frictionStep(twoSteps, 16);
    twoSteps = frictionStep(twoSteps, 16);
    expect(twoSteps).toBeCloseTo(oneStep, 9);
  });

  it("부호를 보존한다", () => {
    expect(frictionStep(-5, 16)).toBeLessThan(0);
  });

  it("정지 임계 이하는 0 으로 잘라낸다", () => {
    expect(frictionStep(REST_VELOCITY * 0.9, 16)).toBe(0);
  });

  it("dt 가 0 이면 그대로다", () => {
    expect(frictionStep(3, 0)).toBe(3);
  });
});

describe("frictionDistance — 착지 지점 예측", () => {
  it("실제 적분 결과와 일치한다", () => {
    const v0 = 3;
    const decay = 4.5;
    let v = v0;
    let travelled = 0;
    for (let i = 0; i < 2000 && v !== 0; i += 1) {
      travelled += v * 1; // dt = 1ms
      v = frictionStep(v, 1, decay);
    }
    // 정지 임계로 잘라내므로 예측값보다 아주 조금 짧다.
    expect(travelled).toBeGreaterThan(frictionDistance(v0, decay) * 0.95);
    expect(travelled).toBeLessThanOrEqual(frictionDistance(v0, decay));
  });

  it("속도에 비례한다", () => {
    expect(frictionDistance(6)).toBeCloseTo(frictionDistance(3) * 2, 9);
  });
});

describe("rubberBand — 벽이 벽처럼 느껴져야 한다", () => {
  const D = 1000;

  it("이탈이 0 이면 저항도 0", () => {
    expect(rubberBand(0, D)).toBe(0);
  });

  it("단조 증가한다", () => {
    let prev = -1;
    for (let x = 0; x <= 5000; x += 100) {
      const v = rubberBand(x, D);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("항상 원래 이탈량보다 작다 (저항이 걸린다)", () => {
    for (const x of [10, 100, 500, 2000]) {
      expect(rubberBand(x, D)).toBeLessThan(x);
    }
  });

  it("아무리 끌어도 상한을 넘지 않는다 — 화면이 날아가지 않는다", () => {
    const limit = rubberBandLimit(D);
    for (const x of [1e3, 1e6, 1e12]) {
      expect(rubberBand(x, D)).toBeLessThan(limit);
    }
    // 점근선은 maxOvershoot 자체다.
    expect(rubberBand(1e12, D)).toBeCloseTo(limit, 3);
  });

  it("음수 방향에 대칭이다", () => {
    expect(rubberBand(-300, D)).toBeCloseTo(-rubberBand(300, D), 9);
  });

  it("작은 이탈에서는 기울기가 constant 다", () => {
    // 처음부터 완전히 막히면 고장난 것처럼, 1:1 이면 벽이 없는 것처럼 느껴진다.
    for (const c of [0.3, 0.55, 0.8]) {
      expect(rubberBand(5, D, c)).toBeCloseTo(5 * c, 1);
    }
  });

  it("퇴화한 치수에 안전하다", () => {
    expect(rubberBand(100, 0)).toBe(0);
    expect(rubberBand(100, -5)).toBe(0);
  });
});

describe("springStep — 튕김 없이 정착", () => {
  it("목표로 수렴한다", () => {
    let state = { value: 0, velocity: 0, atRest: false };
    for (let i = 0; i < 300 && !state.atRest; i += 1) {
      state = springStep(state.value, state.velocity, 100, 16);
    }
    expect(state.atRest).toBe(true);
    expect(state.value).toBe(100);
    expect(state.velocity).toBe(0);
  });

  it("크게 튕기지 않는다 (오버슈트 5% 미만)", () => {
    let state = { value: 0, velocity: 0, atRest: false };
    let maxValue = 0;
    for (let i = 0; i < 300 && !state.atRest; i += 1) {
      state = springStep(state.value, state.velocity, 100, 16);
      maxValue = Math.max(maxValue, state.value);
    }
    expect(maxValue).toBeLessThan(105);
  });

  it("이미 목표에 있으면 움직이지 않는다", () => {
    const state = springStep(50, 0, 50, 16);
    expect(state.atRest).toBe(true);
    expect(state.value).toBe(50);
  });

  it("아래쪽에서도 위쪽에서도 수렴한다", () => {
    for (const from of [-500, 500]) {
      let state = { value: from, velocity: 0, atRest: false };
      for (let i = 0; i < 500 && !state.atRest; i += 1) {
        state = springStep(state.value, state.velocity, 0, 16);
      }
      expect(state.atRest).toBe(true);
    }
  });

  it("큰 dt 에도 발산하지 않는다 — 탭 복귀 시나리오", () => {
    // 배경 탭에서 돌아오면 dt 가 수백 ms 로 튄다. 그대로 적분하면 화면이 날아간다.
    const state = springStep(0, 0, 100, 5000);
    expect(Number.isFinite(state.value)).toBe(true);
    expect(Math.abs(state.value)).toBeLessThan(200);
  });

  it("dt 가 0 이면 상태가 그대로다", () => {
    const state = springStep(10, 3, 100, 0);
    expect(state.value).toBe(10);
    expect(state.velocity).toBe(3);
  });

  it("강성이 높을수록 빨리 도달한다", () => {
    const steps = (stiffness: number) => {
      let state = { value: 0, velocity: 0, atRest: false };
      let n = 0;
      while (!state.atRest && n < 1000) {
        state = springStep(state.value, state.velocity, 100, 16, {
          stiffness,
          damping: 26,
        });
        n += 1;
      }
      return n;
    };
    expect(steps(400)).toBeLessThan(steps(80));
  });
});
