"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { CursorReadout } from "./CursorReadout";
import { PeakLayer } from "./PeakLayer";
import { TerrainLayer } from "./TerrainLayer";
import { useAtlasInput } from "./useAtlasInput";
import { createItemIndex } from "@/engine/index/IntervalIndex";
import { estimateLabelWidth } from "@/engine/index/collision";
import { selectVisible } from "@/engine/index/lod";
import { blendedRecipe, tierAt } from "@/engine/render/tiers";
import { UNIVERSE_START, formatTimePoint } from "@/engine/time/TimePoint";
import { createTimeScale, viewportForRange } from "@/engine/time/TimeScale";
import {
  significanceToY,
  visibleSignificanceRange,
} from "@/engine/time/significance";
import { ViewportController } from "@/engine/viewport/ViewportController";
import type { Domain, TimelineItem, Viewport } from "@/engine/types/timeline";

/** 봉우리 최소 간격 — 화면 내 DOM 노드 수의 상한을 만든다. */
const PEAK_SPACING_PX = 26;
const OVERSCAN_PX = 500;
/** 라벨 상자의 세로 높이 — 이 안에 들어오면 겹친 것으로 본다. */
const LABEL_ROW_PX = 22;

/** LOD 재계산 임계 — 매 프레임 재계산하면 React 렌더가 60fps 로 돌아 의미가 없다. */
const LOD_SPAN_RATIO = 1.12;
const LOD_CENTER_DRIFT = 0.12;

interface LodResult {
  peaks: TimelineItem[];
  labeledIds: ReadonlySet<string>;
}

const EMPTY_LOD: LodResult = { peaks: [], labeledIds: new Set() };

/**
 * Atlas — 시간 지형의 최상위 조율자.
 *
 * 레인도 축 구분선도 범례도 없다. 화면은 하나의 풍경이고,
 * X 는 시간, Y 는 중요도다.
 */
