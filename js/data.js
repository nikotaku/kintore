// 部位と種目のプリセット
export const DEFAULT_PARTS = ["胸", "背中", "脚", "肩", "腕", "腹筋", "有酸素"];

export const DEFAULT_EXERCISES = [
  { id: "ex-bench", name: "ベンチプレス", part: "胸" },
  { id: "ex-pecfly", name: "ペックフライ", part: "胸" },
  { id: "ex-chestpress", name: "チェストプレス", part: "胸" },
  { id: "ex-dumbbellpress", name: "ダンベルプレス", part: "胸" },
  { id: "ex-deadlift", name: "デッドリフト", part: "背中" },
  { id: "ex-latpulldown", name: "ラットプルダウン", part: "背中" },
  { id: "ex-pulleyrow", name: "プーリーロー", part: "背中" },
  { id: "ex-bentoverrow", name: "ベントオーバーロー", part: "背中" },
  { id: "ex-adduction", name: "アダクション", part: "脚" },
  { id: "ex-squat", name: "スクワット", part: "脚" },
  { id: "ex-smithsquat", name: "スミスマシン・バーベルスクワット", part: "脚" },
  { id: "ex-legpress", name: "レッグプレス", part: "脚" },
  { id: "ex-legext", name: "レッグエクステンション", part: "脚" },
  { id: "ex-legcurl", name: "レッグカール", part: "脚" },
  { id: "ex-shoulderpress", name: "ショルダープレス", part: "肩" },
  { id: "ex-sideraise", name: "サイドレイズ", part: "肩" },
  { id: "ex-rearraise", name: "リアレイズ", part: "肩" },
  { id: "ex-armcurl", name: "アームカール", part: "腕" },
  { id: "ex-tricepsext", name: "トライセプスエクステンション", part: "腕" },
  { id: "ex-hammercurl", name: "ハンマーカール", part: "腕" },
  { id: "ex-crunch", name: "クランチ", part: "腹筋" },
  { id: "ex-legraise", name: "レッグレイズ", part: "腹筋" },
  { id: "ex-plank", name: "プランク", part: "腹筋" },
  { id: "ex-treadmill", name: "トレッドミル", part: "有酸素" },
  { id: "ex-bike", name: "エアロバイク", part: "有酸素" },
];

