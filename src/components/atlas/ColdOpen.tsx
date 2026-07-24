"use client";

import { useEffect, useRef } from "react";

import { UNIVERSE_START } from "@/engine/time/TimePoint";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { Viewport } from "@/engine/types/timeline";

/** 세션당 한 번만. 재방문 때마다 4초를 기다리게 하면 그건 방해다. */
const SEEN_KEY = "chronoatlas:cold-open-seen";
const DURATION_MS = 4200;

/**
 * 콜드 오픈 — 3초 안에 이 제품이 무엇인지 말한다.
 *
 * ── 왜 필요한가
 * 정지 화면으로 시작하면 사용자는 "역사 타임라인이구나" 하고 넘긴다.
 * 138억 년에서 인류사로 **날아 들어가는** 것을 한 번 보여주면
 * 이 제품의 규모가 설명 없이 전달된다.
 *
 * ── 규칙
 * 아무 입력이나 스킵된다. 건너뛸 수 없는 인트로는 오만이다.
 * `prefers-reduced-motion` 이면 아예 실행하지 않는다.
 * 세션당 한 번만 — 두 번째 방문부터는 바로 지도가 열린다.
 *
 * ── 왜 state 를 쓰지 않는가
 * 표시 여부가 sessionStorage·matchMedia 라는 외부 상태에 달려 있어서
 * 서버와 클라이언트의 첫 렌더가 달라진다. state 로 다루면 하이드레이션
 * 불일치이거나 effect 안의 동기 setState(연쇄 렌더)가 된다.
 * 이 코드베이스의 다른 레이어들처럼 DOM 을 직접 토글하는 편이 일관되고 정확하다.
 */
export function ColdOpen({
  controller,
  target,
  onDone,
}: {
  controller: ViewportController;
  target: Viewport;
  onDone?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const seen = globalThis.sessionStorage?.getItem(SEEN_KEY);
    if (reduced || seen) {
      onDone?.();
      return;
    }

    root.style.opacity = "1";
    root.style.display = "flex";

    // 우주 전체에서 시작해 인류사로 빨려 들어간다.
    controller.set({
      center: (UNIVERSE_START + 2026) / 2,
      span: 2026 - UNIVERSE_START,
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      /**
       * "봤음" 은 시작이 아니라 **끝났을 때** 기록한다.
       *
       * 시작 시점에 기록하면 React StrictMode 의 effect 이중 실행에서
       * 1회차가 플래그를 세우고 정리되면서 리스너를 떼고, 2회차는 그 플래그를
       * 보고 즉시 반환해 리스너를 다시 달지 않는다. 결과적으로 인트로 화면만
       * 남고 아무 입력도 먹지 않는 상태가 된다 — 실제로 그렇게 만들었고
       * 브라우저 검증이 잡아냈다.
       */
      globalThis.sessionStorage?.setItem(SEEN_KEY, "1");
      controller.stop();
      controller.set(target);
      root.style.opacity = "0";
      // 페이드가 끝난 뒤에 치운다.
      setTimeout(() => {
        root.style.display = "none";
      }, 320);
      onDone?.();
    };

    const events = ["pointerdown", "wheel", "keydown", "touchstart"] as const;
    for (const type of events) {
      globalThis.addEventListener(type, finish, { once: true, passive: true });
    }

    /**
     * 숫자는 뷰포트를 따라간다 — 애니메이션을 두 번 정의하지 않는다.
     * 폭이 로그 보간되므로 숫자도 자연스럽게 자릿수를 잃어간다.
     */
    const unsubscribe = controller.subscribe((viewport) => {
      const el = numberRef.current;
      if (!el) return;
      const yearsAgo = Math.max(0, 2026 - (viewport.center - viewport.span / 2));
      el.textContent = Math.round(yearsAgo).toLocaleString("en-US");
    });

    const timer = setTimeout(finish, DURATION_MS + 150);
    controller.animateTo(target, DURATION_MS, finish);

    return () => {
      done = true;
      clearTimeout(timer);
      unsubscribe();
      controller.stop();
      for (const type of events) globalThis.removeEventListener(type, finish);
      // 정리된 실행의 잔재가 화면에 남지 않게 한다. 다시 실행되면 다시 켠다.
      root.style.display = "none";
    };
  }, [controller, target, onDone]);

  return (
    <div
      ref={rootRef}
      data-testid="cold-open"
      style={{ display: "none" }}
      className="pointer-events-none absolute inset-0 z-30 flex-col items-center justify-center transition-opacity duration-300"
    >
      {/* 지형이 보이도록 배경은 덮지 않는다. 숫자만 떠 있다 */}
      <div
        ref={numberRef}
        className="tabular text-[clamp(40px,7vw,104px)] font-semibold leading-none tracking-tight text-foreground/85"
      >
        13,800,000,000
      </div>
      <div className="mt-4 text-[12px] tracking-[0.2em] text-muted/70">
        년 전부터 지금까지
      </div>
      <div className="absolute bottom-[16%] text-[11px] tracking-wide text-muted/40">
        아무 곳이나 눌러 건너뛰기
      </div>
    </div>
  );
}
