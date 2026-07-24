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

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

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

await browser.close();
log(`\n스크린샷: ${OUT}`);
log(`${fail.length === 0 ? "전체 통과" : `실패 ${fail.length}건: ${fail.join(", ")}`}`);
process.exit(fail.length === 0 ? 0 : 1);
