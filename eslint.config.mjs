import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * 엔진 불변식 (ARCHITECTURE.md / DECISIONS.md ADR-003)
 *
 * `src/engine/` 은 도메인 무관 계층이다. 아래로만 의존한다:
 *   components/ ─▶ engine/ ─▶ (없음)
 *   domains/    ─▶ engine/
 *
 * engine/ 이 domains/ 를 참조하는 순간 "Time Engine" 이라는 주장은 무너진다.
 * 이 규칙은 그 주장을 사람의 규율이 아니라 CI 로 검증하기 위한 것이다.
 */
const ENGINE_FORBIDDEN_LAYERS = ["domains", "components", "stores", "app"];

const engineBoundaryPatterns = ENGINE_FORBIDDEN_LAYERS.map((layer) => ({
  // 별칭(@/domains/...)과 상대경로(../../domains/...) 양쪽을 모두 잡는다.
  group: [`**/${layer}`, `**/${layer}/**`],
  message: `엔진 불변식 위반: engine/ 은 ${layer}/ 를 import 할 수 없습니다. 필요한 값은 인자나 제네릭으로 주입하십시오.`,
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: "chronoatlas/engine-boundary",
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: engineBoundaryPatterns }],

      /**
       * ADR-001: JavaScript `Date` 는 ±271,821년까지만 표현한다.
       * ChronoAtlas 는 138억 년을 다루므로 엔진 코어에서 Date 는 곧 버그다.
       * 시간 값은 항상 TimePoint(= number, 천문학적 연도)로 다룬다.
       *
       * 표시 목적의 예외는 명시적 eslint-disable + 사유 주석으로만 허용한다.
       */
      "no-restricted-globals": [
        "error",
        {
          name: "Date",
          message:
            "ADR-001: 엔진에서 Date 금지 (±271,821년 한계). TimePoint(number, 천문학적 연도)를 사용하십시오.",
        },
      ],
    },
  },

  {
    name: "chronoatlas/domain-boundary",
    files: ["src/domains/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/components", "**/components/**", "**/stores", "**/stores/**"],
              message:
                "domains/ 는 순수 데이터·설정 계층입니다. UI 나 스토어를 참조할 수 없습니다.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    // eslint-config-next 기본 무시 항목
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ChronoAtlas 추가
    "public/data/**",
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