// 食品DB: 100gあたりの kcal / P / F / C。unit は既定入力量(g)
export const FOOD_DB = [
  { name: "白米（ごはん）", kcal: 156, p: 2.5, f: 0.3, c: 37.1, unit: 150 },
  { name: "玄米ごはん", kcal: 152, p: 2.8, f: 1.0, c: 35.6, unit: 150 },
  { name: "おにぎり（鮭）", kcal: 176, p: 4.5, f: 1.5, c: 36.0, unit: 110 },
  { name: "食パン", kcal: 248, p: 8.9, f: 4.1, c: 46.4, unit: 60 },
  { name: "うどん（ゆで）", kcal: 95, p: 2.6, f: 0.4, c: 21.6, unit: 250 },
  { name: "そば（ゆで）", kcal: 130, p: 4.8, f: 1.0, c: 26.0, unit: 200 },
  { name: "パスタ（ゆで）", kcal: 150, p: 5.8, f: 0.9, c: 32.0, unit: 250 },
  { name: "オートミール", kcal: 350, p: 13.7, f: 5.7, c: 69.1, unit: 40 },
  { name: "さつまいも（蒸し）", kcal: 129, p: 1.2, f: 0.2, c: 31.9, unit: 150 },
  { name: "鶏むね肉（皮なし）", kcal: 105, p: 23.3, f: 1.9, c: 0.1, unit: 100 },
  { name: "鶏もも肉（皮なし）", kcal: 113, p: 19.0, f: 5.0, c: 0, unit: 100 },
  { name: "ささみ", kcal: 98, p: 23.9, f: 0.8, c: 0.1, unit: 80 },
  { name: "サラダチキン", kcal: 108, p: 23.8, f: 1.2, c: 0.3, unit: 110 },
  { name: "豚ロース", kcal: 248, p: 19.3, f: 19.2, c: 0.2, unit: 100 },
  { name: "豚ヒレ", kcal: 118, p: 22.2, f: 3.7, c: 0.3, unit: 100 },
  { name: "牛もも肉", kcal: 196, p: 19.5, f: 13.3, c: 0.4, unit: 100 },
  { name: "鮭（焼き）", kcal: 160, p: 29.1, f: 5.1, c: 0.1, unit: 80 },
  { name: "サバ（焼き）", kcal: 264, p: 25.2, f: 22.4, c: 0.4, unit: 80 },
  { name: "マグロ赤身（刺身）", kcal: 115, p: 26.4, f: 1.4, c: 0.1, unit: 100 },
  { name: "ツナ缶（水煮）", kcal: 70, p: 16.0, f: 0.7, c: 0.2, unit: 70 },
  { name: "卵", kcal: 142, p: 12.2, f: 10.2, c: 0.4, unit: 50 },
  { name: "納豆", kcal: 190, p: 16.5, f: 10.0, c: 12.1, unit: 45 },
  { name: "木綿豆腐", kcal: 73, p: 7.0, f: 4.9, c: 1.5, unit: 150 },
  { name: "無調整豆乳", kcal: 44, p: 3.6, f: 2.0, c: 3.1, unit: 200 },
  { name: "牛乳", kcal: 61, p: 3.3, f: 3.8, c: 4.8, unit: 200 },
  { name: "ヨーグルト（無糖）", kcal: 56, p: 3.6, f: 3.0, c: 4.9, unit: 100 },
  { name: "ギリシャヨーグルト", kcal: 59, p: 10.0, f: 0.4, c: 4.0, unit: 110 },
  { name: "プロテイン（1杯）", kcal: 390, p: 75.0, f: 6.0, c: 10.0, unit: 30 },
  { name: "プロセスチーズ", kcal: 313, p: 22.7, f: 26.0, c: 1.3, unit: 18 },
  { name: "ブロッコリー（ゆで）", kcal: 30, p: 3.9, f: 0.4, c: 4.3, unit: 100 },
  { name: "ほうれん草（ゆで）", kcal: 23, p: 2.6, f: 0.5, c: 4.0, unit: 80 },
  { name: "トマト", kcal: 20, p: 0.7, f: 0.1, c: 4.7, unit: 150 },
  { name: "アボカド", kcal: 176, p: 2.1, f: 17.5, c: 7.9, unit: 100 },
  { name: "バナナ", kcal: 93, p: 1.1, f: 0.2, c: 22.5, unit: 100 },
  { name: "りんご", kcal: 56, p: 0.2, f: 0.3, c: 15.5, unit: 250 },
  { name: "ミックスナッツ", kcal: 610, p: 20.0, f: 53.0, c: 18.0, unit: 25 },
  { name: "アーモンド", kcal: 608, p: 20.3, f: 54.1, c: 20.9, unit: 25 },
  { name: "和菓子（大福）", kcal: 223, p: 4.6, f: 0.5, c: 50.3, unit: 70 },
  { name: "チョコレート", kcal: 551, p: 6.9, f: 34.1, c: 55.8, unit: 25 },
  { name: "ビール", kcal: 39, p: 0.4, f: 0, c: 3.1, unit: 350 },
  { name: "ハイボール", kcal: 47, p: 0, f: 0, c: 0, unit: 350 },
];

export const MEAL_TYPES = [
  { key: "breakfast", label: "朝食", icon: "🌅" },
  { key: "lunch", label: "昼食", icon: "☀️" },
  { key: "dinner", label: "夕食", icon: "🌙" },
  { key: "snack", label: "間食", icon: "🍩" },
];

// 負荷量のたとえ（重量比較）
export const VOLUME_COMPARES = [
  { icon: "🚗", label: "車", tons: 1.5 },
  { icon: "🚌", label: "バス", tons: 15 },
  { icon: "✈️", label: "飛行機", tons: 250 },
];

export const DEFAULT_TARGETS = { kcal: 2200, p: 150, f: 60, c: 250 };
