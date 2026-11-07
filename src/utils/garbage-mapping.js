export const GARBAGE_CATEGORIES = Object.freeze({
  BURNABLE: "burnable",
  NON_BURNABLE: "non_burnable",
  PLASTIC: "plastic",
  BOTTLE: "bottle",
  GLASS: "glass",
  CAN: "can",
  RESOURCE: "resource",
  OVERSIZED: "oversized",
});

export const CATEGORY_LABELS = Object.freeze({
  [GARBAGE_CATEGORIES.BURNABLE]: "燃やすごみ",
  [GARBAGE_CATEGORIES.NON_BURNABLE]: "燃やさないごみ",
  [GARBAGE_CATEGORIES.PLASTIC]: "プラスチック",
  [GARBAGE_CATEGORIES.BOTTLE]: "ペットボトル",
  [GARBAGE_CATEGORIES.GLASS]: "びん",
  [GARBAGE_CATEGORIES.CAN]: "缶",
  [GARBAGE_CATEGORIES.RESOURCE]: "資源・その他",
  [GARBAGE_CATEGORIES.OVERSIZED]: "粗大ごみ",
});

/**
 * 自治体を追加するときは、この設定にデータファイルと
 * scheduleKeys の対応を追加してください。
 */
export const MUNICIPALITIES = {
  nakano: {
    name: "中野区",
    schedulesUrl: "data/nakano_garbage_schedules.json",
    scheduleKeys: {
      [GARBAGE_CATEGORIES.BURNABLE]: ["burnable"],
      [GARBAGE_CATEGORIES.NON_BURNABLE]: ["glass_metal"],
      [GARBAGE_CATEGORIES.PLASTIC]: ["plastic"],
      [GARBAGE_CATEGORIES.BOTTLE]: ["plastic"],
      [GARBAGE_CATEGORIES.GLASS]: ["glass_metal"],
      [GARBAGE_CATEGORIES.CAN]: ["glass_metal"],
      [GARBAGE_CATEGORIES.RESOURCE]: ["resource"],
    },
  },
  setagaya: {
    name: "世田谷区",
    schedulesUrl: "data/setagaya_garbage_schedules.json",
    scheduleKeys: {
      [GARBAGE_CATEGORIES.BURNABLE]: ["burnable"],
      [GARBAGE_CATEGORIES.NON_BURNABLE]: ["non_burnable"],
      [GARBAGE_CATEGORIES.PLASTIC]: ["plastic"],
      [GARBAGE_CATEGORIES.BOTTLE]: ["bottle"],
      [GARBAGE_CATEGORIES.GLASS]: ["resource"],
      [GARBAGE_CATEGORIES.CAN]: ["resource"],
      [GARBAGE_CATEGORIES.RESOURCE]: ["resource"],
    },
  },
};

/**
 * 自治体独自のカテゴリ名をアプリ共通カテゴリに対応付けます。
 * びん・缶・ペットボトルなど複数品目をまとめたカテゴリは
 * 資源・その他として扱い、曜日は別途自治体設定から取得します。
 */
export function mapCategory(sourceCategory) {
  const value = normalizeText(sourceCategory);

  if (!value) return GARBAGE_CATEGORIES.RESOURCE;

  if (/(粗大|大型|oversized|bulky)/.test(value)) {
    return GARBAGE_CATEGORIES.OVERSIZED;
  }

  if (/びん.*缶.*ペットボトル|缶.*ペットボトル/.test(value)) {
    return GARBAGE_CATEGORIES.RESOURCE;
  }

  if (/陶器.*ガラス.*金属/.test(value)) {
    return GARBAGE_CATEGORIES.NON_BURNABLE;
  }

  if (/(ペットボトル|petbottle|pet_bottle)/.test(value)) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  if (/(プラスチック|プラ|plastic)/.test(value)) {
    return GARBAGE_CATEGORIES.PLASTIC;
  }

  if (/(燃やさない|燃えない|不燃|nonburnable|non_burnable)/.test(value)) {
    return GARBAGE_CATEGORIES.NON_BURNABLE;
  }

  if (/(燃やす|燃える|可燃|burnable)/.test(value)) {
    return GARBAGE_CATEGORIES.BURNABLE;
  }

  if (/(びん|ビン|瓶|glass)/.test(value)) {
    return GARBAGE_CATEGORIES.GLASS;
  }

  if (/(缶|かん|can)/.test(value)) {
    return GARBAGE_CATEGORIES.CAN;
  }

  if (/(資源|resource|その他)/.test(value)) {
    return GARBAGE_CATEGORIES.RESOURCE;
  }

  return GARBAGE_CATEGORIES.RESOURCE;
}

/**
 * 自治体の収集スケジュール JSON を読み込みます。
 * JSON は提示された「town → blocks → target_blocks / schedule」
 * の配列形式を想定しています。
 */
