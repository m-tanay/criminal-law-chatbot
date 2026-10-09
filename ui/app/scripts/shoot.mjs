// Verification screenshots via Playwright + system Chromium.
// Drives the real UI: empty state -> ask -> cited answer -> sources panel.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://127.0.0.1:5190/";
const OUT = new URL("../../screenshots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/snap/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: "dark",
});

function log(...a) {
  console.log("[shoot]", ...a);
}

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(600); // let fonts settle
  await page.screenshot({ path: OUT + "01-empty-state.png" });
  log("empty state shot");

  // Ask via a starter pill (first one = bribery).
  await page.getByRole("button", { name: /bribing a foreign public official/i }).click();

  // Wait for the assistant answer (a citation chip appears).
  await page.waitForSelector("button:has-text('§ 70.2')", { timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + "02-answer-citations.png" });
  log("answer+citations shot");

  // Hover a citation chip to show the popover.
  const chip = page.locator("button:has-text('§ 70.2(1)')").first();
  await chip.hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "03-citation-hover.png" });
  log("citation hover shot");

  // Open the sources panel via the top-bar button.
  await page.getByRole("button", { name: /^Sources/ }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + "04-sources-panel.png" });
  log("sources panel shot");

  // Light mode variant of the answer.
  await page.getByRole("button", { name: /Switch to light mode/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "05-light-mode.png" });
  log("light mode shot");

  // Capture the rendered answer text for the report.
  const answer = await page.locator(".prose-legal").first().innerText();
  console.log("---ANSWER-START---");
  console.log(answer.slice(0, 1200));
  console.log("---ANSWER-END---");
  const chipCount = await page.locator("button[aria-label^='Citation']").count();
  console.log("CHIP_COUNT:", chipCount);

  // Capture the citation popover quote (hover a chip in light mode is fine).
  const chip2 = page.locator("button:has-text('§ 70.2(1)')").first();
  await chip2.hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "06-citation-quote-popover.png" });
  const popoverText = await page
    .locator("blockquote")
    .first()
    .innerText()
    .catch(() => "(no popover quote found)");
  console.log("POPOVER_QUOTE:", popoverText.slice(0, 300));
  await page.keyboard.press("Escape");

  // --- Off-topic refusal path (new thread, ask something out of scope) ---
  await page.getByRole("button", { name: /Switch to dark mode/i }).click().catch(() => {});
  await page.getByRole("button", { name: /New research thread/i }).click();
  await page.waitForTimeout(400);
  const composer = page.getByRole("textbox").first();
  await composer.click();
  await composer.fill("What is the best pizza topping?");
  await composer.press("Enter");
  // Wait until the in-flight status is gone AND the refusal prose has rendered.
  await page.waitForSelector("text=/Searching the Criminal Code/i", { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const nodes = Array.from(document.querySelectorAll(".prose-legal"));
      const last = nodes[nodes.length - 1];
      return !!last && /could not find this|cannot answer/i.test(last.textContent || "");
    },
    { timeout: 60000 },
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + "07-offtopic-refusal.png" });
  const refusal = await page.locator(".prose-legal").last().innerText();
  console.log("---REFUSAL-START---");
  console.log(refusal.slice(0, 600));
  console.log("---REFUSAL-END---");
  const refusalChips = await page
    .locator(".prose-legal")
    .last()
    .locator("button[aria-label^='Citation']")
    .count();
  console.log("REFUSAL_CHIP_COUNT:", refusalChips);
} catch (e) {
  console.error("[shoot] ERROR", e.message);
  await page.screenshot({ path: OUT + "99-error.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
