const state = {
  currentImageFile: null,
  currentImageUrl: "",
  isReading: false,
  isPaused: false,
  isSpeaking: false,
  voices: [],
  activeUtterance: null,
  lastConfidence: null,
  lastOcrDurationMs: null,
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const SETTINGS_KEY = "sesliYaziAsistaniSettings";

const DEMO_TEXTS = {
  turkish: ["TÜRKÇE İÇİN", "ÇAĞRI GÜNÜ ŞİMDİ"],
  english: ["HELLO AI", "READ THIS TEXT"],
  "low-contrast": ["DÜŞÜK KONTRAST", "TÜRKÇE OKUMA TESTİ"],
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  applySavedSettings();
  bindEvents();
  refreshVoices();
  updateTextStats();
  updateSpeechButtons();
  resetProgress();
  resetQuality();

  if (window.lucide) {
    window.lucide.createIcons();
  }

  if (!("speechSynthesis" in window)) {
    setStatus("Bu tarayıcı seslendirmeyi desteklemiyor.");
    elements.voiceSelect.innerHTML = '<option value="">Seslendirme yok</option>';
    elements.speakButton.disabled = true;
  }

  window.__speechAssistant = {
    createDemoImageFile,
    extractTextFromImage,
    loadImage: handleImageFile,
    runDemoCase,
    setEnhancement(enabled) {
      elements.enhanceToggle.checked = Boolean(enabled);
      persistSettings();
    },
  };
});

function cacheElements() {
  Object.assign(elements, {
    appStatus: document.querySelector("#appStatus"),
    imageInput: document.querySelector("#imageInput"),
    imagePreview: document.querySelector("#imagePreview"),
    emptyPreview: document.querySelector("#emptyPreview"),
    dropZone: document.querySelector("#dropZone"),
    extractButton: document.querySelector("#extractButton"),
    resetButton: document.querySelector("#resetButton"),
    ocrLanguage: document.querySelector("#ocrLanguage"),
    enhanceToggle: document.querySelector("#enhanceToggle"),
    progressLabel: document.querySelector("#progressLabel"),
    progressPercent: document.querySelector("#progressPercent"),
    progressFill: document.querySelector("#progressFill"),
    confidenceValue: document.querySelector("#confidenceValue"),
    qualityCard: document.querySelector("#qualityCard"),
    qualityMessage: document.querySelector("#qualityMessage"),
    fileName: document.querySelector("#fileName"),
    fileSize: document.querySelector("#fileSize"),
    lineCount: document.querySelector("#lineCount"),
    analysisWordCount: document.querySelector("#analysisWordCount"),
    readingTime: document.querySelector("#readingTime"),
    textOutput: document.querySelector("#textOutput"),
    charCount: document.querySelector("#charCount"),
    wordCount: document.querySelector("#wordCount"),
    voiceSelect: document.querySelector("#voiceSelect"),
    rateRange: document.querySelector("#rateRange"),
    rateValue: document.querySelector("#rateValue"),
    pitchRange: document.querySelector("#pitchRange"),
    pitchValue: document.querySelector("#pitchValue"),
    speakButton: document.querySelector("#speakButton"),
    pauseButton: document.querySelector("#pauseButton"),
    stopButton: document.querySelector("#stopButton"),
    copyReportButton: document.querySelector("#copyReportButton"),
    clearTextButton: document.querySelector("#clearTextButton"),
    copyButton: document.querySelector("#copyButton"),
    downloadButton: document.querySelector("#downloadButton"),
    demoButtons: document.querySelectorAll("[data-demo]"),
  });
}

