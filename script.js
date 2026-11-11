import {
  GARBAGE_CATEGORIES,
  MUNICIPALITIES,
  getCollectionSchedule,
  loadSchedules,
  mapCategory,
} from "./src/utils/garbage-mapping.js";

const STORAGE_KEY = "move-gomi-navi.locations";

const ITEM_DATA_URLS = {
  nakano: "data/nakano_garbage_items.json",
  setagaya: "data/setagaya_garbage_items.json",
};

const LOCATIONS = {
  current: {
    city: document.getElementById("current-city"),
    town: document.getElementById("current-town"),
    block: document.getElementById("current-block"),
  },
  previous: {
    city: document.getElementById("previous-city"),
    town: document.getElementById("previous-town"),
    block: document.getElementById("previous-block"),
  },
};

const elements = {
  features: document.getElementById("app-features"),
  summary: document.getElementById("location-summary-text"),
  toggleSettings: document.getElementById("toggle-settings"),
  settingsPanel: document.getElementById("settings-panel"),
  settingsStatus: document.getElementById("settings-status"),
  settingsMessage: document.getElementById("settings-message"),
  saveSettings: document.getElementById("save-settings"),
  comparisonSearch: document.getElementById("comparison-search"),
  comparisonMessage: document.getElementById("comparison-message"),
  comparisonResults: document.getElementById("comparison-results"),
  commonItemCount: document.getElementById("common-item-count"),
  itemSearch: document.getElementById("item-search"),
  suggestions: document.getElementById("search-suggestions"),
  searchButton: document.getElementById("search-button"),
  cameraInput: document.getElementById("camera-input"),
  searchError: document.getElementById("search-error"),
  searchResult: document.getElementById("search-result"),
  matchedItem: document.getElementById("matched-item"),
  photoMockResult: document.getElementById("photo-mock-result"),
  dataError: document.getElementById("data-error"),
};

const cityData = new Map();

let appState = {
  current: null,
  previous: null,
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ 　\t\r\n]/g, "")
    .toLowerCase();
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
}

function getItemName(item) {
  return typeof item === "string"
    ? item
    : item?.name ?? item?.item_name ?? item?.item ?? "";
}

function getItemCategory(item) {
  return typeof item === "string"
    ? ""
    : item?.category ?? item?.category_name ?? item?.classification ?? "";
}

function getItemNote(item) {
  return typeof item === "string"
    ? ""
    : item?.note ?? item?.notes ?? item?.caution ?? item?.description ?? "";
}

function cityOptions() {
  return Object.entries(MUNICIPALITIES).map(([id, municipality]) => [
    id,
    municipality.name,
  ]);
}

function setOptions(select, options, placeholder = null) {
  select.replaceChildren();

  if (placeholder !== null) {
    select.add(new Option(placeholder, ""));
  }

  for (const [value, label] of options) {
    select.add(new Option(label, value));
  }
}

function populateCityOptions() {
  const options = cityOptions();

  for (const location of Object.values(LOCATIONS)) {
    setOptions(location.city, options);
  }

  const cityIds = Object.keys(MUNICIPALITIES);
  const currentDefault = cityIds.includes("setagaya") ? "setagaya" : cityIds[0];
  const previousDefault = cityIds.includes("nakano")
    ? "nakano"
    : cityIds.find((id) => id !== currentDefault) || currentDefault;

  LOCATIONS.current.city.value = currentDefault;
  LOCATIONS.previous.city.value = previousDefault;

  populateTowns("current");
  populateTowns("previous");
}

function populateTowns(locationName, preferredTown = "", preferredBlock = "") {
  const location = LOCATIONS[locationName];
  const data = cityData.get(location.city.value);

  location.town.replaceChildren(new Option("町名を選択", ""));
  location.block.replaceChildren(new Option("丁目を選択", ""));
  location.town.disabled = true;
  location.block.disabled = true;

  if (!data) return;

  for (const record of data.schedules) {
    if (record?.town) {
      location.town.add(new Option(record.town, record.town));
    }
  }

  location.town.disabled = false;

  if (
    preferredTown &&
    [...location.town.options].some((option) => option.value === preferredTown)
  ) {
    location.town.value = preferredTown;
    populateBlocks(locationName, preferredBlock);
  }
}

