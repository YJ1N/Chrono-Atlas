/**
 * 물리 — 관성 · 러버밴딩 · 스프링.
 *
 * ── 왜 필요한가
 * 이전 구현은 드래그가 1:1 로 따라오다 손을 떼는 순간 즉시 멈췄고, 줌은 휠
 * 눈금마다 뚝뚝 끊겼다. 기술적으로는 "정확"하지만 싸구려로 느껴진다.
 *
 * Apple 급 조작감의 대부분은 **시뮬레이션된 질량**에서 온다. 물체에 무게가
 * 있어야 던질 수 있고, 벽에 부딪히면 저항이 있어야 벽이라고 느낀다.
 *
 * 순수 함수와 작은 클래스만 두어 DOM 없이 단위 테스트한다.
 * 단위는 호출자가 정한다(px, 연 단위 무엇이든) — 이 모듈은 무차원이다.
 */

/** 이보다 느리면 멈춘 것으로 본다. 단위/ms. */
export const REST_VELOCITY = 0.02;

// ─────────────────────────────────────────────────────────────
// 속도 추적 — 던지기(flick) 감지
// ─────────────────────────────────────────────────────────────

/**
 * 최근 이동 속도를 추정한다.
 *
 * 마지막 두 점만 쓰면 손을 떼기 직전의 미세한 떨림에 속도가 지배당한다.
 * 짧은 시간창 안의 전체 변위로 계산해야 "던졌다" 는 의도가 잡힌다.
 *
 * ── 시간창 길이의 트레이드오프
 * 길면 떨림에 강하지만, **끌다가 멈춘 뒤 손을 떼도 관성이 붙는다** —
 * 창 안에 이동의 꼬리가 남기 때문이다. 이것은 실제로 짜증나는 버그로 느껴진다.
 * 60ms 는 60fps 에서 약 4표본으로, 떨림을 평균내면서도 "멈췄다 놓기" 를
 * 정확히 0 으로 만든다.
 */
export class VelocityTracker {
  private readonly positions: number[] = [];
  private readonly times: number[] = [];

  constructor(private readonly windowMs = 60) {}

  record(position: number, timeMs: number): void {
    this.positions.push(position);
    this.times.push(timeMs);
    // 시간창을 벗어난 오래된 표본을 버린다.
    while (this.times.length > 2 && timeMs - this.times[0] > this.windowMs) {
      this.positions.shift();
      this.times.shift();
    }
  }

  /** 단위/ms. 표본이 부족하면 0. */
  velocity(): number {
    if (this.times.length < 2) return 0;
    const dt = this.times[this.times.length - 1] - this.times[0];
    if (dt <= 0) return 0;
    return (this.positions[this.positions.length - 1] - this.positions[0]) / dt;
  }

  reset(): void {
    this.positions.length = 0;
    this.times.length = 0;
  }
}

// ─────────────────────────────────────────────────────────────
// 마찰
// ─────────────────────────────────────────────────────────────

/**
 * 지수 감쇠. `decayPerSecond` 가 클수록 빨리 멈춘다.
 *
 * 지수를 쓰는 이유: 프레임 간격이 흔들려도(16ms↔33ms) 같은 시간에 같은 만큼
 * 감쇠해 결과가 프레임률에 의존하지 않는다.
 */
export function frictionStep(
  velocity: number,
  dtMs: number,
  decayPerSecond = 4.5,
): number {
  if (dtMs <= 0) return velocity;
  const next = velocity * Math.exp((-decayPerSecond * dtMs) / 1000);
  return Math.abs(next) < REST_VELOCITY ? 0 : next;
}

/**
 * 이 속도로 던졌을 때 최종적으로 이동할 총 거리.
 * "이 플릭이 어디에 착지할지" 를 미리 알아야 스냅이나 프리페치를 할 수 있다.
 */
export function frictionDistance(
  velocity: number,
  decayPerSecond = 4.5,
): number {
  if (decayPerSecond <= 0) return 0;
  return (velocity * 1000) / decayPerSecond;
}

// ─────────────────────────────────────────────────────────────
// 러버밴딩
// ─────────────────────────────────────────────────────────────

/**
 * 경계를 넘어선 만큼을 저항이 걸린 값으로 변환한다 (iOS 방식).
 *
 *   f(x) = (x · d · c) / (d + c · x)
 *
 * 성질:
 *   f(0) = 0, 단조 증가
 *   x → ∞ 일 때 **f → d.** 즉 `maxOvershoot` 이 점근 상한 그 자체다
 *   x → 0 일 때 기울기 = c. 처음에는 끈 거리의 c 배만 움직인다
 *
 * 점근 상한이 있다는 것이 핵심이다 — 빅뱅 이전으로 아무리 끌어도 화면이
 * 날아가지 않고 "더 갈 수 없다" 는 감각만 남는다.
 *
 * @param maxOvershoot 도달 가능한 최대 이탈량. 화면 폭이 아니라 **허용할
 *   이탈량**을 넘긴다. 화면 폭의 20~25% 정도가 자연스럽다.
 * @param constant 초기 저항. 0.55 면 처음엔 끈 거리의 55%만 따라온다.
 */
export function rubberBand(
  overshoot: number,
  maxOvershoot: number,
  constant = 0.55,
): number {
  if (overshoot === 0 || maxOvershoot <= 0) return 0;
  const magnitude = Math.abs(overshoot);
  const resisted =
    (magnitude * maxOvershoot * constant) /
    (maxOvershoot + constant * magnitude);
  return Math.sign(overshoot) * resisted;
}

/**
 * 러버밴딩으로 도달 가능한 최대 이탈량 — 점근선.
 * `constant` 는 초기 기울기만 바꾸므로 상한에는 영향이 없다.
 */
export function rubberBandLimit(maxOvershoot: number): number {
  return maxOvershoot;
}

// ─────────────────────────────────────────────────────────────
// 스프링
// ─────────────────────────────────────────────────────────────

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
}

export interface SpringState {
  value: number;
  velocity: number;
  atRest: boolean;
}

/** 거의 임계감쇠 — 튕김 없이 빠르게 정착한다. */
export const DEFAULT_SPRING: Required<SpringConfig> = {
  stiffness: 170,
  damping: 26,
};

/** 스프링이 정착했다고 볼 오차. */
const SPRING_EPSILON = 1e-3;
/** 한 번에 적분할 최대 시간(ms). 큰 dt 를 그냥 넣으면 발산한다. */
const MAX_SUBSTEP_MS = 8;

/**
 * 스프링 한 걸음.
 *
 * 탭이 백그라운드에 있다 돌아오면 `dtMs` 가 수백 ms 로 튀는데, 그대로
 * 적분하면 값이 발산해 화면이 날아간다. 그래서 내부에서 잘게 쪼갠다.
 */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  dtMs: number,
  config: SpringConfig = {},
): SpringState {
  const { stiffness, damping } = { ...DEFAULT_SPRING, ...config };
  if (dtMs <= 0) {
    return { value, velocity, atRest: false };
  }

  let position = value;
  let speed = velocity;
  let remaining = Math.min(dtMs, 1000);

  while (remaining > 0) {
    const step = Math.min(MAX_SUBSTEP_MS, remaining) / 1000;
    const acceleration = stiffness * (target - position) - damping * speed;
    speed += acceleration * step;
    position += speed * step;
    remaining -= MAX_SUBSTEP_MS;
  }

  const settled =
    Math.abs(target - position) < SPRING_EPSILON &&
    Math.abs(speed) < SPRING_EPSILON;

  return settled
    ? { value: target, velocity: 0, atRest: true }
    : { value: position, velocity: speed, atRest: false };
}
