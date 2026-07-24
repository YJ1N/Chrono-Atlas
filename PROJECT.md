# PROJECT.md

## ChronoAtlas

ChronoAtlas 는 역사 웹사이트가 아니다. **Time Engine** 이다.

Google Maps 에서 장소를 탐색하듯 시간을 탐색한다. 역사는 첫 데이터셋일 뿐이며, 엔진은 아키텍처 변경 없이 다른 도메인(기술, AI, 기업, 과학, 스포츠, 음악, 문화)을 받아야 한다.

**현재 목표:** 포트폴리오 / 기술 데모. 아키텍처 품질과 시각적 완성도가 최우선이며, SEO·다국어·법적 검토는 후순위.

---

## 이 프로젝트의 진짜 난이도

직관과 달리 어려운 곳은 렌더링이 아니다. 세 곳이다.

**1. 숫자 표현.** JavaScript `Date` 는 ±271,821년까지만 표현한다. 목표는 138억 년이다. `Date` 를 코어 타입으로 잡으면 첫날부터 전제가 깨진다. → `TimePoint = number`(천문학적 연도 float64). ADR-001.

**2. 뷰포트 수치 안정성.** 138억 년 → 하루는 약 5e12배 줌이다. d3-zoom 처럼 배율 스칼라를 누적하면 float 정밀도가 무너져 패닝이 떨린다. → `{center, span}` 직접 소유. ADR-002.

**3. Y축이 무엇인가.** 시간은 1D 다. Maps 가 Maps 인 이유는 2D 공간 + *줌별 의미 수준 변화* 때문이다. 그냥 1D 로 만들면 지도가 아니라 슬라이더다. → 두 번째 축은 범주형 레인, 의미 수준 변화에 대응하는 것은 **LOD**(중요도 기반 선별). ADR-010.

---

## 현재 상태

**Phase 0 · 1 · 2 완료** — 138억 년을 60fps 로 탐색할 수 있는 상태

| 모듈 | 상태 | 내용 |
|---|---|---|
| `engine/types/timeline.ts` | ✅ | 코어 타입 — 도메인 무관 |
| `engine/time/TimePoint.ts` | ✅ | 연도 ↔ 달력 ↔ 표시 변환, 정밀도, 포맷팅 |
| `engine/time/TimeScale.ts` | ✅ | time ↔ pixel 매핑, 줌/팬 대수, 정밀도 하한 |
| `engine/time/ticks.ts` | ✅ | 17자릿수 대응 적응형 눈금 |
| `engine/index/IntervalIndex.ts` | ✅ | 범위 질의 O(log n + k) |
| `engine/index/lod.ts` | ✅ | 중요도 기반 선별 — DOM 노드 상한을 만든다 |
| `engine/index/collision.ts` | ✅ | 구간 분할 — 겹치는 항목을 여러 줄로 |
| `engine/viewport/ViewportController.ts` | ✅ | 뷰포트의 유일한 소유자 |
| `components/timeline/` | ✅ | Timeline · TimeAxis · 입력 처리 |
| `domains/history/` | ✅ | 시드 195건 (Phase 3 에서 ETL 로 교체) |

**단위 테스트 137개 통과.** 138억 년~하루 전 구간 왕복 변환, 5개 연도 전체 날짜 왕복, 2000개 혼합 구간에 대한 무작위 300회 참조 대조, 전 줌 범위 눈금 불변식 포함.

**브라우저 실측 통과.** p50 프레임 간격 16.7ms(60fps), 드롭 0%.

**엔진 경계가 ESLint 로 강제된다.** 실제 위반 파일로 발동을 확인했다.

```bash
npm run verify          # lint + typecheck + test
npm run dev
npm run verify:browser  # 브라우저 실측 (dev 서버 필요)
```

---

## 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16.2.11 (App Router) | Turbopack 기본 |
| React | 19.2.4 | |
| 언어 | TypeScript 5 (strict) | |
| 스타일 | Tailwind CSS 4 | |
| 상태 | Zustand 5 | 저빈도 상태만 (ARCHITECTURE.md) |
| 애니메이션 | motion 12 | UI 트랜지션 전용 |
| 테스트 | Vitest 4 · Playwright | 커널 단위 검증 + 브라우저 실측 |
| 런타임 | Node 26 / npm 11 | |

**의도적으로 넣지 않은 것**

- **D3** — 시간축 스케일·눈금을 직접 소유하는 편이 짧고 정확했다. ADR-008.
- **TanStack Query** — 런타임 API 가 0개면 서버 상태 라이브러리는 해결할 문제가 없다. ADR-007.
- **타임라인 라이브러리** (vis-timeline 등) — 138억 년 동적 범위도 중요도 기반 LOD 도 지원하지 않는다. 자체 구현이 이 프로젝트의 핵심 가치다.

---

## 문서

| 파일 | 내용 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 계층, 폴더 구조, 불변식, 상태·렌더링 전략 |
| [DATA_MODEL.md](DATA_MODEL.md) | 타입 정의, significance, 출처·라이선스 |
| [DECISIONS.md](DECISIONS.md) | ADR — 되돌리기 비용이 큰 결정만 |
| [ROADMAP.md](ROADMAP.md) | Phase 계획, MVP 범위 |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | 토큰, 타이포그래피, 모션 정책 |
| [CLAUDE.md](CLAUDE.md) | 협업 규칙 (프로젝트 헌법) |

`CLAUDE.md` 의 규칙 중 이 프로젝트가 의도적으로 반박한 것들(Era 분리, TanStack Query, D3, "SVG first vs 가상화")은 모두 `DECISIONS.md` 에 근거와 함께 기록되어 있다.