export function Atlas({
  domain,
  items,
}: {
  domain: Domain;
  items: TimelineItem[];
}) {
  const lodViewportRef = useRef<Viewport | null>(null);

  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [lod, setLod] = useState<LodResult>(EMPTY_LOD);
  const [selected, setSelected] = useState<TimelineItem | null>(null);

  const index = useMemo(() => createItemIndex(items), [items]);

  const controller = useMemo(
    () => new ViewportController({ initial: domain.defaultViewport, width: 1 }),
    [domain.defaultViewport],
  );
  useEffect(() => () => controller.destroy(), [controller]);

  // ── LOD 선별 ─────────────────────────────────────────────────
  const recomputeLod = useCallback(() => {
    const w = controller.pixelWidth;
    if (w <= 1) {
      setLod(EMPTY_LOD);
      return;
    }
    const viewport = controller.getSnapshot();
    const recipe = blendedRecipe(viewport.span);
    const { floor } = visibleSignificanceRange(viewport.span);

    /**
     * 중요도 하한 아래는 애초에 뽑지 않는다.
     * 이것이 "확대하면 사소한 것이 떠오른다" 는 동작의 실체다.
     */
    const peaks = selectVisible(index, viewport, w, {
      layer: "primary",
      minSpacingPx: PEAK_SPACING_PX,
      overscanPx: OVERSCAN_PX,
      maxItems: 300,
    })
      .map((p) => p.item)
      .filter((item) => item.significance >= floor);

    /**
     * 라벨 선별 — 중요도 순으로 훑으며 **실제로 겹치지 않는 것만** 채택한다.
     *
     * 상위 N개를 그냥 자르면 가까이 붙은 두 사건의 이름이 서로를 덮는다.
     * 봉우리는 Y(중요도)가 서로 달라서 x 만으로 판정하면 과하게 버려지므로,
     * x·y 두 축의 상자 겹침으로 판정한다.
     */
    const scale = createTimeScale(viewport, w);
    const range = visibleSignificanceRange(viewport.span);
    const ranked = [...peaks].sort((a, b) =>
      b.significance !== a.significance
        ? b.significance - a.significance
        : a.id < b.id
          ? -1
          : 1,
    );

    const placedLabels: { x: number; y: number; width: number }[] = [];
    const labeledIds = new Set<string>();

    for (const item of ranked) {
      if (labeledIds.size >= recipe.maxLabels) break;
      const x = scale.toPixel(item.span.start);
      if (x < -40 || x > w + 40) continue;
      const y = significanceToY(item.significance, range, size.height || 1);
      /**
       * 여유를 둔다. LOD 는 폭이 12% 바뀔 때만 다시 도는데, 그사이 줌으로
       * 마크 간 상대 간격이 최대 그만큼 좁아진다. 여유가 없으면 재계산
       * 직전에 라벨이 서로를 덮는다. (팬은 전체가 함께 움직이므로 무관하다.)
       */
      const labelWidth = (estimateLabelWidth(item.title, 12) + 26) * 1.2;

      const collides = placedLabels.some(
        (other) =>
          Math.abs(other.y - y) < LABEL_ROW_PX &&
          x < other.x + other.width &&
          other.x < x + labelWidth,
      );
      if (collides) continue;

      placedLabels.push({ x, y, width: labelWidth });
      labeledIds.add(item.id);
    }

    setLod({ peaks, labeledIds });
    lodViewportRef.current = viewport;
  }, [controller, index, size.height]);

  const maybeRecomputeLod = useCallback(() => {
    const last = lodViewportRef.current;
    const current = controller.getSnapshot();
    if (!last) {
      recomputeLod();
      return;
    }
    const ratio = current.span / last.span;
    const drift = Math.abs(current.center - last.center) / current.span;
    if (
      ratio > LOD_SPAN_RATIO ||
      ratio < 1 / LOD_SPAN_RATIO ||
      drift > LOD_CENTER_DRIFT
    ) {
      recomputeLod();
    }
  }, [controller, recomputeLod]);

  // ── 크기 측정 ────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!plotEl) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setSize({ width, height });
      controller.setWidth(width);
      recomputeLod();
    });
    observer.observe(plotEl);
    return () => observer.disconnect();
  }, [plotEl, controller, recomputeLod]);

  useEffect(() => {
    let frame: number | null = null;
    const unsubscribe = controller.subscribe(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        maybeRecomputeLod();
      });
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [controller, maybeRecomputeLod]);

  useAtlasInput(plotEl, controller);

  const showAll = useCallback(() => {
    controller.animateTo(viewportForRange(UNIVERSE_START, 2026, 0.02), 1100);
  }, [controller]);

  const resetView = useCallback(() => {
    controller.animateTo(domain.defaultViewport, 700);
  }, [controller, domain.defaultViewport]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-background text-foreground">
      <div
        ref={setPlotEl}
        tabIndex={0}
        role="application"
        aria-label="시간 지형. 드래그로 이동, 휠로 확대·축소."
        className="absolute inset-0 cursor-grab outline-none data-[dragging]:cursor-grabbing"
      >
        {size.width > 0 && (
          <>
            <TerrainLayer
              controller={controller}
              index={index}
              width={size.width}
              height={size.height}
            />
            <CursorReadout controller={controller} target={plotEl} />
            <PeakLayer
              controller={controller}
              items={lod.peaks}
              labeledIds={lod.labeledIds}
              width={size.width}
              height={size.height}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </>
        )}
      </div>

      {/* 크롬은 최소한만. 화면의 주인공은 시간이다 */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 px-5 py-4">
        <span className="text-[13px] font-medium tracking-tight text-foreground/70">
          ChronoAtlas
        </span>
        <span className="text-[11px] text-muted/70">{domain.label}</span>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <TierBadge controller={controller} />
          <button
            type="button"
            onClick={resetView}
            className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted transition-colors hover:border-border hover:text-foreground"
          >
            인류사
          </button>
          <button
            type="button"
            onClick={showAll}
            className="rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted transition-colors hover:border-border hover:text-foreground"
          >
            138억 년
          </button>
        </div>
      </header>

      {selected && (
        <aside className="absolute bottom-6 left-6 max-w-md rounded-xl border border-border/70 bg-surface/80 p-4 backdrop-blur-md">
          <div className="tabular text-[32px] font-semibold leading-none tracking-tight">
            {formatTimePoint(selected.span.start)}
          </div>
          <div className="mt-2 text-[17px] font-medium">{selected.title}</div>
          {selected.summary && (
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
              {selected.summary}
            </p>
          )}
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-3 text-[11px] text-muted hover:text-foreground"
          >
            닫기 (Esc)
          </button>
        </aside>
      )}
    </div>
  );
}

/** 현재 티어를 조용히 알려주는 배지 — 디버그이자 방향 감각. */
function TierBadge({ controller }: { controller: ViewportController }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => {
      const span = controller.getSnapshot().span;
      setLabel(`${tierAt(span)} · ${formatTimePoint(controller.getSnapshot().center)}`);
    };
    update();
    return controller.subscribe(update);
  }, [controller]);
  return (
    <span
      data-testid="tier-badge"
      className="tabular hidden text-[11px] text-muted/60 sm:inline"
    >
      {label}
    </span>
  );
}