function bindEvents() {
  elements.imageInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) {
      handleImageFile(file);
    }
  });

  elements.dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });

  elements.dropZone.addEventListener("dragleave", () => {
    elements.dropZone.classList.remove("is-dragging");
  });

  elements.dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
    const [file] = event.dataTransfer.files;
    if (file) {
      handleImageFile(file);
    }
  });

  elements.extractButton.addEventListener("click", extractTextFromImage);
  elements.resetButton.addEventListener("click", resetApp);

  elements.enhanceToggle.addEventListener("change", () => {
    resetQuality();
    persistSettings();
    setStatus(elements.enhanceToggle.checked ? "İyileştirme açık" : "İyileştirme kapalı");
  });

  elements.ocrLanguage.addEventListener("change", persistSettings);

  elements.textOutput.addEventListener("input", () => {
    updateTextStats();
    updateSpeechButtons();
  });

  elements.rateRange.addEventListener("input", () => {
    elements.rateValue.textContent = Number(elements.rateRange.value).toFixed(1);
    persistSettings();
  });

  elements.pitchRange.addEventListener("input", () => {
    elements.pitchValue.textContent = Number(elements.pitchRange.value).toFixed(1);
    persistSettings();
  });

  elements.voiceSelect.addEventListener("change", persistSettings);
  elements.speakButton.addEventListener("click", speakText);
  elements.pauseButton.addEventListener("click", togglePause);
  elements.stopButton.addEventListener("click", stopSpeaking);
  elements.copyReportButton.addEventListener("click", copyOcrReport);
  elements.clearTextButton.addEventListener("click", clearText);
  elements.copyButton.addEventListener("click", copyText);
  elements.downloadButton.addEventListener("click", downloadText);

  elements.demoButtons.forEach((button) => {
    button.addEventListener("click", () => runDemoCase(button.dataset.demo));
  });

  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  }
}

function handleImageFile(file) {
  const validationMessage = validateImageFile(file);

  if (validationMessage) {
    elements.imageInput.value = "";
    resetProgress();
    setQuality(null, validationMessage);
    setStatus("Fotoğraf yüklenemedi");
    return false;
  }

  loadImage(file);
  return true;
}

function validateImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return "Bu dosya görsel değil. PNG, JPG veya benzeri bir fotoğraf seçin.";
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return "Fotoğraf 10 MB sınırını aşıyor. Daha küçük veya sıkıştırılmış bir görsel deneyin.";
  }

  return "";
}

function loadImage(file) {
  if (state.currentImageUrl) {
    URL.revokeObjectURL(state.currentImageUrl);
  }

  state.currentImageFile = file;
  state.currentImageUrl = URL.createObjectURL(file);
  elements.imagePreview.src = state.currentImageUrl;
  elements.imagePreview.classList.add("has-image");
  elements.emptyPreview.hidden = true;
  elements.extractButton.disabled = false;
  resetProgress();
  resetQuality();
  updateFileSummary(file);
  setStatus("Fotoğraf yüklendi");
}

async function extractTextFromImage() {
  if (!state.currentImageFile || state.isReading) {
    return null;
  }

  if (!window.Tesseract) {
    setStatus("OCR kütüphanesi yüklenemedi.");
    setQuality(null, "OCR kütüphanesi yüklenemedi. İnternet bağlantısını kontrol edin.");
    return null;
  }

  state.isReading = true;
  elements.extractButton.disabled = true;
  elements.extractButton.setAttribute("aria-busy", "true");
  setDemoButtonsDisabled(true);
  setStatus("Metin okunuyor");
  updateProgress("Hazırlanıyor", 0);
  setQuality(null, "Görüntü analiz ediliyor.");
  const startedAt = performance.now();

  try {
    const ocrInput = elements.enhanceToggle.checked
      ? await prepareImageForOcr(state.currentImageFile)
      : state.currentImageFile;

    const result = await window.Tesseract.recognize(ocrInput, elements.ocrLanguage.value, {
      logger: (message) => {
        const progress = typeof message.progress === "number" ? message.progress : 0;
        const label = mapOcrStatus(message.status);
        updateProgress(label, progress);
      },
    });

    const text = normalizeExtractedText(result.data.text || "");
    const confidence = normalizeConfidence(result.data.confidence);
    state.lastOcrDurationMs = Math.round(performance.now() - startedAt);
    elements.textOutput.value = text;
    updateTextStats();
    updateSpeechButtons();
    updateProgress("Tamamlandı", 1);
    setQuality(confidence, getQualityMessage(confidence, text));
    setStatus(text ? "Metin hazır" : "Okunabilir metin bulunamadı");
    updateReportButton();
    return { text, confidence };
  } catch (error) {
    console.error(error);
    updateProgress("Hata", 0);
    state.lastOcrDurationMs = null;
    setQuality(null, "Metin okunamadı. Daha net, ışıklı ve düz çekilmiş bir fotoğraf deneyin.");
    setStatus("Metin okunamadı");
    return null;
  } finally {
    state.isReading = false;
    elements.extractButton.removeAttribute("aria-busy");
    elements.extractButton.disabled = !state.currentImageFile;
    setDemoButtonsDisabled(false);
  }
}

