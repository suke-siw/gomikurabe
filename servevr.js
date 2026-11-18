import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const DEMO_ONLY = process.env.DEMO_ONLY === "1";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const NAKANO_ITEMS_PATH = path.join(
  __dirname,
  "data",
  "nakano_garbage_items.json",
);
const SETAGAYA_ITEMS_PATH = path.join(
  __dirname,
  "data",
  "setagaya_garbage_items.json",
);
const CACHE_PATH = path.join(__dirname, "results_cache.json");

app.use(express.json({ limit: "15mb" }));
app.use(express.static(__dirname));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

let municipalityItemsPromise;

const CATEGORY_MAP = {
  nakano: {
    "燃やすごみ": "可燃",
    "陶器・ガラス・金属ごみ": "不燃",
    "資源プラスチック": "資源",
    "びん・缶・ペットボトル": "資源",
    "古紙(集団回収)": "資源",
    "古着・古布(集団回収)": "資源",
    "粗大ごみ": "粗大",
    "使用済小型家電(拠点回収)": "拠点回収",
    "乾電池(拠点回収)": "拠点回収",
    "食用油(拠点回収)": "拠点回収",
    "使用済蛍光管(拠点回収)": "拠点回収",
    "インクカートリッジ(拠点回収)": "拠点回収",
    "区では収集しないもの": "収集不可",
    "家電リサイクル法対象品目": "収集不可",
    "パソコン": "収集不可",
  },
  setagaya: {
    "可燃ごみ": "可燃",
    "不燃ごみ": "不燃",
    "資源": "資源",
    "粗大ごみ": "粗大",
    "区では収集できないもの": "収集不可",
  },
};

const ALIAS = {
  "クリアファイル": "プラスチック類",
};

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/※.*$/g, "")
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[ 　\t\r\n]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCategory(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ 　\t\r\n]/g, "")
    .trim();
}

