import {
  CATEGORY_LABELS,
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

const elements = {
  municipality: document.getElementById("municipality"),
  town: document.getElementById("town"),
  townOptions: document.getElementById("town-options"),
  block: document.getElementById("block"),
  item: document.getElementById("item-search"),
  searchButton: document.getElementById("search-btn"),
  resultSection: document.getElementById("result-section"),
  resultStatus: document.getElementById("result-status"),
  resultLocation: document.getElementById("result-location"),
  resultItem: document.getElementById("result-item"),
  resultCategory: document.getElementById("result-category"),
  resultDay: document.getElementById("result-day"),
  resultNote: document.getElementById("result-note"),
  errorMessage: document.getElementById("error-message"),
};

const municipalityData = new Map();

function getRecords(json, keys) {
  if (Array.isArray(json)) return json;

  if (json && typeof json === "object") {
    for (const key of keys) {
      if (Array.isArray(json[key])) return json[key];
    }
  }

  return [];
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ 　\t\r\n]/g, "")
    .toLowerCase();
}

function getItemName(item) {
  if (typeof item === "string") return item;

  return (
    item?.item_name ??
    item?.name ??
    item?.item ??
    item?.品目名 ??
    item?.品目 ??
    item?.名称 ??
    item?.title ??
    ""
  );
}

function getItemCategory(item) {
  if (typeof item === "string") return "";

  return (
    item?.category_name ??
    item?.category ??
    item?.classification ??
    item?.garbage_category ??
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

function getTownNames(schedules) {
  return schedules
    .map((record) => record?.town)
    .filter((town) => typeof town === "string" && town.trim() !== "");
}

function setError(message = "") {
  elements.errorMessage.textContent = message;
}

function populateTownOptions() {
  const city = municipalityData.get(elements.municipality.value);

  elements.townOptions.replaceChildren();
  elements.block.replaceChildren();

  if (!city) return;

  const towns = getTownNames(city.schedules);

  for (const town of towns) {
    const option = document.createElement("option");
    option.value = town;
    elements.townOptions.append(option);
  }

  elements.block.add(new Option("丁目を選択してください", ""));
}

function updateBlockOptions() {
  const city = municipalityData.get(elements.municipality.value);
  const selectedTown = normalize(elements.town.value);

  elements.block.replaceChildren();
  elements.block.add(new Option("丁目を選択してください", ""));

  if (!city || !selectedTown) return;

  const townRecord = city.schedules.find(
    (record) => normalize(record?.town) === selectedTown,
  );

  if (!townRecord) return;

  const blocks = [
    ...new Set(
      (townRecord.blocks ?? []).flatMap((record) =>
        (record.target_blocks ?? []).map(String),
      ),
    ),
  ].sort((a, b) => Number(a) - Number(b));

  for (const block of blocks) {
    elements.block.add(new Option(`${block}丁目`, block));
  }
}

function findItem(items, searchText) {
  const query = normalize(searchText);
  if (!query) return null;

  return (
    items.find((item) => normalize(getItemName(item)) === query) ??
    items.find((item) => {
      const itemName = normalize(getItemName(item));
      return itemName && (itemName.includes(query) || query.includes(itemName));
    }) ??
    null
  );
}

function showResult({ city, town, block, itemName, category, schedule, note }) {
  elements.resultSection.classList.remove("hidden");

  elements.resultStatus.textContent = schedule.requiresApplication
    ? "粗大ごみのため、個別申し込みが必要です"
    : schedule.found
      ? "収集ルールが見つかりました"
      : "該当する収集曜日を確認できませんでした";

  elements.resultLocation.textContent =
    `${city.name} ${town}${block}丁目`;

  elements.resultItem.textContent = itemName || "品目";
  elements.resultCategory.textContent =
    schedule.categoryLabel ||
    CATEGORY_LABELS[category] ||
    CATEGORY_LABELS[GARBAGE_CATEGORIES.RESOURCE];

  elements.resultDay.textContent =
    schedule.collectionDay || (schedule.requiresApplication ? "曜日収集なし" : "未確認");

  const notes = [note, schedule.note].filter(Boolean);
  elements.resultNote.textContent = [...new Set(notes)].join("\n");
}

async function searchGarbageRule() {
  setError("");

  const cityId = elements.municipality.value;
  const city = municipalityData.get(cityId);
  const town = elements.town.value.trim();
  const block = elements.block.value;
  const searchText = elements.item.value.trim();

  if (!city) {
    setError("自治体データを読み込めませんでした。");
    return;
  }

  if (!town || !block || !searchText) {
    setError("自治体・町名・丁目・品目を入力してください。");
    return;
  }

  const item = findItem(city.items, searchText);

  if (!item) {
    setError(`「${searchText}」は品目データ内に見つかりませんでした。`);
    return;
  }

  const itemName = getItemName(item) || searchText;
  const sourceCategory = getItemCategory(item);
  const category = mapCategory(sourceCategory);

  const schedule = getCollectionSchedule({
    municipalityId: cityId,
    schedules: city.schedules,
    town,
    block,
    category,
    note: getItemNote(item),
  });

  showResult({
    city,
    town,
    block,
    itemName,
    category,
    schedule,
    note: getItemNote(item),
  });
}

async function initialize() {
  try {
    const cityIds = Object.keys(MUNICIPALITIES);

    await Promise.all(
      cityIds.map(async (cityId) => {
        const config = MUNICIPALITIES[cityId];
        const itemUrl = ITEM_DATA_URLS[cityId];

        if (!itemUrl) {
          throw new Error(`${config.name}の品目データ URL が設定されていません。`);
        }

        const [schedules, itemsResponse] = await Promise.all([
          loadSchedules(cityId),
          fetch(itemUrl),
        ]);

        if (!itemsResponse.ok) {
          throw new Error(
            `${config.name}の品目データを読み込めませんでした: ${itemsResponse.status}`,
          );
        }

        const itemsJson = await itemsResponse.json();

        municipalityData.set(cityId, {
          ...config,
          schedules,
          items: getRecords(itemsJson, ["items", "data", "records", "garbage_items"]),
        });
      }),
    );

    populateTownOptions();
  } catch (error) {
    console.error(error);
    setError(
      "自治体データの読み込みに失敗しました。ローカルサーバーから開いているか、JSON ファイルのパスを確認してください。",
    );
  }
}

elements.municipality.addEventListener("change", () => {
  elements.town.value = "";
  populateTownOptions();
});

elements.town.addEventListener("input", updateBlockOptions);
elements.searchButton.addEventListener("click", searchGarbageRule);

elements.item.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchGarbageRule();
  }
});

initialize();