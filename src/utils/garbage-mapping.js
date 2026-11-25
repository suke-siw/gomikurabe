import { MUNICIPALITY_CONFIG } from "../config/municipalities.js";

export const GARBAGE_CATEGORIES = Object.freeze({
  BURNABLE: "burnable",
  NON_BURNABLE: "non_burnable",
  SETAGAYA_NON_BURNABLE: "setagaya_non_burnable",
  NAKANO_CERAMIC_GLASS_METAL: "nakano_ceramic_glass_metal",
  PLASTIC: "plastic",
  BOTTLE: "bottle",
  GLASS: "glass",
  CAN: "can",
  RESOURCE: "resource",
  HAZARDOUS: "hazardous",
  OVERSIZED: "oversized",
  NOT_COLLECTED: "not_collected",
});

export const CATEGORY_LABELS = Object.freeze({
  [GARBAGE_CATEGORIES.BURNABLE]: "燃やすごみ",
  [GARBAGE_CATEGORIES.NON_BURNABLE]: "燃やさないごみ",
  [GARBAGE_CATEGORIES.SETAGAYA_NON_BURNABLE]: "不燃ごみ",
  [GARBAGE_CATEGORIES.NAKANO_CERAMIC_GLASS_METAL]: "陶器・ガラス・金属ごみ",
  [GARBAGE_CATEGORIES.PLASTIC]: "プラスチック",
  [GARBAGE_CATEGORIES.BOTTLE]: "ペットボトル",
  [GARBAGE_CATEGORIES.GLASS]: "びん",
  [GARBAGE_CATEGORIES.CAN]: "缶",
  [GARBAGE_CATEGORIES.RESOURCE]: "資源・その他",
  [GARBAGE_CATEGORIES.HAZARDOUS]: "有害ごみ",
  [GARBAGE_CATEGORIES.OVERSIZED]: "粗大ごみ",
  [GARBAGE_CATEGORIES.NOT_COLLECTED]: "自治体では収集できないもの",
});

// 街ごとの設定は src/config/municipalities.js にまとめている
export const MUNICIPALITIES = MUNICIPALITY_CONFIG;

export function mapCategory(sourceCategory, municipalityId = "") {
  const value = normalizeText(sourceCategory);

  if (!value) return GARBAGE_CATEGORIES.RESOURCE;

  if (/(粗大|大型|oversized|bulky)/.test(value)) {
    return GARBAGE_CATEGORIES.OVERSIZED;
  }

  // 「区では収集できない」「市では収集しない」「町では回収できない」など自治体の種類によらず判定する。
  // ただし「不燃ごみもしくは区では回収できないもの」のように、収集する区分と並べて
  // 書かれている場合は、収集する区分を優先する（下の判定に進む）。
  const notCollected =
    /([区市町村]では(収集|回収)(でき|し)(ない|ません)|収集不可|引き?取り?不可|家電リサイクル法対象品目|パソコン)/.test(
      value,
    );
  const listedWithRegular =
    /(または|もしくは|又は)/.test(value) &&
    /(可燃|燃やす|燃やせ|燃える|不燃|燃えない|資源|プラ|びん|缶|ペットボトル)/.test(value);

  if (notCollected && !listedWithRegular) {
    return GARBAGE_CATEGORIES.NOT_COLLECTED;
  }

  // 電池類・蛍光灯・水銀体温計など（毛呂山町など、有害ごみを別区分で集める自治体）
  if (/有害/.test(value)) {
    return GARBAGE_CATEGORIES.HAZARDOUS;
  }

  if (/(可燃|燃やす|燃やせる|燃える|burnable)/.test(value)) {
    return GARBAGE_CATEGORIES.BURNABLE;
  }

  if (/陶器.*ガラス.*金属/.test(value)) {
    return municipalityId === "nakano"
      ? GARBAGE_CATEGORIES.NAKANO_CERAMIC_GLASS_METAL
      : GARBAGE_CATEGORIES.NON_BURNABLE;
  }

  if (/(不燃|燃やさない|燃やせない|燃えない|nonburnable|non_burnable)/.test(value)) {
    return municipalityId === "setagaya"
      ? GARBAGE_CATEGORIES.SETAGAYA_NON_BURNABLE
      : GARBAGE_CATEGORIES.NON_BURNABLE;
  }

  if (/びん.*缶.*ペットボトル|缶.*ペットボトル/.test(value)) {
    return GARBAGE_CATEGORIES.RESOURCE;
  }

  if (/(ペットボトル|petbottle|pet_bottle)/.test(value)) {
    return GARBAGE_CATEGORIES.BOTTLE;
  }

  if (/(プラスチック|プラ|plastic)/.test(value)) {
    return GARBAGE_CATEGORIES.PLASTIC;
  }

  // 「ガラス類」なども含む（「陶器・ガラス・金属ごみ」は上で判定済み）
  if (/(びん|ビン|瓶|ガラス|glass)/.test(value)) {
    return GARBAGE_CATEGORIES.GLASS;
  }

  if (/(缶|かん|can)/.test(value)) {
    return GARBAGE_CATEGORIES.CAN;
  }

  if (/(資源|resource|店頭回収|その他)/.test(value)) {
    return GARBAGE_CATEGORIES.RESOURCE;
  }

  return GARBAGE_CATEGORIES.RESOURCE;
}

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

  return [category];
}

