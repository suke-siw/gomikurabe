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

const locationSlots = {
  previous: {
    city: document.getElementById("previous-city"),
    town: document.getElementById("previous-town"),
    block: document.getElementById("previous-block"),
  },
  new: {
    city: document.getElementById("new-city"),
    town: document.getElementById("new-town"),
    block: document.getElementById("new-block"),
  },
};

const elements = {
  comparePreviousCity: document.getElementById("compare-previous-city"),
  compareNewCity: document.getElementById("compare-new-city"),
  comparisonSearch: document.getElementById("comparison-search"),
  comparisonMessage: document.getElementById("comparison-message"),
  comparisonResults: document.getElementById("comparison-results"),
  commonItemCount: document.getElementById("common-item-count"),
  itemSearch: document.getElementById("item-search"),
  searchSuggestions: document.getElementById("search-suggestions"),
  searchButton: document.getElementById("search-button"),
  cameraInput: document.getElementById("camera-input"),
  searchError: document.getElementById("search-error"),
  searchResult: document.getElementById("search-result"),
  matchedItem: document.getElementById("matched-item"),
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

function municipalityOptions() {
  return Object.entries(MUNICIPALITIES).map(([id, municipality]) => [
    id,
    municipality.name,
  ]);
}

function initializeCitySelects() {
  const options = municipalityOptions();

  setOptions(elements.comparePreviousCity, options);
  setOptions(elements.compareNewCity, options);

  for (const slot of Object.values(locationSlots)) {
    setOptions(slot.city, options);
  }

  elements.comparePreviousCity.value = "nakano";
  elements.compareNewCity.value = "setagaya";
  locationSlots.previous.city.value = "nakano";
  locationSlots.new.city.value = "setagaya";

  populateTowns("previous");
  populateTowns("new");
  renderComparisonList();
}

function populateTowns(slotName) {
  const slot = locationSlots[slotName];
  const city = dataByCity.get(slot.city.value);

  slot.town.replaceChildren(new Option("町名を選択", ""));
  slot.town.disabled = true;
  slot.block.replaceChildren(new Option("丁目を選択", ""));
  slot.block.disabled = true;

  if (!city) return;

  for (const record of city.schedules) {
    if (record?.town) {
      slot.town.add(new Option(record.town, record.town));
    }
  }

  slot.town.disabled = false;
}

function populateBlocks(slotName) {
  const slot = locationSlots[slotName];
  const city = dataByCity.get(slot.city.value);
  const selectedTown = normalize(slot.town.value);

  slot.block.replaceChildren(new Option("丁目を選択", ""));
  slot.block.disabled = true;

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
    slot.block.add(new Option(`${block}丁目`, block));
  }

  slot.block.disabled = blocks.length === 0;
}

