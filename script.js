import {
  GARBAGE_CATEGORIES,
  MUNICIPALITIES,
  getCollectionSchedule,
  getNextCollectionDate,
  loadSchedules,
  mapCategory,
} from "./src/utils/garbage-mapping.js";
import { DEFAULT_LOCATIONS } from "./src/config/municipalities.js";

const STORAGE_KEY = "move-gomi-navi.locations";

/*
 * 街ごとの設定（区名・データの場所・収集日の項目名・案内文など）は
 * src/config/municipalities.js にまとめている（MUNICIPALITIES として読み込む）。
 */

const CURBSIDE_OVERRIDE_NOTE =
  "資源の日に集積所へ出すことはできません。店頭・拠点の回収ボックスや指定の回収日を利用するか、集積所へ出す場合は可燃ごみの日に出してください。";

const DEFAULT_NON_REGULAR_GUIDE =
  "集積所での曜日収集はありません。回収の日時・場所は自治体の案内でご確認ください。";

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
  comparisonFilter: document.getElementById("comparison-filter"),
  comparisonMore: document.getElementById("comparison-more"),
  itemSearch: document.getElementById("item-search"),
  suggestions: document.getElementById("search-suggestions"),
  searchButton: document.getElementById("search-button"),
  cameraInput: document.getElementById("camera-input"),
  searchError: document.getElementById("search-error"),
  searchResult: document.getElementById("search-result"),
  matchedItem: document.getElementById("matched-item"),
  photoMockResult: document.getElementById("photo-mock-result"),
  scheduleResults: document.getElementById("schedule-results"),
  dataError: document.getElementById("data-error"),
};

const cityData = new Map();

/** 比較一覧を一度に表示する件数です（スマートフォンでのスクロール量を抑えるため）。 */
const COMPARISON_PAGE_SIZE = 30;
let comparisonLimit = COMPARISON_PAGE_SIZE;

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

function getTownRecord(location) {
  const data = cityData.get(location?.city);
  if (!data || !location?.town) return null;

  return data.schedules.find(
    (record) => normalize(record.town) === normalize(location.town),
  ) ?? null;
}

function getTownBlocks(townRecord) {
  return [
    ...new Set(
      (townRecord?.blocks ?? [])
        .flatMap((record) => record.target_blocks ?? [])
        .map(String)
        .filter((block) => block.trim() !== ""),
    ),
  ].sort((a, b) => Number(a) - Number(b));
}

function populateCityOptions() {
  const options = cityOptions();

  for (const location of Object.values(LOCATIONS)) {
    setOptions(location.city, options);
  }

  // 初期表示の自治体は src/config/municipalities.js の DEFAULT_LOCATIONS で決める
  const cityIds = Object.keys(MUNICIPALITIES);
  const currentDefault = cityIds.includes(DEFAULT_LOCATIONS.current)
    ? DEFAULT_LOCATIONS.current
    : cityIds[0];
  const previousDefault = cityIds.includes(DEFAULT_LOCATIONS.previous)
    ? DEFAULT_LOCATIONS.previous
    : cityIds.find((id) => id !== currentDefault) || currentDefault;

  LOCATIONS.current.city.value = currentDefault;
  LOCATIONS.previous.city.value = previousDefault;

  populateTowns("current");
  populateTowns("previous");
}

function populateTowns(locationName, preferredTown = "", preferredBlock = "") {
  const location = LOCATIONS[locationName];
  const data = cityData.get(location.city.value);

  location.town.replaceChildren(new Option("町名・地区を選択", ""));
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
  const townRecord = getTownRecord({
    city: location.city.value,
    town: location.town.value,
  });
  const blocks = getTownBlocks(townRecord);

  location.block.replaceChildren();

  if (blocks.length === 0) {
    location.block.add(new Option("（選択不要）", ""));
    location.block.value = "";
    location.block.disabled = true;
    return;
  }

  location.block.add(new Option("丁目を選択", ""));

  for (const block of blocks) {
    location.block.add(new Option(`${block}丁目`, block));
  }

  location.block.disabled = false;

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
  if (!location || !MUNICIPALITIES[location.city] || !location.town) {
    return false;
  }

  const townRecord = getTownRecord(location);
  if (!townRecord) return false;

  const blocks = getTownBlocks(townRecord);

  if (blocks.length === 0) {
    return !location.block;
  }

  return blocks.includes(String(location.block));
}