async function prepareImageForOcr(file) {
  const bitmap = await loadBitmap(file);
  const maxSide = 1800;
  const maxDimension = Math.max(bitmap.width, bitmap.height);
  const upscale = maxDimension < 1200 ? Math.min(2, 1200 / maxDimension) : 1;
  const downscale = maxDimension > maxSide ? maxSide / maxDimension : 1;
  const scale = Math.min(upscale, downscale);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let min = 255;
  let max = 0;
  let sum = 0;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    min = Math.min(min, gray);
    max = Math.max(max, gray);
    sum += gray;
  }

  const mean = sum / (data.length / 4);
  const contrast = max - min;
  const shouldThreshold = contrast < 74;
  const contrastFactor = shouldThreshold ? 2.9 : 1.45;
  const threshold = Math.max(110, Math.min(206, mean * 0.96));

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    let enhanced = (gray - mean) * contrastFactor + 150;

    if (shouldThreshold) {
      enhanced = enhanced > threshold ? 255 : 0;
    }

    const value = Math.max(0, Math.min(255, enhanced));
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), "image/png");
  });
}

function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel yüklenemedi."));
    };
    image.src = url;
  });
}

function normalizeConfidence(confidence) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function setQuality(confidence, message) {
  state.lastConfidence = confidence;
  elements.qualityCard.classList.remove("is-empty", "is-warning", "is-danger");

  if (confidence === null) {
    elements.confidenceValue.textContent = "--";
    elements.qualityCard.classList.add("is-empty");
  } else {
    elements.confidenceValue.textContent = `%${confidence}`;
    if (confidence < 55) {
      elements.qualityCard.classList.add("is-danger");
    } else if (confidence < 78) {
      elements.qualityCard.classList.add("is-warning");
    }
  }

  elements.qualityMessage.textContent = message;
}

function resetQuality() {
  setQuality(null, "Henüz analiz yapılmadı.");
}

function getQualityMessage(confidence, text) {
  if (!text) {
    return "Okunabilir metin bulunamadı. Fotoğrafı daha net, ışıklı ve düz çekmeyi deneyin.";
  }

  if (confidence === null) {
    return "Metin çıkarıldı, kalite skoru hesaplanamadı.";
  }

  if (confidence < 55) {
    return "Düşük kalite. Daha net fotoğraf, iyi ışık ve düz kadraj sonucu belirgin iyileştirir.";
  }

  if (confidence < 78) {
    return "Orta kalite. Metni kontrol edip gerekirse küçük düzeltmeler yapın.";
  }

  return "Yüksek kalite. Metin seslendirme için hazır görünüyor.";
}

function mapOcrStatus(status = "") {
  const labels = {
    "loading tesseract core": "OCR motoru",
    "initializing tesseract": "Başlatılıyor",
    "loading language traineddata": "Dil modeli",
    "initializing api": "Model hazırlanıyor",
    recognizing: "Metin aranıyor",
  };

  return labels[status] || "İşleniyor";
}

