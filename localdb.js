
import {
  ymd, isoWeekKey, dowKey, isWeekday,
  tasksForDate, computeLevelFromTotalXP, rankFromLevel,
  isPerfectGymWeek, computeDailyDebtPenalty, titleFromStats, XP,
  nextInventoryUpgrade,
  defaultAttributes, ATTR_KEYS, ATTR_MILESTONE, ATTR_MILESTONE_BONUS_XP,
  getStoreCatalog as gameStoreCatalog,
  EQUIP_SLOTS, applyXpBonus, computeEquipmentBonuses
} from "./game.js";

const DB_NAME = "solo_fit_v5";
const DB_VER = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("users")) db.createObjectStore("users", { keyPath: "username" });
      if (!db.objectStoreNames.contains("profiles")) db.createObjectStore("profiles", { keyPath: "username" });
      if (!db.objectStoreNames.contains("day_state")) db.createObjectStore("day_state", { keyPath: "key" });
      if (!db.objectStoreNames.contains("week_state")) db.createObjectStore("week_state", { keyPath: "key" });
      if (!db.objectStoreNames.contains("logs")) db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeNames, mode, fn){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = {};
    for (const n of storeNames) stores[n] = t.objectStore(n);

    let out;
    Promise.resolve()
      .then(() => fn(stores))
      .then((r) => { out = r; })
      .catch(reject);

    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqToPromise(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(store){
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function dayKey(username, day){ return `${username}|${day}`; }
function weekKey(username, week){ return `${username}|${week}`; }
function nowDate(){ return new Date(); }

function logMsg(stores, username, message){
  stores.logs.add({ username, ts: new Date().toISOString(), message });
}

async function sha256Base64(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/* ============================================================
   ✅ PATCH: helper para persistir iconUrl
   - Prioriza item.iconUrl (já vem do game.js via applyIconUrls)
   - Se item.icon for um caminho (./assets/...) também aceita
   ============================================================ */
function pickIconUrl(item){
  const icon = String(item?.icon || "");
  const looksLikeUrl =
    icon.startsWith("./") || icon.startsWith("../") || icon.startsWith("/") || icon.startsWith("http");
  return String(item?.iconUrl || (looksLikeUrl ? icon : "") || "");
}

// ---------------- AUTH ----------------
export async function register(username, password){
  if (!username || !password) throw new Error("missing_fields");
  const passHash = await sha256Base64(`${username}:${password}`);

  return tx(["users","profiles","logs"], "readwrite", async (s) => {
    const existing = await reqToPromise(s.users.get(username));
    if (existing) throw new Error("user_exists");

    s.users.put({ username, passHash, createdAt: new Date().toISOString() });

    const attrs = defaultAttributes();
    const milestones = Object.fromEntries(ATTR_KEYS.map(k => [k, 1]));
    const equipment = { head:null, chest:null, arms:null, legs:null };

    s.profiles.put(normalizeProfile({
      username,
      xp_total: 0,
      xp_debt: 0,
      last_day: null,
      last_week: null,
      rank: "E",
      title: "Novato",

      coins: 0,
      avatarDataUrl: "",

      invCapacity: 15,
      inventory: [],

      customMissions: [],

      attrs,
      attrMilestones: milestones,
      equipment
    }));

    logMsg(s, username, "Registro criado localmente.");
    return { ok:true };
  });
}

export async function login(username, password){
  const passHash = await sha256Base64(`${username}:${password}`);
  return tx(["users","logs"], "readwrite", async (s) => {
    const u = await reqToPromise(s.users.get(username));
    if (!u || u.passHash !== passHash) throw new Error("invalid_login");
    logMsg(s, username, "Login efetuado.");
    return { token: await sha256Base64(`token:${username}:${Date.now()}`) };
  });
}

// ---------------- HELPERS ----------------
function normalizeProfile(p){
  const attrs = p.attrs && typeof p.attrs === "object" ? p.attrs : defaultAttributes();
  for (const k of ATTR_KEYS) attrs[k] = Math.max(1, Number(attrs[k] || 1));

  const ms = p.attrMilestones && typeof p.attrMilestones === "object"
    ? p.attrMilestones
    : Object.fromEntries(ATTR_KEYS.map(k => [k, attrs[k]]));

  for (const k of ATTR_KEYS) ms[k] = Math.max(1, Number(ms[k] || 1));

  const equipment = p.equipment && typeof p.equipment === "object"
    ? p.equipment
    : { head:null, chest:null, arms:null, legs:null };

  for (const slot of EQUIP_SLOTS) if (!(slot in equipment)) equipment[slot] = null;

  return {
    ...p,
    coins: p.coins ?? 0,
    avatarDataUrl: p.avatarDataUrl ?? "",
    invCapacity: p.invCapacity ?? 15,
    inventory: Array.isArray(p.inventory) ? p.inventory : [],
    customMissions: Array.isArray(p.customMissions) ? p.customMissions : [],
    attrs,
    attrMilestones: ms,
    equipment
  };
}

async function ensureProfile(stores, username){
  const p = await reqToPromise(stores.profiles.get(username));
  if (p) return normalizeProfile(p);

  const np = normalizeProfile({
    username,
    xp_total:0, xp_debt:0, last_day:null, last_week:null,
    rank:"E", title:"Novato",
    coins:0, avatarDataUrl:"",
    invCapacity:15, inventory:[],
    customMissions:[],
    attrs: defaultAttributes(),
    attrMilestones: Object.fromEntries(ATTR_KEYS.map(k => [k, 1])),
    equipment: { head:null, chest:null, arms:null, legs:null }
  });
  stores.profiles.put(np);
  return np;
}

async function ensureDay(stores, username, day){
  const k = dayKey(username, day);
  const row = await reqToPromise(stores.day_state.get(k));
  if (row) return row;
  const n = { key:k, username, day, tasksState:{}, xp_gained:0, coins_gained:0 };
  stores.day_state.put(n);
  return n;
}

async function ensureWeek(stores, username, week){
  const k = weekKey(username, week);
  const row = await reqToPromise(stores.week_state.get(k));
  if (row) return row;
  const n = { key:k, username, week, gymWeek:{ mon:false,tue:false,wed:false,thu:false,fri:false }, claimed:false };
  stores.week_state.put(n);
  return n;
}

function applyMilestoneIfNeeded(stores, p, username, attrKey){
  const maxReached = p.attrMilestones?.[attrKey] ?? 1;
  const nowVal = p.attrs[attrKey];
  if (maxReached < ATTR_MILESTONE && nowVal >= ATTR_MILESTONE) {
    p.attrMilestones[attrKey] = ATTR_MILESTONE;
    p.xp_total = (p.xp_total || 0) + ATTR_MILESTONE_BONUS_XP;
    logMsg(stores, username, `MILESTONE! ${attrKey.toUpperCase()} chegou em ${ATTR_MILESTONE}. +${ATTR_MILESTONE_BONUS_XP} XP.`);
  } else if (nowVal > maxReached) {
    p.attrMilestones[attrKey] = nowVal;
  }
}

async function rolloverIfNeeded(stores, username){
  const p = await ensureProfile(stores, username);
  const now = nowDate();
  const today = ymd(now);

  if (p.last_day && p.last_day !== today) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yKey = ymd(yesterday);

    const dayRow = await ensureDay(stores, username, yKey);
    const gymDone = !!dayRow.tasksState.gym;

    let debt = computeDailyDebtPenalty({ isWeekday: isWeekday(yesterday), gymDone });

    // aplica redução de dívida via set/gear
    const b = computeEquipmentBonuses(p);
    debt = Math.max(0, debt - (b.debtReduce || 0));

    if (debt > 0) {
      p.xp_debt = (p.xp_debt || 0) + debt;
      logMsg(stores, username, `FALHA: dívida de ${debt} XP (faltou academia em ${yKey}).`);
    }
  }

  p.last_day = today;
  p.last_week = isoWeekKey(now);
  stores.profiles.put(p);
}

// ---------------- CUSTOM MISSIONS ----------------
export async function addCustomMission(username, name, repeatDaily, attrKey){
  name = String(name || "").trim();
  if (!name) throw new Error("name_required");

  const aKey = ATTR_KEYS.includes(attrKey) ? attrKey : "con";

  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    if (p.customMissions.length >= 20) throw new Error("custom_limit_20");

    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
    p.customMissions.push({ id, name, repeatDaily: !!repeatDaily, enabled: true, attrKey: aKey });

    s.profiles.put(p);
    logMsg(s, username, `Criou missão custom: "${name}" (daily=${!!repeatDaily}, attr=${aKey})`);
    return { ok:true };
  });
}

export async function patchCustomMission(username, id, patch){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const m = p.customMissions.find(x => x.id === id);
    if (!m) throw new Error("custom_not_found");

    if (typeof patch.enabled === "boolean") m.enabled = patch.enabled;
    if (typeof patch.repeatDaily === "boolean") m.repeatDaily = patch.repeatDaily;
    if (typeof patch.name === "string") m.name = patch.name.trim().slice(0, 80);
    if (typeof patch.attrKey === "string" && ATTR_KEYS.includes(patch.attrKey)) m.attrKey = patch.attrKey;

    s.profiles.put(p);
    logMsg(s, username, `Atualizou missão custom: "${m.name}"`);
    return { ok:true };
  });
}