function populateBlocks(locationName, preferredBlock = "") {
  const location = LOCATIONS[locationName];
  const data = cityData.get(location.city.value);
  const townKey = normalize(location.town.value);

  location.block.replaceChildren(new Option("丁目を選択", ""));
  location.block.disabled = true;

  if (!data || !townKey) return;

  const townRecord = data.schedules.find(
    (record) => normalize(record.town) === townKey,
  );

  const blocks = [
    ...new Set(
      (townRecord?.blocks ?? []).flatMap((record) =>
        (record.target_blocks ?? []).map(String),
      ),
    ),
  ].sort((a, b) => Number(a) - Number(b));

  for (const block of blocks) {
    location.block.add(new Option(`${block}丁目`, block));
  }

  location.block.disabled = blocks.length === 0;

  if (blocks.includes(String(preferredBlock))) {
    location.block.value = String(preferredBlock);
  }
}

function readLocation(locationName) {
  const location = LOCATIONS[locationName];

  return {
    city: location.city.value,
    town: location.town.value,
    block: location.block.value,
  };
}

function locationIsComplete(location) {
  if (!location || !MUNICIPALITIES[location.city] || !location.town || !location.block) {
    return false;
  }

  const data = cityData.get(location.city);
  const townRecord = data?.schedules.find(
    (record) => normalize(record.town) === normalize(location.town),
  );

  return Boolean(
    townRecord?.blocks?.some((blockRecord) =>
      (blockRecord.target_blocks ?? []).some(
        (block) => String(block) === String(location.block),
      ),
    ),
  );
}

function formatLocation(location) {
  if (!locationIsComplete(location)) return "未設定";

  return `${MUNICIPALITIES[location.city].name} ${location.town}${location.block}丁目`;
}

function hasSavedLocations() {
  return locationIsComplete(appState.current) &&
    locationIsComplete(appState.previous);
}

function updateLocationSummary() {
  if (hasSavedLocations()) {
    elements.summary.textContent =
      `今：${formatLocation(appState.current)} ⇄ 前：${formatLocation(appState.previous)}`;
    elements.settingsStatus.textContent = "設定済み";
    elements.settingsStatus.classList.add("is-saved");
    return;
  }

  elements.summary.textContent = "今の自治体と前の自治体を設定してください";
  elements.settingsStatus.textContent = "未設定";
  elements.settingsStatus.classList.remove("is-saved");
}

function restoreSavedLocations() {
  let saved;

  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  if (!saved || typeof saved !== "object") return;

  for (const name of ["current", "previous"]) {
    const value = saved[name];

    if (!value || !MUNICIPALITIES[value.city]) continue;

    const location = LOCATIONS[name];
    location.city.value = value.city;
    populateTowns(name, value.town, value.block);
  }

  const current = readLocation("current");
  const previous = readLocation("previous");

  appState = {
    current: locationIsComplete(current) ? current : null,
    previous: locationIsComplete(previous) ? previous : null,
  };
}

function categoryEquivalent(category) {
  const value = normalize(category);

  if (/(可燃|燃やす|燃える)/.test(value)) {
    return "burnable";
  }

  return value;
}

function buildCommonItems() {
  if (!hasSavedLocations()) return [];

  const previousData = cityData.get(appState.previous.city);
  const currentData = cityData.get(appState.current.city);

  if (!previousData || !currentData) return [];

  const currentByName = new Map();

  for (const item of currentData.items) {
    const key = normalize(getItemName(item));
    if (key && !currentByName.has(key)) currentByName.set(key, item);
  }

  const seen = new Set();

  return previousData.items.flatMap((previousItem) => {
    const name = getItemName(previousItem);
    const key = normalize(name);

    if (!key || seen.has(key) || !currentByName.has(key)) return [];

    seen.add(key);

    return [{
      name,
      previousItem,
      currentItem: currentByName.get(key),
    }];
  });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text || "記載なし";
  return element;
}

