import {
  GARBAGE_CATEGORIES,
  MUNICIPALITIES,
  getCollectionSchedule,
  loadSchedules,
  mapCategory,
} from "./src/utils/garbage-mapping.js";

const ITEM_DATA_URLS = {
  nakano: "data/nakano_garbage_items.json",
  setagaya: "data/setagaya_garbage_items.json",
};

const dataByCity = new Map();

const elements = {
  comparePreviousCity: document.getElementById("compare-previous-city"),
  compareNewCity: document.getElementById("compare-new-city"),
  comparisonSearch: document.getElementById("comparison-search"),
  comparisonMessage: document.getElementById("comparison-message"),
  comparisonResults: document.getElementById("comparison-results"),
  commonItemCount: document.getElementById("common-item-count"),
  searchCity: document.getElementById("search-city"),
  searchTown: document.getElementById("search-town"),
  searchBlock: document.getElementById("search-block"),
  itemSearch: document.getElementById("item-search"),
  searchButton: document.getElementById("search-button"),
  cameraInput: document.getElementById("camera-input"),
  searchError: document.getElementById("search-error"),
  searchResult: document.getElementById("search-result"),
  photoMockResult: document.getElementById("photo-mock-result"),
  dataError: document.getElementById("data-error"),
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

function setOptions(select, entries, placeholder = null) {
  select.replaceChildren();

  if (placeholder !== null) {
    select.add(new Option(placeholder, ""));
  }

  for (const [value, label] of entries) {
    select.add(new Option(label, value));
  }
}

function setDataError(message = "") {
  elements.dataError.textContent = message;
}

function getMunicipalityEntries() {
  return Object.entries(MUNICIPALITIES);
}

function initializeCitySelects() {
  const cities = getMunicipalityEntries().map(([id, municipality]) => [
    id,
    municipality.name,
  ]);

  setOptions(elements.comparePreviousCity, cities);
  setOptions(elements.compareNewCity, cities);
  setOptions(elements.searchCity, cities);

  elements.comparePreviousCity.value = "nakano";
  elements.compareNewCity.value = "setagaya";
  elements.searchCity.value = "setagaya";

  populateSearchTowns();
  renderComparisonList();
}

function populateSearchTowns() {
  const city = dataByCity.get(elements.searchCity.value);

  elements.searchTown.replaceChildren(new Option("町名を選択", ""));
  elements.searchTown.disabled = true;
  elements.searchBlock.replaceChildren(new Option("丁目を選択", ""));
  elements.searchBlock.disabled = true;

  if (!city) return;

  for (const record of city.schedules) {
    if (record?.town) {
      elements.searchTown.add(new Option(record.town, record.town));
    }
  }

  elements.searchTown.disabled = false;
}

function populateSearchBlocks() {
  const city = dataByCity.get(elements.searchCity.value);
  const selectedTown = normalize(elements.searchTown.value);

  elements.searchBlock.replaceChildren(new Option("丁目を選択", ""));
  elements.searchBlock.disabled = true;

  if (!city || !selectedTown) return;

  const townRecord = city.schedules.find(
    (record) => normalize(record.town) === selectedTown,
  );

  const blocks = [
    ...new Set(
      (townRecord?.blocks ?? []).flatMap((record) =>
        (record.target_blocks ?? []).map(String),
      ),
    ),
  ].sort((a, b) => Number(a) - Number(b));

  for (const block of blocks) {
    elements.searchBlock.add(new Option(`${block}丁目`, block));
  }

  elements.searchBlock.disabled = blocks.length === 0;
}

function buildCommonItems(previousCityId, newCityId) {
  const previousCity = dataByCity.get(previousCityId);
  const newCity = dataByCity.get(newCityId);

  if (!previousCity || !newCity) return [];

  const newItemsByName = new Map();

  for (const item of newCity.items) {
    const name = getItemName(item);
    const key = normalize(name);
    if (key && !newItemsByName.has(key)) {
      newItemsByName.set(key, item);
    }
  }

  const seen = new Set();

  return previousCity.items.flatMap((previousItem) => {
    const name = getItemName(previousItem);
    const key = normalize(name);

    if (!key || seen.has(key) || !newItemsByName.has(key)) return [];

    seen.add(key);

    return [{
      name,
      previousItem,
      newItem: newItemsByName.get(key),
    }];
  });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text || "記載なし";
  return element;
}

function createComparisonCard(entry, previousCityId, newCityId) {
  const card = document.createElement("article");
  card.className = "comparison-card";

  const heading = document.createElement("div");
  heading.className = "comparison-card-heading";
  heading.append(createTextElement("h3", "comparison-item-name", entry.name));

  const previousCategory = getItemCategory(entry.previousItem);
  const newCategory = getItemCategory(entry.newItem);
  const previousNote = getItemNote(entry.previousItem);
  const newNote = getItemNote(entry.newItem);
  const isDifferent =
    normalize(previousCategory) !== normalize(newCategory) ||
    normalize(previousNote) !== normalize(newNote);

  heading.append(
    createTextElement(
      "span",
      isDifferent ? "difference-badge is-different" : "difference-badge",
      isDifferent ? "違いあり" : "同じルール",
    ),
  );

  const columns = document.createElement("div");
  columns.className = "comparison-card-columns";

  const previousColumn = document.createElement("section");
  previousColumn.className = "comparison-city-card";
  previousColumn.append(
    createTextElement("h4", "comparison-city-name", MUNICIPALITIES[previousCityId].name),
    createTextElement("span", "detail-label", "分別カテゴリ"),
    createTextElement("p", "comparison-category", previousCategory),
    createTextElement("span", "detail-label", "注意事項"),
    createTextElement("p", "comparison-note", previousNote),
  );

  const newColumn = document.createElement("section");
  newColumn.className = "comparison-city-card";
  newColumn.append(
    createTextElement("h4", "comparison-city-name", MUNICIPALITIES[newCityId].name),
    createTextElement("span", "detail-label", "分別カテゴリ"),
    createTextElement("p", "comparison-category", newCategory),
    createTextElement("span", "detail-label", "注意事項"),
    createTextElement("p", "comparison-note", newNote),
  );

  columns.append(previousColumn, newColumn);
  card.append(heading, columns);

  return card;
}

function renderComparisonList() {
  const previousCityId = elements.comparePreviousCity.value;
  const newCityId = elements.compareNewCity.value;
  const query = normalize(elements.comparisonSearch.value);
  const commonItems = buildCommonItems(previousCityId, newCityId);
  const filteredItems = query
    ? commonItems.filter((entry) => normalize(entry.name).includes(query))
    : commonItems;

  elements.commonItemCount.textContent = `${filteredItems.length}件`;
  elements.comparisonResults.replaceChildren();

  if (commonItems.length === 0) {
    elements.comparisonMessage.textContent = "共通する品目がありません。";
    return;
  }

  elements.comparisonMessage.textContent = query
    ? `共通する品目 ${commonItems.length}件のうち、${filteredItems.length}件を表示しています。`
    : `両自治体に共通する品目 ${commonItems.length}件を表示しています。`;

  if (filteredItems.length === 0) {
    elements.comparisonResults.append(
      createTextElement("p", "empty-state", "検索条件に一致する品目はありません。"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of filteredItems) {
    fragment.append(
      createComparisonCard(entry, previousCityId, newCityId),
    );
  }

  elements.comparisonResults.append(fragment);
}

function findItem(items, query) {
  const key = normalize(query);
  if (!key) return null;

  const exact = items.find(
    (item) => normalize(getItemName(item)) === key,
  );

  if (exact) return exact;

  return (
    items
      .filter((item) => normalize(getItemName(item)).includes(key))
      .sort(
        (a, b) =>
          getItemName(a).length - getItemName(b).length,
      )[0] ?? null
  );
}

function getScheduleCategory(cityId, itemName, sourceCategory) {
  if (normalize(itemName).includes("ペットボトル")) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  return mapCategory(sourceCategory);
}

function getDisplayCategory(cityId, itemName, sourceCategory) {
  if (
    cityId === "setagaya" &&
    normalize(itemName) === normalize("ペットボトル")
  ) {
    return "ペットボトル";
  }

  return sourceCategory || "カテゴリ未登録";
}

function renderSearchResult(result) {
  document.getElementById("result-location").textContent =
    `${result.cityName} ${result.town}${result.block}丁目`;
  document.getElementById("result-item").textContent = result.itemName;
  document.getElementById("result-category").textContent =
    result.displayCategory;
  document.getElementById("result-day").textContent =
    result.collectionDay;
  document.getElementById("result-note").textContent =
    result.note || "追加の注意事項はありません。";

  elements.searchResult.classList.remove("hidden");
}

function searchIndividualItem({ photoMock = false } = {}) {
  elements.searchError.textContent = "";
  elements.photoMockResult.textContent = "";
  elements.photoMockResult.classList.add("hidden");

  const cityId = elements.searchCity.value;
  const city = dataByCity.get(cityId);
  const town = elements.searchTown.value;
  const block = elements.searchBlock.value;
  const query = elements.itemSearch.value.trim();

  if (!city || !town || !block || !query) {
    elements.searchError.textContent =
      "自治体・町名・丁目・品目を入力してください。";
    return;
  }

  const item = findItem(city.items, query);

  if (!item) {
    elements.searchError.textContent =
      `「${query}」に一致する品目が見つかりませんでした。`;
    elements.searchResult.classList.add("hidden");
    return;
  }

  const itemName = getItemName(item);
  const sourceCategory = getItemCategory(item);
  const scheduleCategory = getScheduleCategory(
    cityId,
    itemName,
    sourceCategory,
  );
  const schedule = getCollectionSchedule({
    municipalityId: cityId,
    schedules: city.schedules,
    town,
    block,
    category: scheduleCategory,
    note: getItemNote(item),
  });

  const collectionDay = schedule.requiresApplication
    ? "曜日収集なし（個別申し込み）"
    : schedule.collectionDay || "曜日を確認できません";

  const result = {
    cityName: city.name,
    town,
    block,
    itemName,
    displayCategory: getDisplayCategory(
      cityId,
      itemName,
      sourceCategory,
    ),
    collectionDay,
    note: [getItemNote(item), schedule.note]
      .filter(Boolean)
      .filter((note, index, notes) => notes.indexOf(note) === index)
      .join("\n"),
  };

  renderSearchResult(result);

  if (photoMock) {
    elements.photoMockResult.textContent =
      `写真判定（モック）: 「${itemName}」と判定しました。` +
      `${city.name}では「${result.displayCategory}」、` +
      `収集曜日は「${collectionDay}」です。`;
    elements.photoMockResult.classList.remove("hidden");
  }
}

async function loadCityData() {
  try {
    await Promise.all(
      Object.entries(MUNICIPALITIES).map(async ([cityId, municipality]) => {
        const itemUrl = ITEM_DATA_URLS[cityId];

        if (!itemUrl) {
          throw new Error(`${municipality.name}の品目データURLがありません。`);
        }

        const [schedules, itemResponse] = await Promise.all([
          loadSchedules(cityId),
          fetch(itemUrl),
        ]);

        if (!itemResponse.ok) {
          throw new Error(`${municipality.name}の品目データを読み込めませんでした。`);
        }

        const itemPayload = await itemResponse.json();

        dataByCity.set(cityId, {
          name: municipality.name,
          schedules,
          items: getItems(itemPayload),
        });
      }),
    );

    initializeCitySelects();
    setDataError("");
  } catch (error) {
    console.error(error);
    setDataError(
      "自治体データを読み込めませんでした。ローカルサーバーから開いているか、JSONファイルの場所を確認してください。",
    );
  }
}

for (const tabButton of document.querySelectorAll("[data-tab-target]")) {
  tabButton.addEventListener("click", () => {
    const targetId = tabButton.dataset.tabTarget;

    for (const button of document.querySelectorAll("[data-tab-target]")) {
      const isActive = button === tabButton;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    }

    for (const panel of document.querySelectorAll(".tab-panel")) {
      const isActive = panel.id === targetId;
      panel.classList.toggle("hidden", !isActive);
      panel.hidden = !isActive;
    }
  });
}

elements.comparePreviousCity.addEventListener("change", renderComparisonList);
elements.compareNewCity.addEventListener("change", renderComparisonList);
elements.comparisonSearch.addEventListener("input", renderComparisonList);

elements.searchCity.addEventListener("change", populateSearchTowns);
elements.searchTown.addEventListener("change", populateSearchBlocks);
elements.searchButton.addEventListener("click", () => searchIndividualItem());

elements.itemSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchIndividualItem();
});

elements.cameraInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  elements.itemSearch.value = "ペットボトル";
  searchIndividualItem({ photoMock: true });
  event.target.value = "";
});

loadCityData();