export async function deleteCustomMission(username, id){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const before = p.customMissions.length;
    p.customMissions = p.customMissions.filter(x => x.id !== id);
    if (p.customMissions.length === before) throw new Error("custom_not_found");

    s.profiles.put(p);
    logMsg(s, username, `Removeu missão custom (${id}).`);
    return { ok:true };
  });
}

// ---------------- INVENTORY ----------------
export async function addInventoryItem(username, itemName, iconDataUrl = ""){
  itemName = String(itemName || "").trim();
  if (!itemName) throw new Error("item_required");
  iconDataUrl = String(iconDataUrl || "");
  if (iconDataUrl.length > 800_000) throw new Error("image_too_large");

  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    if ((p.inventory?.length || 0) >= p.invCapacity) throw new Error("inventory_full");

    p.inventory.push({
      id: crypto.randomUUID?.() || (Date.now()+"_"+Math.random().toString(16).slice(2)),
      kind: "item",
      name: itemName,
      iconDataUrl
    });

    s.profiles.put(p);
    logMsg(s, username, `Inventário: adicionou "${itemName}".`);
    return { ok:true };
  });
}

export async function removeInventoryItem(username, itemId){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const before = p.inventory.length;
    p.inventory = p.inventory.filter(x => x.id !== itemId);
    if (p.inventory.length === before) throw new Error("item_not_found");

    // se estava equipado, desequipa
    for (const slot of EQUIP_SLOTS) {
      const eq = p.equipment[slot];
      if (eq?.invId === itemId) p.equipment[slot] = null;
    }

    s.profiles.put(p);
    logMsg(s, username, `Inventário: removeu item (${itemId}).`);
    return { ok:true };
  });
}