function createComparisonCard(entry) {
  const card = document.createElement("article");
  card.className = "comparison-card";

  const previousCategory = getItemCategory(entry.previousItem);
  const currentCategory = getItemCategory(entry.currentItem);
  const previousNote = getItemNote(entry.previousItem);
  const currentNote = getItemNote(entry.currentItem);

  const differs =
    categoryEquivalent(previousCategory) !== categoryEquivalent(currentCategory) ||
    normalize(previousNote) !== normalize(currentNote);

  const heading = document.createElement("div");
  heading.className = "comparison-card-heading";
  heading.append(createTextElement("h3", "comparison-item-name", entry.name));
  heading.append(
    createTextElement(
      "span",
      differs ? "difference-badge is-different" : "difference-badge",
      differs ? "違いあり" : "同じルール",
    ),
  );

  const columns = document.createElement("div");
  columns.className = "comparison-card-columns";

  for (const [locationName, item, category, note] of [
    ["current", entry.currentItem, currentCategory, currentNote],
    ["previous", entry.previousItem, previousCategory, previousNote],
  ]) {
    const cityCard = document.createElement("section");
    cityCard.className = "comparison-city-card";
    cityCard.append(
      createTextElement(
        "h4",
        "comparison-city-name",
        `${locationName === "current" ? "今" : "前"}：${formatLocation(appState[locationName])}`,
      ),
      createTextElement("span", "detail-label", "分別カテゴリ"),
      createTextElement("p", "comparison-category", category),
      createTextElement("span", "detail-label", "注意事項"),
      createTextElement("p", "comparison-note", note),
    );
    columns.append(cityCard);
  }

  card.append(heading, columns);
  return card;
}

