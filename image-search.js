const fileInput = document.getElementById("camera-input");
const statusElement = document.getElementById("ai-photo-status");
const resultsElement = document.getElementById("ai-photo-results");
const searchResult = document.getElementById("search-result");
const standardResults = searchResult?.querySelector(".individual-comparison");
const itemSearch = document.getElementById("item-search");
const searchButton = document.getElementById("search-button");

let selectingCandidate = false;
let loadingTimer = null;
let loadingMessageTimer = null;

const LOADING_MESSAGES = [
  "AIが写真の品目を解析中...（数秒かかります）",
  "自治体の分別ルールを照合しています...",
];

function clearLoadingTimers() {
  if (loadingTimer !== null) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }

  if (loadingMessageTimer !== null) {
    clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }
}

function setStatus(message) {
  statusElement?.classList.remove("is-loading");
  statusElement?.removeAttribute("aria-busy");

  if (statusElement) {
    statusElement.textContent = message;
  }
}

function setLoadingStatus(message) {
  if (!statusElement) return;

  statusElement.replaceChildren();

  const spinner = document.createElement("span");
  spinner.className = "ai-photo-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "ai-photo-status-text";
  text.textContent = message;

  statusElement.append(spinner, text);
  statusElement.classList.add("is-loading");
  statusElement.setAttribute("aria-busy", "true");
}

function startLoadingMessages() {
  let messageIndex = 0;

  setLoadingStatus(LOADING_MESSAGES[messageIndex]);

  loadingMessageTimer = setInterval(() => {
    messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
    setLoadingStatus(LOADING_MESSAGES[messageIndex]);
  }, 3500);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

async function resizeImageToBase64(file) {
  let bitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("画像ファイルを読み込めませんでした。");
  }

  const maxDimension = 1500;
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    throw new Error("画像を処理できませんでした。");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const separator = dataUrl.indexOf(",");

  if (separator < 0) {
    throw new Error("画像を送信用データに変換できませんでした。");
  }

  return {
    imageBase64: dataUrl.slice(separator + 1),
    mediaType: "image/jpeg",
  };
}

function createMunicipalitySection(title, records) {
  const section = createElement("section", "ai-photo-municipality");
  section.append(createElement("h4", "ai-photo-municipality-title", title));

  if (!Array.isArray(records) || records.length === 0) {
    section.append(createElement("p", "ai-photo-no-match", "該当なし"));
    return section;
  }

  for (const record of records) {
    const details = createElement("div", "ai-photo-record");

    details.append(
      createElement(
        "p",
        "ai-photo-category",
        record.category || "カテゴリ未登録",
      ),
      createElement(
        "p",
        "ai-photo-note",
        record.note || "注意事項はありません。",
      ),
    );

    section.append(details);
  }

  return section;
}

function selectCandidate(name, card) {
  if (!name || !itemSearch || !searchButton) return;

  selectingCandidate = true;

  resultsElement.replaceChildren();
  setStatus(`「${name}」を選択しました。通常の検索結果を表示しています。`);

  if (standardResults) {
    standardResults.hidden = false;
  }

  itemSearch.value = name;
  searchButton.click();
  itemSearch.focus();

  selectingCandidate = false;
}

function createResultCard(result, index) {
  const card = createElement("article", "ai-photo-result-card");
  const heading = createElement("div", "ai-photo-result-heading");

  heading.append(
    createElement(
      "h3",
      "ai-photo-item-name",
      result.name || `候補 ${index + 1}`,
    ),
  );

  if (result.classificationChanged) {
    heading.append(
      createElement("span", "ai-photo-change-badge", "分別が変わります"),
    );
  }

  card.append(
    heading,
    createMunicipalitySection("中野区（新しい街）", result.nakano),
    createMunicipalitySection("世田谷区（前の街）", result.setagaya),
  );

  const selectButton = createElement(
    "button",
    "ai-photo-select-button",
    "この品目を選択して通常検索",
  );
  selectButton.type = "button";
  selectButton.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCandidate(result.name, card);
  });

  card.append(selectButton);
  card.addEventListener("click", () => {
    selectCandidate(result.name, card);
  });

  return card;
}

function renderResults(results) {
  resultsElement.replaceChildren();

  if (!Array.isArray(results) || results.length === 0) {
    setStatus("候補が見つかりませんでした。名前で検索してください。");
    return;
  }

  const candidates = results.slice(0, 3);

  candidates.forEach((result, index) => {
    resultsElement.append(createResultCard(result, index));
  });

  if (standardResults) {
    standardResults.hidden = true;
  }

  if (searchResult) {
    searchResult.classList.remove("hidden");
  }

  setStatus(`判定候補を${candidates.length}件表示しています。候補を選択できます。`);
}

const REQUEST_TIMEOUT_MS = 50_000;

async function identifyPhoto(file) {
  clearLoadingTimers();

  if (!file.type.startsWith("image/")) {
    setStatus("画像ファイルを選択してください。");
    return;
  }

  resultsElement.replaceChildren();
  setLoadingStatus("画像を最適化・縮小しています...");

  if (searchResult) {
    searchResult.classList.remove("hidden");
  }

  if (standardResults) {
    standardResults.hidden = true;
  }

  try {
    const { imageBase64, mediaType } = await resizeImageToBase64(file);

    startLoadingMessages();

    const fileKey = `${file.name}_${file.size}`;

    // AIの応答がないまま画面が止まらないよう、一定時間で打ち切る（サーバー側は40秒で打ち切る）
    const controller = new AbortController();
    const requestTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;

    try {
      response = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageBase64,
          mediaType,
          fileKey,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          "AIの応答に時間がかかっています。少し待ってからもう一度お試しいただくか、品目名で検索してください。",
        );
      }

      throw new Error("サーバーに接続できませんでした。通信環境を確認してください。");
    } finally {
      clearTimeout(requestTimer);
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      // python3 -m http.server などで開いた場合は /api/identify が存在しない
      throw new Error(
        "写真判定のサーバーに接続できませんでした。「node server.js」でサーバーを起動しているか確認してください。",
      );
    }

    if (!response.ok) {
      throw new Error(payload.error || "写真判定に失敗しました。");
    }

    clearLoadingTimers();
    renderResults(payload.results);
  } catch (error) {
    clearLoadingTimers();
    setStatus(error.message || "写真判定に失敗しました。");
  }
}

if (fileInput && statusElement && resultsElement) {
  /*
   * 既存 script.js のカメラ入力モック処理より先に実行し、
   * 同じ画像選択イベントがモック判定にも流れるのを防ぎます。
   */
  fileInput.addEventListener(
    "change",
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      event.stopImmediatePropagation();
      identifyPhoto(file);
      event.target.value = "";
    },
    true,
  );
}

/*
 * 候補を選んでいないときに手入力検索を開始したら、
 * AI候補を閉じて既存の検索結果表示に戻します。
 */
if (itemSearch) {
  itemSearch.addEventListener("input", () => {
    if (selectingCandidate || resultsElement.childElementCount === 0) return;

    clearLoadingTimers();
    resultsElement.replaceChildren();
    setStatus("");

    if (standardResults) {
      standardResults.hidden = false;
    }
  });
}