export async function upgradeInventory(username){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const nxt = nextInventoryUpgrade(p.invCapacity);
    if (!nxt) throw new Error("max_inventory");
    if ((p.coins || 0) < nxt.cost) throw new Error(`need_${nxt.cost}_coins`);

    p.coins -= nxt.cost;
    p.invCapacity = nxt.cap;

    s.profiles.put(p);
    logMsg(s, username, `Upgrade inventário: agora ${p.invCapacity} slots (custou ${nxt.cost} moedas).`);
    return { ok:true, invCapacity: p.invCapacity, coins: p.coins, cost: nxt.cost };
  });
}

// ---------------- AVATAR ----------------
export async function setAvatar(username, dataUrl){
  dataUrl = String(dataUrl || "");
  if (dataUrl.length > 800_000) throw new Error("image_too_large");
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    p.avatarDataUrl = dataUrl;
    s.profiles.put(p);
    logMsg(s, username, `Avatar atualizado.`);
    return { ok:true };
  });
}

// ---------------- EQUIP / UNEQUIP ----------------
export async function equipItem(username, invId){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const it = p.inventory.find(x => x.id === invId);
    if (!it) throw new Error("item_not_found");
    if (it.kind !== "equip") throw new Error("not_equipment");

    const slot = it.slot;
    if (!EQUIP_SLOTS.includes(slot)) throw new Error("bad_slot");

    p.equipment[slot] = {
      invId: it.id,
      name: it.name,
      slot: it.slot,
      tier: it.tier,
      setName: it.setName || "",
      attrKey: it.attrKey,
      attrBonus: it.attrBonus || 0,
      xpBonusPct: it.xpBonusPct || 0,
      icon: it.icon || "",
      iconUrl: it.iconUrl || "",       // ✅ PATCH
      iconDataUrl: it.iconDataUrl || ""
    };

    s.profiles.put(p);
    logMsg(s, username, `Equipou: ${it.name} (${slot}).`);
    return { ok:true };
  });
}

