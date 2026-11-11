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
| ごみ分別検索・比較 | 品目名を入力すると、前の街と新しい街での「分別区分」「収集曜日」「注意事項」を並べて表示（完全一致 → 部分一致の順で検索） |
| 収集曜日の表示 | 選んだ町名・丁目の収集スケジュールから、その品目の収集曜日を表示。粗大ごみは「個別申し込み」と表示 |

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
  "updated_at": "2026-10-26",
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

2. ローカルサーバーで起動する（`index.html` を直接ダブルクリックで開くと、JSONの読み込みができません）

    ```sh
    python3 -m http.server 8000
    ```

3. ブラウザで <http://localhost:8000> を開く

## ⚠️ 注意（チーム全員へ）

- Gemini APIを導入するときは、**APIキーを絶対にコミットしない**。`.env` に書き、`.gitignore` で除外すること（`.gitignore` は未作成なので、導入時に作る）
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
