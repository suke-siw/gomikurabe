const CITY_CONFIGS = [
  { id: "setagaya", name: "世田谷区", file: "data/setagaya.json" },
  { id: "nakano", name: "中野区", file: "data/nakano.json" }
];

const cityMap = new Map();
const itemAliases = {
  "布団": ["布団", "ふとん", "ふとんケット"],
  "ベッド": ["ベッド", "ベット", "寝具", "すのこベッド"],
  "テレビ": ["テレビ", "液晶テレビ", "TV"],
  "冷蔵庫": ["冷蔵庫", "れいぞうこ", "冷凍庫"],
  "ダンボール": ["ダンボール", "段ボール", "ダンボール箱", "段ボール箱"],
  "掃除機": ["掃除機", "クリーナー"],
  "自転車": ["自転車", "チャリ"],
  "ガスボンベ": ["ガスボンベ", "ボンベ", "ガス缶"],
  "衣類": ["衣類", "服", "洋服", "衣類袋"]
};

const previousCitySelect = document.getElementById("previous-city");
const newCitySelect = document.getElementById("new-city");
const itemSearchInput = document.getElementById("item-search");
const searchBtn = document.getElementById("search-btn");
const searchIconBtn = document.getElementById("search-icon-btn");
const cameraInput = document.getElementById("camera-input");
const resultSection = document.getElementById("result-section");

function normalizeKey(value = "") {
  return String(value).replace(/[（）()]/g, "").replace(/[ 　]/g, "").toLowerCase();
}

function matchAlias(inputValue) {
  const raw = String(inputValue || "").trim();
  if (!raw) return "";

  const normalized = normalizeKey(raw);

  for (const [canonical, aliases] of Object.entries(itemAliases)) {
    if (aliases.some((alias) => normalizeKey(alias) === normalized)) {
      return canonical;
    }
  }

  return raw;
}

