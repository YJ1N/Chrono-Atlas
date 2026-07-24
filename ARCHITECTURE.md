# ARCHITECTURE.md

## 계층

```
빌드타임 (로컬 실행, 런타임 API 0개)

  Wikidata SPARQL ──▶ scripts/etl ──▶ public/data/<domain>/*.json  (커밋됨)
                       fetch → normalize → score → chunk


런타임

  ┌──────────────────────────────────────────────────┐
  │  components/     UI 조립 (Tailwind + shadcn)      │
  ├──────────────────────────────────────────────────┤
  │  engine/         time · viewport · index · render │  ← 도메인 무관 자산
  ├──────────────────────────────────────────────────┤
  │  domains/<id>/   manifest · lanes · categories    │  ← 교체 가능한 데이터
  └──────────────────────────────────────────────────┘
```

## 불변식 — 이 프로젝트에서 유일하게 기계로 강제되는 규칙

의존은 **한 방향으로만** 흐른다.

```
components/ ─▶ engine/
domains/    ─▶ engine/
engine/     ─▶ (아무것도 참조하지 않는다)
```

`eslint.config.mjs` 가 이를 강제한다. `src/engine/**` 에서 `domains`·`components`·`stores`·`app` 으로의 import 는 별칭(`@/domains/…`)이든 상대경로(`../../domains/…`)든 `npm run lint` 를 실패시킨다. `engine/` 안의 `Date` 사용도 같은 방식으로 차단된다(ADR-001).

**"진짜 엔진인가"의 유일한 시험:** `domains/history` 를 지우고 `domains/ai` 를 넣었을 때 `engine/` 이 0줄 변경인가. Phase 6 의 목표다.

## 폴더 구조

```
src/
  engine/                         # 도메인 무관 — 이 프로젝트의 진짜 자산
    time/
      TimePoint.ts       ✅       # 연도 ↔ 달력 ↔ 표시 변환, 정밀도, 포맷팅
      TimeScale.ts       ✅       # time ↔ pixel 매핑, 줌/팬 대수
      ticks.ts           ✅       # 17자릿수 대응 적응형 눈금
    index/
      IntervalIndex.ts   ✅       # 범위 질의 O(log n + k)
      lod.ts             ⬜ P2    # (뷰포트, 픽셀폭) → 표시할 아이템 선별
      collision.ts       ⬜ P2    # 라벨 충돌 회피
    viewport/
      ViewportController.ts ⬜ P2 # {center, span} 명령형 소유 + 관성/이징
      useViewport.ts     ⬜ P2    # React 구독 바인딩
      urlState.ts        ⬜ P4    # 뷰포트 ↔ URL 직렬화
    render/
      Renderer.ts        ⬜ P2    # 공통 인터페이스 (Canvas 교체 지점)
      SvgLayer.tsx       ⬜ P2
    types/
      timeline.ts        ✅       # TimelineItem, Lane, Category, Domain, Viewport
  domains/
    history/             ⬜ P3    # manifest · lanes · categories
  components/            ⬜ P2
  stores/                ⬜ P2    # Zustand — 저빈도 상태만
  app/                   ✅       # Next.js App Router
scripts/etl/             ⬜ P3
public/data/             ⬜ P3    # 커밋되는 정적 산출물
```

`✅` 구현 완료 · `⬜ Pn` 해당 Phase 예정

## 상태 관리 — 3계층 분리

성능상 가장 중요한 결정이다. 셋을 섞으면 60fps 를 잃는다.

| 계층 | 내용 | 저장소 | 갱신 빈도 |
|---|---|---|---|
| **뷰포트** | `center`, `span` | ref + 명령형 emitter | 60fps |
| **선택/UI** | 선택 아이템, 패널, 필터 | Zustand | 저빈도 |
| **데이터** | 로드된 청크 | 모듈 캐시 + `dynamic import` | 희소 |

**뷰포트를 React state 에 넣으면 프로젝트가 죽는다.** 60fps 로 `setState` 하면 매 프레임 전체 재조정이 일어난다. `ViewportController` 가 값을 소유하고, rAF 루프에서 DOM 을 직접 갱신하거나 명시적으로 구독한 컴포넌트만 갱신한다.

## 렌더링 전략

| 대상 | 방식 | 근거 |
|---|---|---|
| 시간축·눈금 | SVG | 텍스트 선명도 |
| 시대 리본 (`layer: context`) | SVG | 수십 개 수준 |
| 이벤트 마크 (`layer: primary`) | SVG + LOD 상한 ~300 | ADR-010 |
| 밀도 미니맵 | Canvas | 1회 렌더 후 재사용 |
| Canvas 마크 레이어 | **만들지 않음** | Phase 6 탈출구 |

**팬 최적화:** 팬 중에는 컨테이너의 `transform: translateX()` 만 변경한다 — 컴포지터가 처리하므로 React 리렌더 0회. 팬 종료 또는 임계 이동량 초과 시에만 재계산·재배치.

## 애니메이션 정책

- **뷰포트 이동/줌** → 자체 rAF + 로그 보간(`interpolateViewport`). 라이브러리 미사용.
- **패널·모달·툴팁** → `motion`, `LazyMotion` + `domAnimation` 으로 번들 축소.
- **마크 진입/퇴장** → CSS transition 의 `opacity` 만. 마크마다 motion 컴포넌트를 붙이지 않는다.
- `prefers-reduced-motion` 존중.

## 성능 예산

1. LOD 로 DOM 노드 상한 고정 (마크 ~300 + 축 ~40)
2. 뷰포트 상태를 React 밖에 유지
3. 팬 중 transform-only
4. `IntervalIndex` 로 범위 질의 O(log n + k). `queryInto` 가 호출자 배열을 재사용해 프레임마다 새 배열을 만들지 않는다
5. 시간 버킷 단위 청크 lazy load
6. 라벨 충돌 계산을 span 버킷 기준으로 메모이제이션

목표: 최초 인터랙션 가능 < 1.5s, 팬/줌 프레임 < 16ms (MacBook Air 기준)

## 검증

```bash
npm run verify      # lint + typecheck + test
npm run test:watch  # 시간 커널 개발 중
```

- **시간 커널** — `vitest`. 138억 년~하루 전 구간 왕복 변환, 눈금 불변식, 범위 질의를 참조 구현과 대조.
- **엔진 경계** — ESLint. 위반 시 `npm run lint` 실패.
- **성능 실측** — Playwright 로 팬/줌 프레임 측정 (Phase 2 부터). 로컬 도구로 [anthropics/skills](https://github.com/anthropics/skills) 의 `webapp-testing` 스킬을 쓰며, 타사 도구이므로 저장소에는 포함하지 않는다(`.gitignore`).
