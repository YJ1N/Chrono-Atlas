import { describe, expect, it } from "vitest";

import {
  parseAtlasState,
  sameUrlViewport,
  serializeAtlasState,
} from "./urlState";
import { MIN_VIEWPORT_SPAN, UNIVERSE_START } from "@/engine/time/TimePoint";
import { minResolvableSpan } from "@/engine/time/TimeScale";
import type { Viewport } from "@/engine/types/timeline";

const SCREEN_WIDTH = 1440;

/** 복원된 뷰포트가 원본 대비 화면에서 몇 픽셀 어긋나는가. */
function pixelDrift(original: Viewport, restored: Viewport): number {
  const centerDrift =
    (Math.abs(original.center - restored.center) / original.span) * SCREEN_WIDTH;
  const spanDrift =
    (Math.abs(original.span - restored.span) / original.span) * SCREEN_WIDTH;
  return Math.max(centerDrift, spanDrift);
}

describe("serializeAtlasState / parseAtlasState", () => {
  it("기본 뷰포트를 짧게 쓴다", () => {
    const query = serializeAtlasState({ viewport: { center: 0, span: 6000 } });
    expect(query).toBe("t=0&s=6000");
  });

  it("선택 id 를 함께 담는다", () => {
    const query = serializeAtlasState({
      viewport: { center: 1969, span: 10 },
      selectedId: "wd-Q1339",
    });
    expect(parseAtlasState(query)).toEqual({
      viewport: { center: 1969, span: 10 },
      selectedId: "wd-Q1339",
    });
  });

  it("`?` 접두어가 있어도 읽는다", () => {
    expect(parseAtlasState("?t=0&s=6000")?.viewport).toEqual({
      center: 0,
      span: 6000,
    });
  });

  it("아무 값도 없으면 null — 콜드 오픈 실행 여부를 가르는 신호다", () => {
    expect(parseAtlasState("")).toBeNull();
    expect(parseAtlasState("?foo=bar")).toBeNull();
  });
});

/**
 * 이 블록이 이 파일의 존재 이유다.
 *
 * 유효숫자를 줄여 URL 을 짧게 만들려던 최초 설계는 여기서 무너졌다.
 * 12 유효숫자면 심원한 시간 최대 확대에서 약 1,100px 이 어긋난다 —
 * 화면을 통째로 벗어난다.
 */
describe("왕복 정확성 — 도달 가능한 모든 뷰포트에서", () => {
  /**
   * 소수부가 있는 위치여야 한다. 처음에는 `UNIVERSE_START + 1e9` 을 썼는데
   * 그 값은 유효숫자가 11자리뿐이라 반올림해도 무손실이었고, 테스트가
   * 아무것도 증명하지 못했다. 실제로 팬 하면 이런 딱 떨어지는 값에
   * 멈추지 않는다.
   */
  const deepCenter = UNIVERSE_START + 1e9 + 0.375;

  const cases: { name: string; viewport: Viewport }[] = [
    { name: "기본 인류사", viewport: { center: 0, span: 6000 } },
    { name: "우주 전체", viewport: { center: -6.9e9, span: 1.38e10 } },
    { name: "달 착륙 순간", viewport: { center: 1969.5479452054795, span: MIN_VIEWPORT_SPAN } },
    { name: "기원전 세밀", viewport: { center: -2560.123456789, span: 1.5 } },
    {
      name: "심원한 시간 최대 확대 (ADR-006 하한)",
      viewport: {
        center: deepCenter,
        span: minResolvableSpan(deepCenter, SCREEN_WIDTH),
      },
    },
  ];

  for (const { name, viewport } of cases) {
    it(`${name} — 왕복이 정확하다`, () => {
      const restored = parseAtlasState(serializeAtlasState({ viewport }))
        ?.viewport;
      expect(restored).toBeDefined();
      expect(restored!.center).toBe(viewport.center);
      expect(restored!.span).toBe(viewport.span);
      expect(pixelDrift(viewport, restored!)).toBe(0);
    });
  }

  it("반올림했다면 실패했을 것이다 — 12 유효숫자의 실제 오차를 보여준다", () => {
    const center = deepCenter;
    const span = minResolvableSpan(center, SCREEN_WIDTH);
    const rounded = Number(center.toPrecision(12));
    const drift = (Math.abs(center - rounded) / span) * SCREEN_WIDTH;
    // 이 값이 작아졌다면 정밀도 하한이 바뀐 것이다. 그때 이 결정을 재검토한다.
    expect(drift).toBeGreaterThan(100);
  });
});

describe("URL 은 신뢰할 수 없는 입력이다", () => {
  it("숫자가 아니면 뷰포트를 버린다", () => {
    expect(parseAtlasState("t=abc&s=xyz")).toBeNull();
  });

  it("빈 문자열을 0 으로 읽지 않는다", () => {
    expect(parseAtlasState("t=&s=")).toBeNull();
  });

  it("span 이 0 이나 음수면 버린다", () => {
    expect(parseAtlasState("t=0&s=0")).toBeNull();
    expect(parseAtlasState("t=0&s=-5")).toBeNull();
  });

  it("Infinity·NaN 을 통과시키지 않는다", () => {
    expect(parseAtlasState("t=Infinity&s=1")).toBeNull();
    expect(parseAtlasState("t=0&s=NaN")).toBeNull();
  });

  /** 이 값은 DOM 조회와 데이터 검색에 쓰인다. 모양을 강제한다. */
  it("이상한 모양의 id 를 거부한다", () => {
    expect(parseAtlasState("i=<script>")).toBeNull();
    expect(parseAtlasState("i=" + "x".repeat(200))).toBeNull();
    expect(parseAtlasState("i=wd-Q1339")).toEqual({ selectedId: "wd-Q1339" });
  });

  /** 하나가 상했다고 나머지까지 버리면 사용자에게 아무 이득이 없다. */
  it("뷰포트가 깨져도 선택 id 는 살린다", () => {
    expect(parseAtlasState("t=oops&s=oops&i=wd-Q1")).toEqual({
      selectedId: "wd-Q1",
    });
  });

  it("직렬화가 쓰레기 값을 URL 에 남기지 않는다", () => {
    const query = serializeAtlasState({
      viewport: { center: Number.NaN, span: Number.POSITIVE_INFINITY },
      selectedId: "<bad>",
    });
    expect(query).toBe("");
  });
});

describe("sameUrlViewport", () => {
  /** 이게 없으면 관성으로 흐르는 동안 replaceState 가 초당 수십 번 불린다. */
  it("같은 값이면 다시 쓰지 않는다", () => {
    expect(sameUrlViewport({ center: 1, span: 2 }, { center: 1, span: 2 })).toBe(
      true,
    );
  });

  it("처음에는 항상 쓴다", () => {
    expect(sameUrlViewport(null, { center: 1, span: 2 })).toBe(false);
  });

  it("값이 다르면 쓴다", () => {
    expect(
      sameUrlViewport({ center: 1, span: 2 }, { center: 1, span: 2.5 }),
    ).toBe(false);
  });
});
