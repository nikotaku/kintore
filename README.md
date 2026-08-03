# 筋トレ・ランニング＆食事 MEMO

筋トレの記録から食事管理（カロリー・PFC）まで一元管理できる、自分専用のWebアプリです。
「筋トレMEMO」風の赤基調UIをベースに、食事管理・体組成管理を統合しています。

## 機能

### 🏠 ホーム
- 月間カレンダー（トレーニング実施日をハイライト）
- 合計負荷量の統計（7日間 / 28日間 / 総合計、🚗🚌✈️ 換算つき）
- 週別負荷量バー（今週〜5週前）
- 月間・累計トレーニング日数（MONTHLY ARCHIVE）
- 選択日のトレーニング内容・食事サマリ
- RM計算機（O'Conner式・推定1RMと回数別重量表）

### 💪 トレーニング記録
- 部位（胸・背中・脚・肩・腕・腹筋・有酸素）別の種目リスト
- 部位・種目の追加/削除（カスタマイズ自由）
- セットごとの重量・回数を記録、推定RMを自動計算
- 日別の合計種目数・セット数・レップ数・負荷量を表示
- 前回メニューをワンタップでコピー
- 種目ごとに前回の重量・回数を一括反映
- 重量入力後にEnterで回数、次セットへ移動
- 種目ごとのフォーム動画を端末内に保存・再生

### 🏃 ランニング記録
- 距離・所要時間・メモを記録
- 1kmあたりの平均ペースを自動計算
- 今週・今月の合計距離を表示
- 履歴カレンダーと週別距離グラフに反映

### 📅 履歴 / 分析
- 部位フィルタ付きカレンダー表示
- 週別合計負荷量グラフ（直近12週）
- 種目別の推定1RM推移グラフ

### 🍽 食事管理
- 朝食・昼食・夕食・間食ごとの記録
- 内蔵食品データベース（和食中心・約40品目）から検索して追加
- グラム数指定でカロリー・PFC自動計算
- 手入力追加＆マイ食品リストへの保存
- 1日の目標（kcal / P / F / C）に対する進捗バー

### ⚖️ 体組成
- 体重・体脂肪率の記録と推移グラフ

### ⚙️ その他
- 通常データはブラウザの localStorage に保存
- フォーム動画はブラウザの IndexedDB に保存（最大250MB/本）
- JSONエクスポート / インポートでバックアップ・引っ越し可能
- PWA対応（ホーム画面に追加してアプリのように使える・オフライン動作）

### 🌱 毎日のLINEアドバイス
- トレーニング・ランニング・食事・体組成の履歴を本人認証付きで同期
- 入力した弱点と「国づくり」「居心地のいいコミュニティ作り」「健康の最適化」を軸に毎日の行動を提案
- 初期値は毎朝8:00（設定画面から変更・停止可能）
- `newkyasukan` の「全力エステ予約通知用」LINEから配信
- 履歴と弱点の分析はSupabase内で完結し、外部AIへ個人データを送信しない

LINEのアクセストークンと送信先IDはこの公開リポジトリには置かず、`newkyasukan` のSupabase Edge Function内だけで参照します。LINE連携中のみ、助言に使う履歴が本人専用のRLS領域へ同期されます。フォーム動画本体は同期しません。

## 使い方

ビルド不要の静的アプリです。そのまま配信するだけで動きます。

```bash
# ローカルで試す
python3 -m http.server 8000
# → http://localhost:8000 を開く
```

GitHub Pages 等の静的ホスティングにそのまま置けます（リポジトリの Pages を有効にするだけ）。

## 技術構成

- HTML / CSS / Vanilla JavaScript（ESモジュール）
- Supabase JS（本人認証・履歴同期・Edge Function呼び出し）
- チャートは自前の軽量SVG描画
- Service Worker によるオフラインキャッシュ

## データ構造

```
localStorage["kintore-memo-v1"] = {
  parts:      ["胸", "背中", ...],
  exercises:  [{ id, name, part }],
  workouts:   { "YYYY-MM-DD": [{ exerciseId, name, part, sets: [{ w, r }] }] },
  meals:      { "YYYY-MM-DD": { breakfast: [{ name, grams, kcal, p, f, c }], ... } },
  body:       { "YYYY-MM-DD": { weight, fat } },
  runs:       { "YYYY-MM-DD": [{ id, distance, durationSec, paceSec, memo }] },
  exerciseVideos: { exerciseId: { name, type, size, updatedAt } },
  customFoods: [{ name, kcal, p, f, c, unit }],   // 100gあたり
  targets:    { kcal, p, f, c },
  advice:     { goals, weaknesses, notificationEnabled, notificationTime, accountEmail }
}
```

フォーム動画の本体は容量が大きいためJSONには含まれず、登録した端末内だけに保存されます。

推定1RMは O'Conner 式（`重量 × (1 + 0.025 × 回数)`）で計算しています。
