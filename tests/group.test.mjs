import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildDaySummary } from "../js/share.js";
import {
  GroupError,
  callGroupRpc,
  checkinLines,
  checkinPayload,
  decodeTransferCode,
  encodeTransferCode,
  hasCheckinContent,
  inviteText,
  inviteUrl,
  loadMemberships,
  membershipFromResponse,
  newMemberSecret,
  normalizeInviteCode,
  parseJoinHash,
  reactionCounts,
  removeMembership,
  saveMemberships,
  upsertMembership,
} from "../js/group.js";

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const MEMBER = "11111111-2222-4333-8444-555555555555";
const GROUP = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SECRET = "s".repeat(43);

test("invite codes are normalised and only valid join links are accepted", () => {
  assert.equal(normalizeInviteCode(" k7m2-qx9a "), "K7M2QX9A");
  assert.equal(parseJoinHash("#join=k7m2qx9a"), "K7M2QX9A");
  assert.equal(parseJoinHash("#join=K7M2-QX9A"), "K7M2QX9A");
  assert.equal(parseJoinHash("#join=K7M2QX9O"), null, "O is not in the code alphabet");
  assert.equal(parseJoinHash("#join=SHORT"), null);
  assert.equal(parseJoinHash("#other=K7M2QX9A"), null);
  assert.equal(parseJoinHash(""), null);
  const url = inviteUrl("K7M2QX9A", { origin: "https://nikotaku.github.io", pathname: "/kintore/" });
  assert.equal(url, "https://nikotaku.github.io/kintore/#join=K7M2QX9A");
  assert.match(inviteText("朝トレ部", "K7M2QX9A", url), /「朝トレ部」[\s\S]*K7M2QX9A[\s\S]*#join=K7M2QX9A$/);
});

test("member secrets are long random url-safe strings", () => {
  const a = newMemberSecret();
  const b = newMemberSecret();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test("memberships persist per device and ignore malformed entries", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadMemberships(storage), []);
  const membership = membershipFromResponse({ member_id: MEMBER, group_id: GROUP, group_name: "朝トレ部", display_name: "たかし" }, SECRET);
  let list = upsertMembership([], membership);
  saveMemberships([...list, { memberId: "bad", secret: "x", groupId: GROUP }], storage);
  assert.deepEqual(loadMemberships(storage).map(m => m.memberId), [MEMBER]);

  // 同じグループを引き継ぎ直しても重複しない
  const other = { ...membership, memberId: "99999999-2222-4333-8444-555555555555" };
  list = upsertMembership(list, other);
  assert.deepEqual(list.map(m => m.memberId), [other.memberId]);
  assert.deepEqual(removeMembership(list, other.memberId), []);

  storage.setItem("kintore-groups-v1", "not json");
  assert.deepEqual(loadMemberships(storage), []);
});

test("transfer codes round-trip and reject anything else", () => {
  const code = encodeTransferCode({ memberId: MEMBER, secret: SECRET });
  assert.ok(code.startsWith("KTG1-"));
  assert.deepEqual(decodeTransferCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `), { memberId: MEMBER, secret: SECRET });
  assert.equal(decodeTransferCode("KTG1-not-a-uuid.xxx"), null);
  assert.equal(decodeTransferCode(`KTG1-${MEMBER}.short`), null);
  assert.equal(decodeTransferCode(`${MEMBER}.${SECRET}`), null);
});

test("check-in payload shares only the training summary", () => {
  const state = {
    exercises: [{ id: "ex-bench", name: "ベンチプレス", part: "胸" }],
    workouts: { "2026-10-23": [{ exerciseId: "ex-bench", sets: [{ w: 60, r: 10 }, { w: 70, r: 5 }] }] },
    runs: { "2026-10-23": [{ id: "r", distance: 5.234, durationSec: 1800.4, paceSec: 344, memo: "家の近所" }] },
    meals: { "2026-10-23": { breakfast: [{ name: "卵", kcal: 70 }] } },
    body: { "2026-10-23": { weight: 70, fat: 15 } },
  };
  const payload = checkinPayload(buildDaySummary(state, "2026-10-23"), { stretch: true });
  assert.deepEqual(payload, {
    v: 1,
    weight: { exercises: 1, sets: 2, volume: 950, top: [{ n: "ベンチプレス", w: 70, r: 5, s: 2 }] },
    run: { km: 5.23, sec: 1800 },
    stretch: true,
  });
  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /家の近所|卵|kcal|fat|weight":70/);

  const empty = checkinPayload(buildDaySummary({ exercises: [], workouts: {}, runs: {} }, "2026-10-23"));
  assert.equal(hasCheckinContent(empty), false);
  assert.equal(hasCheckinContent(empty, "  休養日  "), true);
  assert.equal(hasCheckinContent({ ...empty, stretch: true }), true);
});

test("check-in lines render other members' data defensively", () => {
  assert.deepEqual(checkinLines({
    weight: { exercises: 2, sets: 6, volume: 3200, top: [{ n: "スクワット", w: 100, r: 5 }, { n: "プランク", w: 0, r: 60 }] },
    run: { km: 5, sec: 1500 },
    stretch: true,
  }).map(l => l.text), [
    "🏋️ ウェイト 2種目・6セット・総負荷 3,200kg",
    "スクワット 100kg×5",
    "プランク 60回",
    "🏃 ランニング 5km・25:00（5:00/km）",
    "🧘 ストレッチ",
  ]);
  // 型が違う・負の値・巨大な配列でも壊れず、上限まで
  const odd = checkinLines({ weight: { exercises: "x", sets: -3, volume: null, top: Array.from({ length: 50 }, () => ({ n: "<b>悪</b>".repeat(20), w: "9", r: {} })) }, run: "fast", stretch: "yes" });
  assert.equal(odd[0].text, "🏋️ ウェイト 0種目・0セット・総負荷 0kg");
  assert.equal(odd.length, 6);
  assert.ok(odd[1].text.startsWith("<b>悪</b>"), "HTML is kept as text here and escaped by the renderer");
  assert.ok(odd[1].text.length <= 40);
  assert.deepEqual(checkinLines(null), []);
  assert.deepEqual(checkinLines("not an object"), []);
});

test("reaction counts mark the viewer's own reactions", () => {
  const counts = reactionCounts([
    { member_id: MEMBER, emoji: "🔥" },
    { member_id: "other", emoji: "🔥" },
    { member_id: "other", emoji: "👏" },
    { member_id: "other", emoji: "😈" },
  ], MEMBER);
  assert.deepEqual(counts, [
    { emoji: "👏", count: 1, mine: false },
    { emoji: "🔥", count: 2, mine: true },
    { emoji: "💪", count: 0, mine: false },
    { emoji: "🎉", count: 0, mine: false },
  ]);
  assert.equal(reactionCounts(undefined, MEMBER).length, 4);
});

test("rpc calls post to the Supabase function and map errors to Japanese messages", async () => {
  const calls = [];
  const fakeFetch = (status, body) => async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 400, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) };
  };
  const ok = await callGroupRpc("kintore_group_preview", { p_code: "K7M2QX9A" }, fakeFetch(200, { group_name: "朝トレ部" }));
  assert.deepEqual(ok, { group_name: "朝トレ部" });
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/kintore_group_preview$/);
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].init.headers.apikey.startsWith("sb_publishable_"));
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_code: "K7M2QX9A" });

  assert.equal(await callGroupRpc("kintore_group_set_lock", {}, fakeFetch(204)), null);

  await assert.rejects(
    callGroupRpc("kintore_group_join", {}, fakeFetch(400, { code: "P0001", message: "KINTORE_GROUP_FULL" })),
    err => err instanceof GroupError && err.code === "KINTORE_GROUP_FULL" && err.message === "このグループは満員です",
  );
  await assert.rejects(
    callGroupRpc("kintore_group_join", {}, fakeFetch(500, { message: "something else" })),
    err => err instanceof GroupError && /失敗しました/.test(err.message),
  );
  await assert.rejects(
    callGroupRpc("kintore_group_join", {}, async () => { throw new TypeError("Failed to fetch"); }),
    err => err instanceof GroupError && err.code === "NETWORK",
  );
});

test("group screens, entry point and join-link handling are wired", async () => {
  const [html, app] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  for (const id of ["btn-entry-group", "view-groups", "view-group", "group-list", "btn-group-create", "btn-group-join", "btn-group-transfer-in", "btn-group-settings"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /groups: renderGroups, group: renderGroup/);
  assert.match(app, /showView\("home"\);\s*handleJoinLink\(\);/);
  assert.match(app, /window\.addEventListener\("hashchange", handleJoinLink\)/);
});

test("database migration keeps group tables closed and exposes only checked functions", async () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const [tables, api, removals] = await Promise.all([
    readFile(new URL("20261023140153_kintore_groups_tables.sql", dir), "utf8"),
    readFile(new URL("20261023140237_kintore_groups_api.sql", dir), "utf8"),
    readFile(new URL("20261023140300_kintore_groups_removals.sql", dir), "utf8"),
  ]);
  for (const table of ["kintore_groups", "kintore_group_members", "kintore_group_checkins", "kintore_group_reactions", "kintore_group_comments"]) {
    assert.match(tables, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
  assert.match(tables, /revoke all on table[\s\S]*from public, anon, authenticated;/);
  assert.doesNotMatch(tables, /create policy/i);

  const sql = `${api}\n${removals}`;
  const definers = [...sql.matchAll(/create function public\.(\w+)\([^)]*\)[\s\S]*?\$\$;/g)];
  assert.ok(definers.length >= 18);
  for (const [block, name] of definers) {
    assert.match(block, /set search_path = ''/, `${name} pins search_path`);
    if (/security definer/.test(block) && !["kintore_group_auth", "kintore_group_owner"].includes(name)) {
      assert.match(block, /kintore_group_(auth|owner|require_secret)\(|kintore_group_preview|kintore_group_join/, `${name} checks the caller`);
    }
  }
  // 内部ヘルパーは anon / authenticated に公開しない
  assert.match(api, /revoke all on function\s+public\.kintore_group_hash\(text\)[\s\S]*public\.kintore_group_auth\(uuid, text\)[\s\S]*from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function[^;]*kintore_group_(hash|auth|owner|new_code|unique_code|clean_text|require_secret|membership)\(/);
});
