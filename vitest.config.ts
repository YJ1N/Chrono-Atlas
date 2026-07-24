import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 시간 커널(engine/time, engine/index)은 UI 없이 순수 TS 로 검증한다.
 * 이것이 Phase 1 의 완료 기준이다 — 렌더링 이전에 수치 정확성을 못 박는다.
 */
export default defineConfig({
  test: {
    environment: "node",
    // ETL 의 순수 로직(날짜 파싱·점수·분할)도 같은 기준으로 검증한다.
    // 데이터가 한 번 굳으면 틀린 채로 오래 남기 때문이다.
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