function formatLocation(location) {
  if (!locationIsComplete(location)) return "未設定";

  const municipalityName = MUNICIPALITIES[location.city].name;
  // 丁目がない町名・地区（例：毛呂山町のA地区）は丁目を付けずに表示する
  const blockSuffix = location.block ? `${location.block}丁目` : "";

  return `${municipalityName} ${location.town}${blockSuffix}`;
}

function hasSavedLocations() {
  return (
    locationIsComplete(appState.current) &&
    locationIsComplete(appState.previous)
  );
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
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ストレージが使えない環境では何もしない
    }
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

/**
 * 収集曜日の判定に使う分別区分を返します。
 * 品目名に「ペットボトル」を含んでも、カテゴリが資源プラスチックなどの場合は
 * 元データのカテゴリを優先し、定期収集区分の曜日を取得します。
 */
function getScheduleCategory(itemName, sourceCategory, cityId) {
  const mappedCategory = mapCategory(sourceCategory, cityId);

  if (
    normalize(itemName).includes("ペットボトル") &&
    (mappedCategory === GARBAGE_CATEGORIES.RESOURCE ||
      mappedCategory === GARBAGE_CATEGORIES.BOTTLE)
  ) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  return mappedCategory;
}

/*
 * 区の定期収集（集積所での曜日収集）がない品目の種類を返します。
 * 判定は category のみを使い、note は使用しません。
 * 定期収集区分がカテゴリ名に含まれる場合（例：「拠点回収または不燃ごみ」）は
 * 区でも収集するため null を返します。
 */
const NON_REGULAR_TYPES = Object.freeze({
  COLLECTIVE: "collective",
  DROP_OFF: "drop_off",
  STORE: "store",
});

const NON_REGULAR_LABELS = Object.freeze({
  [NON_REGULAR_TYPES.COLLECTIVE]: "曜日収集なし（集団回収）",
  [NON_REGULAR_TYPES.DROP_OFF]: "曜日収集なし（拠点回収）",
  [NON_REGULAR_TYPES.STORE]: "曜日収集なし（販売店・店頭回収）",
});

function getNonRegularType(item) {
  const category = normalize(getItemCategory(item));
  if (!category) return null;

  const regularCategoryPattern =
    /(資源|可燃|燃やす|燃える|不燃|燃やさない|燃えない|プラスチック|プラ|陶器.*ガラス.*金属|びん.*缶.*ペットボトル|缶.*ペットボトル|ペットボトル)/;

  if (regularCategoryPattern.test(category)) return null;
  if (/集団回収/.test(category)) return NON_REGULAR_TYPES.COLLECTIVE;
  if (/拠点回収/.test(category)) return NON_REGULAR_TYPES.DROP_OFF;
  if (/(販売店.*回収|回収ボックス|店頭回収)/.test(category)) {
    return NON_REGULAR_TYPES.STORE;
  }

  return null;
}

function isNonRegularCollection(item) {
  return getNonRegularType(item) !== null;
}

/*
 * 比較一覧用の区分です。集団回収・拠点回収などは、区の資源回収とは
 * 出し方が異なるため独立した区分として比較します。
 */
function getCurbsideOverride(item, cityId) {
  const overrides = MUNICIPALITIES[cityId]?.curbsideOverrides ?? {};
  const name = normalize(getItemName(item));

  for (const [overrideName, category] of Object.entries(overrides)) {
    if (normalize(overrideName) === name) return category;
  }

  return null;
}

