import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 시간 커널(engine/time, engine/index)은 UI 없이 순수 TS 로 검증한다.
 * 이것이 Phase 1 의 완료 기준이다 — 렌더링 이전에 수치 정확성을 못 박는다.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