function findTownRecords(schedules, townName) {
  const targetTown = normalizeText(townName);

  return schedules.filter(
    (record) => normalizeText(record.town) === targetTown,
  );
}

function findBlockRecord(townRecords, blockNumber) {
  const targetBlock = normalizeBlock(blockNumber);

  for (const townRecord of townRecords) {
    for (const blockRecord of townRecord.blocks ?? []) {
      const matchesBlock = (blockRecord.target_blocks ?? []).some(
        (block) => normalizeBlock(block) === targetBlock,
      );

      if (matchesBlock) {
        return { townRecord, blockRecord };
      }
    }
  }

  return null;
}

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

  const mappedCategory = Object.values(GARBAGE_CATEGORIES).includes(category)
    ? category
    : mapCategory(category, municipalityId);

  if (mappedCategory === GARBAGE_CATEGORIES.OVERSIZED) {
    return {
      found: true,
      category: mappedCategory,
      categoryLabel: CATEGORY_LABELS[mappedCategory],
      collectionDay: null,
      requiresApplication: true,
      note:
        note ||
        "粗大ごみは通常の収集曜日では回収されません。自治体への個別申し込みと、手数料の確認が必要です。",
    };
  }

  if (mappedCategory === GARBAGE_CATEGORIES.NOT_COLLECTED) {
    return {
      found: true,
      category: mappedCategory,
      categoryLabel: CATEGORY_LABELS[mappedCategory],
      collectionDay: null,
      requiresApplication: false,
      note:
        note ||
        "この品目は自治体では収集できません。販売店や専門業者などにご相談ください。",
    };
  }

  if (!Array.isArray(schedules)) {
    throw new TypeError("schedules には JSON 配列を指定してください。");
  }

  const townRecords = findTownRecords(schedules, town);

  if (townRecords.length === 0) {
    return {
      found: false,
      category: mappedCategory,
      categoryLabel: CATEGORY_LABELS[mappedCategory],
      collectionDay: null,
      requiresApplication: false,
      note: `${municipality.name}の「${town}」のスケジュールが見つかりません。`,
    };
  }

  const hasBlockData = townRecords.some((townRecord) =>
    (townRecord.blocks ?? []).some((blockRecord) =>
      (blockRecord.target_blocks ?? []).some(
        (targetBlock) => String(targetBlock).trim() !== "",
      ),
    ),
  );

  let match;

  if (block === undefined || block === null || String(block).trim() === "") {
    if (hasBlockData) {
      return {
        found: false,
        category: mappedCategory,
        categoryLabel: CATEGORY_LABELS[mappedCategory],
        collectionDay: null,
        requiresApplication: false,
        note: "収集曜日の確認には丁目の指定が必要です。",
      };
    }

    const townRecord = townRecords.find(
      (record) => Array.isArray(record.blocks) && record.blocks.length > 0,
    ) ?? townRecords[0];

    const blockRecord = townRecord.blocks?.find(
      (record) => record?.schedule && typeof record.schedule === "object",
    ) ?? {
      schedule: townRecord.schedule ?? {},
      target_blocks: [],
    };

    match = { townRecord, blockRecord };
  } else {
    match = findBlockRecord(townRecords, block);

    if (!match) {
      return {
        found: false,
        category: mappedCategory,
        categoryLabel: CATEGORY_LABELS[mappedCategory],
        collectionDay: null,
        requiresApplication: false,
        note: `${town}${/^\d+$/.test(String(block)) ? `${block}丁目` : `（${block}）`}に一致するスケジュールが見つかりません。`,
      };
    }
  }

  const schedule = match.blockRecord.schedule ?? {};
  const scheduleKeys = getScheduleKey(municipality, mappedCategory);
  const collectionDay = scheduleKeys
    .map((key) => schedule[key])
    .find((day) => typeof day === "string" && day.trim() !== "");

  if (!collectionDay) {
    return {
      found: false,
      category: mappedCategory,
      categoryLabel: CATEGORY_LABELS[mappedCategory],
      collectionDay: null,
      requiresApplication: false,
      note: note || "このカテゴリの収集曜日データがありません。",
      matchedTown: match.townRecord.town,
      matchedBlocks: match.blockRecord.target_blocks,
    };
  }

  return {
    found: true,
    category: mappedCategory,
    categoryLabel: CATEGORY_LABELS[mappedCategory],
    collectionDay,
    requiresApplication: false,
    note,
    matchedTown: match.townRecord.town,
    matchedBlocks: match.blockRecord.target_blocks,
  };
}