function normalizeExtractedText(text) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function updateProgress(label, progress) {
  const safeProgress = Math.max(0, Math.min(1, progress));
  const percent = Math.round(safeProgress * 100);
  elements.progressLabel.textContent = label;
  elements.progressPercent.textContent = `%${percent}`;
  elements.progressFill.style.width = `${percent}%`;
}

function resetProgress() {
  updateProgress("Beklemede", 0);
}

function refreshVoices() {
  if (!("speechSynthesis" in window)) {
    elements.voiceSelect.innerHTML = '<option value="">Ses yok</option>';
    return;
  }

  const selectedVoice = elements.voiceSelect.value;
  const savedVoice = readSettings().voiceName;
  state.voices = window.speechSynthesis.getVoices();
  const orderedVoices = [...state.voices].sort((first, second) => {
    const firstTurkish = first.lang.toLowerCase().startsWith("tr") ? 0 : 1;
    const secondTurkish = second.lang.toLowerCase().startsWith("tr") ? 0 : 1;
    return firstTurkish - secondTurkish || first.lang.localeCompare(second.lang) || first.name.localeCompare(second.name);
  });

  elements.voiceSelect.innerHTML = "";

  if (!orderedVoices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Varsayılan ses";
    elements.voiceSelect.appendChild(option);
    return;
  }

  orderedVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    elements.voiceSelect.appendChild(option);
  });

  const preferredVoice =
    orderedVoices.find((voice) => voice.name === selectedVoice) ||
    orderedVoices.find((voice) => voice.name === savedVoice) ||
    orderedVoices.find((voice) => voice.lang.toLowerCase().startsWith("tr"));

  if (preferredVoice) {
    elements.voiceSelect.value = preferredVoice.name;
    persistSettings();
  }
}

function speakText() {
  const text = elements.textOutput.value.trim();

  if (!text || !("speechSynthesis" in window)) {
    return;
  }

  stopSpeaking({ keepStatus: true });

  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = state.voices.find((voice) => voice.name === elements.voiceSelect.value);

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice.lang;
  } else {
    utterance.lang = "tr-TR";
  }

  utterance.rate = Number(elements.rateRange.value);
  utterance.pitch = Number(elements.pitchRange.value);
  utterance.onstart = () => {
    state.isSpeaking = true;
    state.isPaused = false;
    setPauseButton(false);
    setStatus("Seslendiriliyor");
    updateSpeechButtons();
  };
  utterance.onend = () => {
    state.isSpeaking = false;
    state.isPaused = false;
    state.activeUtterance = null;
    setPauseButton(false);
    setStatus("Hazır");
    updateSpeechButtons();
  };
  utterance.onerror = () => {
    state.isSpeaking = false;
    state.isPaused = false;
    state.activeUtterance = null;
    setPauseButton(false);
    setStatus("Seslendirme tamamlanamadı");
    updateSpeechButtons();
  };

  state.activeUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  state.isSpeaking = true;
  updateSpeechButtons();
}

function togglePause() {
  if (!("speechSynthesis" in window) || !state.isSpeaking) {
    return;
  }

  if (state.isPaused || window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    state.isPaused = false;
    setPauseButton(false);
    setStatus("Seslendiriliyor");
  } else {
    window.speechSynthesis.pause();
    state.isPaused = true;
    setPauseButton(true);
    setStatus("Duraklatıldı");
  }

  updateSpeechButtons();
}

