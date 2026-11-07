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

const CITY_SLOTS = {
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
  item: document.getElementById("item-search"),
  searchButton: document.getElementById("search-btn"),
  searchIconButton: document.getElementById("search-icon-btn"),
  cameraInput: document.getElementById("camera-input"),
  error: document.getElementById("error-message"),
  resultSection: document.getElementById("result-section"),
  matchedItem: document.getElementById("matched-item"),
  photoMock: document.getElementById("photo-mock-result"),
};

const municipalityData = new Map();

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ 　\t\r\n]/g, "")
    .toLowerCase();
}

function getRecords(payload, propertyNames) {
  if (Array.isArray(payload)) return payload;

  for (const propertyName of propertyNames) {
    if (Array.isArray(payload?.[propertyName])) {
      return payload[propertyName];
    }
  }

  return [];
}

function getItemName(item) {
  if (typeof item === "string") return item;

  return (
    item?.name ??
    item?.item_name ??
    item?.item ??
    item?.品目名 ??
    item?.品目 ??
    ""
  );
}

function getItemCategory(item) {
  if (typeof item === "string") return "";

  return (
    item?.category ??
    item?.category_name ??
    item?.classification ??
    item?.分別区分 ??
    item?.分別 ??
    item?.区分 ??
    ""
  );
}

function getItemNote(item) {
  if (typeof item === "string") return "";

  return (
    item?.note ??
    item?.notes ??
    item?.caution ??
    item?.remarks ??
    item?.description ??
    item?.注意事項 ??
    item?.備考 ??
    ""
  );
}

function setError(message = "") {
  elements.error.textContent = message;
}

function addOption(select, value, label) {
  select.add(new Option(label, value));
}

function resetSelect(select, placeholder) {
  select.replaceChildren();
  addOption(select, "", placeholder);
  select.disabled = true;
}

function populateCitySelects() {
  const cityEntries = Object.entries(MUNICIPALITIES);

  for (const slot of Object.values(CITY_SLOTS)) {
    slot.city.replaceChildren();

    for (const [cityId, municipality] of cityEntries) {
      addOption(slot.city, cityId, municipality.name);
    }
  }

  CITY_SLOTS.previous.city.value = "nakano";
  CITY_SLOTS.new.city.value = "setagaya";

  populateTowns("previous");
  populateTowns("new");
}

function populateTowns(slotName) {
  const slot = CITY_SLOTS[slotName];
  const city = municipalityData.get(slot.city.value);

  resetSelect(slot.town, "町名を選択");
  resetSelect(slot.block, "丁目を選択");

  if (!city) return;

  const towns = city.schedules
    .map((record) => record.town)
    .filter((town) => typeof town === "string" && town.trim())
    .sort((a, b) => a.localeCompare(b, "ja"));

  for (const town of towns) {
    addOption(slot.town, town, town);
  }

  slot.town.disabled = false;
}

function populateBlocks(slotName) {
  const slot = CITY_SLOTS[slotName];
  const city = municipalityData.get(slot.city.value);
  const selectedTown = normalize(slot.town.value);

  resetSelect(slot.block, "丁目を選択");

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
    addOption(slot.block, block, `${block}丁目`);
  }

  if (blocks.length > 0) {
    slot.block.disabled = false;
  } else {
    resetSelect(slot.block, "丁目データがありません");
  }
}

function findItem(items, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const namedItems = items
    .map((item) => ({ item, name: getItemName(item) }))
    .filter((entry) => entry.name);

  const exact = namedItems.find(
    (entry) => normalize(entry.name) === normalizedQuery,
  );

  if (exact) return exact;

  const matches = namedItems
    .filter((entry) => normalize(entry.name).includes(normalizedQuery))
    .sort((a, b) => a.name.length - b.name.length);

  return matches[0] ?? null;
}