function renderComparisonList() {
  const query = normalize(elements.comparisonSearch.value);
  const commonItems = buildCommonItems();
  const matches = query
    ? commonItems.filter((entry) => normalize(entry.name).includes(query))
    : commonItems;

  elements.commonItemCount.textContent = `${matches.length}件`;
  elements.comparisonResults.replaceChildren();

  if (!hasSavedLocations()) {
    elements.comparisonMessage.textContent =
      "地域設定を保存すると、両自治体に共通する品目を比較できます。";
    return;
  }

  elements.comparisonMessage.textContent =
    `共通品目 ${commonItems.length}件のうち、${matches.length}件を表示しています。`;

  if (matches.length === 0) {
    elements.comparisonResults.append(
      createTextElement("p", "empty-state", "該当する共通品目はありません。"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of matches) {
    fragment.append(createComparisonCard(entry));
  }

  elements.comparisonResults.append(fragment);
}

function findItem(items, query) {
  const key = normalize(query);
  if (!key) return null;

  const exact = items.find((item) => normalize(getItemName(item)) === key);
  if (exact) return exact;

  const prefixMatches = items
    .filter((item) => normalize(getItemName(item)).startsWith(key))
    .sort((a, b) => getItemName(a).length - getItemName(b).length);

  if (prefixMatches.length > 0) return prefixMatches[0];

  return (
    items
      .filter((item) => normalize(getItemName(item)).includes(key))
      .sort((a, b) => getItemName(a).length - getItemName(b).length)[0] ?? null
  );
}

function collectCandidates(query) {
  const key = normalize(query);
  if (!key || !hasSavedLocations()) return [];

  const names = new Map();

  for (const cityId of [appState.current.city, appState.previous.city]) {
    const data = cityData.get(cityId);
    if (!data) continue;

    for (const item of data.items) {
      const name = getItemName(item);
      const normalizedName = normalize(name);

      if (normalizedName.includes(key) && !names.has(normalizedName)) {
        names.set(normalizedName, name);
      }
    }
  }

  return [...names.values()]
    .sort((a, b) => {
      const aKey = normalize(a);
      const bKey = normalize(b);
      const aRank = aKey === key ? 0 : aKey.startsWith(key) ? 1 : 2;
      const bRank = bKey === key ? 0 : bKey.startsWith(key) ? 1 : 2;

      return aRank - bRank || a.length - b.length || a.localeCompare(b, "ja");
    })
    .slice(0, 50);
}

function renderSuggestions() {
  const candidates = collectCandidates(elements.itemSearch.value);
  elements.suggestions.replaceChildren();

  if (!elements.itemSearch.value.trim() || candidates.length === 0) {
    elements.suggestions.classList.add("hidden");
    return candidates;
  }

  elements.suggestions.append(
    createTextElement("p", "suggestions-heading", `候補 ${candidates.length}件`),
  );

  const list = document.createElement("div");
  list.className = "suggestion-list";

  for (const name of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.setAttribute("role", "option");
    button.textContent = name;
    button.addEventListener("click", () => searchItem(name));
    list.append(button);
  }

  elements.suggestions.append(list);
  elements.suggestions.classList.remove("hidden");
  return candidates;
}

function getScheduleCategory(itemName, sourceCategory, cityId) {
  if (normalize(itemName).includes("ペットボトル")) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  return mapCategory(sourceCategory, cityId);
}

function getLocationItemResult(locationName, query) {
  const location = appState[locationName];
  const data = location && cityData.get(location.city);

  if (!locationIsComplete(location) || !data) {
    return {
      valid: false,
      message: "地域設定が未完了です。",
    };
  }

  const item = findItem(data.items, query);

  if (!item) {
    return {
      valid: true,
      found: false,
      cityName: MUNICIPALITIES[location.city].name,
      location,
      itemName: query,
      category: "品目が見つかりません",
      day: "—",
      note: "この自治体の品目データに該当する品目がありません。",
    };
  }

  const itemName = getItemName(item);
  const sourceCategory = getItemCategory(item);
  const category = getScheduleCategory(
    itemName,
    sourceCategory,
    location.city,
  );

  const schedule = getCollectionSchedule({
    municipalityId: location.city,
    schedules: data.schedules,
    town: location.town,
    block: location.block,
    category,
    note: getItemNote(item),
  });

  const displayCategory =
    location.city === "setagaya" &&
    normalize(itemName) === normalize("ペットボトル")
      ? "ペットボトル"
      : sourceCategory || "カテゴリ未登録";

  const notes = [getItemNote(item), schedule.note]
    .filter(Boolean)
    .filter((note, index, list) => list.indexOf(note) === index);

  return {
    valid: true,
    found: true,
    cityName: MUNICIPALITIES[location.city].name,
    location,
    itemName,
    category: displayCategory,
    day: schedule.requiresApplication
      ? "曜日収集なし（個別申し込み）"
      : schedule.collectionDay || "曜日を確認できません",
    note: notes.join("\n"),
  };
}

function renderLocationResult(locationName, result) {
  const prefix = locationName === "current" ? "current" : "previous";
  const locationElementId = locationName === "current"
    ? "current-location"
    : "previous-location-result";

  document.getElementById(locationElementId).textContent =
    result.valid ? formatLocation(result.location) : "";

  document.getElementById(`${prefix}-item`).textContent =
    result.valid ? result.itemName : "—";
  document.getElementById(`${prefix}-category`).textContent =
    result.valid ? result.category : result.message;
  document.getElementById(`${prefix}-day`).textContent =
    result.valid ? result.day : "—";
  document.getElementById(`${prefix}-note`).textContent =
    result.valid ? result.note || "追加の注意事項はありません。" : result.message;
}

function requireLocations() {
  if (hasSavedLocations()) return true;

  elements.settingsMessage.textContent =
    "今の地域と前の地域を設定して保存してください。";
  elements.settingsPanel.hidden = false;
  elements.toggleSettings.setAttribute("aria-expanded", "true");
  elements.toggleSettings.textContent = "設定を閉じる";
  return false;
}

function searchItem(selectedName = null, photoMock = false) {
  elements.searchError.textContent = "";
  elements.photoMockResult.textContent = "";
  elements.photoMockResult.classList.add("hidden");

  if (!requireLocations()) {
    elements.searchError.textContent = "先に地域設定を保存してください。";
    return;
  }

  const query = (selectedName || elements.itemSearch.value).trim();

  if (!query) {
    elements.searchError.textContent = "調べたい品目を入力してください。";
    elements.itemSearch.focus();
    return;
  }

  if (!selectedName) {
    const candidates = renderSuggestions();

    if (candidates.length > 1 && normalize(candidates[0]) !== normalize(query)) {
      elements.searchError.textContent = "候補から品目を選択してください。";
      return;
    }
  }

  const currentResult = getLocationItemResult("current", query);
  const previousResult = getLocationItemResult("previous", query);

  const matchedName = currentResult.found
    ? currentResult.itemName
    : previousResult.found
      ? previousResult.itemName
      : query;

  elements.matchedItem.textContent = `品目「${matchedName}」の比較`;
  renderLocationResult("current", currentResult);
  renderLocationResult("previous", previousResult);
  elements.searchResult.classList.remove("hidden");
  elements.suggestions.classList.add("hidden");

  if (photoMock) {
    elements.photoMockResult.textContent =
      `写真判定（モック）: 「${matchedName}」と判定しました。保存済みの今・前の地域で検索しています。`;
    elements.photoMockResult.classList.remove("hidden");
  }
}

function saveSettings() {
  const current = readLocation("current");
  const previous = readLocation("previous");

  if (!locationIsComplete(current) || !locationIsComplete(previous)) {
    elements.settingsMessage.textContent =
      "今の自治体・町名・丁目と、前の自治体・町名・丁目を選択してください。";
    return;
  }

  appState = { current, previous };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));

  elements.settingsMessage.textContent = "地域設定を保存しました。";
  elements.features.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.toggleSettings.setAttribute("aria-expanded", "false");
  elements.toggleSettings.textContent = "地域設定を変更";

  updateLocationSummary();
  renderComparisonList();
  elements.searchResult.classList.add("hidden");
  elements.photoMockResult.classList.add("hidden");
}

