// グループ機能（ログイン不要・招待コード制）のAPI呼び出しと、この端末に保存する参加情報
// 参加情報の secret はこの端末だけに保存し、サーバーにはハッシュだけが残る。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { formatSet, formatDuration, formatPace, formatNumber } from "./share.js";

const STORAGE_KEY = "kintore-groups-v1";
const TRANSFER_PREFIX = "KTG1-";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOP_EXERCISES = 5;

export const INVITE_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
export const GROUP_REACTIONS = ["👏", "🔥", "💪", "🎉"];
export const GROUP_POST_WINDOW_DAYS = 7;

const ERROR_MESSAGES = {
  NETWORK: "通信できませんでした。ネット接続を確認してください",
  UNKNOWN: "グループの処理に失敗しました。時間をおいて試してください",
  KINTORE_GROUP_AUTH: "このグループの参加情報が確認できませんでした。退出したか、メンバーから外された可能性があります",
  KINTORE_GROUP_NOT_FOUND: "招待コードが見つかりません。コードを確認してください",
  KINTORE_GROUP_LOCKED: "このグループは今、新しいメンバーの参加を止めています",
  KINTORE_GROUP_FULL: "このグループは満員です",
  KINTORE_GROUP_NAME_TAKEN: "同じ名前のメンバーがいます。別の名前にしてください",
  KINTORE_GROUP_NAME_REQUIRED: "名前を入力してください",
  KINTORE_GROUP_RATE_LIMIT: "今はグループを作成できません。時間をおいて試してください",
  KINTORE_GROUP_DAY: "投稿できるのは過去7日以内の記録です",
  KINTORE_GROUP_SUMMARY: "投稿内容が大きすぎます",
  KINTORE_GROUP_NOT_OWNER: "この操作はグループのオーナーだけができます",
  KINTORE_GROUP_COMMENT_REQUIRED: "コメントを入力してください",
  KINTORE_GROUP_COMMENT_LIMIT: "この投稿にはこれ以上コメントできません",
  KINTORE_GROUP_RANGE: "表示する期間が長すぎます",
  KINTORE_GROUP_EMOJI: "このリアクションは使えません",
};

export class GroupError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GroupError";
    this.code = code;
  }
}

export async function callGroupRpc(name, params, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new GroupError("NETWORK", ERROR_MESSAGES.NETWORK);
  }
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "";
    const code = message.startsWith("KINTORE_GROUP_") ? message : (body?.code || `HTTP_${response.status}`);
    throw new GroupError(code, ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN);
  }
  return body;
}

// 取り消し系の関数（リアクション・投稿の取り消し・退出など）がサーバーに入っているかを確かめる。
// 存在すれば架空のメンバーで呼んで認証エラーになり、未適用なら「関数が見つからない」になる。
// 判定できない（通信エラー）ときは null を返す。
export async function detectRemovalSupport(fetchImpl = globalThis.fetch) {
  try {
    await callGroupRpc("kintore_group_react", {
      p_member_id: "00000000-0000-4000-8000-000000000000",
      p_secret: "0".repeat(32),
      p_checkin_id: "00000000-0000-4000-8000-000000000000",
      p_emoji: "👏",
    }, fetchImpl);
    return true;
  } catch (err) {
    if (err.code === "NETWORK") return null;
    return !(err.code === "PGRST202" || err.code === "HTTP_404");
  }
}

/* ---------- 招待コード・招待リンク ---------- */
export function normalizeInviteCode(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseJoinHash(hash) {
  const match = /^#join=([A-Za-z0-9-]+)$/.exec(String(hash ?? ""));
  const code = match ? normalizeInviteCode(match[1]) : "";
  return INVITE_CODE_RE.test(code) ? code : null;
}

export function inviteUrl(code, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}#join=${code}`;
}

export function inviteText(groupName, code, url) {
  return `筋トレMEMOのグループ「${groupName}」に招待します💪\n参加コード：${code}\n${url}`;
}