function getNonRegularGuide(cityId, nonRegularType) {
  return (
    MUNICIPALITIES[cityId]?.nonRegularGuides?.[nonRegularType] ??
    DEFAULT_NON_REGULAR_GUIDE
  );
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

/** 収集曜日の文字列から「次回 11/20(金)」のような表示を作ります。判定できない場合は空文字。 */
function formatNextCollection(dayText, fromDate = new Date()) {
  const next = getNextCollectionDate(dayText, fromDate);
  if (!next) return "";

  if (next.isYearEnd) return "次回：年末年始のため自治体の案内を確認";

  const { date } = next;
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const diffDays = Math.round((date - today) / 86400000);
  const label = `${date.getMonth() + 1}/${date.getDate()}(${WEEKDAY_LABELS[date.getDay()]})`;

  if (diffDays === 0) return `次回：今日 ${label}`;
  if (diffDays === 1) return `次回：明日 ${label}`;
  return `次回：${label}`;
}

function getComparisonCategory(item, cityId) {
  const nonRegularType = getNonRegularType(item);
  if (nonRegularType) return `non_regular:${nonRegularType}`;

  const override = getCurbsideOverride(item, cityId);
  if (override) return `curbside:${override}`;

  return getScheduleCategory(
    getItemName(item),
    getItemCategory(item),
    cityId,
  );
}

function buildCommonItems() {
  if (!hasSavedLocations()) return [];

  const previousData = cityData.get(appState.previous.city);
  const currentData = cityData.get(appState.current.city);

  if (!previousData || !currentData) return [];

  const currentByName = new Map();

  for (const item of currentData.items) {
    const key = normalize(getItemName(item));
    if (key && !currentByName.has(key)) {
      currentByName.set(key, item);
    }
  }

  const seen = new Set();

  return previousData.items.flatMap((previousItem) => {
    const name = getItemName(previousItem);
    const key = normalize(name);
    const currentItem = currentByName.get(key);

    if (!key || seen.has(key) || !currentItem) return [];

    seen.add(key);

    const previousCategory = getComparisonCategory(
      previousItem,
      appState.previous.city,
    );
    const currentCategory = getComparisonCategory(
      currentItem,
      appState.current.city,
    );

    if (previousCategory === currentCategory) return [];

    return [{
      name,
      previousItem,
      currentItem,
    }];
  });
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text || "記載なし";
  return element;
}

function createExternalLink(url, label, className) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = className;
  link.textContent = label;
  return link;
}

/** "2026-11-25" → "2026年11月25日" */
function formatJapaneseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return "";
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

/*
 * 画面下の「データの出典」を、src/config/municipalities.js の sources から作る。
 * 自治体が増えても画面が長くならないよう折りたたみの枠に入れ、
 * 今・前に設定している自治体を先頭に表示する。
 */
function renderDataSources() {
  const list = document.getElementById("data-sources-list");
  const count = document.getElementById("data-sources-count");
  if (!list || !count) return;

  const selected = [appState.current?.city, appState.previous?.city].filter(Boolean);
  const rank = (cityId) => (selected.includes(cityId) ? selected.indexOf(cityId) : selected.length);
  const cityIds = Object.keys(MUNICIPALITIES).sort((a, b) => rank(a) - rank(b));

  list.replaceChildren();
  count.textContent = String(cityIds.length);

  for (const cityId of cityIds) {
    const municipality = MUNICIPALITIES[cityId];
    const section = document.createElement("section");
    section.className = "data-source-city";

    const heading = createTextElement("h3", "data-source-name", municipality.name);
    if (selected.includes(cityId)) {
      heading.append(createTextElement("span", "data-source-badge", "設定中"));
    }
    section.append(heading);

    const sources = Array.isArray(municipality.sources) ? municipality.sources : [];
    if (sources.length > 0) {
      const ul = document.createElement("ul");
      for (const source of sources) {
        const li = document.createElement("li");
        if (source.url) {
          li.append(createExternalLink(source.url, source.title, "data-source-link"));
        } else {
          li.textContent = source.title;
        }
        ul.append(li);
      }
      section.append(ul);
    } else {
      section.append(createTextElement("p", "data-source-meta", "出典：未記入"));
    }

    const verified = formatJapaneseDate(municipality.verifiedOn);
    section.append(
      createTextElement(
        "p",
        "data-source-meta",
        `収集日データの公式照合日：${verified || "未記入"}`,
      ),
    );

    list.append(section);
  }
}

/** 電話番号のリンク（スマートフォンでは押すと電話をかけられる） */
function createPhoneLink(phoneNumber, label, className) {
  const link = document.createElement("a");
  link.href = `tel:${String(phoneNumber).replace(/[^0-9+]/g, "")}`;
  link.className = className;
  link.textContent = label;
  return link;
}

