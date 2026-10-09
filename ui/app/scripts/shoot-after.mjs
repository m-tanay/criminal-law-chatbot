import { chromium } from "playwright";
const BASE = "http://127.0.0.1:5190/lawyer/";
const OUT = "/home/invisible-kernel/.openclaw/workspace-forge/projects/screenshots/";
const b = await chromium.launch({ executablePath: "/snap/bin/chromium", args: ["--no-sandbox"] });
const log = (...a) => console.log("[after]", ...a);
try {
  // 1. Empty state (dark)
  let p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + "01-AFTER-empty-dark.png" });
  log("empty dark");

  // 2. Ask a starter -> cited answer
  await p.getByRole("button", { name: /maximum penalty for assault occasioning/i }).click();
  await p.waitForFunction(() => {
    const n = document.querySelectorAll(".prose-legal");
    return n.length && /s |section|§/i.test(n[n.length-1].textContent||"");
  }, { timeout: 60000 });
  await p.waitForTimeout(1000);
  await p.screenshot({ path: OUT + "02-AFTER-answer-dark.png" });
  const answer = await p.locator(".prose-legal").first().innerText();
  const chips = await p.locator("button[aria-label^='Citation']").count();
  log("answer dark, chips=", chips);
  console.log("---ANSWER---\n" + answer.slice(0,700) + "\n---END---");

  // 3. Open sources panel
  await p.getByRole("button", { name: /^Sources/ }).first().click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + "03-AFTER-sources-dark.png" });
  log("sources");

  // 4. Light mode
  await p.getByRole("button", { name: /Switch to light mode/i }).click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "04-AFTER-answer-light.png" });
  log("light");
  await p.close();

  // 5. Empty state light (fresh)
  p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  // force light via toggle if defaulted dark
  const needLight = await p.evaluate(() => document.documentElement.classList.contains("dark"));
  if (needLight) { await p.getByRole("button", { name: /Switch to light mode/i }).click(); await p.waitForTimeout(500); }
  await p.screenshot({ path: OUT + "05-AFTER-empty-light.png" });
  log("empty light");
  await p.close();

  // 6. Mobile empty
  p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: "dark" });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + "06-AFTER-empty-mobile.png", fullPage: true });
  log("mobile");
  await p.close();
} catch (e) {
  console.error("[after] ERROR", e.message);
  process.exitCode = 1;
} finally {
  await b.close();
}