const WEEKDAY_INDEX = Object.freeze({
  日: 0,
  月: 1,
  火: 2,
  水: 3,
  木: 4,
  金: 5,
  土: 6,
});

/**
 * 収集曜日の文字列を、判定用のルールに変換します。
 * 対応する書式:
 *   "月曜日・木曜日"   → 毎週 月・木
 *   "第2・第4金曜日"   → 毎月 2回目・4回目の金曜日
 * 解釈できない書式の場合は空配列を返します（推測で日付を出さないため）。
 */
export function parseCollectionDays(dayText) {
  const text = normalizeText(dayText);
  if (!text) return [];

  // 「第1・第3金曜日」のほか、「第1・3金曜日」「第1金曜日」「第2・4水曜」のような書き方も読む
  const monthly = text.match(/^第(\d(?:[・,、]第?\d)*)([日月火水木金土])(?:曜日?)?$/);

  if (monthly) {
    const weeks = monthly[1].match(/\d/g).map(Number);
    return [{ weekday: WEEKDAY_INDEX[monthly[2]], weeks }];
  }

  // 「月曜日・木曜日」のほか、「月・木」「月曜・木曜」のような書き方も読む
  const parts = text.split(/[・,、]/);
  const rules = [];

  for (const part of parts) {
    const weekly = part.match(/^([日月火水木金土])(?:曜日?)?$/);
    if (!weekly) return [];
    rules.push({ weekday: WEEKDAY_INDEX[weekly[1]], weeks: null });
  }

  return rules;
}

function matchesRule(date, rule) {
  if (date.getDay() !== rule.weekday) return false;
  if (!rule.weeks) return true;

  // その月の何回目の曜日か（1日〜7日が1回目）
  const nth = Math.floor((date.getDate() - 1) / 7) + 1;
  return rule.weeks.includes(nth);
}

/**
 * 年末年始（12/29〜1/7）は年ごとに収集日が変わるため、日付を確定せず
 * 区の案内を確認するよう表示します（年始第1週のずれも考慮して1/7までとする）。
 */
export function isYearEndPeriod(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return (month === 12 && day >= 29) || (month === 1 && day <= 7);
}

/**
 * 次回の収集日を返します。当日が収集日の場合は当日を返します。
 * 祝日も通常どおり収集する前提です（世田谷区・中野区とも区の案内で確認済み）。
 * 返り値: { date: Date, isYearEnd: boolean } / 判定できない場合は null
 */
export function getNextCollectionDate(dayText, fromDate = new Date()) {
  const rules = parseCollectionDays(dayText);
  if (rules.length === 0) return null;

  const start = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );

  for (let offset = 0; offset < 70; offset += 1) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
    );

    if (rules.some((rule) => matchesRule(date, rule))) {
      return { date, isYearEnd: isYearEndPeriod(date) };
    }
  }

  return null;
}
