/**
 * 브라우저 실측 검증 — Atlas (Phase 2R).
 *
 * 단위 테스트는 엔진의 수치 정확성을 보장하지만, "60fps 로 부드럽다"와
 * "차트가 아니라 풍경으로 보인다"는 브라우저에서 재보지 않으면 주장에 불과하다.
 *
 * 사용:
 *   터미널 1) npm run dev
 *   터미널 2) npm run verify:browser
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const OUT = process.env.SHOT_DIR ?? mkdtempSync(join(tmpdir(), "chrono-shots-"));
const URL = process.env.BASE_URL ?? "http://localhost:3000";

const log = (...a) => console.log(...a);
const fail = [];
const check = (name, ok, detail = "") => {
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail.push(name);
};

const browser = await chromium.launch({ headless: true });
// 다크가 기본 테마다 (DESIGN_SYSTEM.md). 헤드리스 기본값은 라이트이므로 명시한다.
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: process.env.SCHEME === "light" ? "light" : "dark",
});

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

/**
 * 지연 로드된 detail 청크 (ADR-015).
 *
 * 단위 테스트는 "어느 청크가 필요한가" 를 검증하지만, 실제로 그것만
 * 받아오는지는 네트워크를 봐야 안다. 시간 겹침만으로 판정하는 버그가
 * 들어오면 전체 보기에서 8개를 전부 받아버리는데, 화면은 멀쩡해 보인다.
 */
const chunkRequests = new Set();
let overviewRequested = false;
/** 검색 색인이 **언제** 요청됐는지 — 번들이 아니라 지연 로드임을 확인한다. */
let searchIndexRequestedAt = null;
page.on("request", (r) => {
  const m = /\/data\/history\/(history-\d+)\.json/.exec(r.url());
  if (m) chunkRequests.add(m[1]);
  if (r.url().includes("overview.json")) overviewRequested = true;
  if (r.url().includes("search.json") && searchIndexRequestedAt === null) {
    searchIndexRequestedAt = Date.now();
  }
});

await page.goto(URL, { waitUntil: "networkidle" });
const firstPaintAt = Date.now();
await page.waitForTimeout(400);

/**
 * 콜드 오픈은 첫 4초간 뷰포트를 138억 년으로 끌고 간다.
 * 건너뛰지 않으면 이후의 초기 상태 검사가 전부 인트로 중간을 재게 된다.
 * 겸사겸사 "건너뛸 수 있는가" 를 확인한다 — 못 건너뛰는 인트로는 결함이다.
 */
const coldOpen = page.getByTestId("cold-open");
check("콜드 오픈이 실행된다", await coldOpen.isVisible());
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
check("콜드 오픈을 입력으로 건너뛸 수 있다", !(await coldOpen.isVisible()));

const plot = page.locator('[role="application"]');
const tier = async () => (await page.getByTestId("tier-badge").textContent()) ?? "";
const peakCount = () => page.locator("svg g[data-start]").count();

/**
 * 화면에 표시된 사건 중 가장 낮은 중요도.
 *
 * ── 왜 개수가 아니라 이것을 재는가
 * cosmic 은 138억 년을, detail 은 700년을 담는다. 담긴 시간이 다르므로
 * 개수 비교는 의미가 없다(오히려 줌 인하면 줄어드는 게 정상이다).
 * "확대하면 사소한 것이 떠오른다" 는 **중요도 하한이 내려간다**는 뜻이고,
 * 그것이 이 제품이 Maps 를 닮았다고 주장하는 근거다.
 */
const minSignificance = () =>
  page.evaluate(() => {
    const values = [...document.querySelectorAll("svg g[data-sig]")].map((g) =>
      Number(g.dataset.sig),
    );
    return values.length ? Math.min(...values) : 1;
  });

/** 지형 캔버스에 실제로 픽셀이 칠해졌는지 — "빈 화면" 회귀 방지. */
const terrainCoverage = () =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4 * 37) if (data[i] > 8) painted += 1;
    return painted / (data.length / (4 * 37));
  });

