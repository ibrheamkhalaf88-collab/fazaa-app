import { chromium } from "playwright";

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  try {
    await page.goto("http://localhost:8080", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "docs/screenshots/app-welcome.png", fullPage: false });
    console.log("✓ welcome");

    // Use evaluate to click directly
    await page.evaluate(() => {
      document.querySelector('[data-go="country"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-country.png", fullPage: false });
    console.log("✓ country");

    await page.evaluate(() => {
      document.querySelector('[data-go="home"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-home.png", fullPage: false });
    console.log("✓ home");

    await page.evaluate(() => {
      document.querySelector('[data-go="sos"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-sos.png", fullPage: false });
    console.log("✓ sos");

    await page.evaluate(() => {
      document.querySelector('[data-go="chat"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-chat.png", fullPage: false });
    console.log("✓ chat");

    await page.evaluate(() => {
      document.querySelector('[data-go="lawyer"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-lawyer.png", fullPage: false });
    console.log("✓ lawyer");

    await page.evaluate(() => {
      document.querySelector('[data-go="support"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-support.png", fullPage: false });
    console.log("✓ support");

    await page.evaluate(() => {
      document.querySelector('[data-go="settings"]')?.click();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: "docs/screenshots/app-settings.png", fullPage: false });
    console.log("✓ settings");
  } catch (e) {
    console.error("Error:", e.message);
  } finally {
    await browser.close();
    console.log("All screenshots done");
  }
}

capture();
