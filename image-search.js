import { DEFAULT_LOCATIONS, MUNICIPALITY_CONFIG } from "./src/config/municipalities.js";

// 「撮影する」（カメラ）と「写真を選ぶ」（保存済みの写真）の2つの入力
const fileInputs = ["camera-input", "photo-input"]
  .map((id) => document.getElementById(id))
  .filter(Boolean);
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
    throw new Error(
      "この画像は読み込めませんでした。JPEG・PNG形式の写真を選ぶか、カメラで撮影してください。",
    );
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

// script.js が保存している地域設定（今の街・前の街）
const LOCATION_STORAGE_KEY = "move-gomi-navi.locations";

const cityName = (cityId) => MUNICIPALITY_CONFIG[cityId]?.name ?? cityId;

/** 地域設定から今の街・前の街を取り出す（未設定なら初期設定を使う） */
function getSavedCities() {
  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(LOCATION_STORAGE_KEY) || "null");
  } catch {
    saved = null;
  }

  const valid = (cityId) => Object.hasOwn(MUNICIPALITY_CONFIG, cityId ?? "");

  return {
    currentCity: valid(saved?.current?.city) ? saved.current.city : DEFAULT_LOCATIONS.current,
    previousCity: valid(saved?.previous?.city) ? saved.previous.city : DEFAULT_LOCATIONS.previous,
  };
}

/**
 * 判定結果に表示する欄と見出し。今の街 → 前の街の順に表示し、同じ街なら1つにまとめる。
 * 例：今＝世田谷・前＝中野なら「今の街：世田谷区」「前の街：中野区」。
 */
function getSections({ currentCity, previousCity }) {
  if (currentCity === previousCity) {
    return [{ key: "current", title: `今・前の街：${cityName(currentCity)}` }];
  }

  return [
    { key: "current", title: `今の街：${cityName(currentCity)}` },
    { key: "previous", title: `前の街：${cityName(previousCity)}` },
  ];
}

function createMunicipalitySection(title, records, candidateName) {
  const section = createElement("section", "ai-photo-municipality");
  section.append(createElement("h4", "ai-photo-municipality-title", title));

  if (!Array.isArray(records) || records.length === 0) {
    section.append(
      createElement(
        "p",
        "ai-photo-no-match",
        "同じ名前の品目が見つかりません。下のボタンで検索すると、似た品目を確認できます。",
      ),
    );
    return section;
  }

  for (const record of records) {
    const details = createElement("div", "ai-photo-record");

    // 候補と名前が違う品目（表記違い・複数該当）の場合は、どの品目の分別かを示す
    if (record.name && record.name !== candidateName) {
      details.append(
        createElement("p", "ai-photo-record-name", `品目：${record.name}`),
      );
    }

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

function createResultCard(result, index, cities) {
  const sections = getSections(cities);
  const card = createElement("article", "ai-photo-result-card");
  const heading = createElement("div", "ai-photo-result-heading");

  heading.append(
    createElement(
      "h3",
      "ai-photo-item-name",
      result.name || `候補 ${index + 1}`,
    ),
  );

  // 今と前が別の区のときだけ「分別が変わります」を表示する
  if (result.classificationChanged && sections.length > 1) {
    heading.append(
      createElement("span", "ai-photo-change-badge", "分別が変わります"),
    );
  }

  card.append(heading);

  for (const { key, title } of sections) {
    card.append(createMunicipalitySection(title, result[key], result.name));
  }

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

function renderResults(results, cities) {
  resultsElement.replaceChildren();

  if (!Array.isArray(results) || results.length === 0) {
    setStatus("候補が見つかりませんでした。名前で検索してください。");
    return;
  }

  const candidates = results.slice(0, 3);

  candidates.forEach((result, index) => {
    resultsElement.append(createResultCard(result, index, cities));
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
    const requestCities = getSavedCities();

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
          ...requestCities,
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
    // サーバーが実際に使った街（未登録の街などは初期設定に置き換わる）で表示する
    renderResults(payload.results, {
      currentCity: payload.currentCity ?? requestCities.currentCity,
      previousCity: payload.previousCity ?? requestCities.previousCity,
    });
  } catch (error) {
    clearLoadingTimers();
    setStatus(error.message || "写真判定に失敗しました。");
  }
}

if (statusElement && resultsElement) {
  for (const fileInput of fileInputs) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      identifyPhoto(file);
      // 同じ写真をもう一度選んでも反応するように、選択状態を戻す
      event.target.value = "";
    });
  }
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