function categoryEquivalent(category) {
  const value = normalize(category);

  if (/(可燃|燃やす|燃える)/.test(value)) {
    return "burnable";
  }

  return value;
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

  const previousCategory = getItemCategory(entry.previousItem);
  const newCategory = getItemCategory(entry.newItem);
  const previousNote = getItemNote(entry.previousItem);
  const newNote = getItemNote(entry.newItem);

  const differs =
    categoryEquivalent(previousCategory) !== categoryEquivalent(newCategory) ||
    normalize(previousNote) !== normalize(newNote);

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

  for (const [cityId, item, category, note] of [
    [previousCityId, entry.previousItem, previousCategory, previousNote],
    [newCityId, entry.newItem, newCategory, newNote],
  ]) {
    const cityCard = document.createElement("section");
    cityCard.className = "comparison-city-card";
    cityCard.append(
      createTextElement("h4", "comparison-city-name", MUNICIPALITIES[cityId].name),
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
  const previousCityId = elements.comparePreviousCity.value;
  const newCityId = elements.compareNewCity.value;
  const query = normalize(elements.comparisonSearch.value);
  const commonItems = buildCommonItems(previousCityId, newCityId);
  const matches = query
    ? commonItems.filter((entry) => normalize(entry.name).includes(query))
    : commonItems;

  elements.commonItemCount.textContent = `${matches.length}件`;
  elements.comparisonResults.replaceChildren();

  elements.comparisonMessage.textContent = query
    ? `共通品目 ${commonItems.length}件のうち、${matches.length}件を表示しています。`
    : `両自治体に共通する品目 ${commonItems.length}件を表示しています。`;

  if (matches.length === 0) {
    elements.comparisonResults.append(
      createTextElement("p", "empty-state", "該当する共通品目はありません。"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of matches) {
    fragment.append(createComparisonCard(entry, previousCityId, newCityId));
  }

  elements.comparisonResults.append(fragment);
}

function collectSearchCandidates(query) {
  const key = normalize(query);
  if (!key) return [];

  const cityIds = [
    locationSlots.previous.city.value,
    locationSlots.new.city.value,
  ];

  const uniqueNames = new Map();

  for (const cityId of cityIds) {
    const city = dataByCity.get(cityId);
    if (!city) continue;

    for (const item of city.items) {
      const name = getItemName(item);
      const normalizedName = normalize(name);
      if (!normalizedName || !normalizedName.includes(key)) continue;
      if (!uniqueNames.has(normalizedName)) {
        uniqueNames.set(normalizedName, name);
      }
    }
  }

  return [...uniqueNames.values()]
    .sort((a, b) => {
      const left = normalize(a);
      const right = normalize(b);
      const leftRank = left === key ? 0 : left.startsWith(key) ? 1 : 2;
      const rightRank = right === key ? 0 : right.startsWith(key) ? 1 : 2;

      return leftRank - rightRank || a.length - b.length || a.localeCompare(b, "ja");
    })
    .slice(0, 50);
}

function renderSearchSuggestions() {
  const query = elements.itemSearch.value.trim();
  const candidates = collectSearchCandidates(query);

  elements.searchSuggestions.replaceChildren();

  if (!query || candidates.length === 0) {
    elements.searchSuggestions.classList.add("hidden");
    return candidates;
  }

  const heading = createTextElement(
    "p",
    "suggestions-heading",
    `候補 ${candidates.length}件（先頭から優先順）`,
  );
  elements.searchSuggestions.append(heading);

  const list = document.createElement("div");
  list.className = "suggestion-list";

  for (const name of candidates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.setAttribute("role", "option");
    button.textContent = name;
    button.addEventListener("click", () => {
      elements.itemSearch.value = name;
      elements.searchSuggestions.classList.add("hidden");
      searchIndividualItem(name);
    });
    list.append(button);
  }

  elements.searchSuggestions.append(list);
  elements.searchSuggestions.classList.remove("hidden");
  return candidates;
}

function findItem(items, query) {
  const key = normalize(query);
  if (!key) return null;

  const exact = items.find(
    (item) => normalize(getItemName(item)) === key,
  );
  if (exact) return exact;

  const prefixes = items
    .filter((item) => normalize(getItemName(item)).startsWith(key))
    .sort((a, b) => getItemName(a).length - getItemName(b).length);
  if (prefixes.length > 0) return prefixes[0];

  return (
    items
      .filter((item) => normalize(getItemName(item)).includes(key))
      .sort((a, b) => getItemName(a).length - getItemName(b).length)[0] ?? null
  );
}

function getScheduleCategory(cityId, itemName, sourceCategory) {
  if (normalize(itemName).includes("ペットボトル")) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  return mapCategory(sourceCategory, cityId);
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

function getCityResult(slotName, query) {
  const slot = locationSlots[slotName];
  const city = dataByCity.get(slot.city.value);
  const town = slot.town.value;
  const block = slot.block.value;

  if (!city || !town || !block) {
    return {
      valid: false,
      message: "自治体・町名・丁目を選択してください。",
    };
  }

  const item = findItem(city.items, query);

  if (!item) {
    return {
      valid: true,
      found: false,
      city,
      town,
      block,
      itemName: query,
      displayCategory: "品目が見つかりません",
      collectionDay: "—",
      note: "この自治体の品目データに該当する品目がありません。",
    };
  }

  const itemName = getItemName(item);
  const sourceCategory = getItemCategory(item);
  const category = getScheduleCategory(
    slot.city.value,
    itemName,
    sourceCategory,
  );
  const schedule = getCollectionSchedule({
    municipalityId: slot.city.value,
    schedules: city.schedules,
    town,
    block,
    category,
    note: getItemNote(item),
  });

  const notes = [getItemNote(item), schedule.note]
    .filter(Boolean)
    .filter((note, index, values) => values.indexOf(note) === index);

  return {
    valid: true,
    found: true,
    city,
    town,
    block,
    itemName,
    displayCategory: getDisplayCategory(
      slot.city.value,
      itemName,
      sourceCategory,
    ),
    collectionDay: schedule.requiresApplication
      ? "曜日収集なし（個別申し込み）"
      : schedule.collectionDay || "曜日を確認できません",
    note: notes.join("\n"),
  };
}

function renderCityResult(slotName, result) {
  const prefix = slotName === "previous" ? "previous" : "new";

  if (!result.valid) {
    document.getElementById(`${prefix}-location`).textContent = "";
    document.getElementById(`${prefix}-item`).textContent = "—";
    document.getElementById(`${prefix}-category`).textContent = "—";
    document.getElementById(`${prefix}-day`).textContent = "—";
    document.getElementById(`${prefix}-note`).textContent = result.message;
    return;
  }

  document.getElementById(`${prefix}-location`).textContent =
    `${result.city.name} ${result.town}${result.block}丁目`;
  document.getElementById(`${prefix}-item`).textContent = result.itemName;
  document.getElementById(`${prefix}-category`).textContent =
    result.displayCategory;
  document.getElementById(`${prefix}-day`).textContent =
    result.collectionDay;
  document.getElementById(`${prefix}-note`).textContent =
    result.note || "追加の注意事項はありません。";
}

function searchIndividualItem(selectedName = null, photoMock = false) {
  elements.searchError.textContent = "";
  elements.photoMockResult.textContent = "";
  elements.photoMockResult.classList.add("hidden");

  const query = (selectedName || elements.itemSearch.value).trim();

  if (!query) {
    elements.searchError.textContent = "調べたい品目を入力してください。";
    elements.itemSearch.focus();
    return;
  }

  if (!selectedName) {
    const candidates = renderSearchSuggestions();

    if (candidates.length > 1 && normalize(candidates[0]) !== normalize(query)) {
      elements.searchError.textContent =
        "候補から品目を選択してください。";
      return;
    }
  }

  const previousResult = getCityResult("previous", query);
  const newResult = getCityResult("new", query);

  if (!previousResult.valid || !newResult.valid) {
    elements.searchError.textContent =
      "引っ越し前後それぞれの自治体・町名・丁目を選択してください。";
    return;
  }

  const matchedName = newResult.found
    ? newResult.itemName
    : previousResult.found
      ? previousResult.itemName
      : query;

  elements.matchedItem.textContent = `品目「${matchedName}」の比較`;
  renderCityResult("previous", previousResult);
  renderCityResult("new", newResult);
  elements.searchResult.classList.remove("hidden");
  elements.searchSuggestions.classList.add("hidden");

  if (photoMock) {
    elements.photoMockResult.textContent =
      `写真判定（モック）: 「${matchedName}」と判定しました。` +
      `引っ越し前後のルールを表示しています。`;
    elements.photoMockResult.classList.remove("hidden");
  }
}

function setCitySelects() {
  const options = municipalityOptions();

  setOptions(elements.comparePreviousCity, options);
  setOptions(elements.compareNewCity, options);

  for (const slot of Object.values(locationSlots)) {
    setOptions(slot.city, options);
  }

  elements.comparePreviousCity.value = "nakano";
  elements.compareNewCity.value = "setagaya";
  locationSlots.previous.city.value = "nakano";
  locationSlots.new.city.value = "setagaya";

  populateTowns("previous");
  populateTowns("new");
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

    setCitySelects();
    setDataError("");
  } catch (error) {
    console.error(error);
    setDataError(
      "自治体データを読み込めませんでした。ローカルサーバーから開いているか、JSONファイルの場所を確認してください。",
    );
  }
}

function setActiveTab(tabButton) {
  const targetId = tabButton.dataset.tabTarget;

  for (const button of document.querySelectorAll("[data-tab-target]")) {
    const active = button === tabButton;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }

  for (const panel of document.querySelectorAll(".tab-panel")) {
    const active = panel.id === targetId;
    panel.classList.toggle("hidden", !active);
    panel.hidden = !active;
  }
}

for (const button of document.querySelectorAll("[data-tab-target]")) {
  button.addEventListener("click", () => setActiveTab(button));
}

elements.comparePreviousCity.addEventListener("change", renderComparisonList);
elements.compareNewCity.addEventListener("change", renderComparisonList);
elements.comparisonSearch.addEventListener("input", renderComparisonList);

for (const [slotName, slot] of Object.entries(locationSlots)) {
  slot.city.addEventListener("change", () => populateTowns(slotName));
  slot.town.addEventListener("change", () => populateBlocks(slotName));
}

elements.itemSearch.addEventListener("input", renderSearchSuggestions);
elements.itemSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchIndividualItem();
  }

  if (event.key === "Escape") {
    elements.searchSuggestions.classList.add("hidden");
  }
});

elements.searchButton.addEventListener("click", () => searchIndividualItem());

elements.cameraInput.addEventListener("change", (event) => {
  if (!event.target.files?.[0]) return;

  elements.itemSearch.value = "ペットボトル";
  searchIndividualItem("ペットボトル", true);
  event.target.value = "";
});

document.addEventListener("click", (event) => {
  if (
    !elements.searchSuggestions.contains(event.target) &&
    event.target !== elements.itemSearch
  ) {
    elements.searchSuggestions.classList.add("hidden");
  }
});

loadCityData();