/**
 * 뷰포트 ↔ URL 직렬화.
 *
 * ── 왜 이것이 Phase 4 의 핵심인가
 * 딥링크는 나중에 붙일 수 없다. "이 순간을 남에게 보여준다" 가 불가능하면
 * 탐험의 결과를 아무도 공유하지 못하고, 탐험은 휘발된다.
 *
 * ── 왜 반올림하지 않는가
 * 처음에는 URL 을 짧게 하려고 12 유효숫자로 줄이려 했다. 계산해 보니 틀렸다.
 * 복원 오차를 픽셀로 환산하면
 *
 *     오차px = |center| × 10⁻ᵈ ÷ span × width
 *
 * 이고, 128억 년 전에서 최대로 확대한 지점(span ≈ 0.016년, ADR-006 의 정밀도
 * 하한)에 넣으면 d=12 일 때 **약 1,100px** 이 나온다. 화면을 통째로 벗어난다.
 * 0.25px 아래로 누르려면 d ≈ 16 이 필요한데 그건 float64 의 전부다.
 *
 * 그래서 `String(number)` 를 쓴다. JS 의 숫자 → 문자열은 **정확히 왕복하는
 * 가장 짧은 표현**을 보장하므로, 짧게 만들려는 노력과 정확성이 둘 다 얻어진다.
 * 대부분의 뷰포트에서는 어차피 `0` · `6000` 처럼 짧다.
 *
 * 이 파일은 DOM 을 모른다 — `window.location` 을 만지는 쪽은 components 다.
 */

import type { TimePoint, Viewport } from "@/engine/types/timeline";

export const URL_PARAM_CENTER = "t";
export const URL_PARAM_SPAN = "s";
export const URL_PARAM_SELECTED = "i";

export interface AtlasUrlState {
  viewport: Viewport;
  /** 선택된 항목 id. 없으면 선택 없음. */
  selectedId?: string;
}

/**
 * 항목 id 로 허용하는 형태.
 *
 * URL 은 신뢰할 수 없는 입력이다. 이 값은 나중에 DOM 조회와 데이터 검색에
 * 쓰이므로, 우리가 실제로 만드는 id 모양(`wd-Q1339`)만 통과시킨다.
 */
const SAFE_ID = /^[\w.:-]{1,80}$/;

function isUsableNumber(value: number): boolean {
  return Number.isFinite(value);
}

/**
 * `?t=...&s=...&i=...` 문자열을 만든다. `?` 는 붙이지 않는다.
 *
 * 값이 없거나 쓸 수 없으면 해당 파라미터를 아예 빼서, URL 에 `s=NaN` 같은
 * 쓰레기가 남지 않게 한다.
 */
export function serializeAtlasState(state: AtlasUrlState): string {
  const params = new URLSearchParams();
  const { center, span } = state.viewport;

  if (isUsableNumber(center)) params.set(URL_PARAM_CENTER, String(center));
  if (isUsableNumber(span) && span > 0) params.set(URL_PARAM_SPAN, String(span));
  if (state.selectedId && SAFE_ID.test(state.selectedId)) {
    params.set(URL_PARAM_SELECTED, state.selectedId);
  }

  return params.toString();
}

/**
 * URL 질의 문자열에서 복원한다.
 *
 * **부분 복원을 허용한다.** 뷰포트 파라미터가 깨졌어도 선택 id 는 살릴 수
 * 있고, 반대도 마찬가지다. 하나가 상하면 전부 버리는 것은 사용자에게
 * 아무 이득이 없다.
 *
 * 값이 하나도 쓸 만하지 않으면 `null` — 호출자가 "URL 상태 없음" 과
 * "URL 상태 있음" 을 구별해야 콜드 오픈 실행 여부를 정할 수 있다.
 */
export function parseAtlasState(
  search: string,
): { viewport?: Viewport; selectedId?: string } | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );

  const result: { viewport?: Viewport; selectedId?: string } = {};

  const rawCenter = params.get(URL_PARAM_CENTER);
  const rawSpan = params.get(URL_PARAM_SPAN);
  if (rawCenter !== null && rawSpan !== null) {
    const center = Number(rawCenter);
    const span = Number(rawSpan);
    // 빈 문자열은 Number("") === 0 이라 통과해 버린다. 명시적으로 막는다.
    if (
      rawCenter.trim() !== "" &&
      rawSpan.trim() !== "" &&
      isUsableNumber(center) &&
      isUsableNumber(span) &&
      span > 0
    ) {
      result.viewport = { center, span };
    }
  }

  const rawId = params.get(URL_PARAM_SELECTED);
  if (rawId !== null && SAFE_ID.test(rawId)) result.selectedId = rawId;

  return result.viewport || result.selectedId ? result : null;
}

/**
 * 두 뷰포트가 URL 에 같은 값을 남기는가.
 *
 * 이걸로 걸러내지 않으면 관성으로 흐르는 동안 `replaceState` 가 초당 수십 번
 * 불린다. 브라우저에 따라 호출 횟수 제한에 걸린다.
 */
export function sameUrlViewport(a: Viewport | null, b: Viewport): boolean {
  if (!a) return false;
  return a.center === b.center && a.span === b.span;
}

/** 이 시점이 URL 에 담겼을 때의 문자열. 테스트와 디버깅용. */
export function formatUrlNumber(value: TimePoint): string {
  return String(value);
}
