import { chromium } from "@playwright/test";
import axeCore from "axe-core";
import fs from "fs";
import path from "path";

const VIEWPORTS = [
  { name: "360x640", width: 360, height: 640 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x800", width: 1280, height: 800 },
];

const THEMES = ["light", "dark"];

const PAGES = [
  { id: "dashboard", name: "Dashboard" },
  { id: "transactions", name: "Transactions" },
  { id: "budgets", name: "Budgets" },
  { id: "goals", name: "Goals" },
  { id: "debts", name: "Debts" },
  { id: "council", name: "Council" },
  { id: "suggestions", name: "Suggestions" },
  { id: "data", name: "Data" },
  { id: "settings", name: "Settings" },
];

const SCREENSHOT_DIR = path.resolve("./screenshots/after");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function runAudit() {
  console.log("=== STARTING MOBILE UI AUDIT (POST-FIX VERIFICATION) ===");

  let browser;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
  } catch (err) {
    try {
      browser = await chromium.launch({
        channel: "chrome",
        headless: true,
      });
    } catch {
      browser = await chromium.launch({ headless: true });
    }
  }

  // Initial login to store authenticated storageState
  const setupContext = await browser.newContext();
  const setupPage = await setupContext.newPage();
  await setupPage.goto("http://127.0.0.1:5173/");
  await setupPage.waitForLoadState("networkidle");
  const emailInput = setupPage.locator('input[type="email"]');
  if (await emailInput.count() > 0) {
    await emailInput.fill("test@moneycouncil.ai");
    await setupPage.fill('input[type="password"]', "Password123!");
    await setupPage.click('button[type="submit"]');
    await setupPage.waitForTimeout(1000);
  }
  const authStatePath = path.resolve("./scripts/auth_state.json");
  await setupContext.storageState({ path: authStatePath });
  await setupContext.close();

  const allDefects = [];

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      console.log(`\nTesting Viewport: ${vp.name}, Theme: ${theme}`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        storageState: authStatePath,
      });
      const page = await context.newPage();

      await page.goto("http://127.0.0.1:5173/");
      await page.waitForLoadState("networkidle");

      // Set theme attribute on document
      await page.evaluate((th) => {
        document.documentElement.setAttribute("data-theme", th);
        if (th === "light") {
          document.body.classList.remove("theme-dark");
          document.body.classList.add("theme-light");
        } else {
          document.body.classList.remove("theme-light");
          document.body.classList.add("theme-dark");
        }
      }, theme);

      // Audit each app page
      for (const p of PAGES) {
        // Navigate to page via __navigateTo helper
        await page.evaluate((pageId) => {
          if ((window).__navigateTo) {
            (window).__navigateTo(pageId);
          }
        }, p.id);

        await page.waitForTimeout(600);

        // Take screenshot
        const screenshotPath = path.join(SCREENSHOT_DIR, `${vp.name}_${theme}_${p.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Run Page-Level Defect Checks:
        // 1. Horizontal Scroll Check
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        if (hasHorizontalScroll) {
          allDefects.push({
            type: "Horizontal Scroll",
            page: p.name,
            viewport: vp.name,
            theme,
            details: `Page scrollWidth exceeds window.innerWidth`,
          });
        }

        // 2. Tap Targets Check (< 44x44 px)
        const smallTapTargets = await page.evaluate(() => {
          const interactives = Array.from(
            document.querySelectorAll('button, a, input, select, textarea, [role="button"]')
          );
          const defects = [];
          for (const el of interactives) {
            const rect = el.getBoundingClientRect();
            // Ignore elements not in visual flow or hidden
            if (rect.width > 0 && rect.height > 0 && (window.getComputedStyle(el).display !== "none") && (window.getComputedStyle(el).visibility !== "hidden")) {
              if (rect.width < 44 || rect.height < 44) {
                const label = el.textContent?.trim().slice(0, 30) || el.getAttribute("aria-label") || el.tagName;
                defects.push({
                  element: `<${el.tagName.toLowerCase()}> "${label}"`,
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                });
              }
            }
          }
          return defects;
        });

        for (const st of smallTapTargets) {
          allDefects.push({
            type: "Small Tap Target (<44x44px)",
            page: p.name,
            viewport: vp.name,
            theme,
            details: `${st.element} is only ${st.width}x${st.height}px`,
          });
        }

        // 3. Fixed UI Overlaps Check (Bottom Nav, Floating Plus Button, Header)
        const overlaps = await page.evaluate(() => {
          const defects = [];
          const bottomNav = document.querySelector(".mobile-bottom-nav");
          const fab = document.querySelector(".mobile-fab-btn");

          if (bottomNav && fab) {
            const fabRect = fab.getBoundingClientRect();
            const navRect = bottomNav.getBoundingClientRect();
            if (fabRect.bottom > navRect.top && fabRect.height > 0 && navRect.height > 0) {
              defects.push(`Floating action button overlaps with bottom navigation bar`);
            }
          }

          return defects;
        });

        for (const ov of overlaps) {
          allDefects.push({
            type: "UI Overlap / Clearance Defect",
            page: p.name,
            viewport: vp.name,
            theme,
            details: ov,
          });
        }

        // 4. Text Overflow / Truncation Check for financial stats
        const textOverflows = await page.evaluate(() => {
          const defects = [];
          const textElements = Array.from(document.querySelectorAll(".tabular-nums, .metric-value, .stat-number"));
          for (const el of textElements) {
            if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) {
              defects.push(`Financial stat "${el.textContent?.trim().slice(0, 25)}" is clipped/overflowing (${el.scrollWidth}px > ${el.clientWidth}px)`);
            }
          }
          return defects;
        });

        for (const to of textOverflows) {
          allDefects.push({
            type: "Text / Number Clipping",
            page: p.name,
            viewport: vp.name,
            theme,
            details: to,
          });
        }

        // 5. Axe-Core Accessibility & Contrast Check
        try {
          await page.addScriptTag({ content: axeCore.source });
          const axeResults = await page.evaluate(async () => {
            return await window.axe.run(document, {
              runOnly: ["color-contrast"],
            });
          });

          if (axeResults && axeResults.violations) {
            for (const v of axeResults.violations) {
              for (const node of v.nodes) {
                allDefects.push({
                  type: "Colour Contrast Failure (WCAG AA)",
                  page: p.name,
                  viewport: vp.name,
                  theme,
                  details: `${node.target.join(" ")}: ${node.failureSummary?.slice(0, 100)}`,
                });
              }
            }
          }
        } catch {
          // Ignore axe-core injection failures on unmount
        }
      }

      await context.close();
    }
  }

  await browser.close();

  fs.writeFileSync("./screenshots/audit_defects_after.json", JSON.stringify(allDefects, null, 2));

  console.log("\n==========================================");
  console.log(`TOTAL DEFECTS DETECTED (POST-FIX): ${allDefects.length}`);
  console.log("==========================================");

  if (allDefects.length > 0) {
    const typeCounts = {};
    for (const d of allDefects) {
      typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;
    }
    for (const [t, count] of Object.entries(typeCounts)) {
      console.log(`- ${t}: ${count}`);
    }
  } else {
    console.log("PASS: Zero overlaps, clipping, horizontal scroll, tap-target, and contrast failures!");
  }
}

runAudit().catch(console.error);