function getScheduleCategory(itemName, sourceCategory) {
  if (normalize(itemName) === normalize("ペットボトル")) {
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

function getCityResult(slotName, query) {
  const slot = CITY_SLOTS[slotName];
  const city = municipalityData.get(slot.city.value);
  const town = slot.town.value;
  const block = slot.block.value;

  if (!city || !town || !block) {
    return {
      valid: false,
      message: "自治体・町名・丁目を選択してください。",
    };
  }

  const match = findItem(city.items, query);

  if (!match) {
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

  const itemName = match.name;
  const item = match.item;
  const sourceCategory = getItemCategory(item);
  const scheduleCategory = getScheduleCategory(itemName, sourceCategory);

  const schedule = getCollectionSchedule({
    municipalityId: slot.city.value,
    schedules: city.schedules,
    town,
    block,
    category: scheduleCategory,
    note: getItemNote(item),
  });

  const notes = [getItemNote(item), schedule.note].filter(Boolean);

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
    note: [...new Set(notes)].join("\n"),
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

function runSearch({ photoMock = false } = {}) {
  setError("");

  const query = elements.item.value.trim();

  if (!query) {
    setError("調べたい品目を入力してください。");
    elements.item.focus();
    return;
  }

  const previousResult = getCityResult("previous", query);
  const newResult = getCityResult("new", query);

  if (!previousResult.valid || !newResult.valid) {
    setError("引っ越し前後の自治体・町名・丁目を選択してください。");
    return;
  }

  const matchedName = newResult.found
    ? newResult.itemName
    : previousResult.found
      ? previousResult.itemName
      : query;

  elements.matchedItem.textContent =
    `「${query}」の検索結果（品目: ${matchedName}）`;

  renderCityResult("previous", previousResult);
  renderCityResult("new", newResult);
  elements.resultSection.classList.remove("hidden");

  if (photoMock) {
    elements.photoMock.textContent = newResult.found
      ? `写真判定（モック）: 「${newResult.itemName}」と判定しました。${newResult.city.name}では「${newResult.sourceCategory || "カテゴリ未登録"}」、収集曜日は「${newResult.collectionDay}」です。`
      : "写真判定（モック）: ペットボトルと判定しました。品目データに一致する情報がありません。";
    elements.photoMock.classList.remove("hidden");
  } else {
    elements.photoMock.textContent = "";
    elements.photoMock.classList.add("hidden");
  }
}

async function loadMunicipalityData() {
  setError("");

  try {
    await Promise.all(
      Object.entries(MUNICIPALITIES).map(async ([cityId, municipality]) => {
        const itemUrl = ITEM_DATA_URLS[cityId];

        if (!itemUrl) {
          throw new Error(`${municipality.name}の品目データURLがありません。`);
        }

        const [schedules, itemsResponse] = await Promise.all([
          loadSchedules(cityId),
          fetch(itemUrl),
        ]);

        if (!itemsResponse.ok) {
          throw new Error(
            `${municipality.name}の品目データを読み込めませんでした。`,
          );
        }

        const itemsJson = await itemsResponse.json();

        municipalityData.set(cityId, {
          ...municipality,
          schedules,
          items: getRecords(itemsJson, ["items", "data", "records"]),
        });
      }),
    );

    populateCitySelects();
  } catch (error) {
    console.error(error);
    setError(
      "データを読み込めませんでした。ローカルサーバーから開いているか、JSONファイルのパスを確認してください。",
    );
  }
}

for (const [slotName, slot] of Object.entries(CITY_SLOTS)) {
  slot.city.addEventListener("change", () => populateTowns(slotName));
  slot.town.addEventListener("change", () => populateBlocks(slotName));
}

elements.searchButton.addEventListener("click", () => runSearch());
elements.searchIconButton.addEventListener("click", () => runSearch());

elements.item.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runSearch();
});

elements.cameraInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  elements.item.value = "ペットボトル";
  runSearch({ photoMock: true });
  event.target.value = "";
});

loadMunicipalityData();