export async function unequipSlot(username, slot){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    if (!EQUIP_SLOTS.includes(slot)) throw new Error("bad_slot");
    p.equipment[slot] = null;
    s.profiles.put(p);
    logMsg(s, username, `Desequipou slot: ${slot}.`);
    return { ok:true };
  });
}

// ---------------- STORE ----------------
export function getStoreCatalog(){
  // ✅ agora retorna o catálogo do game.js, sem recursão
  return gameStoreCatalog();
}

export async function buyStoreItem(username, itemId){
  return tx(["profiles","logs"], "readwrite", async (s) => {
    const p = await ensureProfile(s, username);
    const catalog = gameStoreCatalog();
    const item = catalog.find(x => x.id === itemId);
    if (!item) throw new Error("item_not_found");

    if ((p.coins || 0) < item.cost) throw new Error(`need_${item.cost}_coins`);
    p.coins -= item.cost;

    if (item.type === "attr") {
      const k = item.attr;
      const before = p.attrs[k];
      p.attrs[k] = Math.max(1, before + (item.amount || 1));
      applyMilestoneIfNeeded(s, p, username, k);
      logMsg(s, username, `Comprou ${item.name}. ${k.toUpperCase()}: ${before} → ${p.attrs[k]}`);

    } else if (item.type === "xp") {
      const amount = Number(item.amount || 0);
      p.xp_total = Math.max(0, (p.xp_total || 0) + amount);
      logMsg(s, username, `Comprou ${item.name}. +${amount} XP.`);

    } else if (item.type === "debt") {
      p.xp_debt = 0;
      logMsg(s, username, `Comprou ${item.name}. Dívida zerada.`);

    } else if (item.type === "inv") {
      if ((p.inventory?.length || 0) >= p.invCapacity) {
        p.coins += item.cost; // reembolsa
        throw new Error("inventory_full_upgrade_needed");
      }

      // ✅ PATCH: persiste icon + iconUrl
      p.inventory.push({
        id: crypto.randomUUID?.() || (Date.now()+"_"+Math.random().toString(16).slice(2)),
        kind: "item",
        name: item.itemName || item.name,
        icon: item.icon || "",
        iconUrl: pickIconUrl(item),
        iconDataUrl: ""
      });

      logMsg(s, username, `Comprou ${item.name}. Adicionado ao inventário.`);

    } else if (item.type === "equip") {
      if ((p.inventory?.length || 0) >= p.invCapacity) {
        p.coins += item.cost; // reembolsa
        throw new Error("inventory_full_upgrade_needed");
      }

      // ✅ PATCH: persiste icon + iconUrl
      p.inventory.push({
        id: crypto.randomUUID?.() || (Date.now()+"_"+Math.random().toString(16).slice(2)),
        kind: "equip",
        name: item.name,
        slot: item.slot,
        tier: item.tier,
        setName: item.setName || "",
        attrKey: item.attrKey,
        attrBonus: item.attrBonus || 0,
        xpBonusPct: item.xpBonusPct || 0,
        icon: item.icon || "",
        iconUrl: pickIconUrl(item),
        iconDataUrl: "" // pode ser preenchido via foto depois se quiser
      });

      logMsg(s, username, `Comprou equipamento: ${item.name} (${item.tier}).`);

    } else {
      p.coins += item.cost; // reembolsa
      throw new Error("unknown_item_type");
    }

    s.profiles.put(p);
    return { ok:true, coins: p.coins };
  });
}