function getDataFromFile(filePath) {
  return fetch(filePath, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}`);
      }
      return response.json();
    })
    .then((payload) => {
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.data)
            ? payload.data
            : [];

      return items.map((item) => {
        const normalized = {
          item:
            item.item ||
            item.name ||
            item.category ||
            item.label ||
            item.title ||
            "不明",
          status:
            item.status ||
            item.result ||
            item.rule ||
            item.categoryText ||
            item.garbageType ||
            "要確認",
          note:
            item.note ||
            item.description ||
            item.summary ||
            item.detail ||
            item.ruleText ||
            "",
          advice:
            item.advice ||
            item.guidance ||
            item.recommendation ||
            item.description ||
            item.note ||
            "",
          contact:
            item.contact ||
            item.contactInfo ||
            item.callCenter ||
            item.window ||
            "",
          municipality:
            item.municipality || payload.municipality || payload.name || ""
        };

        return normalized;
      });
    });
}

async function loadCityData() {
  try {
    const promises = CITY_CONFIGS.map(async (city) => {
      const items = await getDataFromFile(city.file);
      cityMap.set(city.name, { ...city, items });
      return city.name;
    });

    await Promise.all(promises);

    const cities = CITY_CONFIGS.map((city) => city.name);
    populateSelect(previousCitySelect, cities, cities[0]);
    populateSelect(newCitySelect, cities, cities[1] || cities[0]);

    previousCitySelect.value = cities[0];
    newCitySelect.value = cities[1] || cities[0];

    renderResult();
  } catch (error) {
    console.error(error);
    showFallbackResult();
  }
}

function populateSelect(selectElement, values, defaultValue) {
  selectElement.innerHTML = values
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");

  if (defaultValue) {
    selectElement.value = defaultValue;
  }
}

function getCityData(cityName) {
  return cityMap.get(cityName) || { items: [] };
}

function findItemRule(cityName, rawItemName) {
  const itemName = matchAlias(rawItemName) || rawItemName || "布団";
  const cityData = getCityData(cityName);

  const exact = cityData.items.find((entry) => {
    const entryItem = matchAlias(entry.item || "");
    return normalizeKey(entryItem) === normalizeKey(itemName);
  });

  if (exact) {
    return exact;
  }

  const fuzzy = cityData.items.find((entry) => {
    const entryItem = (entry.item || "").toString();
    return entryItem.includes(itemName) || itemName.includes(entryItem);
  });

  if (fuzzy) {
    return fuzzy;
  }

  return {
    item: itemName,
    status: "要確認",
    note: "自治体の最新の分別案内をご確認ください。",
    advice:
      "自治体の最新の分別ルールを確認してください。品目名とサイズ、袋の有無を入念に見直しましょう。",
    contact: `${cityName} ごみ対策窓口`
  };
}

function formatContact(contact) {
  if (!contact) return "自治体の窓口にお問い合わせください。";
  if (typeof contact === "string") return contact.replace(/\n/g, "<br>");
  if (typeof contact === "object") {
    const lines = [];
    if (contact.name) lines.push(contact.name);
    if (contact.address) lines.push(contact.address);
    if (contact.phone) lines.push(`電話: ${contact.phone}`);
    if (contact.hours) lines.push(`受付時間: ${contact.hours}`);
    return lines.join("<br>");
  }
  return String(contact);
}

function renderResult() {
  const previousCityName = previousCitySelect.value;
  const newCityName = newCitySelect.value;
  const itemValue = (itemSearchInput.value || "").trim() || "布団";
  const matchedItem = matchAlias(itemValue);

  const previousRule = findItemRule(previousCityName, matchedItem);
  const newRule = findItemRule(newCityName, matchedItem);

  document.getElementById("route-label").textContent = `${previousCityName} → ${newCityName}`;
  document.getElementById("comparison-item").textContent = `品目: ${matchedItem}`;
  document.getElementById("previous-city-name").textContent = previousCityName;
  document.getElementById("new-city-name").textContent = newCityName;

  document.getElementById("previous-rule").textContent = previousRule.status || "要確認";
  document.getElementById("new-rule").textContent = newRule.status || "要確認";

  const adviceText =
    previousRule.status !== newRule.status
      ? `${newCityName}では${newRule.status || "分別方法が異なる"}ため、${newRule.advice || "新しい自治体のルールを確認してください。"}`
      : `${newCityName}でも${previousCityName}でも同じ扱いです。引っ越し後も基本的な方法で出せます。`;

  document.getElementById("advice").textContent = adviceText;

  const summaryText =
    previousRule.status === newRule.status
      ? `${matchedItem}は前後の自治体で同じ扱いです。差分はほとんどありません。`
      : `${matchedItem}は${previousCityName}では「${previousRule.status || "要確認"}」、${newCityName}では「${newRule.status || "要確認"}」です。出し方や料金、袋の条件が変わる可能性があります。`;

  document.getElementById("diff-summary").textContent = summaryText;

  const contactText = formatContact(newRule.contact || `${newCityName} ごみ対策窓口`);
  document.getElementById("contact").innerHTML = contactText;

  resultSection.classList.remove("hidden");
}

function showFallbackResult() {
  const previousCityName = previousCitySelect.value || "世田谷区";
  const newCityName = newCitySelect.value || "中野区";
  const itemValue = itemSearchInput.value || "布団";

  document.getElementById("route-label").textContent = `${previousCityName} → ${newCityName}`;
  document.getElementById("comparison-item").textContent = `品目: ${matchAlias(itemValue)}`;
  document.getElementById("previous-city-name").textContent = previousCityName;
  document.getElementById("new-city-name").textContent = newCityName;
  document.getElementById("previous-rule").textContent = "要確認";
  document.getElementById("new-rule").textContent = "要確認";
  document.getElementById("advice").textContent =
    "データの読み込みに失敗したため、自治体の分別案内をご確認ください。";
  document.getElementById("diff-summary").textContent =
    "現在のデータが正しく読み込めていないため、最新の自治体の分別ルールを確認してください。";
  document.getElementById("contact").innerHTML = `${newCityName} ごみ対策窓口`;

  resultSection.classList.remove("hidden");
}

function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const fileName = file.name || "";
  const lower = fileName.toLowerCase();

  if (lower.includes("futon") || lower.includes("布団") || lower.includes("futon")) {
    itemSearchInput.value = "布団";
    return;
  }

  if (lower.includes("bed") || lower.includes("ベッド")) {
    itemSearchInput.value = "ベッド";
    return;
  }

  if (lower.includes("tv") || lower.includes("テレビ")) {
    itemSearchInput.value = "テレビ";
    return;
  }

  if (lower.includes("refrigerator") || lower.includes("冷蔵庫")) {
    itemSearchInput.value = "冷蔵庫";
    return;
  }

  if (lower.includes("box") || lower.includes("段ボール")) {
    itemSearchInput.value = "ダンボール";
  }
}

previousCitySelect.addEventListener("change", renderResult);
newCitySelect.addEventListener("change", renderResult);
searchBtn.addEventListener("click", renderResult);
searchIconBtn.addEventListener("click", renderResult);
itemSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    renderResult();
  }
});
cameraInput.addEventListener("change", handleFileUpload);

loadCityData();