function getItems(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

async function loadMunicipalityItems() {
  if (!municipalityItemsPromise) {
    municipalityItemsPromise = Promise.all([
      fs.readFile(NAKANO_ITEMS_PATH, "utf8").then(JSON.parse),
      fs.readFile(SETAGAYA_ITEMS_PATH, "utf8").then(JSON.parse),
    ]).then(([nakanoPayload, setagayaPayload]) => ({
      nakano: getItems(nakanoPayload),
      setagaya: getItems(setagayaPayload),
    }));
  }

  return municipalityItemsPromise;
}

async function readCache() {
  try {
    const content = await fs.readFile(CACHE_PATH, "utf8");
    const cache = JSON.parse(content);
    return cache && typeof cache === "object" ? cache : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeCache(cache) {
  const temporaryPath = `${CACHE_PATH}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(temporaryPath, CACHE_PATH);
}

function findItemMatches(items, name) {
  const target = normalizeName(name);
  if (!target) return [];

  const exactMatches = items.filter(
    (item) => normalizeName(item.name) === target,
  );
  if (exactMatches.length > 0) return exactMatches;

  return items.filter((item) => {
    const candidate = normalizeName(item.name);
    return candidate && (candidate.includes(target) || target.includes(candidate));
  });
}

function findSetagayaMatches(setagayaItems, nakanoName) {
  const directMatches = findItemMatches(setagayaItems, nakanoName);
  if (directMatches.length > 0) return directMatches;

  const alias = ALIAS[nakanoName];
  return alias ? findItemMatches(setagayaItems, alias) : [];
}

function categoryGroup(city, category) {
  const normalized = normalizeCategory(category);
  const cityMap = CATEGORY_MAP[city];

  if (!cityMap) return null;

  const exactMatch = Object.entries(cityMap).find(
    ([label]) => normalizeCategory(label) === normalized,
  );

  if (exactMatch) return exactMatch[1];

  if (city === "setagaya" && normalized.includes("拠点回収")) {
    return "拠点回収";
  }

  return null;
}

function hasClassificationChange(nakanoItem, setagayaItems) {
  const nakanoGroup = categoryGroup("nakano", nakanoItem.category);
  if (!nakanoGroup || setagayaItems.length === 0) return false;

  const setagayaGroups = setagayaItems
    .map((item) => categoryGroup("setagaya", item.category))
    .filter(Boolean);

  if (setagayaGroups.length === 0) return false;

  return setagayaGroups.every((group) => group !== nakanoGroup);
}

function buildResults(candidateNames, municipalityItems) {
  const results = [];

  for (const candidateName of candidateNames.slice(0, 3)) {
    const nakanoMatches = findItemMatches(
      municipalityItems.nakano,
      candidateName,
    );

    for (const nakanoItem of nakanoMatches) {
      const setagayaMatches = findSetagayaMatches(
        municipalityItems.setagaya,
        nakanoItem.name,
      );

      results.push({
        name: nakanoItem.name,
        nakano: [{
          name: nakanoItem.name,
          category: nakanoItem.category || "",
          note: nakanoItem.note || "",
        }],
        setagaya: setagayaMatches.map((item) => ({
          name: item.name,
          category: item.category || "",
          note: item.note || "",
        })),
        classificationChanged: hasClassificationChange(
          nakanoItem,
          setagayaMatches,
        ),
      });
    }
  }

  return results.slice(0, 3);
}

function parseCandidateNames(responseText, allowedNames) {
  const cleaned = String(responseText ?? "")
    .replace(/```(?:json)?/gi, "")
    .trim();

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];

    try {
      parsed = JSON.parse(arrayMatch[0]);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const allowedNamesSet = new Set(allowedNames);
  const uniqueNames = [];

  for (const value of parsed) {
    if (
      typeof value === "string" &&
      allowedNamesSet.has(value) &&
      !uniqueNames.includes(value)
    ) {
      uniqueNames.push(value);
    }

    if (uniqueNames.length === 3) break;
  }

  return uniqueNames;
}

function getStatusCode(error) {
  return Number(
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    error?.error?.code,
  );
}

app.post("/api/identify", async (req, res) => {
  try {
    const { imageBase64, mediaType, fileKey } = req.body ?? {};

    if (typeof fileKey !== "string" || fileKey.length > 300) {
      return res.status(400).json({
        error: "fileKey は300文字以内で指定してください。",
      });
    }

    let imageBuffer = null;

    if (typeof imageBase64 === "string" && imageBase64.length > 0) {
      imageBuffer = Buffer.from(imageBase64, "base64");

      if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
        return res.status(413).json({
          error: "画像サイズが大きすぎるか、画像データが無効です。",
        });
      }
    }

    const cacheKey =
      fileKey.trim() ||
      (imageBuffer
        ? crypto.createHash("sha256").update(imageBuffer).digest("hex")
        : "");

    if (!cacheKey) {
      return res.status(400).json({
        error: "imageBase64 または fileKey を指定してください。",
      });
    }

    const cache = await readCache();

    if (Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
      return res.json({
        results: cache[cacheKey],
        cached: true,
      });
    }

    if (DEMO_ONLY) {
      return res.status(404).json({
        error: "この写真の保存結果がありません",
      });
    }

    if (!imageBuffer || typeof imageBase64 !== "string") {
      return res.status(400).json({
        error: "imageBase64 が必要です。",
      });
    }

    const allowedMediaTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedMediaTypes.has(mediaType)) {
      return res.status(400).json({
        error: "JPEG、PNG、WebP形式の画像を指定してください。",
      });
    }

    if (!ai) {
      return res.status(500).json({
        error: "GEMINI_API_KEY が設定されていません。",
      });
    }

    const municipalityItems = await loadMunicipalityItems();
    const candidateNames = municipalityItems.nakano
      .map((item) => item.name)
      .filter((name) => typeof name === "string" && name.trim());

    const prompt = [
      "画像に写っているごみの品目を判定してください。",
      "次の中野区の品目名候補から、画像に最も近い品目を最大3つ選択してください。",
      "候補リスト外の品目名は回答しないでください。",
      "該当する品目がなければ空配列 [] を返してください。",
      "説明文やコードフェンスを付けず、JSON文字列配列だけを返してください。",
      "",
      "候補リスト:",
      JSON.stringify(candidateNames),
    ].join("\n");

    let geminiResponse;

    try {
      geminiResponse = await ai.models.generateContent({
        model: MODEL,
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mediaType,
              },
            },
            { text: prompt },
          ],
        }],
      });
    } catch (error) {
      if (getStatusCode(error) === 429) {
        return res.status(429).json({
          error: "無料枠の上限に達しました。少し待ってからお試しください",
        });
      }

      throw error;
    }

    const allowedNames = new Set(candidateNames);
    const selectedNames = parseCandidateNames(
      geminiResponse.text,
      allowedNames,
    );
    const results = buildResults(selectedNames, municipalityItems);

    cache[cacheKey] = results;
    await writeCache(cache);

    return res.json({
      results,
      cached: false,
    });
  } catch (error) {
    console.error("写真判定エラー:", error);

    return res.status(500).json({
      error: "写真判定中にエラーが発生しました。",
    });
  }
});

app.listen(PORT, () => {
  console.log(`サーバーを起動しました: http://localhost:${PORT}`);
});