/*
 * 粗大ごみの申込案内。自治体の設定に応じて、Web申込のボタンか電話のボタン（または両方）と、
 * 公式の案内ページへのリンクを表示する。
 */
function appendOversizedGuide(container, cityId) {
  const info = MUNICIPALITIES[cityId];
  if (!info?.oversizedApplicationUrl && !info?.oversizedApplicationTel) return;

  const guide = document.createElement("div");
  guide.className = "oversized-guide";

  guide.append(
    createTextElement(
      "p",
      "oversized-guide-note",
      "粗大ごみは事前申し込みが必要です。品目・手数料・収集日を申込先でご確認ください。",
    ),
  );

  if (info.oversizedApplicationUrl) {
    guide.append(
      createExternalLink(
        info.oversizedApplicationUrl,
        info.oversizedApplicationLabel || `${info.name} 粗大ごみ申込`,
        "oversized-application-link",
      ),
    );
  }

  if (info.oversizedApplicationTel) {
    guide.append(
      createPhoneLink(
        info.oversizedApplicationTel,
        info.oversizedApplicationTelLabel || `電話で申し込む ${info.oversizedApplicationTel}`,
        "oversized-application-link",
      ),
    );
  }

  if (info.oversizedDetailsUrl) {
    guide.append(
      createExternalLink(
        info.oversizedDetailsUrl,
        `${info.name}公式の粗大ごみ案内`,
        "oversized-details-link",
      ),
    );
  }

  container.append(guide);
}

function createComparisonCard(entry) {
  const card = document.createElement("article");
  card.className = "comparison-card";

  const heading = document.createElement("div");
  heading.className = "comparison-card-heading";
  heading.append(createTextElement("h3", "comparison-item-name", entry.name));

  const columns = document.createElement("div");
  columns.className = "comparison-card-columns";

  for (const [locationName, item] of [
    ["current", entry.currentItem],
    ["previous", entry.previousItem],
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
      createTextElement("p", "comparison-category", getItemCategory(item)),
      createTextElement("span", "detail-label", "注意事項"),
      createTextElement("p", "comparison-note", getItemNote(item)),
    );
    columns.append(cityCard);
  }

  card.append(heading, columns);
  return card;
}

/** 今の自治体の分別区分ごとの件数で、絞り込みの選択肢を作り直します（選択は維持）。 */
function populateComparisonFilter(differingItems) {
  const select = elements.comparisonFilter;
  const selected = select.value;
  const counts = new Map();

  for (const entry of differingItems) {
    const category = getItemCategory(entry.currentItem) || "カテゴリ未登録";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const options = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([category, count]) => [category, `${category}（${count}件）`]);

  setOptions(select, options, `すべての区分（${differingItems.length}件）`);
  select.value = counts.has(selected) ? selected : "";
}

function renderComparisonList() {
  const query = normalize(elements.comparisonSearch.value);
  const differingItems = buildCommonItems();

  populateComparisonFilter(differingItems);

  const categoryFilter = elements.comparisonFilter.value;
  const matches = differingItems.filter(
    (entry) =>
      (!query || normalize(entry.name).includes(query)) &&
      (!categoryFilter ||
        (getItemCategory(entry.currentItem) || "カテゴリ未登録") === categoryFilter),
  );

  elements.commonItemCount.textContent = `${matches.length}件`;
  elements.comparisonResults.replaceChildren();
  elements.comparisonMore.hidden = true;

  if (!hasSavedLocations()) {
    elements.comparisonMessage.textContent =
      "地域設定を保存すると、分別カテゴリが異なる共通品目を比較できます。";
    return;
  }

  const shown = matches.slice(0, comparisonLimit);

  elements.comparisonMessage.textContent =
    `分別カテゴリが異なる共通品目 ${differingItems.length}件のうち、条件に合う${matches.length}件中${shown.length}件を表示しています。`;

  if (matches.length === 0) {
    elements.comparisonResults.append(
      createTextElement("p", "empty-state", "条件に合う、分別カテゴリが異なる共通品目はありません。"),
    );
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const entry of shown) {
    fragment.append(createComparisonCard(entry));
  }

  elements.comparisonResults.append(fragment);

  if (matches.length > shown.length) {
    elements.comparisonMore.hidden = false;
    elements.comparisonMore.textContent =
      `もっと見る（残り${matches.length - shown.length}件）`;
  }
}

