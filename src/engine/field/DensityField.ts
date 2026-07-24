/**
 * 밀도 필드 — 화면을 채우는 "지형"의 고도값.
 *
 * ── 이 모듈이 존재하는 이유
 * 이전 구현의 가장 큰 실패는 화면의 70%가 비어 있었다는 것이다.
 * Google Maps 에는 빈 픽셀이 없다 — 바다에도 수심이 있다.
 * 공백은 정보가 아니라 미완성으로 읽힌다.
 *
 * 그래서 개별 사건 사이의 공간을 "그때 무슨 일이 얼마나 있었는가" 로 채운다.
 * 이것이 실루엣이 되고, 실루엣을 뚫고 솟은 봉우리가 랜드마크가 된다.
 *
 * ── 두 채널을 합친다
 *   plateau — 구간 항목(시대·제국·지질누대)이 만드는 **고원**. 최댓값을 쓴다.
 *             신생대가 6600만 년에 걸쳐 있으면 그 구간 전체가 그 높이다.
 *   spikes  — 점 사건이 만드는 **봉우리**. 합산 후 정규화한다.
 *             사건이 몰린 곳이 솟는다.
 *
 * 고도 = max(고원, 봉우리). 합산이 아니라 최댓값인 이유는, 합산하면 긴 시대가
 * 벽이 되어 그 안의 사건 밀도를 가려버리기 때문이다.
 */

import type { TimePoint, TimelineItem } from "@/engine/types/timeline";

export interface DensityFieldOptions {
  /** 샘플 개수. 실루엣의 가로 해상도. */
  resolution?: number;
  /** 가우시안 평활 반경(bin). 0 이면 평활 없음. */
  smoothing?: number;
  /**
   * 최소 고도.
   *
   * 0 이면 사건이 없는 구간에서 지형이 완전히 사라져 다시 빈 화면이 된다.
   * 얇은 지평선이라도 항상 남겨 "여기도 시간이다" 를 말한다.
   */
  baseline?: number;
}

export const DEFAULT_RESOLUTION = 256;
/** 합친 필드에 걸리므로 넉넉해야 능선이 부드럽다. */
export const DEFAULT_SMOOTHING = 7;
export const DEFAULT_BASELINE = 0.05;

/** 1차원 가우시안 평활. 경계는 값을 반복해 늘린다(clamp-to-edge). */
function smooth(values: Float64Array, radius: number): Float64Array {
  if (radius <= 0) return values;

  const sigma = Math.max(0.5, radius / 2);
  const size = Math.ceil(radius);
  const kernel = new Float64Array(size * 2 + 1);
  let total = 0;
  for (let k = -size; k <= size; k += 1) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel[k + size] = w;
    total += w;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= total;

  const out = new Float64Array(values.length);
  const last = values.length - 1;
  for (let i = 0; i <= last; i += 1) {
    let acc = 0;
    for (let k = -size; k <= size; k += 1) {
      const j = Math.min(last, Math.max(0, i + k));
      acc += values[j] * kernel[k + size];
    }
    out[i] = acc;
  }
  return out;
}

/**
 * `[start, end]` 구간의 고도 배열을 만든다. 값은 항상 `[baseline, 1]`.
 *
 * 호출자는 `IntervalIndex.query` 로 이 구간과 겹치는 항목만 넘기면 된다 —
 * 구간 밖으로 삐져나온 부분은 여기서 잘린다.
 */
