/*
 * 自治体（街）の設定をまとめたファイルです。
 * 画面（script.js・image-search.js）と写真判定のサーバー（server.js）の両方がこのファイルを読みます。
 *
 * 新しい街を追加するときは：
 *   1. data/ に「〇〇_garbage_items.json」と「〇〇_garbage_schedules.json」を入れる（形式は README 参照）
 *   2. 下の MUNICIPALITY_CONFIG に、その街の設定を1つ追加する
 *   3. （任意）名前が違う同じ品目があれば ITEM_ALIASES に追加する
 * これで、品目検索・比較・収集日・写真判定のすべてで使えるようになります。
 *
 * 粗大ごみの申込先は、Web申込なら oversizedApplicationUrl / oversizedApplicationLabel、
 * 電話なら oversizedApplicationTel / oversizedApplicationTelLabel に書く（両方でも可）。
 * oversizedDetailsUrl には自治体公式の粗大ごみ案内ページを書く。
 *
 * scheduleKeys の左側は分別区分のID（src/utils/garbage-mapping.js の GARBAGE_CATEGORIES）、
 * 右側はその街の収集日データ（schedules.json の schedule）の項目名です。
 *   burnable … 燃やす（可燃）ごみ
 *   non_burnable … 燃やさない（不燃）ごみ
 *   setagaya_non_burnable … 世田谷区の「不燃ごみ」
 *   nakano_ceramic_glass_metal … 中野区の「陶器・ガラス・金属ごみ」
 *   plastic … プラスチック
 *   bottle … ペットボトル
 *   glass … びん
 *   can … 缶
 *   resource … 資源（上のどれにも当てはまらない資源）
 */
