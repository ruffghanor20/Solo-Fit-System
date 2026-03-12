import {
  register, login,
  getState, toggleTask, claimWeekly, getLogs,
  addCustomMission, patchCustomMission, deleteCustomMission,
  addInventoryItem, removeInventoryItem, upgradeInventory,
  setAvatar, buyStoreItem,
  equipItem, unequipSlot
} from "./localdb.js";

import {
  ATTR_KEYS, ATTR_LABEL,
  computeEffectiveAttrs,
  TRAINING_PLAN, dowKey, isWeekday
} from "./game.js";

const tokenKey = "soloFitV5.token";
const userKey  = "soloFitV5.user";
const DB_NAME  = "solo_fit_v5";

const el = (id) => document.getElementById(id);
const must = (id) => {
  const node = el(id);
  if (!node) throw new Error(`Elemento #${id} não existe no index.html`);
  return node;
};

let lastSnapshot = null;
let debugOn = false;
let pendingInvIconDataUrl = "";

// ---------- storage helpers ----------
function setTop(status){ const p = el("topPill"); if (p) p.textContent = status; }

function setToken(t){ localStorage.setItem(tokenKey, t); }
function getToken(){ return localStorage.getItem(tokenKey); }
function clearToken(){ localStorage.removeItem(tokenKey); }

function setUser(u){ localStorage.setItem(userKey, u); }
function getUser(){ return localStorage.getItem(userKey); }
function clearUser(){ localStorage.removeItem(userKey); }

// ---------- treino dividido (localStorage) ----------
function gymPartsKey(username, day){ return `soloFitV5.gymParts|${username}|${day}`; }
function getGymParts(username, day){
  try {
    const raw = localStorage.getItem(gymPartsKey(username, day));
    const v = raw ? JSON.parse(raw) : null;
    return { warmup: !!v?.warmup, main: !!v?.main, stretch: !!v?.stretch };
  } catch {
    return { warmup:false, main:false, stretch:false };
  }
}
function setGymParts(username, day, parts){
  localStorage.setItem(gymPartsKey(username, day), JSON.stringify({
    warmup: !!parts.warmup,
    main: !!parts.main,
    stretch: !!parts.stretch
  }));
}

// ---------- view helpers ----------
function showGame(){ must("authBox").style.display = "none"; must("gameBox").style.display = "block"; }
function showAuth(){ must("authBox").style.display = "grid"; must("gameBox").style.display = "none"; }

function toast(msg){
  const t = el("toast");
  if (!t) return;
  t.textContent = String(msg || "");
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove("show"), 2200);
}

function money(n){ return `${n} 💰`; }

function safeAsync(fn){
  return async (...args) => {
    try { return await fn(...args); }
    catch (e) {
      console.error(e);
      toast(e?.message || String(e));
      throw e;
    }
  };
}

// ---------- image helper ----------
function fileToDataUrl(file, maxSize){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_context_unavailable"));
          return;
        }

        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