function setPauseButton(paused) {
  elements.pauseButton.innerHTML = paused
    ? '<i data-lucide="play"></i><span>Sürdür</span>'
    : '<i data-lucide="pause"></i><span>Duraklat</span>';

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function stopSpeaking(options = {}) {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  state.isSpeaking = false;
  state.isPaused = false;
  state.activeUtterance = null;
  setPauseButton(false);

  if (!options.keepStatus) {
    setStatus("Hazır");
  }

  updateSpeechButtons();
}

function updateSpeechButtons() {
  const hasText = Boolean(elements.textOutput.value.trim());
  const speechSupported = "speechSynthesis" in window;
  const speaking =
    speechSupported &&
    (state.isSpeaking || window.speechSynthesis.speaking || window.speechSynthesis.pending);

  elements.speakButton.disabled = !hasText || !speechSupported;
  elements.pauseButton.disabled = !speaking;
  elements.stopButton.disabled = !speaking;
  updateReportButton();
  elements.clearTextButton.disabled = !hasText;
  elements.copyButton.disabled = !hasText;
  elements.downloadButton.disabled = !hasText;
}

function updateReportButton() {
  const hasReport = Boolean(elements.textOutput.value.trim()) && state.lastConfidence !== null;
  elements.copyReportButton.disabled = !hasReport;
}

function clearText() {
  stopSpeaking();
  elements.textOutput.value = "";
  state.lastOcrDurationMs = null;
  updateTextStats();
  updateSpeechButtons();
  setStatus("Metin temizlendi");
}

async function copyOcrReport() {
  const report = createOcrReport();

  if (!report) {
    return;
  }

  try {
    await navigator.clipboard.writeText(report);
    setStatus("OCR raporu kopyalandı");
  } catch (error) {
    console.error(error);
    setStatus("Rapor kopyalanamadı");
  }
}

function createOcrReport() {
  const text = elements.textOutput.value.trim();

  if (!text || state.lastConfidence === null) {
    return "";
  }

  const metrics = getTextMetrics(text, elements.textOutput.value.length);
  const languageLabel = elements.ocrLanguage.selectedOptions[0]?.textContent || elements.ocrLanguage.value;
  const fileName = state.currentImageFile?.name || "Metin girişi";
  const duration = state.lastOcrDurationMs ? `${(state.lastOcrDurationMs / 1000).toFixed(1)} sn` : "Hesaplanamadı";

  return [
    "Sesli Yazı Asistanı OCR Raporu",
    `Dosya: ${fileName}`,
    `Dil: ${languageLabel}`,
    `Görüntü iyileştirme: ${elements.enhanceToggle.checked ? "Açık" : "Kapalı"}`,
    `Kalite skoru: %${state.lastConfidence}`,
    `Satır: ${metrics.lineCount}`,
    `Kelime: ${metrics.wordCount}`,
    `Tahmini okuma: ${metrics.readingTimeLabel}`,
    `OCR süresi: ${duration}`,
    "",
    "Çıkarılan metin:",
    text,
  ].join("\n");
}

async function copyText() {
  const text = elements.textOutput.value.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Metin kopyalandı");
  } catch (error) {
    console.error(error);
    setStatus("Kopyalama başarısız");
  }
}

function downloadText() {
  const text = elements.textOutput.value.trim();
  if (!text) {
    return;
  }

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "okunan-metin.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  setStatus("Metin indirildi");
}

function updateTextStats() {
  const text = elements.textOutput.value.trim();
  const metrics = getTextMetrics(text, elements.textOutput.value.length);
  elements.charCount.textContent = `${metrics.charCount} karakter`;
  elements.wordCount.textContent = `${metrics.wordCount} kelime`;
  elements.lineCount.textContent = String(metrics.lineCount);
  elements.analysisWordCount.textContent = String(metrics.wordCount);
  elements.readingTime.textContent = metrics.readingTimeLabel;
}

function getTextMetrics(trimmedText, rawCharCount) {
  const wordCount = trimmedText ? trimmedText.split(/\s+/).filter(Boolean).length : 0;
  const lineCount = trimmedText ? trimmedText.split(/\n+/).filter((line) => line.trim()).length : 0;
  const readingMinutes = wordCount ? Math.max(1, Math.ceil(wordCount / 150)) : 0;

  return {
    charCount: rawCharCount,
    lineCount,
    readingTimeLabel: `${readingMinutes} dk`,
    wordCount,
  };
}

