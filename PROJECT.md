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

**3. Y축이 무엇이고, 줌이 무엇을 바꾸는가.** 시간은 1D 다. Maps 가 Maps 인 이유는 2D 공간 + *줌별 의미 수준 변화* 때문이다. → Y축은 **연속적인 중요도**이며 줌에 결합된다(ADR-013). 그리고 줌은 배율이 아니라 **표현 자체**를 바꾼다(ADR-012). 첫 시도의 범주형 레인은 Y축이 아니라 스프레드시트 행 머리글이었다.

---

## 현재 상태

**Phase 4 완료** — 검색·딥링크·키보드로 탐색 가능한 시간 지형

Phase 3 이 실데이터 7,182건을 얹었고, Phase 4 가 그것을 **찾고 공유할 수 있게** 만들었다. 딥링크는 나중에 붙일 수 없어서 이 단계에 넣었다 — 공유가 안 되면 탐험의 결과가 휘발된다.

| 계층 | 모듈 |
|---|---|
| **시간** | `TimePoint` · `TimeScale` · `ticks` · `significance` · `projection` |
| **색인** | `IntervalIndex` · `lod` · `collision` · `search` |
| **필드** | `DensityField` — 지형의 고도값 |
| **렌더 규칙** | `tiers` — cosmic→moment 5단 변태 |
| **뷰포트** | `ViewportController` · `inertia` · `useViewport` · `urlState` |
| **UI** | `Atlas` · `ChunkedAtlas` · `CommandPalette` · `TerrainLayer`(Canvas) · `PeakLayer` · `EraLayer` · `Horizon` · `DetailPanel` · `ColdOpen` · `Overlays` |
| **ETL** | `queries`(16 소스) · `wikitime` · `normalize` · `score` · `enrich` · `chunk` · `report` · `deep-time` |
| **도메인** | `domains/history` — **7,182건** + 랜드마크 8개 |

**단위 테스트 328개 · 브라우저 검증 54개 항목 전체 통과.**
브라우저 실측(7,182건, 시드의 36배): p50 프레임 간격 **16.7ms(60fps)**, 드롭 **0%**, 최악 17.7ms.

데이터: overview **884건**(번들 416KB, 첫 페인트) + detail 청크 **7개**(2.8MB, 지연 로드).
검증 리포트: [`scripts/etl/REPORT.md`](scripts/etl/REPORT.md) — 날짜 파싱 실패율 **0.0%**, 언어 편향 실측.
검색 색인 7,182건은 ⌘K 를 처음 열 때만 받는다(585KB). 딥링크는 도달 가능한 모든 뷰포트에서 오차 0px 로 복원된다 (ADR-017).
키보드만으로 전부 조작된다 — 건너뛰기 링크, 봉우리 순회, 포커스 트랩과 복원까지 브라우저 검증이 지킨다.

**엔진 경계가 ESLint 로 강제된다.** 실제 위반 파일로 발동을 확인했다.

```bash
npm run verify          # lint + typecheck + test
npm run dev
npm run verify:browser  # 브라우저 실측 (dev 서버 필요)
npm run etl             # Wikidata 수집 → 산출물 재생성 (수동, 커밋 대상)
npm run etl:probe       # 쿼리가 WDQS 60초 제한을 통과하는지만 점검
```

**다음: Phase 5 (마감 — 디자인 시스템 확정, 카테고리 필터, 접근성 감사, SSG, 배포).**


---

## 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | Next.js 16.2.11 (App Router) | Turbopack 기본 |
| React | 19.2.4 | |
| 언어 | TypeScript 5 (strict) | |
| 스타일 | Tailwind CSS 4 | |
| 애니메이션 | motion 12 | UI 트랜지션 전용 |
| 테스트 | Vitest 4 · Playwright | 커널 단위 검증 + 브라우저 실측 |
| 런타임 | Node 26 / npm 11 | |

**의도적으로 넣지 않은 것**

- **D3** — 시간축 스케일·눈금을 직접 소유하는 편이 짧고 정확했다. ADR-008.
- **TanStack Query** — 런타임 API 가 0개면 서버 상태 라이브러리는 해결할 문제가 없다. ADR-007.
- **타임라인 라이브러리** (vis-timeline 등) — 138억 년 동적 범위도 중요도 기반 LOD 도 지원하지 않는다. 자체 구현이 이 프로젝트의 핵심 가치다.
- **Zustand** — 계획에는 있었고 실제로 설치까지 했으나 Phase 4 까지 와도 전역으로 나눌 상태가 없어 제거했다. 뷰포트는 `ViewportController`, 선택은 `Atlas`, 청크는 로더의 모듈 캐시가 들고 있다. 필요해지면 설치는 명령 하나다 (ARCHITECTURE.md).

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
