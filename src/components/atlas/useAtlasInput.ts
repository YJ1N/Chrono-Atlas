"use client";

import { useEffect } from "react";

import { zoomAt } from "@/engine/time/TimeScale";
import {
  REST_VELOCITY,
  VelocityTracker,
  frictionStep,
  springStep,
} from "@/engine/viewport/inertia";
import type { ViewportController } from "@/engine/viewport/ViewportController";
import type { Viewport } from "@/engine/types/timeline";

/**
 * 물리가 있는 입력.
 *
 * 이전 구현은 드래그가 1:1 로 따라오다 손을 떼는 순간 즉시 멈췄고, 줌은 휠
 * 눈금마다 뚝뚝 끊겼다. 정확하지만 싸구려로 느껴진다.
 *
 * 여기서는 두 가지를 더한다:
 *   던지기(flick) — 손을 뗀 뒤 마찰로 감속하며 계속 흐른다
 *   줌 스프링    — 휠 눈금은 *목표*를 옮기고, 실제 값은 스프링으로 따라간다
 *
 * ── 왜 controller.animateTo 를 쓰지 않는가
 * 휠은 연속으로 들어온다. 매 눈금마다 animateTo 를 부르면 이징이 계속
 * 처음부터 다시 시작해 오히려 끊긴다. 목표만 갱신하고 적분은 한 루프에서
 * 계속 이어가야 매끄럽다.
 */
export interface AtlasInputOptions {
  zoomSensitivity?: number;
  keyPanPx?: number;
  keyZoomFactor?: number;
  /** 이 픽셀 이상 움직여야 드래그로 본다. 그 전에는 클릭일 수 있다. */
  dragThresholdPx?: number;
}