export async function loadSchedules(municipalityId) {
  const municipality = MUNICIPALITIES[municipalityId];

  if (!municipality) {
    throw new Error(`未登録の自治体です: ${municipalityId}`);
  }

  const response = await fetch(municipality.schedulesUrl);

  if (!response.ok) {
    throw new Error(
      `${municipality.name}の収集スケジュールを読み込めませんでした: ${response.status}`,
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`${municipality.name}のスケジュール JSON は配列ではありません。`);
  }

  return data;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[ 　\t\r\n]/g, "")
    .toLowerCase();
}

function normalizeBlock(value) {
  return normalizeText(value)
    .replace(/丁目/g, "")
    .replace(/番地?/g, "")
    .replace(/号/g, "");
}

function getScheduleKey(municipality, category) {
  const keys = municipality.scheduleKeys?.[category];

  if (Array.isArray(keys)) return keys;
  if (typeof keys === "string") return [keys];

  // 新しい自治体で個別設定がない場合は、共通カテゴリ名を使います。
  return [category];
}

function findTownRecords(schedules, townName) {
  const targetTown = normalizeText(townName);

  return schedules.filter(
    (townRecord) => normalizeText(townRecord.town) === targetTown,
  );
}

function findBlockRecord(townRecords, blockNumber) {
  const targetBlock = normalizeBlock(blockNumber);

  const matches = townRecords.flatMap((townRecord) =>
    (townRecord.blocks ?? [])
      .filter((blockRecord) =>
        (blockRecord.target_blocks ?? []).some(
          (block) => normalizeBlock(block) === targetBlock,
        ),
      )
      .map((blockRecord) => ({
        townRecord,
        blockRecord,
      })),
  );

  return matches[0] ?? null;
}

/**
 * 自治体・町名・丁目・カテゴリから収集曜日を取得します。
 *
 * 粗大ごみは曜日を検索せず、個別申し込みが必要な結果を返します。
 *
 * @param {object} params
 * @param {string} params.municipalityId MUNICIPALITIES のキー
 * @param {Array} params.schedules loadSchedules() で読み込んだ配列
 * @param {string} params.town 町名（例: "新井"）
 * @param {string|number} params.block 丁目（例: "1" または "1丁目"）
 * @param {string} params.category 共通カテゴリ ID または自治体カテゴリ名
 * @param {string} [params.note] 品目データにある注意事項
 */
export function getCollectionSchedule({
  municipalityId,
  schedules,
  town,
  block,
  category,
  note = "",
}) {
  const municipality = MUNICIPALITIES[municipalityId];

  if (!municipality) {
    throw new Error(`未登録の自治体です: ${municipalityId}`);
  }

  const commonCategory = Object.values(GARBAGE_CATEGORIES).includes(category)
    ? category
    : mapCategory(category);

  if (commonCategory === GARBAGE_CATEGORIES.OVERSIZED) {
    return {
      found: true,
      category: commonCategory,
      categoryLabel: CATEGORY_LABELS[commonCategory],
      collectionDay: null,
      requiresApplication: true,
      note:
        note ||
        "粗大ごみは通常の収集曜日では回収されません。自治体への個別申し込みと、手数料の確認が必要です。",
    };
  }

  if (!Array.isArray(schedules)) {
    throw new TypeError("schedules には JSON 配列を指定してください。");
  }

  const townRecords = findTownRecords(schedules, town);

  if (townRecords.length === 0) {
    return {
      found: false,
      category: commonCategory,
      categoryLabel: CATEGORY_LABELS[commonCategory],
      collectionDay: null,
      requiresApplication: false,
      note: `${municipality.name}の「${town}」のスケジュールが見つかりません。`,
    };
  }

  if (block === undefined || block === null || String(block).trim() === "") {
    return {
      found: false,
      category: commonCategory,
      categoryLabel: CATEGORY_LABELS[commonCategory],
      collectionDay: null,
      requiresApplication: false,
      note: "正しい収集曜日を調べるには丁目の指定が必要です。",
    };
  }

  const match = findBlockRecord(townRecords, block);

  if (!match) {
    return {
      found: false,
      category: commonCategory,
      categoryLabel: CATEGORY_LABELS[commonCategory],
      collectionDay: null,
      requiresApplication: false,
      note: `${town}${block}丁目に一致するスケジュールが見つかりません。`,
    };
  }

  const schedule = match.blockRecord.schedule ?? {};
  const scheduleKeys = getScheduleKey(municipality, commonCategory);
  const collectionDay = scheduleKeys
    .map((key) => schedule[key])
    .find((day) => typeof day === "string" && day.trim() !== "");

  if (!collectionDay) {
    return {
      found: false,
      category: commonCategory,
      categoryLabel: CATEGORY_LABELS[commonCategory],
      collectionDay: null,
      requiresApplication: false,
      note: note || "このカテゴリの収集曜日データがありません。",
      matchedTown: match.townRecord.town,
      matchedBlocks: match.blockRecord.target_blocks,
    };
  }

  return {
    found: true,
    category: commonCategory,
    categoryLabel: CATEGORY_LABELS[commonCategory],
    collectionDay,
    requiresApplication: false,
    note,
    matchedTown: match.townRecord.town,
    matchedBlocks: match.blockRecord.target_blocks,
  };
}