// ---------------- GAME ----------------
export async function getState(username){
  return tx(["profiles","day_state","week_state","logs"], "readwrite", async (s) => {
    await rolloverIfNeeded(s, username);

    const now = nowDate();
    const today = ymd(now);
    const week = isoWeekKey(now);

    const p = await ensureProfile(s, username);
    const dayRow = await ensureDay(s, username, today);
    const weekRow = await ensureWeek(s, username, week);

    const tasks = tasksForDate(now, p.customMissions);
    const levelInfo = computeLevelFromTotalXP(p.xp_total || 0);
    const rank = rankFromLevel(levelInfo.level);

    const last30 = (await getAll(s.day_state))
      .filter(x => x.username === username)
      .sort((a,b)=> (a.day < b.day ? 1 : -1))
      .slice(0, 30)
      .map(x => ({ day:x.day, xp_gained:x.xp_gained||0, tasksState:x.tasksState||{} }));

    const last7 = last30.slice(0,7);
    const xp7 = last7.reduce((a,r)=>a+(r.xp_gained||0),0);

    const claimedWeeks = (await getAll(s.week_state)).filter(x => x.username === username && !!x.claimed).length;
    const mealStreak7 = (() => {
      let streak = 0;
      for (const d of last7) {
        const ok = !!(d.tasksState?.breakfast && d.tasksState?.lunch && d.tasksState?.snack && d.tasksState?.dinner);
        if (ok) streak++; else break;
      }
      return streak;
    })();

    const gymStreak5 = ["mon","tue","wed","thu","fri"].reduce((a,k)=>a+(weekRow.gymWeek?.[k]?1:0),0);
    const title = titleFromStats({ level: levelInfo.level, perfectWeeks: claimedWeeks, mealStreak7, gymStreak5 });

    p.rank = rank;
    p.title = title;
    s.profiles.put(p);

    return {
      today, week,
      profile: {
        xp_total: p.xp_total || 0,
        xp_debt: p.xp_debt || 0,
        rank, title,
        level: levelInfo.level,
        xp_into_level: levelInfo.xpInto,
        xp_next: levelInfo.reqNext,

        coins: p.coins || 0,
        avatarDataUrl: p.avatarDataUrl || "",

        invCapacity: p.invCapacity || 15,
        inventory: p.inventory || [],

        customMissions: p.customMissions || [],

        attrs: p.attrs,
        attrMilestones: p.attrMilestones,
        equipment: p.equipment
      },
      tasks,
      tasksState: dayRow.tasksState || {},
      gymWeek: weekRow.gymWeek || { mon:false,tue:false,wed:false,thu:false,fri:false },
      weeklyClaimed: !!weekRow.claimed,
      xpToday: dayRow.xp_gained || 0,
      coinsToday: dayRow.coins_gained || 0,
      store: gameStoreCatalog(),
      equipBonuses: computeEquipmentBonuses(p),
      stats: { xp7, last30 }
    };
  });
}

