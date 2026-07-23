const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

let chromium;

try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error("Playwright bulunamadı. Önce `npm install` çalıştırın.");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.PYTHON || "python3";
const DEFAULT_CHROME_PATHS = [
  process.env.CHROME_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const port = await getFreePort();
  const server = spawn(PYTHON, ["-m", "http.server", String(port)], {
    cwd: ROOT,
    stdio: "ignore",
  });

  try {
    await waitForServer(port);
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
    await page.locator("h1").waitFor({ state: "visible", timeout: 30000 });
    await assertPageBasics(page);
    await assertTextFlow(page);
    await assertSettingsPersistence(page, port);
    await assertFileValidation(page);
    await assertOcrDemo(page, "turkish", ["TÜRKÇE", "İÇİN", "ÇAĞRI"]);
    await assertOcrDemo(page, "english", ["HELLO", "READ THIS TEXT"]);
    await assertLowContrastImprovement(page);
    await assertMobileLayout(page);

    if (errors.length) {
      throw new Error(`Konsol hataları var:\n${errors.join("\n")}`);
    }

    await browser.close();
    console.log("Smoke tests passed.");
  } finally {
    server.kill();
  }
}

async function assertPageBasics(page) {
  const title = await page.locator("h1").innerText();
  const extractDisabled = await page.locator("#extractButton").isDisabled();
  const speakDisabled = await page.locator("#speakButton").isDisabled();
  const demoCount = await page.locator("[data-demo]").count();
  const metricCount = await page.locator(".quality-metrics span").count();
  const fileMetricCount = await page.locator(".file-summary span").count();

  assert(title === "Sesli Yazı Asistanı", "Başlık beklenen gibi değil.");
  assert(extractDisabled, "Başlangıçta OCR butonu disabled olmalı.");
  assert(speakDisabled, "Başlangıçta seslendirme butonu disabled olmalı.");
  assert(demoCount === 4, "Deneme Merkezi 4 demo butonu göstermeli.");
  assert(metricCount === 3, "Kalite kartı 3 metin analizi metriği göstermeli.");
  assert(fileMetricCount === 2, "Kalite kartı dosya adı ve boyut bilgisi göstermeli.");
}

async function assertTextFlow(page) {
  await page.locator("#textOutput").fill("Merhaba dünya. Bu bir seslendirme testidir.");
  const speakEnabled = await page.locator("#speakButton").isEnabled();
  const clearEnabled = await page.locator("#clearTextButton").isEnabled();
  const charCount = await page.locator("#charCount").innerText();
  const wordCount = await page.locator("#wordCount").innerText();
  const analysisWordCount = await page.locator("#analysisWordCount").innerText();
  const readingTime = await page.locator("#readingTime").innerText();

  assert(speakEnabled, "Metin girilince seslendirme butonu aktif olmalı.");
  assert(clearEnabled, "Metin girilince temizleme butonu aktif olmalı.");
  assert(charCount === "43 karakter", "Karakter sayacı beklenen değerde değil.");
  assert(wordCount === "6 kelime", "Kelime sayacı beklenen değerde değil.");
  assert(analysisWordCount === "6", "Analiz kelime sayısı beklenen değerde değil.");
  assert(readingTime === "1 dk", "Tahmini okuma süresi beklenen değerde değil.");

  await page.locator("#clearTextButton").click();
  const clearedText = await page.locator("#textOutput").inputValue();
  const clearDisabled = await page.locator("#clearTextButton").isDisabled();
  assert(clearedText === "", "Temizleme butonu metni silmeli.");
  assert(clearDisabled, "Metin temizlenince temizleme butonu disabled olmalı.");
}