// ── 1. 초기 렌더 ────────────────────────────────────────────────
check("콘솔 에러 없음", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
check("지형 캔버스 존재", (await page.locator("canvas").count()) === 1);

const peaks0 = await peakCount();
check("봉우리 렌더", peaks0 > 0, `${peaks0}개`);

const coverage0 = await terrainCoverage();
check("지형이 화면을 채운다 (>20%)", coverage0 > 0.2, `${(coverage0 * 100).toFixed(0)}%`);
check("초기 티어가 historical", (await tier()).startsWith("historical"), await tier());

await page.mouse.move(720, 450);
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/r1-default.png` });

// ── 2. 티어 변태 — 표현이 실제로 바뀌는가 ──────────────────────
await page.getByRole("button", { name: "138억 년" }).click();
await page.waitForTimeout(1700);
check("줌 아웃 → cosmic 티어", (await tier()).startsWith("cosmic"), await tier());

const peaksCosmic = await peakCount();
const sigCosmic = await minSignificance();
check("cosmic 에서 봉우리가 크게 줄어든다", peaksCosmic < peaks0, `${peaks0} → ${peaksCosmic}`);
check("cosmic 은 최상위 사건만 남긴다", sigCosmic >= 0.8, `최저 중요도 ${sigCosmic.toFixed(2)}`);
check("cosmic 에서도 화면이 비지 않는다", (await terrainCoverage()) > 0.15);
await page.screenshot({ path: `${OUT}/r2-cosmic.png` });

await page.getByRole("button", { name: "인류사" }).click();
await page.waitForTimeout(1300);

const box = await plot.boundingBox();
await page.mouse.move(box.x + 900, box.y + 450);
for (let i = 0; i < 16; i += 1) {
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(45);
}
await page.waitForTimeout(700);
const detailTier = await tier();
check(
  "줌 인 → detail/moment 티어",
  /detail|moment/.test(detailTier),
  detailTier,
);
const sigDetail = await minSignificance();
check(
  "줌 인하면 사소한 사건이 떠오른다 (중요도 하한이 내려간다)",
  sigDetail < sigCosmic - 0.2,
  `최저 중요도 ${sigCosmic.toFixed(2)} → ${sigDetail.toFixed(2)}`,
);
await page.screenshot({ path: `${OUT}/r3-detail.png` });

// ── 3. 물리 — 던지면 계속 흐르는가 ─────────────────────────────
await page.getByRole("button", { name: "인류사" }).click();
await page.waitForTimeout(1200);

const centerOf = async () => (await tier()).split("·")[1]?.trim() ?? "";
await page.mouse.move(box.x + 1000, box.y + 450);
await page.mouse.down();
for (let i = 0; i < 10; i += 1) {
  await page.mouse.move(box.x + 1000 - i * 40, box.y + 450);
  await page.waitForTimeout(8);
}
await page.mouse.up();
const rightAfterRelease = await centerOf();
await page.waitForTimeout(600);
const afterCoast = await centerOf();
check("던지면 손을 뗀 뒤에도 흐른다 (관성)", rightAfterRelease !== afterCoast,
  `${rightAfterRelease} → ${afterCoast}`);

await page.waitForTimeout(1200);
const settled = await centerOf();
await page.waitForTimeout(500);
check("관성은 결국 멈춘다", settled === (await centerOf()), settled);

// ── 4. 선택 ────────────────────────────────────────────────────
await page.getByRole("button", { name: "인류사" }).click();
await page.waitForTimeout(1200);

const target = await page.evaluate(() => {
  const plotEl = document.querySelector('[role="application"]');
  const pr = plotEl.getBoundingClientRect();
  for (const g of document.querySelectorAll("svg g[data-start]")) {
    const circle = g.querySelector("circle:nth-of-type(2)");
    if (!circle) continue;
    const r = circle.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (cx > pr.x + 80 && cx < pr.right - 80 && cy > pr.y + 80 && cy < pr.bottom - 120) {
      return { x: cx, y: cy };
    }
  }
  return null;
});
check("화면 안에 클릭 가능한 봉우리 존재", target !== null);
if (target) await page.mouse.click(target.x, target.y);
await page.waitForTimeout(250);
check("봉우리 클릭 → 상세 패널이 열린다", await page.getByTestId("detail-panel").isVisible());
const chips = await page.locator('[data-testid="detail-panel"] button').count();
check("패널에 탐험을 잇는 관계 칩이 있다", chips > 1, `${chips - 1}개`);
await page.screenshot({ path: `${OUT}/r4-selected.png` });

// ── 5. 프레임 실측 ──────────────────────────────────────────────
await page.evaluate(() => {
  window.__f = [];
  let last = performance.now();
  const loop = (t) => {
    window.__f.push(t - last);
    last = t;
    window.__raf = requestAnimationFrame(loop);
  };
  window.__raf = requestAnimationFrame(loop);
});

await page.mouse.move(box.x + 1000, box.y + 450);
await page.mouse.down();
for (let i = 0; i < 90; i += 1) {
  await page.mouse.move(box.x + 1000 - i * 9, box.y + 450);
}
await page.mouse.up();

await page.mouse.move(box.x + 600, box.y + 450);
for (let i = 0; i < 40; i += 1) await page.mouse.wheel(0, -60);
await page.waitForTimeout(300);

const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return window.__f.slice(5);
});

/**
 * ── 무엇을 재는가
 * 이것은 rAF **간격**이지 작업 시간이 아니다. 60Hz 화면에서 간격이 16.7ms 로
 * 유지되면 그것이 곧 60fps 다. 봐야 할 것은 vsync 를 놓친 프레임(드롭)이다.
 */
frames.sort((a, b) => a - b);
const p50 = frames[Math.floor(frames.length * 0.5)];
const p95 = frames[Math.floor(frames.length * 0.95)];
const worst = frames[frames.length - 1];
const dropped = frames.filter((f) => f > 25).length;
const dropRate = (dropped / frames.length) * 100;

log(
  `\n프레임 ${frames.length}개 — p50 ${p50.toFixed(1)}ms / p95 ${p95.toFixed(1)}ms / 최악 ${worst.toFixed(1)}ms`,
);
log(`드롭(>25ms) ${dropped}개 (${dropRate.toFixed(1)}%) · 체감 ${(1000 / p50).toFixed(0)}fps`);

check("60fps 유지 (p50 간격 <= 17.5ms)", p50 <= 17.5, `${p50.toFixed(1)}ms`);
check("프레임 드롭 1% 미만", dropRate < 1, `${dropRate.toFixed(1)}%`);
check("최악 프레임 < 50ms (끊김 없음)", worst < 50, `${worst.toFixed(1)}ms`);

// ── 6. 조작 후 무결성 ───────────────────────────────────────────
check("수평선이 항상 보인다 (주변시)", await page.getByTestId("horizon").isVisible());
check("수평선에 현재 위치 띠가 있다", await page.getByTestId("horizon-band").isVisible());
check("'지금' 마커가 존재한다", (await page.getByTestId("present-marker").count()) === 1);
check("심원한 시간 주석이 존재한다", (await page.getByTestId("scale-note").count()) === 1);
check("조작 후에도 지형이 남는다", (await terrainCoverage()) > 0.15);
check("조작 후에도 봉우리가 남는다", (await peakCount()) > 0);
check("조작 중 콘솔 에러 없음", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
await page.screenshot({ path: `${OUT}/r5-after-stress.png` });

// ── 7. 청크 지연 로딩 (ADR-015) ─────────────────────────────────
check(
  "확대하면 detail 청크를 지연 로드한다",
  chunkRequests.size > 0,
  `${chunkRequests.size}개`,
);

/**
 * 여기가 요점이다. 138억 년 뷰는 **모든** 청크와 시간상 겹친다.
 * 시간만으로 판정하면 이 화면에서 전부 내려받는다 — 지연 로딩이 아니라
 * 지연된 일괄 로딩이다. 줌이 정하는 중요도 하한이 청크를 걸러야 한다.
 */
// 앞 단계에서 열린 상세 패널이 헤더 버튼을 덮는다.
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.getByRole("button", { name: "138억 년" }).click();
await page.waitForTimeout(1600);
const beforeIdle = chunkRequests.size;
await page.waitForTimeout(1200);

check(
  "전체 보기에서는 새 청크를 받지 않는다 (중요도 게이트)",
  chunkRequests.size === beforeIdle,
  `${beforeIdle} → ${chunkRequests.size}`,
);
/**
 * overview 는 번들이지 요청이 아니다 (ADR-015).
 *
 * 이걸 fetch 로 바꾸면 콜드 오픈 직후 지형이 빈 채로 남는데, 화면은
 * "아직 로딩 중" 처럼 보여서 눈으로는 잡히지 않는다.
 */
check(
  "overview 는 네트워크로 받지 않는다 (번들)",
  !overviewRequested,
);
check("청크 로딩 중 콘솔 에러 없음", consoleErrors.length === 0);

log(`\n지연 로드된 detail 청크: ${chunkRequests.size}개`);

// ── 8. 검색 (Phase 4) ───────────────────────────────────────────
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.getByRole("button", { name: "인류사" }).click();
await page.waitForTimeout(1200);

await page.keyboard.press("Meta+k");
await page.waitForTimeout(150);
const palette = page.getByTestId("command-palette");
check("⌘K 로 검색이 열린다", await palette.isVisible());

/**
 * 색인은 지연 로드된다 — 열기 전에는 네트워크에 없어야 한다.
 * 번들에 넣으면 검색을 쓰지 않는 대다수가 수백 KB 를 헛되이 받는다.
 */
check(
  "검색 색인은 열 때 받는다 (번들 아님)",
  searchIndexRequestedAt !== null && searchIndexRequestedAt > firstPaintAt,
);

await page.keyboard.type("전투");
await page.waitForTimeout(400);
const results = page.locator('#command-palette-results [role="option"]');
const resultCount = await results.count();
check("검색 결과가 나온다", resultCount > 0, `${resultCount}건`);

const firstResultTitle = await results.first().textContent();
await results.first().click();
await page.waitForTimeout(900);
check("결과를 고르면 검색창이 닫힌다", !(await palette.isVisible()));
check(
  "고른 사건의 상세가 열린다",
  await page.getByTestId("detail-panel").isVisible(),
  firstResultTitle?.trim().slice(0, 20),
);

// ── 9. URL 딥링크 (Phase 4) ─────────────────────────────────────
const deepLink = page.url();
check("URL 에 뷰포트가 기록된다", /[?&]t=/.test(deepLink) && /[?&]s=/.test(deepLink));
check("URL 에 선택이 기록된다", /[?&]i=/.test(deepLink));

const centerBefore = await centerOf();

/**
 * 딥링크의 값어치는 "같은 화면이 다시 열리는가" 하나다.
 * 새 페이지로 열어 확인한다 — 같은 탭에서 재사용하면 살아 있는 상태가
 * 결과를 가려버린다.
 */
const restored = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  colorScheme: "dark",
});
await restored.goto(deepLink, { waitUntil: "networkidle" });
await restored.waitForTimeout(900);

check(
  "딥링크로 들어오면 콜드 오픈을 건너뛴다",
  !(await restored.getByTestId("cold-open").isVisible()),
);
const centerAfter =
  (await restored.getByTestId("tier-badge").textContent())?.split("·")[1]?.trim() ??
  "";
check("딥링크가 같은 시점을 복원한다", centerAfter === centerBefore,
  `${centerBefore} → ${centerAfter}`);
check(
  "딥링크가 선택까지 복원한다",
  await restored.getByTestId("detail-panel").isVisible(),
);
await restored.screenshot({ path: `${OUT}/r6-deeplink.png` });
await restored.close();

// ── 10. 키보드 · 스크린리더 (Phase 4) ───────────────────────────
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

const tabStops = await page.evaluate(() => {
  const all = document.querySelectorAll("svg g[data-start]");
  const focusable = document.querySelectorAll("svg g[data-start][tabindex]");
  const labelled = [...all].filter((g) => g.querySelector("text"));
  const hidden = document.querySelectorAll(
    'svg g[data-start][aria-hidden="true"]',
  );
  return {
    all: all.length,
    focusable: focusable.length,
    labelled: labelled.length,
    hidden: hidden.length,
  };
});

/**
 * 키보드로 닿는 것과 화면에 이름이 보이는 것이 **정확히 일치**해야 한다.
 *
 * 적으면 보이는데 못 가는 사건이 생기고, 많으면 이름 없는 점 사이를
 * 수백 번 지나야 한다. 티어가 라벨 수에 상한(최대 40)을 두므로
 * 탭 정지 수도 저절로 유계다 — 별도의 임의 임계값이 필요 없다.
 */
check(
  "키보드가 닿는 곳 = 이름이 보이는 곳",
  tabStops.focusable === tabStops.labelled && tabStops.focusable > 0,
  `탭 ${tabStops.focusable} / 라벨 ${tabStops.labelled} / 전체 ${tabStops.all}`,
);
check(
  "이름 없는 봉우리는 스크린리더에서 숨긴다",
  tabStops.hidden === tabStops.all - tabStops.labelled,
  `${tabStops.hidden}개 숨김`,
);

const labelled = await page.evaluate(() => {
  const el = document.querySelector("svg g[data-start][tabindex]");
  return el?.getAttribute("aria-label") ?? null;
});
check(
  "봉우리가 이름과 시각을 함께 읽어준다",
  Boolean(labelled && /\d/.test(labelled)),
  labelled ?? "",
);

await page.evaluate(() => {
  document.querySelector("svg g[data-start][tabindex]")?.focus();
});
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
check(
  "봉우리에서 Enter 로 선택된다",
  await page.getByTestId("detail-panel").isVisible(),
);

const liveRegion = await page.locator('[role="status"][aria-live]').textContent();
check(
  "현재 위치를 스크린리더에 알린다",
  Boolean(liveRegion && liveRegion.trim().length > 0),
  liveRegion?.trim().slice(0, 40),
);

check("Phase 4 조작 중 콘솔 에러 없음", consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(" | "));

await browser.close();
log(`\n스크린샷: ${OUT}`);
log(`${fail.length === 0 ? "전체 통과" : `실패 ${fail.length}건: ${fail.join(", ")}`}`);
process.exit(fail.length === 0 ? 0 : 1);