async function loadCityData() {
  try {
    await Promise.all(
      Object.entries(MUNICIPALITIES).map(async ([cityId, municipality]) => {
        const itemUrl = ITEM_DATA_URLS[cityId];

        if (!itemUrl) {
          throw new Error(`${municipality.name}の品目データURLがありません。`);
        }

        const [schedules, response] = await Promise.all([
          loadSchedules(cityId),
          fetch(itemUrl),
        ]);

        if (!response.ok) {
          throw new Error(`${municipality.name}の品目データを読み込めませんでした。`);
        }

        const payload = await response.json();

        cityData.set(cityId, {
          schedules,
          items: getItems(payload),
        });
      }),
    );

    populateCityOptions();
    restoreSavedLocations();
    updateLocationSummary();

    const configured = hasSavedLocations();
    elements.features.hidden = !configured;
    elements.settingsPanel.hidden = configured;
    elements.toggleSettings.setAttribute("aria-expanded", String(!configured));
    elements.toggleSettings.textContent = configured
      ? "地域設定を変更"
      : "設定を閉じる";

    if (!configured) {
      elements.settingsMessage.textContent =
        "最初に今の地域と前の地域を選択して保存してください。";
    }

    renderComparisonList();
    elements.dataError.textContent = "";
  } catch (error) {
    console.error(error);
    elements.dataError.textContent =
      "自治体データを読み込めませんでした。ローカルサーバーから開いているか、JSONファイルの場所を確認してください。";
  }
}

for (const name of ["current", "previous"]) {
  const location = LOCATIONS[name];

  location.city.addEventListener("change", () => {
    populateTowns(name);
  });

  location.town.addEventListener("change", () => {
    populateBlocks(name);
  });
}

elements.saveSettings.addEventListener("click", saveSettings);

elements.toggleSettings.addEventListener("click", () => {
  const willOpen = elements.settingsPanel.hidden;

  elements.settingsPanel.hidden = !willOpen;
  elements.toggleSettings.setAttribute("aria-expanded", String(willOpen));
  elements.toggleSettings.textContent = willOpen
    ? "設定を閉じる"
    : "地域設定を変更";
});

elements.comparisonSearch.addEventListener("input", renderComparisonList);

elements.itemSearch.addEventListener("input", renderSuggestions);
elements.itemSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchItem();
  }

  if (event.key === "Escape") {
    elements.suggestions.classList.add("hidden");
  }
});

elements.searchButton.addEventListener("click", () => searchItem());

elements.cameraInput.addEventListener("change", (event) => {
  if (!event.target.files?.[0]) return;

  elements.itemSearch.value = "ペットボトル";
  searchItem("ペットボトル", true);
  event.target.value = "";
});

for (const button of document.querySelectorAll("[data-tab-target]")) {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tabTarget;

    for (const tab of document.querySelectorAll("[data-tab-target]")) {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }

    for (const panel of document.querySelectorAll(".tab-panel")) {
      const active = panel.id === targetId;
      panel.classList.toggle("hidden", !active);
      panel.hidden = !active;
    }
  });
}

document.addEventListener("click", (event) => {
  if (
    !elements.suggestions.contains(event.target) &&
    event.target !== elements.itemSearch
  ) {
    elements.suggestions.classList.add("hidden");
  }
});

loadCityData();