function resetComparisonList() {
  comparisonLimit = COMPARISON_PAGE_SIZE;
  renderComparisonList();
}

function getBlockSchedule(locationName) {
  const location = appState[locationName];

  if (!locationIsComplete(location)) {
    return {
      found: false,
      message: "地域設定が未完了です。",
    };
  }

  const data = cityData.get(location.city);
  const townRecord = getTownRecord(location);

  if (!data || !townRecord) {
    return {
      found: false,
      message: `${location.town}のスケジュールが見つかりません。`,
    };
  }

  const blocks = getTownBlocks(townRecord);

  if (blocks.length === 0) {
    const scheduleRecord = (townRecord.blocks ?? []).find(
      (record) => record?.schedule && typeof record.schedule === "object",
    );

    const schedule = scheduleRecord?.schedule ?? townRecord.schedule;

    if (schedule && typeof schedule === "object") {
      return {
        found: true,
        schedule,
      };
    }

    return {
      found: false,
      message: `${location.town}のスケジュールデータが見つかりません。`,
    };
  }

  const blockRecord = townRecord.blocks?.find((record) =>
    (record.target_blocks ?? []).some(
      (block) => String(block) === String(location.block),
    ),
  );

  if (!blockRecord) {
    return {
      found: false,
      message: `${location.town}${location.block}丁目のスケジュールが見つかりません。`,
    };
  }

  return {
    found: true,
    schedule: blockRecord.schedule ?? {},
  };
}

function getScheduleRows(locationName) {
  const location = appState[locationName];
  const { found, schedule, message } = getBlockSchedule(locationName);

  if (!found) {
    return {
      found: false,
      message,
      rows: [],
    };
  }

  const rows = MUNICIPALITIES[location.city]?.scheduleRows ??
    Object.keys(schedule).map((key) => ({ key, label: key }));

  return {
    found: true,
    rows: rows.map(({ key, label }) => ({
      label,
      day: schedule[key] || "-",
      next: schedule[key] ? formatNextCollection(schedule[key]) : "",
    })),
  };
}

function getAreaNotice(location) {
  if (!location) return "";

  const notice = (MUNICIPALITIES[location.city]?.areaNotices ?? []).find(
    (entry) =>
      normalize(entry.town) === normalize(location.town) &&
      entry.blocks.includes(String(location.block)),
  );

  return notice?.message ?? "";
}

function createScheduleNotes(location) {
  const fragment = document.createDocumentFragment();
  const areaNotice = getAreaNotice(location);

  if (areaNotice) {
    fragment.append(createTextElement("p", "area-notice", `⚠ ${areaNotice}`));
  }

  const notes = MUNICIPALITIES[location.city]?.scheduleNotes ?? [];

  if (notes.length > 0) {
    const list = document.createElement("ul");
    list.className = "schedule-notes";

    for (const note of notes) {
      list.append(createTextElement("li", "", note));
    }

    fragment.append(list);
  }

  return fragment;
}

function createScheduleCard(locationName) {
  const location = appState[locationName];
  const cityInfo = MUNICIPALITIES[location.city];
  const card = document.createElement("article");
  card.className = "schedule-card";

  const header = document.createElement("div");
  header.className = "schedule-card-header";
  header.append(
    createTextElement(
      "span",
      "result-tag",
      locationName === "current" ? "今の自治体" : "前の自治体",
    ),
    createTextElement("h3", "schedule-location", formatLocation(location)),
    createTextElement(
      "p",
      "designated-bag-info",
      cityInfo?.designatedBag ?? "指定ごみ袋の情報は自治体の案内をご確認ください。",
    ),
  );

  const content = document.createElement("div");
  content.className = "schedule-card-content";

  const result = getScheduleRows(locationName);

  if (!result.found) {
    content.append(createTextElement("p", "empty-state", result.message));
  } else {
    const list = document.createElement("dl");
    list.className = "schedule-list";

    for (const row of result.rows) {
      const rowElement = document.createElement("div");
      rowElement.className = "schedule-row";
      const dayElement = createTextElement("dd", "schedule-day", row.day);

      if (row.next) {
        dayElement.append(createTextElement("span", "schedule-next", row.next));
      }

      rowElement.append(
        createTextElement("dt", "schedule-category", row.label),
        dayElement,
      );
      list.append(rowElement);
    }

    const oversized = document.createElement("div");
    oversized.className = "schedule-row schedule-row-note";
    oversized.append(
      createTextElement("dt", "schedule-category", "粗大ごみ"),
      createTextElement("dd", "schedule-day", "曜日収集なし・個別申し込み"),
    );

    content.append(createScheduleNotes(location), list, oversized);
    appendOversizedGuide(content, location.city);
  }

  card.append(header, content);
  return card;
}

