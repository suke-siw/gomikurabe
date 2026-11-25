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
const RECOMMENDED_MODEL = "gemini-3.5-flash";
const MODEL = process.env.GEMINI_MODEL || RECOMMENDED_MODEL;

/*
 * 設定したモデルが使えない（404）・混雑（503）・上限（429）などで失敗したときに
 * 順番に試す予備のモデルです。.env の GEMINI_FALLBACK_MODELS（カンマ区切り）で変更できます。
 * ※ gemini-2.5-flash は新規のAPIキーでは使えません。上位の 3.8 / 3.7 は混雑しやすいため、
 *   初期値は安定して応答した gemini-3.5-flash とし、混雑時は上位モデル → 軽量版の順に試します。
 */
const FALLBACK_MODELS = (
  process.env.GEMINI_FALLBACK_MODELS ||
  "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite"
)
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
// .env に古いモデル名が残っていても推奨モデルを必ず試すよう、2番目に入れる
const MODEL_CHAIN = [...new Set([MODEL, RECOMMENDED_MODEL, ...FALLBACK_MODELS])];

// 1モデルあたりの待ち時間と、1回の判定全体の待ち時間（ブラウザ側は50秒で打ち切る）
const PER_MODEL_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 40_000;
// 次のモデルに切り替えるHTTPステータス
const FALLBACK_STATUS_CODES = new Set([404, 429, 500, 502, 503, 504]);
// 「使えない」と分かったモデルは、サーバーを再起動するまで試さない
const unavailableModels = new Set();
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

// Render などのプロキシ経由でも、利用者のIPアドレスを正しく取得する
app.set("trust proxy", 1);

app.use(express.json({ limit: "15mb" }));

/*
 * ブラウザに公開するのは画面に必要なファイルだけにする。
 * server.js・package.json・node_modules・results_cache.json・.env などは公開しない。
 */
const PUBLIC_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/style.css": "style.css",
  "/script.js": "script.js",
  "/image-search.css": "image-search.css",
  "/image-search.js": "image-search.js",
};

for (const [route, file] of Object.entries(PUBLIC_FILES)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
}

// フォルダ単位の公開は、そのフォルダを起点にする（「..」などで外のファイルに届かないようにするため）
app.use("/src", express.static(path.join(__dirname, "src"), { dotfiles: "ignore" }));
app.use("/data", express.static(path.join(__dirname, "data"), { dotfiles: "ignore" }));

/*
 * 写真判定の利用回数の制限（公開後に無料枠を使い切られないようにする）。
 * 同じIPアドレスから RATE_LIMIT_WINDOW_MS の間に RATE_LIMIT_MAX 回まで。
 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 20);
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter(
    (time) => now - time < RATE_LIMIT_WINDOW_MS,
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of requestLog) {
    if (times.every((time) => now - time >= RATE_LIMIT_WINDOW_MS)) {
      requestLog.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS).unref();

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

/*
 * 中野区の品目名 → 世田谷区の品目名（名前が違う同じ品目）。
 * 世田谷区「キャップ(プラスチック製)」の注意事項にペットボトルキャップの記載がある。
 */
const ALIAS = {
  "クリアファイル": "プラスチック類",
  "ペットボトルのキャップ": "キャップ(プラスチック製)",
};

/** 表記の揺れ（全角・半角、空白、大文字小文字）だけをそろえた名前。括弧の中身は残す。 */
function normalizeExactName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ 　\t\r\n]/g, "")
    .trim()
    .toLowerCase();
}

/** 括弧書き（「(飲食用)」など）を除いた名前。自治体間で表記が違う同じ品目の照合に使う。 */
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

/**
 * Gemini は中野区の品目名リストから名前をそのまま選ぶので、中野区は完全一致だけで照合する。
 * （括弧を除いて照合すると「空き缶(飲食用)」に「空き缶(飲食用以外のもの)」が混ざるため）
 */
function findExactItems(items, name) {
  const target = normalizeExactName(name);
  if (!target) return [];

  return items.filter((item) => normalizeExactName(item.name) === target);
}

/**
 * 世田谷区の同じ品目を探す。部分一致は使わない（別の品目の分別が混ざるため）。
 * 1. 名前が完全に同じ  2. 対応表（ALIAS）  3. 括弧を除いた名前が同じ（例：空き缶(飲食用) → 空き缶(アルミ・スチール)）
 */
