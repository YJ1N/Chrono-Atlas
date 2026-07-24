# ARCHITECTURE.md

## 계층

```
빌드타임 (로컬 실행, 런타임 API 0개)

  Wikidata SPARQL ──▶ scripts/etl ──┬─▶ src/domains/<id>/data/   overview (번들)
   + deep-time.ts    normalize      └─▶ public/data/<id>/        detail  (fetch)
   (큐레이션 시간값)  score·enrich
                     ·chunk            둘 다 커밋된다 — ADR-015


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
      significance.ts    ✅       # 줌에 결합된 중요도 하한 = Y축
      projection.ts      ✅       # 로그 시간 투영 (수평선 전용)
    field/
      DensityField.ts    ✅       # 고원+봉우리 두 채널의 밀도 필드
    render/
      tiers.ts           ✅       # cosmic→moment 5단 + 크로스페이드
    index/
      IntervalIndex.ts   ✅       # 범위 질의 O(log n + k)
      lod.ts             ✅       # (뷰포트, 픽셀폭) → 표시할 아이템 선별
      collision.ts       ✅       # 구간 분할 — 겹치는 항목을 여러 줄로
      search.ts          ✅       # 제목 검색 랭킹 (순수)
    viewport/
      ViewportController.ts ✅    # {center, span} 명령형 소유 + rAF 이징
      useViewport.ts     ✅       # React 구독 바인딩
      inertia.ts         ✅       # 던지기 관성 · 러버밴딩 · 스프링
      urlState.ts        ✅       # 뷰포트 ↔ URL 직렬화 (ADR-017)
    types/
      timeline.ts        ✅       # TimelineItem, Lane, Category, Domain, Viewport
  domains/
    history/             ✅       # manifest · lanes · categories
      loader.ts          ✅       # overview 번들 + 청크 fetch·캐시 (ADR-015)
      data/              ✅       # ETL 산출: overview.json · chunks.json
  components/atlas/      ✅       # Atlas · TerrainLayer(Canvas) · PeakLayer
                                # EraLayer · Horizon · DetailPanel · Overlays
      ChunkedAtlas.tsx   ✅       # 청크 지연 로딩 껍데기 (도메인 무관)
      CommandPalette.tsx ✅       # ⌘K 검색
      useAtlasUrl.ts     ✅       # URL ↔ 뷰포트·선택 배선
  stores/                ❌       # 만들지 않았다 — 아래 참조
  app/                   ✅       # Next.js App Router — 합성 루트
scripts/etl/             ✅       # queries · wikitime · normalize · score
                                # enrich · chunk · report · deep-time
public/data/             ✅       # 커밋되는 정적 청크
```

`✅` 구현 완료 · `⬜ Pn` 해당 Phase 예정

## 상태 관리 — 3계층 분리

성능상 가장 중요한 결정이다. 셋을 섞으면 60fps 를 잃는다.

| 계층 | 내용 | 저장소 | 갱신 빈도 |
|---|---|---|---|
| **뷰포트** | `center`, `span` | ref + 명령형 emitter | 60fps |
| **선택/UI** | 선택 id, 패널, 검색창 | 컴포넌트 지역 상태 | 저빈도 |
| **데이터** | overview(번들) + 로드된 청크 | 모듈 캐시 + `fetch` | 희소 |

**Zustand 를 도입하지 않았다.** 계획에는 있었지만 Phase 4 까지 와도 전역으로 나눠야 할 상태가 없었다. 선택은 `Atlas` 가, 검색창은 `CommandPalette` 가, 로드된 청크는 로더의 모듈 캐시가 들고 있으면 충분하다. 해결할 문제가 없는 곳에 저장소 계층을 만드는 것은 간접층일 뿐이다. 여러 화면이 같은 상태를 공유하게 되면 재검토한다.

**선택은 항목이 아니라 id 로 들고 있다.** 검색이나 딥링크로 **아직 받지 않은 청크**의 항목을 고를 수 있기 때문이다. id 로 두면 청크가 도착하는 순간 선택이 저절로 맺힌다.

**뷰포트를 React state 에 넣으면 프로젝트가 죽는다.** 60fps 로 `setState` 하면 매 프레임 전체 재조정이 일어난다. `ViewportController` 가 값을 소유하고, rAF 루프에서 DOM 을 직접 갱신하거나 명시적으로 구독한 컴포넌트만 갱신한다.

## 렌더링 전략

공간 모델: **X = 시간, Y = 중요도(연속).** 화면은 풍경이다.

| 대상 | 방식 | 근거 |
|---|---|---|
| 지형 (밀도 필드) | **Canvas** | 폭만큼의 폴리라인 하나. SVG 면 프레임마다 좌표 문자열을 다시 파싱한다 |
| 이벤트 봉우리 | SVG + LOD 상한 ~300 | ADR-010 |
| 시대 밴드 (`layer: context`) | SVG, cosmic/epochal 에서만 | 티어 가중치로 크로스페이드 |
| 로그 수평선 | DOM | 요소가 10여 개뿐 |

**티어별 표현의 변태**가 이 렌더링의 핵심이다. 넓은 쪽에서는 지형이 주인공이고
개별 사건이 존재하지 않으며, 좁은 쪽에서는 지형이 사라지고 사건이 카드가 된다.
같은 것을 크게 그리는 것은 줌이 아니다 (ADR-012).

**팬·줌 최적화 — 실제 구현:** 마크는 위치만 바뀌고 내용은 그대로이므로 React 를
거치지 않는다. rAF 안에서 각 마크의 `style.transform` 을 직접 쓴다(수백 개라도
1ms 미만이고 레이아웃을 유발하지 않는다). React 재렌더는 **LOD 선별 결과가
바뀔 때만** 일어나며, 그 임계값은 폭 15% 변화 또는 중심 0.15 span 이동이다.
오버스캔 500px 이 그사이의 가장자리 팝인을 막는다.

시간축은 반대다 — 라벨 **내용 자체가** 바뀌므로 transform 으로 처리할 수 없어
매 프레임 재렌더한다. 대신 개수가 10~20개라 비용이 무시할 만하다.

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
5. 청크 lazy load — **항목 수**로 분할하고 시간·중요도 양쪽으로 건다. 시간만으로 걸면 전체 보기에서 모든 청크가 겹쳐 첫 화면에 전부 받는다 (ADR-015)
6. 라벨 충돌 계산을 span 버킷 기준으로 메모이제이션

목표: 최초 인터랙션 가능 < 1.5s, 팬/줌 프레임 < 16ms (MacBook Air 기준)

## 검증

```bash
npm run verify          # lint + typecheck + test
npm run test:watch      # 시간 커널 개발 중

npm run dev             # 터미널 1
npm run verify:browser  # 터미널 2 — 브라우저 실측
```

- **시간 커널** — `vitest`. 138억 년~하루 전 구간 왕복 변환, 눈금 불변식, 범위 질의를 참조 구현과 대조.
- **엔진 경계** — ESLint. 위반 시 `npm run lint` 실패.
- **성능 실측** — `npm run verify:browser` 가 Playwright 로 렌더·입력·프레임을 측정한다. 현재 60fps · 드롭 0%. 로컬 도구로 [anthropics/skills](https://github.com/anthropics/skills) 의 `webapp-testing` 스킬을 쓰며, 타사 도구이므로 저장소에는 포함하지 않는다(`.gitignore`).