async function assertSettingsPersistence(page, port) {
  await page.locator("#ocrLanguage").selectOption("eng");
  await page.locator("#enhanceToggle").uncheck();
  await page.evaluate(() => {
    const rate = document.querySelector("#rateRange");
    rate.value = "1.3";
    rate.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor({ state: "visible", timeout: 30000 });

  const language = await page.locator("#ocrLanguage").inputValue();
  const enhanceChecked = await page.locator("#enhanceToggle").isChecked();
  const rate = await page.locator("#rateRange").inputValue();

  assert(language === "eng", "OCR dili yenilemeden sonra korunmalı.");
  assert(!enhanceChecked, "Görüntü iyileştirme seçimi yenilemeden sonra korunmalı.");
  assert(rate === "1.3", "Ses hızı yenilemeden sonra korunmalı.");

  await page.locator("#ocrLanguage").selectOption("tur+eng");
  await page.locator("#enhanceToggle").check();
  await page.evaluate(() => {
    const rate = document.querySelector("#rateRange");
    rate.value = "1";
    rate.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.goto(`http://localhost:${port}/`, { waitUntil: "domcontentloaded" });
  await page.locator("h1").waitFor({ state: "visible", timeout: 30000 });
}

async function assertFileValidation(page) {
  const accepted = await page.evaluate(async () => {
    const textFile = new File(["not an image"], "notes.txt", { type: "text/plain" });
    return window.__speechAssistant.loadImage(textFile);
  });
  const status = await page.locator("#appStatus").innerText();

  assert(!accepted, "Görsel olmayan dosya kabul edilmemeli.");
  assert(status === "Fotoğraf yüklenemedi", "Geçersiz dosya durum mesajı beklenen gibi değil.");
}

async function assertOcrDemo(page, demoName, expectedParts) {
  await page.locator(`[data-demo="${demoName}"]`).click();
  await waitForExpectedOcrText(page, expectedParts);
  const text = normalize(await page.locator("#textOutput").inputValue());
  const confidence = await confidenceValue(page);
  const fileName = await page.locator("#fileName").innerText();
  const fileSize = await page.locator("#fileSize").innerText();
  const reportEnabled = await page.locator("#copyReportButton").isEnabled();

  expectedParts.forEach((part) => {
    assert(text.includes(normalize(part)), `${demoName} OCR sonucu "${part}" içermiyor: ${text}`);
  });
  assert(confidence !== null && confidence >= 65, `${demoName} kalite skoru düşük: ${confidence}`);
  assert(fileName.includes(demoName), `${demoName} dosya adı kalite kartında görünmeli.`);
  assert(fileSize !== "--", `${demoName} dosya boyutu kalite kartında görünmeli.`);
  assert(reportEnabled, `${demoName} OCR sonrası rapor kopyalama aktif olmalı.`);
}

async function waitForExpectedOcrText(page, expectedParts) {
  await page.waitForFunction(
    (parts) => {
      const text = (document.querySelector("#textOutput")?.value || "").toLocaleUpperCase("tr-TR");
      const normalizedText = text.replace(/\s+/g, " ").trim();
      return parts.every((part) => normalizedText.includes(part.toLocaleUpperCase("tr-TR")));
    },
    expectedParts,
    { timeout: 120000 },
  );
}

async function assertLowContrastImprovement(page) {
  const expectedParts = ["DÜŞÜK", "KONTRAST"];
  await page.locator("#enhanceToggle").uncheck();
  await page.locator('[data-demo="low-contrast"]').click();
  await waitForOcr(page);
  const rawText = normalize(await page.locator("#textOutput").inputValue());
  const rawConfidence = (await confidenceValue(page)) || 0;

  await page.locator("#enhanceToggle").check();
  await page.locator('[data-demo="low-contrast"]').click();
  await waitForOcr(page);
  const enhancedText = normalize(await page.locator("#textOutput").inputValue());
  const enhancedConfidence = (await confidenceValue(page)) || 0;
  const rawHasExpected = expectedParts.every((part) => rawText.includes(part));
  const enhancedHasExpected = expectedParts.every((part) => enhancedText.includes(part));

  assert(enhancedHasExpected, "İyileştirilmiş düşük kontrast metni okunmalı.");

  if (!rawHasExpected) {
    assert(
      enhancedConfidence >= rawConfidence || enhancedText.length > rawText.length,
      `İyileştirme ham OCR başarısızken toparlamalı. Ham: ${rawConfidence}/${rawText}, iyileştirilmiş: ${enhancedConfidence}/${enhancedText}`,
    );
  }
}

async function assertMobileLayout(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!mobileOverflow, "Mobil görünümde yatay taşma olmamalı.");
}

async function waitForOcr(page) {
  await page.waitForFunction(
    () => {
      const label = document.querySelector("#progressLabel")?.textContent;
      const status = document.querySelector("#appStatus")?.textContent || "";
      return label === "Tamamlandı" || status.includes("bulunamadı") || status.includes("okunamadı");
    },
    null,
    { timeout: 120000 },
  );
}

async function confidenceValue(page) {
  const raw = await page.locator("#confidenceValue").innerText();
  const value = Number(raw.replace("%", ""));
  return Number.isFinite(value) ? value : null;
}

function normalize(text) {
  return text.toLocaleUpperCase("tr-TR").replace(/\s+/g, " ").trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function launchBrowser() {
  const executablePath = DEFAULT_CHROME_PATHS.find((candidate) => candidate && fs.existsSync(candidate));

  try {
    return await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (error) {
    if (executablePath) {
      throw error;
    }
    throw new Error("Playwright tarayıcısı bulunamadı. `npx playwright install chromium` çalıştırın.");
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(port) {
  const deadline = Date.now() + 10000;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(`http://localhost:${port}/`, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }
        retry();
      });

      request.on("error", retry);
    };

    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("Yerel test sunucusu başlatılamadı."));
        return;
      }
      setTimeout(attempt, 120);
    };

    attempt();
  });
}