function renderScheduleList() {
  elements.scheduleResults.replaceChildren();

  if (!hasSavedLocations()) {
    elements.scheduleResults.append(
      createTextElement(
        "p",
        "empty-state",
        "スケジュールを確認するには、今の地域と前の地域を設定して保存してください。",
      ),
    );
    return;
  }

  elements.scheduleResults.append(
    createScheduleCard("current"),
    createScheduleCard("previous"),
  );
}

function findItem(items, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  return (
    items.find(
      (item) => normalize(getItemName(item)) === normalizedQuery,
    ) ?? null
  );
}

/** 括弧書き（「(飲食用)」など）を除いた品目名です。自治体間の表記揺れの吸収に使います。 */
function getBaseName(name) {
  return normalize(name).replace(/\(.*?\)/g, "");
}

function sortByRank(entries) {
  const seen = new Set();

  return entries
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.name.length - b.name.length ||
        a.name.localeCompare(b.name, "ja"),
    )
    .filter(({ name }) => {
      const key = normalize(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ name }) => name);
}

/**
 * 完全一致しなかったときの「似た品目」を返します。
 * 括弧を除いた名前が同じもの → 前方一致 → 部分一致 → 入力が品目名を含む、の順です。
 */
function findSimilarItems(items, query, limit = 6) {
  const key = normalize(query);
  const base = getBaseName(query);
  if (!key) return [];

  const entries = [];

  for (const item of items) {
    const name = getItemName(item);
    const nameKey = normalize(name);
    if (!nameKey) continue;

    const nameBase = getBaseName(name);
    let rank = null;

    if (base && nameBase === base) rank = 0;
    else if (nameKey.startsWith(key)) rank = 1;
    else if (nameKey.includes(key)) rank = 2;
    // 「ペットボトルのキャップ」→「キャップ」のように、末尾の語（主語）と一致するものを優先
    else if (nameBase.length >= 2 && key.endsWith(nameBase)) rank = 3;
    else if (nameBase.length >= 2 && key.includes(nameBase)) rank = 4;

    if (rank !== null) entries.push({ name, rank });
  }

  return sortByRank(entries).slice(0, limit);
}