async function runDemoCase(name) {
  if (state.isReading) {
    return;
  }

  stopSpeaking();

  if (name === "speech") {
    elements.textOutput.value =
      "Merhaba! Bu deneme metni fotoğraf yüklemeden seslendirme özelliğini test etmek için hazırlandı.";
    updateTextStats();
    updateSpeechButtons();
    resetProgress();
    resetQuality();
    setStatus("Seslendirme metni hazır");
    return;
  }

  const file = await createDemoImageFile(name);
  loadImage(file);
  setStatus("Demo görsel yüklendi");
  await extractTextFromImage();
}

async function createDemoImageFile(name) {
  const lines = DEMO_TEXTS[name] || DEMO_TEXTS.turkish;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");
  const lowContrast = name === "low-contrast";

  ctx.fillStyle = lowContrast ? "#edf2f7" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (lowContrast) {
    ctx.fillStyle = "rgba(148, 163, 184, 0.18)";
    for (let x = 0; x < canvas.width; x += 34) {
      ctx.fillRect(x, 0, 10, canvas.height);
    }
  }

  ctx.fillStyle = lowContrast ? "#9aa7b5" : "#111827";
  ctx.textBaseline = "top";
  ctx.font = "bold 78px Arial, sans-serif";
  lines.forEach((line, index) => {
    ctx.fillText(line, 86, 92 + index * 126);
  });

  ctx.font = "32px Arial, sans-serif";
  ctx.fillStyle = lowContrast ? "#b8c2ce" : "#475569";
  ctx.fillText("Sesli Yazı Asistanı V2", 88, 392);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new File([blob], `${name}-demo.png`, { type: "image/png" });
}

function setDemoButtonsDisabled(disabled) {
  elements.demoButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function resetApp() {
  stopSpeaking();

  if (state.currentImageUrl) {
    URL.revokeObjectURL(state.currentImageUrl);
  }

  state.currentImageFile = null;
  state.currentImageUrl = "";
  state.lastConfidence = null;
  state.lastOcrDurationMs = null;
  elements.imageInput.value = "";
  elements.imagePreview.removeAttribute("src");
  elements.imagePreview.classList.remove("has-image");
  elements.emptyPreview.hidden = false;
  elements.extractButton.disabled = true;
  elements.textOutput.value = "";
  resetProgress();
  resetQuality();
  resetFileSummary();
  updateTextStats();
  updateSpeechButtons();
  setStatus("Hazır");
}

function updateFileSummary(file) {
  elements.fileName.textContent = file.name || "İsimsiz görsel";
  elements.fileSize.textContent = formatFileSize(file.size);
}

function resetFileSummary() {
  elements.fileName.textContent = "--";
  elements.fileSize.textContent = "--";
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "--";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(message) {
  elements.appStatus.textContent = message;
}

function applySavedSettings() {
  const settings = readSettings();

  if (settings.ocrLanguage) {
    elements.ocrLanguage.value = settings.ocrLanguage;
  }

  if (typeof settings.enhanceImages === "boolean") {
    elements.enhanceToggle.checked = settings.enhanceImages;
  }

  if (settings.rate) {
    elements.rateRange.value = settings.rate;
    elements.rateValue.textContent = Number(elements.rateRange.value).toFixed(1);
  }

  if (settings.pitch) {
    elements.pitchRange.value = settings.pitch;
    elements.pitchValue.textContent = Number(elements.pitchRange.value).toFixed(1);
  }
}

function persistSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        enhanceImages: elements.enhanceToggle.checked,
        ocrLanguage: elements.ocrLanguage.value,
        pitch: elements.pitchRange.value,
        rate: elements.rateRange.value,
        voiceName: elements.voiceSelect.value,
      }),
    );
  } catch (error) {
    console.warn("Ayarlar kaydedilemedi.", error);
  }
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch (error) {
    console.warn("Ayarlar okunamadı.", error);
    return {};
  }
}