/* ---------- この端末の参加情報 ---------- */
export function newMemberSecret(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isMembership(m) {
  return Boolean(m) && UUID_RE.test(m.memberId) && UUID_RE.test(m.groupId)
    && typeof m.secret === "string" && m.secret.length >= 32;
}

export function loadMemberships(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(list) ? list.filter(isMembership) : [];
  } catch {
    return [];
  }
}

export function saveMemberships(list, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(list.filter(isMembership)));
}

// 同じグループの参加情報は1つだけ持つ（引き継ぎ直しなどで重複させない）
export function upsertMembership(list, membership) {
  return [...list.filter(m => m.memberId !== membership.memberId && m.groupId !== membership.groupId), membership];
}

export function removeMembership(list, memberId) {
  return list.filter(m => m.memberId !== memberId);
}

export function membershipFromResponse(json, secret) {
  return {
    memberId: json.member_id,
    secret,
    groupId: json.group_id,
    groupName: json.group_name,
    displayName: json.display_name,
    joinedAt: new Date().toISOString(),
  };
}

export function encodeTransferCode(membership) {
  return `${TRANSFER_PREFIX}${membership.memberId}.${membership.secret}`;
}

export function decodeTransferCode(text) {
  const raw = String(text ?? "").replace(/\s+/g, "");
  if (!raw.startsWith(TRANSFER_PREFIX)) return null;
  const [memberId, secret] = raw.slice(TRANSFER_PREFIX.length).split(".");
  if (!UUID_RE.test(memberId || "") || !secret || secret.length < 32 || secret.length > 200) return null;
  return { memberId, secret };
}

/* ---------- 投稿（チェックイン）の内容 ---------- */
// 共有するのは種目名・ベストセット・合計とランの距離/時間だけ。食事・体重・メモは含めない
export function checkinPayload(summary, { stretch = false } = {}) {
  const totals = summary.weightTotals;
  return {
    v: 1,
    weight: summary.weight.length ? {
      exercises: totals.exercises,
      sets: totals.sets,
      volume: Math.round(totals.volume),
      top: summary.weight.slice(0, MAX_TOP_EXERCISES).map(ex => ({
        n: String(ex.name).slice(0, 30),
        w: ex.best.w,
        r: ex.best.r,
        s: ex.sets,
      })),
    } : null,
    run: summary.run ? {
      km: Math.round(summary.run.distance * 100) / 100,
      sec: Math.round(summary.run.durationSec),
    } : null,
    stretch: Boolean(stretch),
  };
}

export function hasCheckinContent(payload, note = "") {
  return Boolean(payload.weight || payload.run || payload.stretch || String(note).trim());
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// 他のメンバーが送った内容なので、型を確かめてから表示用の文字列にする（HTMLの無害化は表示側で行う）
export function checkinLines(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  const lines = [];
  if (s.weight && typeof s.weight === "object") {
    const w = s.weight;
    lines.push({ kind: "weight", text: `🏋️ ウェイト ${num(w.exercises)}種目・${num(w.sets)}セット・総負荷 ${formatNumber(num(w.volume))}kg` });
    (Array.isArray(w.top) ? w.top.slice(0, MAX_TOP_EXERCISES) : []).forEach(ex => {
      const name = String(ex?.n ?? "種目").slice(0, 30);
      lines.push({ kind: "exercise", text: `${name} ${formatSet({ w: num(ex?.w), r: num(ex?.r) })}` });
    });
  }
  if (s.run && typeof s.run === "object") {
    const km = num(s.run.km);
    const sec = num(s.run.sec);
    lines.push({ kind: "run", text: `🏃 ランニング ${formatNumber(km, 2)}km・${formatDuration(sec)}${km ? `（${formatPace(sec / km)}/km）` : ""}` });
  }
  if (s.stretch === true) lines.push({ kind: "stretch", text: "🧘 ストレッチ" });
  return lines;
}

export function reactionCounts(reactions, myMemberId) {
  const list = Array.isArray(reactions) ? reactions : [];
  return GROUP_REACTIONS.map(emoji => {
    const matching = list.filter(r => r?.emoji === emoji);
    return { emoji, count: matching.length, mine: matching.some(r => r.member_id === myMemberId) };
  });
}