/** 入力中の候補です。今・前の両方の自治体から部分一致で集めます。 */
function collectCandidates(query) {
  const key = normalize(query);
  if (!key || !hasSavedLocations()) return [];

  const entries = [];

  for (const locationName of ["current", "previous"]) {
    const data = cityData.get(appState[locationName].city);

    for (const item of data?.items ?? []) {
      const name = getItemName(item);
      const nameKey = normalize(name);
      if (!nameKey.includes(key)) continue;

      const rank = nameKey === key ? 0 : nameKey.startsWith(key) ? 1 : 2;
      entries.push({ name, rank });
    }
  }

  return sortByRank(entries).slice(0, 50);
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

    button.addEventListener("click", () => {
      elements.itemSearch.value = name;
      elements.suggestions.classList.add("hidden");
      searchItem(name);
    });

    list.append(button);
  }

  elements.suggestions.append(list);
  elements.suggestions.classList.remove("hidden");
  return candidates;
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
    const similarItems = findSimilarItems(data.items, query);

    return {
      valid: true,
      found: false,
      location,
      cityId: location.city,
      itemName: "—",
      category: "品目が見つかりません",
      day: "—",
      note: similarItems.length > 0
        ? `「${query}」と同じ名前の品目はありません。この自治体では下の名前で登録されている可能性があります。`
        : `「${query}」に一致する品目はありません。品目名を短くするか、別の言い方で検索してください。`,
      requiresApplication: false,
      similarItems,
    };
  }

  const itemName = getItemName(item);
  const sourceCategory = getItemCategory(item);
  const curbsideOverride = getCurbsideOverride(item, location.city);
  const scheduleCategory = curbsideOverride ?? getScheduleCategory(
    itemName,
    sourceCategory,
    location.city,
  );

  const schedule = getCollectionSchedule({
    municipalityId: location.city,
    schedules: data.schedules,
    town: location.town,
    block: location.block || undefined,
    category: scheduleCategory,
    note: getItemNote(item),
  });

  // 街の設定で表示名を指定している品目（例：世田谷区のペットボトル）は、その名前で表示する
  const displayOverride = Object.entries(
    MUNICIPALITIES[location.city]?.displayCategoryOverrides ?? {},
  ).find(([name]) => normalize(name) === normalize(itemName))?.[1];
  const displayCategory = displayOverride || sourceCategory || "カテゴリ未登録";

  const nonRegularType = getNonRegularType(item);
  const isNotCollected =
    schedule.category === GARBAGE_CATEGORIES.NOT_COLLECTED;
  const hasRegularDay =
    !nonRegularType && !schedule.requiresApplication && !isNotCollected &&
    Boolean(schedule.collectionDay);

  const notes = [
    curbsideOverride ? CURBSIDE_OVERRIDE_NOTE : "",
    getItemNote(item),
    nonRegularType
      ? getNonRegularGuide(location.city, nonRegularType)
      : schedule.note,
    hasRegularDay ? getAreaNotice(location) : "",
  ]
    .filter(Boolean)
    .filter((note, index, list) => list.indexOf(note) === index);

  let collectionDay;

  if (nonRegularType) {
    collectionDay = NON_REGULAR_LABELS[nonRegularType];
  } else if (schedule.requiresApplication) {
    collectionDay = "曜日収集なし（個別申し込み）";
  } else if (isNotCollected) {
    collectionDay = `${MUNICIPALITIES[location.city]?.name ?? "自治体"}では収集しません`;
  } else if (schedule.collectionDay) {
    const prefix = curbsideOverride ? "集積所では可燃ごみ：" : "";
    const next = formatNextCollection(schedule.collectionDay);
    collectionDay = `${prefix}${schedule.collectionDay}${next ? `\n${next}` : ""}`;
  } else {
    collectionDay = "—";
  }

  return {
    valid: true,
    found: true,
    location,
    cityId: location.city,
    itemName,
    category: displayCategory,
    day: collectionDay,
    note: notes.join("\n") || "追加の注意事項はありません。",
    requiresApplication: schedule.requiresApplication,
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
    result.valid ? result.category : "—";
  document.getElementById(`${prefix}-day`).textContent =
    result.valid ? result.day : "—";
  document.getElementById(`${prefix}-note`).textContent =
    result.valid ? result.note : "—";

  const noteElement = document.getElementById(`${prefix}-note`);
  const resultBody = noteElement.parentElement;
  resultBody.querySelector(".oversized-guide")?.remove();
  resultBody.querySelector(".similar-items")?.remove();

  if (result.valid && result.found && result.requiresApplication) {
    appendOversizedGuide(resultBody, result.cityId);
  }

  if (result.valid && !result.found && result.similarItems?.length > 0) {
    resultBody.append(createSimilarItems(result.similarItems));
  }
}

function createSimilarItems(names) {
  const container = document.createElement("div");
  container.className = "similar-items";
  container.append(createTextElement("p", "suggestions-heading", "似た品目（押すと検索します）"));

  const list = document.createElement("div");
  list.className = "suggestion-list";

  for (const name of names) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.textContent = name;
    button.addEventListener("click", () => searchItem(name));
    list.append(button);
  }

  container.append(list);
  return container;
}