// ---------- Debug UI (injeção) ----------
function ensureDebugPanel(){
  const gameBox = el("gameBox");
  if (!gameBox) return;
  if (el("debugPanel")) return;

  const panel = document.createElement("div");
  panel.id = "debugPanel";
  panel.className = "panel2";
  panel.style.marginBottom = "12px";

  panel.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>
        <div class="mono">DEV / DEBUG</div>
        <div class="hint">Ferramentas (export/import) + debug snapshot.</div>
      </div>
      <div class="row">
        <button id="dbgExportBtn" type="button" title="Baixa um JSON com seu progresso">Export JSON</button>
        <button id="dbgImportBtn" type="button" title="Importa um JSON e restaura progresso">Import JSON</button>
        <button id="dbgToggleBtn" type="button">Debug: OFF</button>
        <button id="dbgResetBtn" class="danger" type="button" title="Apaga IndexedDB + login">Reset DB</button>
      </div>
    </div>
    <input id="dbgImportFile" type="file" accept="application/json" style="display:none" />
    <div id="dbgBox" style="display:none; margin-top:10px;">
      <div class="hint mono">STATE (snapshot)</div>
      <pre class="log mono" id="dbgPre" style="max-height:240px; margin-top:8px;"></pre>
    </div>
  `;

  gameBox.prepend(panel);

  must("dbgToggleBtn").addEventListener("click", () => {
    debugOn = !debugOn;
    must("dbgToggleBtn").textContent = `Debug: ${debugOn ? "ON" : "OFF"}`;
    must("dbgBox").style.display = debugOn ? "block" : "none";
    if (!debugOn) must("dbgPre").textContent = "";
    if (debugOn && lastSnapshot) must("dbgPre").textContent = JSON.stringify(lastSnapshot, null, 2);
  });

  must("dbgResetBtn").addEventListener("click", async () => {
    const ok = confirm("Resetar o banco local (IndexedDB) e deslogar? Isso apaga tudo desse app neste navegador.");
    if (!ok) return;
    await resetLocalDB();
  });

  // Export / Import
  must("dbgExportBtn").addEventListener("click", safeAsync(async () => {
    const username = getUser();
    if (!username) throw new Error("Sem usuário logado.");
    const payload = await exportProgress(username);
    downloadJSON(payload, `solo-fit-v5_${username}.json`);
    toast("Export JSON gerado.");
  }));

  const importFile = must("dbgImportFile");
  must("dbgImportBtn").addEventListener("click", () => importFile.click());

  importFile.addEventListener("change", safeAsync(async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);

    const ok = confirm("Importar esse JSON vai sobrescrever seu progresso local deste usuário. Continuar?");
    if (!ok) { importFile.value = ""; return; }

    const username = getUser();
    if (!username) throw new Error("Sem usuário logado.");
    await importProgress(username, data);

    importFile.value = "";
    toast("Import concluído. Atualizando…");
    await refresh();
  }));
}

async function resetLocalDB(){
  clearToken();
  clearUser();
  lastSnapshot = null;
  setTop("offline");
  showAuth();

  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

  toast("DB resetado. Recarregue e crie/login novamente.");
}

// ---------- Export/Import (IndexedDB direto) ----------
function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function reqToPromise(req){
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function exportProgress(username){
  const db = await openDB();
  const stores = ["users","profiles","day_state","week_state","logs"].filter(n => db.objectStoreNames.contains(n));

  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readonly");
    const out = { version: "solo_fit_v5_export_v1", username, ts: new Date().toISOString(), data:{} };

    (async () => {
      if (stores.includes("users")) out.data.user = await reqToPromise(tx.objectStore("users").get(username));
      if (stores.includes("profiles")) out.data.profile = await reqToPromise(tx.objectStore("profiles").get(username));

      const readAllFilter = async (storeName, filterFn) => {
        const all = await reqToPromise(tx.objectStore(storeName).getAll());
        return (all || []).filter(filterFn);
      };

      if (stores.includes("day_state")) out.data.day_state = await readAllFilter("day_state", (r)=> r?.username === username);
      if (stores.includes("week_state")) out.data.week_state = await readAllFilter("week_state", (r)=> r?.username === username);
      if (stores.includes("logs")) out.data.logs = await readAllFilter("logs", (r)=> r?.username === username);
    })().catch(reject);

    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function importProgress(username, payload){
  if (!payload?.data) throw new Error("JSON inválido (sem data).");

  const db = await openDB();
  const stores = ["users","profiles","day_state","week_state","logs"].filter(n => db.objectStoreNames.contains(n));

  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");

    const sUsers = stores.includes("users") ? tx.objectStore("users") : null;
    const sProfiles = stores.includes("profiles") ? tx.objectStore("profiles") : null;
    const sDay = stores.includes("day_state") ? tx.objectStore("day_state") : null;
    const sWeek = stores.includes("week_state") ? tx.objectStore("week_state") : null;
    const sLogs = stores.includes("logs") ? tx.objectStore("logs") : null;

    if (sUsers && payload.data.user?.username === username) sUsers.put(payload.data.user);
    if (sProfiles && payload.data.profile?.username === username) sProfiles.put(payload.data.profile);

    const wipeAndPut = async (store, rows, keyField) => {
      const all = await reqToPromise(store.getAll());
      for (const r of (all || [])) {
        if (r?.username === username) store.delete(r[keyField]);
      }
      for (const r of (rows || [])) {
        if (r?.username === username) store.put(r);
      }
    };

    (async () => {
      if (sDay) await wipeAndPut(sDay, payload.data.day_state, "key");
      if (sWeek) await wipeAndPut(sWeek, payload.data.week_state, "key");

      if (sLogs) {
        const rows = (payload.data.logs || []).filter(r => r?.username === username);
        for (const r of rows) {
          sLogs.add({ username, ts: r.ts || new Date().toISOString(), message: r.message || "" });
        }
      }
    })().catch(reject);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- Renders ----------
function renderAvatar(dataUrl){
  const img = el("avatarImg");
  const empty = el("avatarEmpty");
  if (!img || !empty) return;

  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
    empty.style.display = "none";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
    empty.style.display = "grid";
  }
}

function renderAttributes(profile){
  const pack = computeEffectiveAttrs(profile);
  const base = pack.baseAttrs || {};
  const eff  = pack.effectiveAttrs || {};
  const b    = pack.equipBonuses || {};

  for (const k of ATTR_KEYS) {
    const baseV = Math.max(1, Number(base[k] || 1));
    const effV  = Math.max(1, Number(eff[k] || baseV));
    const add   = Math.max(0, effV - baseV);

    const node = el(`attr_${k}`);
    const bar  = el(`attrbar_${k}`);

    if (node) node.textContent = add > 0 ? `${effV} (+${add})` : String(effV);
    if (bar) bar.style.width = `${Math.min(100, Math.floor((effV / 20) * 100))}%`;
  }

  const bonusLine = el("bonusLine");
  if (bonusLine) {
    const ms = profile.attrMilestones || {};
    const done = ATTR_KEYS.filter(k => Number(ms[k] || 1) >= 20).length;

    const adds = b.attrAdds || {};
    const parts = ATTR_KEYS
      .filter(k => Number(adds[k] || 0) > 0)
      .map(k => `+${adds[k]} ${ATTR_LABEL[k]}`);

    const gearTxt = parts.length ? ` • Equip: ${parts.join(" • ")}` : "";
    bonusLine.textContent = `Milestones 20/20: ${done}/${ATTR_KEYS.length}${gearTxt}`;
  }
}

/**
 * ✅ Atualizado: iconNode aceita iconUrl (arquivo/URL)
 * Prioridade:
 * 1) iconDataUrl (base64 do usuário / inventário / avatar mini)
 * 2) iconUrl (arquivo local tipo ./assets/store/xxx.png ou http)
 * 3) emoji (icon)
 */
function iconNode({ iconDataUrl = "", iconUrl = "", icon = "" }){
  const wrap = document.createElement("div");

  const url = String(iconDataUrl || iconUrl || "").trim();
  if (url) {
    const img = document.createElement("img");
    img.className = "iimg";
    img.src = url;
    // fallback: se quebrar, mostra emoji
    img.onerror = () => {
      img.remove();
      const span = document.createElement("div");
      span.className = "iemoji";
      span.textContent = icon || "🎒";
      wrap.appendChild(span);
    };
    wrap.appendChild(img);
    return wrap;
  }

  const span = document.createElement("div");
  span.className = "iemoji";
  span.textContent = icon || "🎒";
  wrap.appendChild(span);
  return wrap;
}

function renderEquipment(s){
  const eq = s.profile.equipment || {};
  const slotLabels = { head:"CABEÇA", chest:"PEITO", arms:"BRAÇOS", legs:"PERNAS" };
  const slots = ["head","chest","arms","legs"];

  for (const slot of slots) {
    const host = el(`eq_${slot}`);
    if (!host) continue;
    host.innerHTML = "";

    const item = eq?.[slot];
    if (!item) {
      const empty = document.createElement("div");
      empty.className = "eqEmpty mono";
      empty.textContent = "Vazio";
      host.appendChild(empty);
      continue;
    }

    const row = document.createElement("div");
    row.className = "eqRow";
    row.innerHTML = `
      <div class="eqLeft">
        <div class="eqIcon"></div>
        <div class="eqMeta">
          <div class="eqName mono"></div>
          <div class="hint mono"></div>
        </div>
      </div>
      <button class="eqBtn danger" type="button">Desequipar</button>
    `;

    const iconBox = row.querySelector(".eqIcon");
    iconBox.appendChild(iconNode({
      iconDataUrl: item.iconDataUrl,
      iconUrl: item.iconUrl || "",       // se algum dia você salvar url no item equipado
      icon: item.icon || "🛡️"
    }));

    row.querySelector(".eqName").textContent = `${item.name} [${item.tier || "?"}]`;

    const hint = row.querySelector(".hint");
    const parts = [];
    if (item.attrKey) parts.push(`+${item.attrBonus || 0} ${ATTR_LABEL[item.attrKey] || item.attrKey}`);
    if (item.xpBonusPct != null) parts.push(`+${Math.round(Number(item.xpBonusPct || 0) * 100)}% XP`);
    if (item.setName) parts.push(`SET: ${item.setName}`);
    hint.textContent = parts.join(" • ") || "—";

    row.querySelector("button").addEventListener("click", safeAsync(async () => {
      await unequipSlot(getUser(), slot);
      toast(`${slotLabels[slot]}: desequipado`);
      await refresh();
    }));

    host.appendChild(row);
  }

  const setLine = el("setBonusLine");
  if (setLine) {
    const b = s.equipBonuses || {};
    if (b.hasFullSetS) {
      setLine.textContent = `SET: ATIVO (+${Math.round((b.globalXpPct || 0) * 100)}% XP global • -${b.debtReduce || 0} dívida)`;
    } else {
      setLine.textContent = "SET: inativo";
    }
  }
}

function renderStore(store, coins){
  const list = must("storeList");
  list.innerHTML = "";

  for (const item of (store || [])) {
    const row = document.createElement("div");
    row.className = "storeItem";
    row.innerHTML = `
      <div class="storeLeft">
        <div class="storeIcon"></div>
        <div class="storeText">
          <div class="storeName"></div>
          <div class="storeDesc mono"></div>
        </div>
      </div>
      <div class="storeRight">
        <div class="pill mono"></div>
        <button type="button">Comprar</button>
      </div>
    `;

    const iconBox = row.querySelector(".storeIcon");

    // ✅ AQUI: usa item.iconUrl (do game.js) com fallback
    // fallback extra: se item.icon for "./assets/..." também considera como URL
    const looksLikeUrl =
      typeof item?.icon === "string" &&
      (item.icon.startsWith("./") || item.icon.startsWith("../") || item.icon.startsWith("/") || item.icon.startsWith("http"));

    iconBox.appendChild(iconNode({
      iconUrl: item.iconUrl || (looksLikeUrl ? item.icon : ""),
      icon: (!looksLikeUrl ? (item.icon || "") : "")
    }));

    row.querySelector(".storeName").textContent = item.name;
    row.querySelector(".storeDesc").textContent = item.desc || "";
    row.querySelector(".pill").textContent = `${item.cost} 💰`;

    const btn = row.querySelector("button");
    btn.disabled = coins < item.cost;
    btn.addEventListener("click", safeAsync(async () => {
      btn.disabled = true;
      await buyStoreItem(getUser(), item.id);
      toast(`Comprado: ${item.name}`);
      await refresh();
      btn.disabled = false;
    }));

    list.appendChild(row);
  }
}

function renderCustomMissions(s){
  const box = must("customList");
  box.innerHTML = "";

  const missions = s.profile.customMissions || [];
  el("customCount").textContent = `${missions.length}/20`;

  for (const m of missions) {
    const row = document.createElement("div");
    row.className = "cmRow";
    row.innerHTML = `
      <div class="cmLeft">
        <div class="cmName"></div>
        <div class="cmMeta mono"></div>
      </div>
      <div class="cmRight">
        <select class="cmAttr miniSelect mono"></select>
        <label class="cmToggle mono"><input type="checkbox" class="cmEnabled"> ON</label>
        <label class="cmToggle mono"><input type="checkbox" class="cmDaily"> DAILY</label>
        <button class="cmDel danger" type="button">Remover</button>
      </div>
    `;

    row.querySelector(".cmName").textContent = m.name;
    row.querySelector(".cmMeta").textContent = `XP fixo: 15 • Moedas: +5`;

    const sel = row.querySelector(".cmAttr");
    for (const k of ATTR_KEYS) {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = ATTR_LABEL[k];
      if (m.attrKey === k) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", safeAsync(async () => {
      sel.disabled = true;
      await patchCustomMission(getUser(), m.id, { attrKey: sel.value });
      await refresh();
      sel.disabled = false;
    }));

    const cbEnabled = row.querySelector(".cmEnabled");
    cbEnabled.checked = !!m.enabled;
    cbEnabled.addEventListener("change", safeAsync(async () => {
      cbEnabled.disabled = true;
      await patchCustomMission(getUser(), m.id, { enabled: cbEnabled.checked });
      await refresh();
      cbEnabled.disabled = false;
    }));

    const cbDaily = row.querySelector(".cmDaily");
    cbDaily.checked = !!m.repeatDaily;
    cbDaily.addEventListener("change", safeAsync(async () => {
      cbDaily.disabled = true;
      await patchCustomMission(getUser(), m.id, { repeatDaily: cbDaily.checked });
      await refresh();
      cbDaily.disabled = false;
    }));

    row.querySelector(".cmDel").addEventListener("click", safeAsync(async () => {
      if (!confirm("Remover essa missão custom?")) return;
      await deleteCustomMission(getUser(), m.id);
      await refresh();
    }));

    box.appendChild(row);
  }
}

function renderInventory(s){
  const items = s.profile.inventory || [];
  const cap = s.profile.invCapacity || 15;
  el("invCap").textContent = `${items.length}/${cap}`;

  const list = must("invList");
  list.innerHTML = "";

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "invItem";
    row.innerHTML = `
      <div class="invLeft">
        <div class="invIcon"></div>
        <div class="invText">
          <div class="invName"></div>
          <div class="invMeta hint mono"></div>
        </div>
      </div>
      <div class="invRight">
        <button class="equipBtn" type="button" style="display:none;">Equipar</button>
        <button class="danger" type="button">Remover</button>
      </div>
    `;

    row.querySelector(".invIcon").appendChild(iconNode({
      iconDataUrl: it.iconDataUrl,
      iconUrl: it.iconUrl || "",
      icon: it.icon || (it.kind === "equip" ? "🛡️" : "🎒")
    }));

    row.querySelector(".invName").textContent = it.name;

    const meta = row.querySelector(".invMeta");
    if (it.kind === "equip") {
      const parts = [];
      parts.push(`EQUIP • ${String(it.slot || "").toUpperCase()} • Tier ${it.tier || "?"}`);
      if (it.attrKey) parts.push(`+${it.attrBonus || 0} ${ATTR_LABEL[it.attrKey] || it.attrKey}`);
      if (it.xpBonusPct != null) parts.push(`+${Math.round(Number(it.xpBonusPct || 0) * 100)}% XP`);
      if (it.setName) parts.push(`SET ${it.setName}`);
      meta.textContent = parts.join(" • ");

      const eqBtn = row.querySelector(".equipBtn");
      eqBtn.style.display = "inline-block";
      eqBtn.addEventListener("click", safeAsync(async () => {
        await equipItem(getUser(), it.id);
        toast(`Equipado: ${it.name}`);
        await refresh();
      }));
    } else {
      meta.textContent = "ITEM";
    }

    row.querySelector(".danger").addEventListener("click", safeAsync(async () => {
      await removeInventoryItem(getUser(), it.id);
      await refresh();
    }));

    list.appendChild(row);
  }
}

// ---------- Treino dividido (amarra no taskId "gym") ----------
function ensureTrainingPanel(){
  const gameBox = el("gameBox");
  if (!gameBox) return;
  if (el("trainingPanel")) return;

  const panel = document.createElement("div");
  panel.id = "trainingPanel";
  panel.className = "panel2";
  panel.style.marginBottom = "12px";

  panel.innerHTML = `
    <div class="row" style="justify-content:space-between;">
      <div>
        <div class="mono">TREINO DO DIA</div>
        <div class="hint" id="trainHint">—</div>
      </div>
      <div class="pill mono" id="trainStatus">—</div>
    </div>

    <div class="row" style="margin-top:10px;">
      <label class="cmToggle mono"><input type="checkbox" id="trainWarmup"/> Aquecimento</label>
      <label class="cmToggle mono"><input type="checkbox" id="trainMain"/> Treino principal</label>
      <label class="cmToggle mono"><input type="checkbox" id="trainStretch"/> Alongamento</label>
    </div>
    <div class="hint mono" style="margin-top:8px;">Quando fechar os 3 checks, o app marca automaticamente a missão “Academia”.</div>
  `;

  const dbg = el("debugPanel");
  if (dbg && dbg.parentElement) dbg.insertAdjacentElement("afterend", panel);
  else gameBox.prepend(panel);
}

async function renderTrainingPanel(s, username){
  const hasGym = s.tasks.some(t => t.id === "gym");
  const panel = el("trainingPanel");

  if (!hasGym) {
    if (panel) panel.style.display = "none";
    return;
  }

  ensureTrainingPanel();
  const p = el("trainingPanel");
  p.style.display = "block";

  const today = s.today;
  const dow = dowKey(new Date());
  const plan = TRAINING_PLAN?.[dow];

  const hint = el("trainHint");
  if (hint) hint.textContent = plan ? `Hoje: ${plan.label}` : "Hoje: treino";

  const parts = getGymParts(username, today);

  const warm = must("trainWarmup");
  const main = must("trainMain");
  const stre = must("trainStretch");
  warm.checked = parts.warmup;
  main.checked = parts.main;
  stre.checked = parts.stretch;

  const gymDone = !!s.tasksState?.gym;
  const status = el("trainStatus");
  if (status) status.textContent = gymDone ? "Academia: OK" : "Academia: pendente";

  const onChange = safeAsync(async () => {
    const next = { warmup: warm.checked, main: main.checked, stretch: stre.checked };
    setGymParts(username, today, next);

    const complete = next.warmup && next.main && next.stretch;

    if (complete && !gymDone) {
      await toggleTask(username, "gym", true);
      toast("Treino completo → missão Academia marcada.");
      await refresh();
      return;
    }

    if (!complete && gymDone) {
      await toggleTask(username, "gym", false);
      toast("Treino incompleto → missão Academia desmarcada.");
      await refresh();
      return;
    }

    if (status) status.textContent = complete ? "Treino completo" : "Treino em andamento";
  });

  warm.onchange = onChange;
  main.onchange = onChange;
  stre.onchange = onChange;
}

// ---------- diffs ----------
function diffAndNotify(prev, next){
  if (!prev) return;

  if (next.profile.level > prev.profile.level) toast(`LEVEL UP! ${prev.profile.level} → ${next.profile.level}`);

  const pa = prev.profile.attrs || {};
  const na = next.profile.attrs || {};
  for (const k of ATTR_KEYS) {
    const pv = Number(pa[k] || 1);
    const nv = Number(na[k] || 1);
    if (nv > pv) toast(`+${ATTR_LABEL[k]} (${pv} → ${nv})`);
    if (pv < 20 && nv >= 20) toast(`BÔNUS! ${ATTR_LABEL[k]} 20 → +250 XP`);
  }
}

// ---------- main render ----------
function renderState(s, username){
  el("who").textContent = `USUÁRIO: ${username}`;
  el("dateLine").textContent = `Data: ${s.today} • Semana: ${s.week}`;
  el("weekKeyPill").textContent = `WEEK: ${s.week}`;

  el("rank").textContent = s.profile.rank;
  el("title").textContent = s.profile.title;

  el("level").textContent = s.profile.level;
  el("xpTotal").textContent = s.profile.xp_total;

  const pct = Math.min(100, Math.floor((s.profile.xp_into_level / s.profile.xp_next) * 100));
  el("xpFill").style.width = `${pct}%`;
  el("xpLine").textContent = `${s.profile.xp_into_level} / ${s.profile.xp_next} XP`;

  const debt = s.profile.xp_debt || 0;
  const debtPct = Math.min(100, Math.floor((debt / 200) * 100));
  el("debtFill").style.width = `${debtPct}%`;
  el("debtLine").textContent = `${debt} XP`;

  el("xpToday").textContent = `+${s.xpToday || 0}`;
  el("coinsToday").textContent = `+${s.coinsToday || 0} moedas`;
  el("coinsTotal").textContent = money(s.profile.coins || 0);

  const done = s.tasks.filter(t => !!s.tasksState[t.id]).length;
  el("doneCount").textContent = `${done} / ${s.tasks.length}`;

  const gymCount = ["mon","tue","wed","thu","fri"].reduce((a,k)=>a+(s.gymWeek?.[k]?1:0),0);
  el("gymWeek").textContent = `${gymCount} / 5`;

  const weeklyReady = gymCount === 5;
  if (s.weeklyClaimed) {
    el("weekly").textContent = "Reivindicado";
    el("weekly").className = "v good mono";
  } else if (weeklyReady) {
    el("weekly").textContent = "Pronto";
    el("weekly").className = "v good mono";
  } else {
    el("weekly").textContent = "Pendente";
    el("weekly").className = "v warn mono";
  }

  const hasGym = s.tasks.some(t => t.id === "gym");
  el("dayType").textContent = hasGym ? "Dia útil: treino obrigatório disponível" : "Fim de semana: atividade leve";

  renderAvatar(s.profile.avatarDataUrl || "");
  renderAttributes(s.profile);
  renderEquipment(s);
  renderCustomMissions(s);
  renderInventory(s);
  renderStore(s.store || [], s.profile.coins || 0);

  const list = el("tasks");
  list.innerHTML = "";

  for (const t of s.tasks) {
    const row = document.createElement("div");
    const isDone = !!s.tasksState[t.id];
    row.className = "task" + (isDone ? " done" : "");
    row.innerHTML = `
      <div class="left">
        <input type="checkbox" ${isDone ? "checked" : ""} />
        <div>
          <div class="name"></div>
          <div class="xp mono"></div>
        </div>
      </div>
      <div class="tag mono"></div>
    `;

    row.querySelector(".name").textContent = t.label;
    row.querySelector(".xp").textContent =
      `+${t.xp} XP • +${t.coins || 5} moedas • +${ATTR_LABEL[t.attr] || "ATR"} `;
    row.querySelector(".tag").textContent = t.kind;

    const cb = row.querySelector("input");
    cb.addEventListener("change", safeAsync(async () => {
      cb.disabled = true;
      await toggleTask(username, t.id, cb.checked);
      await refresh();
      cb.disabled = false;
    }));

    list.appendChild(row);
  }

  if (debugOn && el("dbgPre")) el("dbgPre").textContent = JSON.stringify(s, null, 2);
}

async function renderLogs(username){
  try {
    const r = await getLogs(username);
    el("log").textContent = (r.items || [])
      .map(x => `[${new Date(x.ts).toLocaleString("pt-BR")}] ${x.message}`)
      .join("\n");
  } catch (e) {
    console.error(e);
    el("log").textContent = "";
  }
}

// ---------- refresh ----------
async function refresh(){
  const username = getUser();
  if (!username) throw new Error("Sem usuário logado.");

  const s = await getState(username);

  setTop("online");
  diffAndNotify(lastSnapshot, s);
  lastSnapshot = JSON.parse(JSON.stringify(s));

  renderState(s, username);
  await renderTrainingPanel(s, username);
  await renderLogs(username);
}

// ---------- actions ----------
const doRegister = safeAsync(async () => {
  const username = must("username").value.trim();
  const password = must("password").value.trim();
  const msg = el("authMsg");
  await register(username, password);
  msg.textContent = "Registrado. Faça login.";
});

const doLogin = safeAsync(async () => {
  const username = must("username").value.trim();
  const password = must("password").value.trim();
  const msg = el("authMsg");

  const r = await login(username, password);
  setToken(r.token);
  setUser(username);

  showGame();
  ensureDebugPanel();
  await refresh();

  msg.textContent = "";
});

const doClaimWeekly = safeAsync(async () => {
  const username = getUser();
  await claimWeekly(username);
  toast("Bônus semanal aplicado.");
  await refresh();
});

const doAddCustom = safeAsync(async () => {
  const username = getUser();
  const name = must("customName").value.trim();
  const repeat = must("customDaily").checked;
  const attrKey = must("customAttr").value;

  await addCustomMission(username, name, repeat, attrKey);

  must("customName").value = "";
  must("customDaily").checked = true;
  await refresh();
});

const doAddInv = safeAsync(async () => {
  const username = getUser();
  const name = must("invName").value.trim();

  await addInventoryItem(username, name, pendingInvIconDataUrl || "");

  must("invName").value = "";
  pendingInvIconDataUrl = "";
  const invPhoto = el("invPhoto");
  if (invPhoto) invPhoto.value = "";

  await refresh();
});

const doUpgradeInv = safeAsync(async () => {
  const username = getUser();
  const r = await upgradeInventory(username);
  toast(`Inventário: ${r.invCapacity} slots (custou ${r.cost} 💰)`);
  await refresh();
});

const doAvatarPick = safeAsync(async () => {
  const username = getUser();
  const input = must("avatarFile");
  const file = input.files?.[0];
  if (!file) return;

  const dataUrl = await fileToDataUrl(file, 512);
  await setAvatar(username, dataUrl);

  input.value = "";
  toast("Avatar atualizado.");
  await refresh();
});

const doInvPhotoPick = safeAsync(async () => {
  const input = el("invPhoto");
  if (!input) return;
  const file = input.files?.[0];
  if (!file) return;

  pendingInvIconDataUrl = await fileToDataUrl(file, 384);
  toast("Foto do ícone carregada (vai no próximo item).");
});

function logout(){
  clearToken();
  clearUser();
  lastSnapshot = null;
  setTop("offline");
  showAuth();
  toast("Saiu.");
}

// ---------- wire ----------
function wire(){
  must("registerBtn").addEventListener("click", doRegister);
  must("loginBtn").addEventListener("click", doLogin);

  must("claimBtn").addEventListener("click", doClaimWeekly);
  must("logoutBtn").addEventListener("click", logout);

  must("customAddBtn").addEventListener("click", doAddCustom);
  must("invAddBtn").addEventListener("click", doAddInv);
  must("invUpBtn").addEventListener("click", doUpgradeInv);

  must("avatarFile").addEventListener("change", doAvatarPick);

  const invPhoto = el("invPhoto");
  if (invPhoto) invPhoto.addEventListener("change", doInvPhotoPick);
}

// ---------- boot ----------
window.addEventListener("DOMContentLoaded", async () => {
  wire();
  setTop("offline");

  const sel = must("customAttr");
  sel.innerHTML = "";
  for (const k of ATTR_KEYS) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = ATTR_LABEL[k];
    sel.appendChild(opt);
  }
  sel.value = "con";

  const t = getToken();
  const u = getUser();

  if (t && u) {
    showGame();
    ensureDebugPanel();
    try { await refresh(); }
    catch (e) { console.error(e); logout(); }
  } else {
    showAuth();
  }
});