export async function toggleTask(username, taskId, done){
  return tx(["profiles","day_state","week_state","logs"], "readwrite", async (s) => {
    await rolloverIfNeeded(s, username);

    const now = nowDate();
    const today = ymd(now);
    const week = isoWeekKey(now);
    const dow = dowKey(now);

    const p = await ensureProfile(s, username);
    const dayRow = await ensureDay(s, username, today);
    const weekRow = await ensureWeek(s, username, week);

    const tasks = tasksForDate(now, p.customMissions);
    const taskDef = tasks.find(t => t.id === taskId);
    if (!taskDef) throw new Error("task_not_found");

    const was = !!dayRow.tasksState[taskId];
    if (was === done) return { ok:true };

    dayRow.tasksState[taskId] = done;

    // XP com bônus de equipamento
    const baseXp = taskDef.xp;
    const boostedXp = applyXpBonus(baseXp, taskDef.attr, p);
    let deltaXP = done ? boostedXp : -boostedXp;

    // coins
    const coinDelta = done ? (taskDef.coins || 5) : -(taskDef.coins || 5);

    // atributo
    const attrKey = taskDef.attr;
    const attrDelta = (done ? (taskDef.attrDelta || 1) : -(taskDef.attrDelta || 1));

    // paga dívida antes de ganhar XP
    if (deltaXP > 0 && (p.xp_debt || 0) > 0) {
      const debtPaid = Math.min(p.xp_debt, deltaXP);
      p.xp_debt -= debtPaid;
      deltaXP -= debtPaid;
      logMsg(s, username, `DÍVIDA PAGA: -${debtPaid} XP (antes do ganho).`);
    }

    p.xp_total = Math.max(0, (p.xp_total || 0) + deltaXP);
    dayRow.xp_gained = Math.max(0, (dayRow.xp_gained || 0) + (done ? boostedXp : -boostedXp));

    p.coins = Math.max(0, (p.coins || 0) + coinDelta);
    dayRow.coins_gained = Math.max(0, (dayRow.coins_gained || 0) + coinDelta);

    if (ATTR_KEYS.includes(attrKey)) {
      const before = p.attrs[attrKey];
      p.attrs[attrKey] = Math.max(1, before + attrDelta);
      applyMilestoneIfNeeded(s, p, username, attrKey);
      logMsg(s, username, `${done ? "Atributo +" : "Atributo -"} ${attrKey.toUpperCase()} (${before} → ${p.attrs[attrKey]})`);
    }

    // marca semana de academia
    if (taskId === "gym" && isWeekday(now)) {
      if (["mon","tue","wed","thu","fri"].includes(dow)) weekRow.gymWeek[dow] = done;
    }

    s.profiles.put(p);
    s.day_state.put(dayRow);
    s.week_state.put(weekRow);

    logMsg(s, username, `${done ? "Concluiu" : "Desmarcou"} ${taskId} (+${boostedXp} XP, +${taskDef.coins||5} moedas).`);
    return { ok:true };
  });
}

export async function claimWeekly(username){
  return tx(["profiles","week_state","logs"], "readwrite", async (s) => {
    const now = nowDate();
    const week = isoWeekKey(now);

    const p = await ensureProfile(s, username);
    const w = await ensureWeek(s, username, week);

    if (w.claimed) throw new Error("already_claimed");
    if (!isPerfectGymWeek(w.gymWeek)) throw new Error("not_ready");

    w.claimed = true;
    p.xp_total = (p.xp_total || 0) + XP.weeklyGymPerfect;

    s.week_state.put(w);
    s.profiles.put(p);

    logMsg(s, username, `BÔNUS SEMANAL: +${XP.weeklyGymPerfect} XP.`);
    return { ok:true };
  });
}

export async function getLogs(username){
  return tx(["logs"], "readonly", async (s) => {
    const all = await getAll(s.logs);
    const items = all
      .filter(x => x.username === username)
      .sort((a,b)=> (a.id < b.id ? 1 : -1))
      .slice(0, 200)
      .map(({ts,message}) => ({ ts, message }));
    return { items };
  });
}