export const MUNICIPALITY_CONFIG = {
  nakano: {
    name: "中野区",
    itemsUrl: "data/nakano_garbage_items.json",
    schedulesUrl: "data/nakano_garbage_schedules.json",

    // 中野区の schedule JSON: resource = びん・缶・ペットボトル、plastic = 資源プラスチック（区公式の収集日一覧と照合済み）
    scheduleKeys: {
      burnable: ["burnable"],
      non_burnable: ["glass_metal"],
      nakano_ceramic_glass_metal: ["glass_metal"],
      plastic: ["plastic"],
      bottle: ["resource"],
      glass: ["glass_metal"],
      can: ["glass_metal"],
      resource: ["resource"],
    },

    // 「ごみ出しスケジュール」タブに表示する行（key は schedule JSON の項目名）
    scheduleRows: [
      { key: "burnable", label: "燃やすごみ" },
      { key: "glass_metal", label: "陶器・ガラス・金属ごみ" },
      { key: "resource", label: "びん・缶・ペットボトル" },
      { key: "plastic", label: "資源プラスチック" },
    ],

    designatedBag: "指定ごみ袋：なし（市販の透明・半透明袋を使用）",
    oversizedApplicationUrl: "https://www2.sodai-web.jp/nakano/index.html",
    oversizedApplicationLabel: "中野区 粗大ごみWeb申込",
    oversizedDetailsUrl:
      "https://www.city.tokyo-nakano.lg.jp/kurashi/gomi/sodaigomi/index.html",

    // 収集日に関する共通の案内（公式資料で確認できた内容のみ）
    scheduleNotes: [
      "収集日の朝8時までに出してください。",
      "祝日も通常どおり収集します。",
      "「第5」にあたる曜日の収集はありません。",
      "年末年始の収集日は区のホームページ等でご確認ください。",
    ],

    /*
     * 丁目より細かい単位（番地など）で収集日が異なる地域の注意書き。
     * 出典：中野区「資源とごみの分け方・出し方」2026年版 p.1 区内収集日一覧
     */
    areaNotices: [
      {
        town: "中野",
        blocks: ["2", "3", "5"],
        message:
          "中野2・3・5丁目の一部（毎日収集地域）は収集日が異なります。表示している曜日は毎日収集地域以外のものです。該当するかどうかは中野区の清掃事務所にご確認ください。",
      },
    ],

    // 集団回収・拠点回収の品目について、回収日の調べ方の案内
    nonRegularGuides: {
      collective:
        "古紙・古着は地域の集団回収に出してください。実施日は中野区の冊子「資源とごみの分け方・出し方」の集団回収実施日一覧（11・12ページ）や「中野区ごみ分別アプリ」で確認できます。",
      drop_off:
        "区の施設などに設置された回収ボックス（拠点回収）に出してください。回収場所は中野区の冊子「資源とごみの分け方・出し方」（15ページ〜）で確認できます。",
    },

    // 公式データの区分では集積所に出せるように見えるが、実際は別の区分で出す品目（品目名 → 分別区分ID）
    curbsideOverrides: {},

    // 検索結果で、元データの区分名の代わりに表示する区分名（品目名 → 表示名）
    displayCategoryOverrides: {},
  },

  setagaya: {
    name: "世田谷区",
    itemsUrl: "data/setagaya_garbage_items.json",
    schedulesUrl: "data/setagaya_garbage_schedules.json",

    scheduleKeys: {
      burnable: ["burnable"],
      non_burnable: ["non_burnable"],
      setagaya_non_burnable: ["non_burnable"],
      plastic: ["plastic"],
      bottle: ["bottle"],
      glass: ["resource"],
      can: ["resource"],
      resource: ["resource"],
    },

    scheduleRows: [
      { key: "burnable", label: "可燃ごみ" },
      { key: "non_burnable", label: "不燃ごみ" },
      { key: "bottle", label: "ペットボトル" },
      { key: "resource", label: "資源" },
    ],

    designatedBag: "指定ごみ袋：なし（市販の透明・半透明袋を使用）",
    oversizedApplicationUrl: "https://www.sodai-setagaya.jp/eco/view/setagaya/top.html",
    oversizedApplicationLabel: "世田谷区 粗大ごみWeb申込",
    oversizedDetailsUrl:
      "https://www.city.setagaya.lg.jp/02241/online_tetsuzuki/380.html#p1",

    scheduleNotes: [
      "収集日の朝8時までに出してください（可燃ごみは、三軒茶屋駅・下北沢駅周辺の一部地域では朝7時まで）。",
      "祝日も通常どおり収集します。",
      "「第5」（5回目）にあたる曜日の収集はありません。",
      "年末年始の収集日は区のホームページ等でご確認ください。",
    ],

    areaNotices: [],

    nonRegularGuides: {
      drop_off:
        "区の施設などで行う拠点回収に出してください。回収場所・日時は世田谷区ホームページの「拠点回収」のページで確認できます。",
    },

    /*
     * 公式データの区分は「資源」だが、集積所の資源回収には出せない品目。
     * （店頭・拠点回収、または月2回の指定場所での回収。集積所に出す場合は可燃ごみ）
     * 出典：世田谷区「ごみ分別一覧」各品目の注意事項
     */
    curbsideOverrides: {
      "食品トレイ(白色発泡トレイ)": "burnable",
      "食品トレイ(色・柄付き発泡トレイ)": "burnable",
      "発泡トレー": "burnable",
      "食品用透明プラスチック容器": "burnable",
      "食用油": "burnable",
    },

    // 区分が「資源または店頭回収」のペットボトル本体は、ペットボトルの収集日に出すため
    displayCategoryOverrides: {
      "ペットボトル": "ペットボトル",
    },
  },

  /*
   * 出典：毛呂山町「令和8年度 ごみ・資源収集カレンダー（A・B・C地区）」
   *       埼玉西部環境保全組合「令和8年度 ごみと資源の分け方・出し方」「家庭ごみと資源の分別表」
   * 町の地区は A・B・C の3つで、町名（大字）ごとの地区一覧は公式資料にないため、
   * カレンダーの地図の境目（JR八高線・東武越生線）で地区を選ぶ形にしている。
   */
  moroyama: {
    name: "毛呂山町",
    itemsUrl: "data/moroyama_garbage_items.json",
    schedulesUrl: "data/moroyama_garbage_schedules.json",

    scheduleKeys: {
      burnable: ["burnable"],
      non_burnable: ["non_burnable"],
      hazardous: ["hazardous"],
      plastic: ["plastic"],
      bottle: ["pet"],
      glass: ["bottle_can"],
      can: ["bottle_can"],
      resource: ["paper_cloth"],
    },

    scheduleRows: [
      { key: "burnable", label: "燃やせるごみ" },
      { key: "non_burnable", label: "燃やせないごみ・有害ごみ" },
      { key: "plastic", label: "その他容器包装プラスチック" },
      { key: "bottle_can", label: "びん・かん類" },
      { key: "pet", label: "ペットボトル" },
      { key: "paper_cloth", label: "紙・布類" },
    ],

    designatedBag:
      "指定ごみ袋：なし（ごみは市販の45L以内の白色半透明袋、資源物は市販の45L以内の透明袋。紙・布類は袋に入れずひもでしばる）",
    // 粗大ごみは電話で申し込む（Web申込なし）
    oversizedApplicationTel: "049-276-3355",
    oversizedApplicationTelLabel: "電話 049-276-3355（平日）",
    oversizedDetailsUrl:
      "https://www.town.moroyama.saitama.jp/soshikikarasagasu/seikatsukankyoka/kankyoukakari/gominowakekatadasikata/10420.html",

    scheduleNotes: [
      "収集日当日の朝8時30分までに出してください（前日には出さないでください）。",
      "祝日も通常どおり収集します。",
      "「第5」にあたる曜日の収集はありません。",
      "紙・布類は雨の日には出さないでください。",
      "長辺が80cmを超えるもの、または10kgを超えるものは粗大ごみです（集積所には出せません）。",
      "年末年始（12/31〜1/1）は収集がありません。A地区は令和9年1/29（金）に燃やせないごみ・有害ごみの臨時収集、B・C地区は12/29（火）に燃やせるごみの臨時収集があります。",
    ],

    areaNotices: [],

    nonRegularGuides: {},

    curbsideOverrides: {},

    displayCategoryOverrides: {},
  },
};

// 地域設定の画面を最初に開いたときに選ばれている自治体
export const DEFAULT_LOCATIONS = {
  current: "setagaya",
  previous: "nakano",
};

/*
 * 街によって名前が違う同じ品目の対応表（任意）。
 * 1行に「街のID: その街での品目名」を並べると、どの組み合わせでも同じ品目として扱います。
 * 一方向だけに使いたい場合は oneWayFrom に元の街のIDを書きます
 * （例：中野の「クリアファイル」→世田谷の「プラスチック類」は使うが、逆向きには使わない）。
 * 名前が同じ品目や、括弧を除くと同じになる品目（例：空き缶(飲食用) と 空き缶(アルミ・スチール)）は
 * 自動で照合するので、ここに書く必要はありません。
 */
export const ITEM_ALIASES = [
  { nakano: "クリアファイル", setagaya: "プラスチック類", oneWayFrom: "nakano" },
  // 世田谷区「キャップ(プラスチック製)」の注意事項にペットボトルキャップの記載がある
  { nakano: "ペットボトルのキャップ", setagaya: "キャップ(プラスチック製)" },
];