export function computeDensityField(
  items: readonly TimelineItem[],
  start: TimePoint,
  end: TimePoint,
  options: DensityFieldOptions = {},
): Float64Array {
  const {
    resolution = DEFAULT_RESOLUTION,
    smoothing = DEFAULT_SMOOTHING,
    baseline = DEFAULT_BASELINE,
  } = options;

  const n = Math.max(2, Math.floor(resolution));
  const field = new Float64Array(n).fill(baseline);
  const width = end - start;
  if (!(width > 0) || !Number.isFinite(width)) return field;

  const plateau = new Float64Array(n);
  const spikes = new Float64Array(n);
  const lastBin = n - 1;
  const binOf = (t: TimePoint) =>
    Math.min(lastBin, Math.max(0, Math.floor(((t - start) / width) * n)));

  for (const item of items) {
    const significance = Math.min(1, Math.max(0, item.significance));
    if (significance <= 0) continue;

    const from = item.span.start;
    const to = Math.max(from, item.span.end);
    // 구간이 완전히 화면 밖이면 건너뛴다.
    if (to < start || from > end) continue;

    const i0 = binOf(from);
    const i1 = binOf(to);

    if (i1 <= i0) {
      spikes[i0] += significance;
      continue;
    }
    for (let i = i0; i <= i1; i += 1) {
      if (significance > plateau[i]) plateau[i] = significance;
    }
  }

  /**
   * 두 채널을 **각각** 평활한 뒤 합친다.
   *
   * 합친 뒤에 한 번만 평활하면 봉우리의 질량이 이웃으로 퍼지면서 높이를
   * 잃는다 — 중요한 단일 사건이 언덕이 되어버린다.
   * 반대로 봉우리에만 걸면 고원의 시작·끝이 수직 벽으로 남아 지형이
   * 계단이 된다. 계단은 풍경이 아니라 막대그래프로 읽힌다.
   *
   * 그래서 고원은 모서리를 둥글리기 위해, 봉우리는 폭을 주기 위해
   * 따로 평활하고, 봉우리는 평활 **후에** 정규화해 높이를 되찾는다.
   */
  const plateauSmooth = smooth(plateau, smoothing);
  const spikeSmooth = smooth(spikes, smoothing);

  let peak = 0;
  for (let i = 0; i < n; i += 1) if (spikeSmooth[i] > peak) peak = spikeSmooth[i];

  for (let i = 0; i < n; i += 1) {
    /**
     * 봉우리는 상대값(정규화), 고원은 절대값(중요도 그 자체).
     *
     * ── 왜 제곱근으로 압축하는가
     * 사건 밀도는 현재에 가까울수록 지수적으로 커진다. 그대로 정규화하면
     * 근현대가 화면 끝의 수직 첨탑이 되고 나머지 5,000년이 전부 바닥에
     * 눌린다 — 지형이 아니라 절벽 하나가 된다.
     * 제곱근은 큰 값을 눌러 능선의 기복을 살린다. 홀로 있는 사건의 봉우리
     * 높이는 1 그대로 보존된다(√1 = 1).
     */
    const spike = peak > 0 ? Math.sqrt(spikeSmooth[i] / peak) : 0;
    field[i] = Math.min(
      1,
      Math.max(baseline, Math.max(plateauSmooth[i], spike)),
    );
  }
  return field;
}

/**
 * 필드를 0..1 위치에서 선형 보간해 읽는다.
 *
 * 필드 해상도(256)와 화면 폭(1440px)이 다르므로 렌더러는 픽셀마다 이걸로
 * 샘플링한다. 계단이 아니라 매끈한 능선이 되게 하는 것이 목적이다.
 */
export function sampleField(field: Float64Array, position: number): number {
  const n = field.length;
  if (n === 0) return 0;
  if (n === 1) return field[0];

  const x = Math.min(1, Math.max(0, position)) * (n - 1);
  const i = Math.floor(x);
  if (i >= n - 1) return field[n - 1];
  return field[i] + (field[i + 1] - field[i]) * (x - i);
}

/**
 * 필드를 화면 좌표 폴리라인으로 변환한다.
 *
 * Canvas 가 그대로 `lineTo` 할 수 있는 형태이며, 배열을 재사용해
 * 프레임마다 새로 할당하지 않는다.
 */
export function fieldToPolyline(
  field: Float64Array,
  pixelWidth: number,
  pixelHeight: number,
  out: Float64Array = new Float64Array(0),
): Float64Array {
  const points = Math.max(2, Math.floor(pixelWidth));
  const target =
    out.length === points * 2 ? out : new Float64Array(points * 2);

  for (let i = 0; i < points; i += 1) {
    const position = i / (points - 1);
    target[i * 2] = position * pixelWidth;
    target[i * 2 + 1] = pixelHeight * (1 - sampleField(field, position));
  }
  return target;
}