export function useAtlasInput(
  element: HTMLElement | null,
  controller: ViewportController,
  options: AtlasInputOptions = {},
): void {
  const {
    zoomSensitivity = 0.0016,
    keyPanPx = 90,
    keyZoomFactor = 0.75,
    dragThresholdPx = 4,
  } = options;

  useEffect(() => {
    if (!element) return;

    let frame: number | null = null;
    let lastFrameTime = 0;

    /** 줌 스프링의 목표. null 이면 스프링이 돌지 않는다. */
    let zoomTarget: Viewport | null = null;
    let spanVelocity = 0;
    let centerVelocity = 0;
    /** 팬 관성의 현재 속도(px/ms). */
    let panVelocity = 0;
    /** 클램프에 막혀 값이 멈췄는지 감지 — 무한 루프 방지. */
    let stalledFrames = 0;

    const stopPhysics = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      zoomTarget = null;
      panVelocity = 0;
      spanVelocity = 0;
      centerVelocity = 0;
      stalledFrames = 0;
    };

    const ensureLoop = () => {
      if (frame !== null) return;
      lastFrameTime = performance.now();
      frame = requestAnimationFrame(step);
    };

    const step = (now: number) => {
      frame = null;
      const dt = Math.min(64, now - lastFrameTime);
      lastFrameTime = now;
      if (dt <= 0) {
        ensureLoop();
        return;
      }

      const before = controller.getSnapshot();

      if (zoomTarget) {
        /**
         * 폭은 **로그 공간**에서 스프링한다. 선형으로 하면 줌 아웃이 처음에만
         * 빠르고 끝에서 멈춘 것처럼 보인다.
         */
        const span = springStep(
          Math.log(before.span),
          spanVelocity,
          Math.log(zoomTarget.span),
          dt,
        );
        const center = springStep(
          before.center,
          centerVelocity,
          zoomTarget.center,
          dt,
        );
        spanVelocity = span.velocity;
        centerVelocity = center.velocity;
        controller.set({ center: center.value, span: Math.exp(span.value) });

        if (span.atRest && center.atRest) {
          zoomTarget = null;
          spanVelocity = 0;
          centerVelocity = 0;
        }
      } else if (panVelocity !== 0) {
        controller.panBy(panVelocity * dt);
        panVelocity = frictionStep(panVelocity, dt);
      }

      const after = controller.getSnapshot();
      // 우주 경계에 눌려 더 못 가면 물리를 끝낸다.
      if (after.center === before.center && after.span === before.span) {
        stalledFrames += 1;
        if (stalledFrames > 3) {
          stopPhysics();
          return;
        }
      } else {
        stalledFrames = 0;
      }

      if (zoomTarget || panVelocity !== 0) ensureLoop();
    };

    const localX = (clientX: number) =>
      clientX - element.getBoundingClientRect().left;

    // ── 휠 · 핀치 ─────────────────────────────────────────────
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      panVelocity = 0;

      const isPinch = event.ctrlKey || event.metaKey;
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);

      if (!isPinch && horizontal) {
        zoomTarget = null;
        controller.panBy(-event.deltaX);
        return;
      }

      // exp 를 쓰면 한 눈금의 효과가 현재 배율과 무관하게 일정하다.
      const factor = Math.exp(event.deltaY * zoomSensitivity);
      // 목표를 이전 *목표* 기준으로 쌓아야 연속 스크롤이 누적된다.
      const base = zoomTarget ?? controller.getSnapshot();
      zoomTarget = zoomAt(base, localX(event.clientX), factor, controller.pixelWidth);
      ensureLoop();
    };

    // ── 드래그 · 던지기 ───────────────────────────────────────
    const tracker = new VelocityTracker();
    let activePointerId: number | null = null;
    let lastX = 0;
    let moved = 0;
    let capturing = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      stopPhysics();
      activePointerId = event.pointerId;
      lastX = event.clientX;
      moved = 0;
      capturing = false;
      tracker.reset();
      tracker.record(event.clientX, event.timeStamp);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      const delta = event.clientX - lastX;
      lastX = event.clientX;
      moved += Math.abs(delta);
      tracker.record(event.clientX, event.timeStamp);

      if (!capturing) {
        /**
         * 포인터 캡처를 pointerdown 에서 즉시 걸면 이후 `click` 이 원래
         * 대상이 아니라 캡처한 요소로 전달되어, 봉우리를 클릭해도 선택되지
         * 않는다. 실제로 끌었을 때만 캡처한다.
         */
        if (moved <= dragThresholdPx) return;
        capturing = true;
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = "true";
      }
      controller.panBy(delta);
    };

    const endDrag = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId) return;
      activePointerId = null;
      if (!capturing) return;

      capturing = false;
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      delete element.dataset.dragging;

      const velocity = tracker.velocity();
      if (Math.abs(velocity) > REST_VELOCITY) {
        panVelocity = velocity;
        ensureLoop();
      }

      const swallow = (e: Event) => e.stopPropagation();
      element.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(
        () => element.removeEventListener("click", swallow, { capture: true }),
        0,
      );
    };

    // ── 키보드 ────────────────────────────────────────────────
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? keyPanPx * 4 : keyPanPx;
      const center = controller.pixelWidth / 2;
      const base = zoomTarget ?? controller.getSnapshot();

      switch (event.key) {
        case "ArrowLeft":
          stopPhysics();
          controller.panBy(step);
          break;
        case "ArrowRight":
          stopPhysics();
          controller.panBy(-step);
          break;
        case "+":
        case "=":
          zoomTarget = zoomAt(base, center, keyZoomFactor, controller.pixelWidth);
          ensureLoop();
          break;
        case "-":
        case "_":
          zoomTarget = zoomAt(base, center, 1 / keyZoomFactor, controller.pixelWidth);
          ensureLoop();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
    element.addEventListener("keydown", onKeyDown);

    return () => {
      stopPhysics();
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", endDrag);
      element.removeEventListener("pointercancel", endDrag);
      element.removeEventListener("keydown", onKeyDown);
    };
  }, [
    element,
    controller,
    zoomSensitivity,
    keyPanPx,
    keyZoomFactor,
    dragThresholdPx,
  ]);
}