function findSetagayaMatches(setagayaItems, nakanoName) {
  const exactMatches = findExactItems(setagayaItems, nakanoName);
  if (exactMatches.length > 0) return exactMatches;

  const alias = ALIAS[nakanoName];
  if (alias) {
    const aliasMatches = findExactItems(setagayaItems, alias);
    if (aliasMatches.length > 0) return aliasMatches;
  }

  const baseName = normalizeName(nakanoName);
  if (!baseName) return [];

  return setagayaItems.filter((item) => normalizeName(item.name) === baseName);
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
    const nakanoMatches = findExactItems(
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

function createGeminiError(kind, cause) {
  const error = new Error(`Gemini の呼び出しに失敗しました: ${kind}`);
  error.kind = kind;
  error.cause = cause;
  return error;
}

/**
 * MODEL_CHAIN のモデルを順番に試し、最初に成功した応答を返します。
 * ライブラリの自動再送（初期設定では最大5回・待ち時間最大60秒）は無効にし、
 * 1モデルあたり PER_MODEL_TIMEOUT_MS、全体で TOTAL_TIMEOUT_MS で打ち切ります。
 * すべて失敗した場合は kind が "quota" / "busy" / "timeout" のエラーを投げます。
 */
async function generateWithFallback(contents) {
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const failures = [];

  for (const model of MODEL_CHAIN) {
    if (unavailableModels.has(model)) continue;

    const remaining = deadline - Date.now();
    if (remaining < 2_000) break;

    const timeoutMs = Math.min(PER_MODEL_TIMEOUT_MS, remaining);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          abortSignal: controller.signal,
          httpOptions: {
            timeout: timeoutMs,
            retryOptions: { attempts: 1 },
          },
        },
      });

      return { response, model };
    } catch (error) {
      const status = getStatusCode(error);
      const timedOut =
        controller.signal.aborted ||
        error?.name === "AbortError" ||
        error?.name === "TimeoutError";

      failures.push(timedOut ? "timeout" : status);
      console.warn(
        `モデル ${model} で失敗しました（${timedOut ? "時間切れ" : status || error?.name}）。次のモデルを試します。`,
      );

      if (status === 404) unavailableModels.add(model);
      if (timedOut || FALLBACK_STATUS_CODES.has(status)) continue;

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  if (failures.includes(429) && !failures.some((f) => f === 503 || f === "timeout")) {
    throw createGeminiError("quota");
  }

  if (failures.length > 0 && failures.every((f) => f === "timeout")) {
    throw createGeminiError("timeout");
  }

  throw createGeminiError("busy");
}

app.post("/api/identify", async (req, res) => {
  try {
    const { imageBase64, mediaType, fileKey } = req.body ?? {};

    if (fileKey !== undefined && (typeof fileKey !== "string" || fileKey.length > 300)) {
      return res.status(400).json({
        error: "fileKey は300文字以内で指定してください。",
      });
    }

    if (isRateLimited(req.ip)) {
      return res.status(429).json({
        error: "短い時間に写真判定が多すぎます。しばらく待ってからお試しいただくか、品目名で検索してください。",
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

    /*
     * 保存結果のキーは画像の中身から計算する（ファイル名とサイズが同じ別の写真で
     * 前回の結果が返らないようにするため）。画像がない場合だけ fileKey を使う。
     */
    const cacheKey = imageBuffer
      ? `sha256:${crypto.createHash("sha256").update(imageBuffer).digest("hex")}`
      : (fileKey ?? "").trim();

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
    let usedModel;

    try {
      ({ response: geminiResponse, model: usedModel } = await generateWithFallback([{
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
      }]));
    } catch (error) {
      if (error.kind === "quota") {
        return res.status(429).json({
          error: "無料枠の上限に達しました。少し待ってからお試しください",
        });
      }

      if (error.kind === "busy") {
        return res.status(503).json({
          error: "AIが混み合っています。少し待ってからもう一度お試しいただくか、品目名で検索してください。",
        });
      }

      if (error.kind === "timeout") {
        return res.status(504).json({
          error: "AIの応答に時間がかかっています。少し待ってからもう一度お試しいただくか、品目名で検索してください。",
        });
      }

      throw error;
    }

    console.log(`写真判定: ${usedModel} で判定しました。`);

    const allowedNames = new Set(candidateNames);
    const selectedNames = parseCandidateNames(
      geminiResponse.text,
      allowedNames,
    );
    const results = buildResults(selectedNames, municipalityItems);

    // 候補なしの結果は保存しない（撮り直しや混雑解消後に再判定できるようにする）
    if (results.length > 0) {
      cache[cacheKey] = results;
      await writeCache(cache);
    }

    return res.json({
      results,
      cached: false,
      model: usedModel,
    });
  } catch (error) {
    console.error("写真判定エラー:", error);

    return res.status(500).json({
      error: "写真判定中にエラーが発生しました。",
    });
  }
});

/*
 * 送信データが大きすぎる・JSONが壊れているなどのエラーも、画面側で読めるJSONで返す。
 */
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      error: "画像サイズが大きすぎます。別の写真でお試しください。",
    });
  }

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "送信データの形式が正しくありません。" });
  }

  console.error("サーバーエラー:", error);
  return res.status(500).json({ error: "サーバーでエラーが発生しました。" });
});

app.listen(PORT, () => {
  console.log(`サーバーを起動しました: http://localhost:${PORT}`);
});