# ごみくらべ

> 引っ越し先でも迷わずゴミを出せるようにするサービス

引っ越したばかりの人のためのスマートフォン向けWebアプリです。
前の街と新しい街（町名・丁目まで）を選んで品目を入力すると、それぞれの街での分別区分・収集曜日・注意事項を並べて表示します。

授業「開発プロジェクト演習」で制作しているプロトタイプです。

## 公開URL

（Netlifyで公開後に記入）

## 主な機能

### 実装済み

| 機能 | 内容 |
| --- | --- |
| 住所選択 | 前の街・新しい街それぞれについて、自治体 → 町名 → 丁目を選ぶ |
| ごみ分別検索・比較 | 品目名を入力すると、前の街と新しい街での「分別区分」「収集曜日」「注意事項」を並べて表示（完全一致で検索し、見つからない自治体では表記の近い「似た品目」を提示。入力中は両区の品目から部分一致で候補を表示） |
| 収集曜日の表示 | 選んだ町名・丁目の収集スケジュールから、その品目の収集曜日を表示。粗大ごみは「個別申し込み」、集団回収・拠点回収の品目は「曜日収集なし」、区で収集しないものは「区では収集しません」と表示。中野2・3・5丁目の毎日収集地域など、丁目より細かい例外は注意文を表示 |
| 次回収集日 | 収集曜日から次回の収集日（今日・明日・月/日）を表示。年末年始（12/29〜1/7）は日付を出さず区の案内を確認するよう表示 |
| 比較一覧の絞り込み | 品目名と「今の自治体の分別区分」で絞り込み、30件ずつ表示 |

### 開発中・予定

| 機能 | 現状 |
| --- | --- |
| 写真からごみ判定 | カメラ撮影ボタンはあるが、現在は**モック**（常に「ペットボトル」と判定）。Gemini APIでの解析は未実装 |
| 違いだけの一覧表示 | 分別区分が違う品目だけを一覧で表示する機能（予定） |
| 選択した街の保存 | 端末に保存して次回も引き継ぐ機能（予定） |
| 指定袋・粗大ごみ申込方法の案内 | 予定 |
| 粗大ごみのサイズ判定 | 将来実装予定 |

## 対応自治体

- 東京都世田谷区
- 東京都中野区

## 使用技術

| 部分 | 技術 |
| --- | --- |
| 画面 | HTML / CSS / JavaScript（ES Modules、ビルドなし） |
| データ | JSON（自治体のオープンデータを整形） |
| 画像認識（予定） | Gemini API（Netlify Functions 経由で呼び出す予定） |
| 公開 | Netlify（GitHub連携で自動デプロイ予定） |

## フォルダ構成

```text
gomikurabe/
├── index.html                      … 画面（検索フォームと比較結果）
├── style.css                       … スタイル
├── script.js                       … 画面の処理（データ読み込み・検索・表示）
├── src/
│   └── utils/
│       └── garbage-mapping.js      … 自治体設定と分別区分の対応付け・収集曜日の取得
├── data/
│   ├── nakano_garbage_items.json       … 中野区の品目と分別区分
│   ├── nakano_garbage_schedules.json   … 中野区の町名・丁目ごとの収集曜日
│   ├── setagaya_garbage_items.json     … 世田谷区の品目と分別区分
│   └── setagaya_garbage_schedules.json … 世田谷区の町名・丁目ごとの収集曜日
└── README.md
```

### データ形式

**品目データ**（`data/*_garbage_items.json`）

```json
{
  "city_code": "131121",
  "city_name": "世田谷区",
  "items": [
    { "id": "setagaya_0001", "name": "アイスピック", "category": "不燃ごみ", "note": "新聞紙等に包んで「キケン」と表示してください" }
  ]
}
```

**収集スケジュール**（`data/*_garbage_schedules.json`）