function searchItem(selectedName = null) {
  elements.searchError.textContent = "";
  elements.photoMockResult.textContent = "";
  elements.photoMockResult.classList.add("hidden");

  if (!hasSavedLocations()) {
    elements.searchError.textContent = "先に地域設定を保存してください。";
    elements.settingsMessage.textContent =
      "今の地域と前の地域を設定して保存してください。";
    elements.settingsPanel.hidden = false;
    elements.toggleSettings.setAttribute("aria-expanded", "true");
    elements.toggleSettings.textContent = "設定を閉じる";
    return;
  }

  const query = (selectedName || elements.itemSearch.value).trim();

  if (!query) {
    elements.searchError.textContent = "調べたい品目を入力してください。";
    elements.itemSearch.focus();
    return;
  }

  if (selectedName) {
    elements.itemSearch.value = selectedName;
  } else {
    renderSuggestions();
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
}

function saveSettings() {
  const current = readLocation("current");
  const previous = readLocation("previous");

  if (!locationIsComplete(current) || !locationIsComplete(previous)) {
    elements.settingsMessage.textContent =
      "今の自治体・町名（地区）と、前の自治体・町名（地区）を選択してください。丁目がある場合は丁目も選択してください。";
    return;
  }

  appState = { current, previous };

  let persisted = true;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    console.warn(error);
    persisted = false;
  }

  elements.settingsMessage.textContent = persisted
    ? "地域設定を保存しました。"
    : "地域設定を反映しました（この端末では保存できないため、次回は再設定が必要です）。";
  elements.features.hidden = false;
  elements.settingsPanel.hidden = true;
  elements.toggleSettings.disabled = false;
  elements.toggleSettings.setAttribute("aria-expanded", "false");
  elements.toggleSettings.textContent = "地域設定を変更";

  updateLocationSummary();
  renderDataSources();
  elements.comparisonFilter.value = "";
  resetComparisonList();
  renderScheduleList();
  elements.searchResult.classList.add("hidden");
  elements.photoMockResult.classList.add("hidden");
}

async function loadCityData() {
  try {
    await Promise.all(
      Object.entries(MUNICIPALITIES).map(async ([cityId, municipality]) => {
        const itemUrl = municipality.itemsUrl;

        if (!itemUrl) {
          throw new Error(`${municipality.name}の品目データURLがありません。`);
        }

        const [schedules, response] = await Promise.all([
          loadSchedules(cityId),
          fetch(itemUrl),
        ]);

        if (!response.ok) {
          throw new Error(
            `${municipality.name}の品目データを読み込めませんでした。`,
          );
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
    renderDataSources();

    const configured = hasSavedLocations();
    elements.features.hidden = !configured;
    elements.settingsPanel.hidden = configured;
    // 未設定のまま設定パネルを閉じると何も表示されなくなるため、保存までは無効にする
    elements.toggleSettings.disabled = !configured;
    elements.toggleSettings.setAttribute("aria-expanded", String(!configured));
    elements.toggleSettings.textContent = configured
      ? "地域設定を変更"
      : "地域を設定中";

    if (!configured) {
      elements.settingsMessage.textContent =
        "最初に今の地域と前の地域を選択してください。丁目がある場合は丁目も選択してください。";
    }

    renderComparisonList();
    renderScheduleList();
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

  if (!willOpen && !hasSavedLocations()) {
    elements.settingsMessage.textContent =
      "地域設定を保存すると、比較・検索・スケジュールを使えます。";
    return;
  }

  elements.settingsPanel.hidden = !willOpen;
  elements.toggleSettings.setAttribute("aria-expanded", String(willOpen));
  elements.toggleSettings.textContent = willOpen
    ? "設定を閉じる"
    : "地域設定を変更";
});

elements.comparisonSearch.addEventListener("input", resetComparisonList);
elements.comparisonFilter.addEventListener("change", resetComparisonList);
elements.comparisonMore.addEventListener("click", () => {
  comparisonLimit += COMPARISON_PAGE_SIZE;
  renderComparisonList();
});

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

// カメラ・写真の選択（AI写真判定）は image-search.js で処理する

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

    if (targetId === "panel-schedule") {
      renderScheduleList();
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

// 出典はデータの読み込みに失敗しても表示できるよう、先に作っておく
renderDataSources();
loadCityData();
