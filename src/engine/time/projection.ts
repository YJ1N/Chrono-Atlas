/**
 * 시간 투영 — 138억 년을 한 줄에 담는 방법.
 *
 * ── 왜 투영이 필요한가
 * Google Maps 는 메르카토르로 지구를 **왜곡해서** 쓸모를 만든다. 왜곡 없이
 * 구를 평면에 펴는 방법은 없기 때문이다.
 *
 * 시간도 같다. 138억 년을 선형으로 한 줄에 그리면 인류 문명 6,000년은
 * 전체의 0.00004%, 1440px 화면에서 **0.0006px** 이다. 즉 존재하지 않는다.
 * 이전 구현이 "전체 보기"에서 빈 화면을 보여준 이유가 정확히 이것이다.
 *
 * ── 그런데 본문에는 쓰지 않는다
 * 로그 축 위에서는 두 사건의 간격을 눈으로 비교할 수 없다. 측정이 거짓말이
 * 된다. 그래서 **본문은 선형으로 두고, 항상 보이는 수평선 띠에만** 이 투영을
 * 쓴다. 수평선은 재는 곳이 아니라 어디쯤인지 아는 곳이다.
 */

import { PRESENT_EPOCH, UNIVERSE_START } from "./TimePoint";
import type { TimePoint } from "@/engine/types/timeline";

export interface HorizonScale {
  /** 가장 오래된 끝 (위치 0). */
  readonly oldest: TimePoint;
  /** 가장 최근 끝 (위치 1). */
  readonly newest: TimePoint;
  /** 시점 → 0..1 위치. */
  toPosition(t: TimePoint): number;
  /** 0..1 위치 → 시점. `toPosition` 의 역함수. */
  toTime(position: number): TimePoint;
}

/**
 * 현재로부터의 경과 시간에 로그를 취하는 투영.
 *
 *   p(t) = 1 − ln(1 + (newest − t)) / ln(1 + (newest − oldest))
 *
 * `log1p` 를 쓰는 이유: 현재(경과 0)에서 `log(0) = -∞` 가 되는 것을 피하면서
 * 0 근처에서 선형에 가깝게 동작한다.
 *
 * 결과: 최근 12,000년이 수평선의 약 40% 를 차지한다. 인류사가 비로소
 * 보이는 크기가 된다.
 */
export function createHorizonScale(
  oldest: TimePoint = UNIVERSE_START,
  newest: TimePoint = PRESENT_EPOCH,
): HorizonScale {
  const total = Math.max(1e-9, newest - oldest);
  const denominator = Math.log1p(total);

  return {
    oldest,
    newest,
    toPosition(t) {
      const elapsed = Math.min(total, Math.max(0, newest - t));
      return 1 - Math.log1p(elapsed) / denominator;
    },
    toTime(position) {
      const p = Math.min(1, Math.max(0, position));
      return newest - Math.expm1((1 - p) * denominator);
    },
  };
}

/**
 * 뷰포트가 수평선에서 차지하는 구간.
 *
 * 아주 좁게 확대하면 폭이 0px 이 되어 위치를 알 수 없으므로 최소 폭을 준다.
 * "지금 여기" 를 알려주는 것이 이 띠의 존재 이유다.
 */
export function viewportBand(
  scale: HorizonScale,
  center: TimePoint,
  span: number,
  pixelWidth: number,
  minPixels = 3,
): { x: number; width: number } {
  const left = scale.toPosition(center - span / 2) * pixelWidth;
  const right = scale.toPosition(center + span / 2) * pixelWidth;
  const width = Math.max(minPixels, right - left);
  // 최소 폭을 준 만큼 중심을 유지하도록 되민다.
  const x = left - (width - (right - left)) / 2;
  return {
    x: Math.min(pixelWidth - width, Math.max(0, x)),
    width,
  };
}