```json
[
  {
    "town": "赤堤",
    "blocks": [
      {
        "target_blocks": ["1", "3", "4", "5"],
        "schedule": { "burnable": "水曜日・土曜日", "non_burnable": "第2・第4月曜日", "resource": "木曜日", "bottle": "第1・第3月曜日" }
      }
    ]
  }
]
```

`schedule` のキー（`burnable` など）は自治体ごとに異なります。各区の分別区分とキーの対応は `src/utils/garbage-mapping.js` の `MUNICIPALITIES` で設定しています。

| 自治体 | キー | 区分 |
| --- | --- | --- |
| 世田谷区 | `burnable` / `non_burnable` / `resource` / `bottle` | 可燃ごみ / 不燃ごみ / 資源 / ペットボトル |
| 中野区 | `burnable` / `glass_metal` / `resource` / `plastic` | 燃やすごみ / 陶器・ガラス・金属ごみ / **びん・缶・ペットボトル** / **資源プラスチック** |

収集日データを更新するときは、区の公式の収集日一覧と照合してください（中野区は `resource` と `plastic` を取り違えやすいので注意）。

### 自治体を追加するには

1. `data/` に `〇〇_garbage_items.json` と `〇〇_garbage_schedules.json` を追加する
2. `src/utils/garbage-mapping.js` の `MUNICIPALITIES` に自治体名・スケジュールのパス・`scheduleKeys` を追加する
3. `script.js` の `ITEM_DATA_URLS` に品目データのパスを追加する

## 開発環境の準備

1. リポジトリをクローンする

    ```sh
    git clone （リポジトリのURL）
    cd gomikurabe
    ```

2. 必要なパッケージを入れ、設定ファイルを作る

    ```sh
    npm install
    cp .env.example .env   # .env の GEMINI_API_KEY に自分のAPIキーを書く
    ```

3. サーバーを起動する（写真判定にはこのサーバーが必要です）

    ```sh
    node server.js
    ```

4. ブラウザで <http://localhost:3000> を開く

> `python3 -m http.server` で開いた場合や `index.html` を直接開いた場合は、写真判定が動きません（品目検索・収集日は `python3 -m http.server` でも動きます）。

### 写真判定（Gemini）の設定

| 項目 | 内容 |
| --- | --- |
| `GEMINI_MODEL` | 使うモデル（初期値 `gemini-3.5-flash`）。`gemini-2.5-flash` は新しいAPIキーでは使えません。上位の 3.8 / 3.7 は混雑しやすいため、安定して応答する 3.5-flash を基本にしています |
| `GEMINI_FALLBACK_MODELS` | 設定したモデルが混雑・上限・使用不可のときに順に試すモデル（カンマ区切り、初期値 `gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash-lite`） |
| 待ち時間 | 1モデル20秒・全体40秒（サーバー）、50秒（ブラウザ）で打ち切り、「少し待ってから再度お試しください」と表示 |

## ⚠️ 注意（チーム全員へ）

- **APIキーを絶対にコミットしない**。`.env.example` をコピーして `.env` を作り（`cp .env.example .env`）、そこにキーを書く。`.env` と `node_modules/` は `.gitignore` で除外済み
- `node_modules/` はコミットしない。クローン後に `npm install` で作成する
- 本番のAPIキーは Netlify の管理画面「環境変数」に登録する
- 写真は判定にのみ使用し、アプリ側では保存しない

## データの出典

本アプリは以下のオープンデータを加工して利用しています（CC BY 互換ライセンス）。

- 世田谷区「ごみ分別一覧」（自治体標準オープンデータセット）
  <https://www.city.setagaya.lg.jp/documents/22308/n6_131121_garbage_separation.csv>
- 中野区「ごみ分別一覧」（自治体標準オープンデータセット）
  <https://www2.wagmap.jp/nakanodatamap/nakanodatamap/opendatafile/map_1/CSV/opendata_5000769.csv>

品目の対応付けデータは、AIで作成したものをチームで確認しています。

## チーム「まったりがんばる」
