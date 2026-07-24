"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import type { IntervalIndex } from "@/engine/index/IntervalIndex";
import {
  computeDensityField,
  fieldToPolyline,
} from "@/engine/field/DensityField";
import { blendedRecipe } from "@/engine/render/tiers";
import { createTimeScale, viewportRange } from "@/engine/time/TimeScale";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { TimelineItem } from "@/engine/types/timeline";

/**
 * 지형 — 화면을 채우는 밀도 필드.
 *
 * ── 왜 Canvas 인가
 * 실루엣은 폭만큼의 점을 가진 폴리라인 하나다. SVG 로 하면 1440개 좌표를 담은
 * `points` 문자열을 프레임마다 다시 만들어 파싱하게 된다. Canvas 는 그냥
 * 숫자 배열을 훑으며 `lineTo` 한다.
 *
 * ── 왜 React 를 거치지 않는가
 * 지형은 뷰포트가 바뀔 때마다 다시 그려야 하지만 DOM 구조는 그대로다.
 * 그래서 컨트롤러를 직접 구독해 rAF 안에서 캔버스만 갱신한다.
 * React 는 이 컴포넌트를 한 번 마운트하고 그 뒤로 관여하지 않는다.
 */
export function TerrainLayer({
  controller,
  index,
  width,
  height,
  /** 필드 계산에 쓸 샘플 수. 화면 폭보다 작아도 보간되므로 충분하다. */
  resolution = 256,
  /** 이 시점 이후로 지형을 흐린다. 데이터의 끝(현재)을 절벽이 아니게 만든다. */
  fadeAfter,
}: {
  controller: ViewportController;
  index: IntervalIndex<TimelineItem>;
  width: number;
  height: number;
  resolution?: number;
  fadeAfter?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const polylineRef = useRef<Float64Array>(new Float64Array(0));
  const itemsRef = useRef<TimelineItem[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const viewport = controller.getSnapshot();
    const { start, end } = viewportRange(viewport);
    const recipe = blendedRecipe(viewport.span);

    // 배열을 재사용해 프레임마다 새로 할당하지 않는다.
    const items = index.queryInto(start, end, itemsRef.current);
    const field = computeDensityField(items, start, end, { resolution });
    const line = fieldToPolyline(field, width, height, polylineRef.current);
    polylineRef.current = line;

    const dpr = Math.min(2, globalThis.devicePixelRatio ?? 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = recipe.terrainOpacity;

    /**
     * 능선 아래를 채우는 그라디언트.
     *
     * 지형은 배경 장식이 아니라 **화면의 주인공**이다. 너무 어두우면
     * 이전과 똑같이 "빈 화면에 점이 떠 있는" 그림이 된다.
     * 능선 바로 아래가 가장 밝고 아래로 갈수록 깊어진다 — 물속처럼.
     */
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, "rgba(126, 152, 255, 0.42)");
    fill.addColorStop(0.35, "rgba(96, 116, 224, 0.26)");
    fill.addColorStop(0.75, "rgba(64, 78, 170, 0.13)");
    fill.addColorStop(1, "rgba(44, 54, 130, 0.05)");

    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 0; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1]);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // 능선 — 지형의 윤곽. 밝게 그어야 풍경의 실루엣으로 읽힌다.
    ctx.beginPath();
    for (let i = 0; i < line.length; i += 2) {
      if (i === 0) ctx.moveTo(line[i], line[i + 1]);
      else ctx.lineTo(line[i], line[i + 1]);
    }
    ctx.strokeStyle = "rgba(190, 210, 255, 0.75)";
    ctx.lineWidth = 1.25;
    ctx.stroke();

    /**
     * 데이터의 끝을 절벽이 아니게 만든다.
     *
     * 2026년 이후에는 사건이 없으므로 지형이 수직으로 뚝 떨어진다.
     * 의미상 맞지만 렌더링 결함처럼 보인다. 현재 지점부터 오른쪽으로
     * 서서히 지우면 "여기부터는 아직 없다" 로 읽힌다.
     */
    if (fadeAfter !== undefined) {
      const edge = createTimeScale(viewport, width).toPixel(fadeAfter);
      if (edge < width) {
        const from = Math.max(0, edge);
        const mask = ctx.createLinearGradient(from, 0, width, 0);
        mask.addColorStop(0, "rgba(0,0,0,0)");
        mask.addColorStop(1, "rgba(0,0,0,1)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = mask;
        ctx.fillRect(from, 0, width - from, height);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    ctx.globalAlpha = 1;
  }, [controller, index, width, height, resolution, fadeAfter]);

  /** 캔버스 해상도는 DPR 을 반영해야 능선이 흐려지지 않는다. */
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio ?? 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    draw();
  }, [width, height, draw]);

  useEffect(() => {
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        draw();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, draw]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block"
      style={{ width, height }}
    />
  );
}
