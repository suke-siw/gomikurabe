const fileInput = document.getElementById("ai-camera-input");
const statusElement = document.getElementById("ai-photo-status");
const resultsElement = document.getElementById("ai-photo-results");
const itemSearch = document.getElementById("item-search");
const searchButton = document.getElementById("search-button");

function setStatus(message) {
  statusElement.textContent = message;
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
  section.append(createElement("h3", "ai-photo-municipality-title", title));

  if (!Array.isArray(records) || records.length === 0) {
    section.append(createElement("p", "ai-photo-no-match", "該当なし"));
    return section;
  }

  for (const record of records) {
    const detail = createElement("div", "ai-photo-record");

    detail.append(
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

    section.append(detail);
  }

  return section;
}

function selectCandidate(name, card) {
  document
    .querySelectorAll(".ai-photo-result-card.is-selected")
    .forEach((selectedCard) => selectedCard.classList.remove("is-selected"));

  card.classList.add("is-selected");

  if (itemSearch && searchButton) {
    itemSearch.value = name;
    searchButton.click();
    itemSearch.focus();
  }

  setStatus(`「${name}」を選択しました。`);
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
    "この候補を選択",
  );
  selectButton.type = "button";
  selectButton.addEventListener("click", () => {
    selectCandidate(result.name, card);
  });

  card.append(selectButton);
  card.addEventListener("click", (event) => {
    if (event.target !== selectButton) {
      selectCandidate(result.name, card);
    }
  });

  return card;
}

function renderResults(results) {
  resultsElement.replaceChildren();

  if (!Array.isArray(results) || results.length === 0) {
    setStatus("候補が見つかりませんでした。名前で検索してください");
    return;
  }

  const candidates = results.slice(0, 3);

  candidates.forEach((result, index) => {
    resultsElement.append(createResultCard(result, index));
  });

  setStatus(`判定候補を${candidates.length}件表示しています。`);
}

async function identifyPhoto(file) {
  resultsElement.replaceChildren();
  setStatus("画像を縮小して判定しています...");

  try {
    const { imageBase64, mediaType } = await resizeImageToBase64(file);
    const fileKey = `${file.name}_${file.size}`;

    const response = await fetch("/api/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        imageBase64,
        mediaType,
        fileKey,
      }),
    });

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw new Error("サーバーから正しい応答を受け取れませんでした。");
    }

    if (!response.ok) {
      throw new Error(payload.error || "写真判定に失敗しました。");
    }

    renderResults(payload.results);
  } catch (error) {
    setStatus(error.message || "写真判定に失敗しました。");
  }
}

if (fileInput && statusElement && resultsElement) {
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    identifyPhoto(file);
    fileInput.value = "";
  });
}