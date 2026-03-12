export const MAX_LEVEL = 99;␊
␊
export const COINS_PER_MISSION = 5;␊
export const CUSTOM_MISSION_XP = 15;␊
␊
export const ATTR_MILESTONE = 20;␊
export const ATTR_MILESTONE_BONUS_XP = 250;␊
␊
export const ATTR_KEYS = ["str","dex","con","int","cha"];␊
export const ATTR_LABEL = {␊
  str: "FORÇA",␊
  dex: "DESTREZA",␊
  con: "CONSTITUIÇÃO",␊
  int: "INTELIGÊNCIA",␊
  cha: "CARISMA"␊
};␊
␊
export const EQUIP_SLOTS = ["head","chest","arms","legs"];␊
export const SLOT_LABEL = {␊
  head: "CABEÇA",␊
  chest: "PEITO",␊
  arms: "BRAÇOS",␊
  legs: "PERNAS"␊
};␊
␊
export const TIER_ORDER = ["C","B","A","S"];␊
export const TIER_COST = { C:50, B:200, A:600, S:2000 };␊
␊
// bônus por tier␊
export const TIER_ATTR_BONUS = { C:1, B:2, A:3, S:5 };␊
export const TIER_XP_BONUS_PCT = { C:0.02, B:0.04, A:0.07, S:0.12 };␊
␊
export const SET_S_NAME = "Monarca das Sombras";␊
export const SET_S_GLOBAL_XP_PCT = 0.15; // +15% xp em tudo␊
export const SET_S_DEBT_REDUCE = 15;     // reduz penalidade diária␊
␊
export const XP = {␊
  breakfast: 15,␊
  lunch: 20,␊
  snack: 10,␊
  dinner: 20,␊
  water: 10,␊
  protein: 20,␊
  calories: 20,␊
␊
  steps: 15,␊
  gym: 70,␊
  cardio: 35,␊
  mobility: 25,␊
  run: 40,␊
␊
  reading: 10,␊
  meditation: 15,␊
  sunlight: 10,␊
  posture: 10,␊
  social: 15,␊
␊
  weeklyGymPerfect: 300␊
};␊
␊
export const TRAINING_PLAN = {␊
  mon: { label: "Peito + Tríceps", xp: XP.gym },␊
  tue: { label: "Costas + Bíceps", xp: XP.gym },␊
  wed: { label: "Perna", xp: XP.gym },␊
  thu: { label: "Ombro + Core", xp: XP.gym },␊
  fri: { label: "Full Body / Cardio", xp: XP.gym },␊
  sat: { label: "Mobilidade / Caminhada", xp: XP.mobility },␊
  sun: { label: "Descanso Ativo", xp: XP.mobility }␊
};␊
␊
export function defaultAttributes(){␊
  return { str:1, dex:1, con:1, int:1, cha:1 };␊
}␊
␊
export function pad2(n){ return String(n).padStart(2,"0"); }␊
export function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }␊
␊
export function isoWeekKey(date){␊
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));␊
  const dayNum = d.getUTCDay() || 7;␊
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);␊
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));␊
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);␊
  return `${d.getUTCFullYear()}-W${pad2(weekNo)}`;␊
}␊
export function dowKey(d){ return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()]; }␊
export function isWeekday(d){ const g=d.getDay(); return g>=1 && g<=5; }␊
␊
export function xpToNext(level){␊
  const L = Math.max(1, Math.min(MAX_LEVEL, level));␊
  return Math.floor(90 + 22 * Math.pow(L, 1.18));␊
}␊
␊
export function computeLevelFromTotalXP(totalXP){␊
  let level = 1;␊
  let xpInto = Math.max(0, totalXP);␊
  while(level < MAX_LEVEL){␊
    const req = xpToNext(level);␊
    if(xpInto >= req){ xpInto -= req; level++; }␊
    else break;␊
  }␊
  return { level, xpInto, reqNext: xpToNext(level) };␊
}␊
␊
/**␊
 * Ranks ajustados para MAX_LEVEL=99.␊
 */␊
export function rankFromLevel(level){␊
  const L = Math.max(1, Math.min(MAX_LEVEL, Number(level || 1)));␊
  if (L >= 90) return "S";␊
  if (L >= 75) return "A";␊
  if (L >= 55) return "B";␊
  if (L >= 35) return "C";␊
  if (L >= 20) return "D";␊
  return "E";␊
}␊
␊
export function titleFromStats({ level, perfectWeeks, mealStreak7, gymStreak5 }){␊
  const L = Math.max(1, Math.min(MAX_LEVEL, Number(level || 1)));␊
  if (L >= 95) return "Monarca";␊
  if (perfectWeeks >= 8) return "Executor de Dungeons";␊
  if (perfectWeeks >= 4) return "Caçador Consistente";␊
  if (gymStreak5 >= 5) return "Disciplina de Aço";␊
  if (mealStreak7 >= 7) return "Nutrição Impecável";␊
  if (L >= 50) return "Veterano";␊
  return "Novato";␊
}␊
␊
// penalidade base: 40␊
export function computeDailyDebtPenalty({ isWeekday, gymDone }){␊
  if (isWeekday && !gymDone) return 40;␊
  return 0;␊
}␊
␊
export function isPerfectGymWeek(gymObj){␊
  return !!(gymObj.mon && gymObj.tue && gymObj.wed && gymObj.thu && gymObj.fri);␊
}␊
␊
// ------------- BONUSES (equipamento) -------------␊
export function computeEquipmentBonuses(profile){␊
  const eq = profile?.equipment || {};␊
  let globalXpPct = 0;   // decimal (ex: 0.15 = +15%)␊
  let debtReduce = 0;␊
␊
  // bônus de XP por atributo (decimal)␊
  const xpPctByAttr = { str:0, dex:0, con:0, int:0, cha:0 };␊
␊
  // bônus de atributo efetivo do equipamento␊
  const attrAdds = { str:0, dex:0, con:0, int:0, cha:0 };␊
␊
  const pieces = EQUIP_SLOTS.map(s => eq[s]).filter(Boolean);␊
  const hasFullSetS =␊
    pieces.length === 4 &&␊
    pieces.every(p => p.tier === "S" && p.setName === SET_S_NAME);␊
␊
  if (hasFullSetS) {␊
    globalXpPct += SET_S_GLOBAL_XP_PCT;␊
    debtReduce += SET_S_DEBT_REDUCE;␊
  }␊
␊
  for (const slot of EQUIP_SLOTS) {␊
    const it = eq[slot];␊
    if (!it) continue;␊
␊
    // XP% por tier, aplicado ao attrKey do item␊
    const pct = TIER_XP_BONUS_PCT[it.tier] || 0;␊
    if (it.attrKey && xpPctByAttr[it.attrKey] != null) {␊
      xpPctByAttr[it.attrKey] += pct;␊
    }␊
␊
    // bônus de atributo: attrBonus aplicado ao attrKey do item␊
    const aKey = it.attrKey;␊
    const aVal = Number(it.attrBonus || 0);␊
    if (aKey && attrAdds[aKey] != null && aVal) {␊
      attrAdds[aKey] += aVal;␊
    }␊
  }␊
␊
  return {␊
    globalXpPct,␊
    xpPctByAttr,␊
    attrAdds,␊
    debtReduce,␊
    hasFullSetS,␊
␊
    // aliases p/ UI antiga (se precisar)␊
    setActive: hasFullSetS,␊
    setXpBonusPct: Math.round((hasFullSetS ? SET_S_GLOBAL_XP_PCT : 0) * 100)␊
  };␊
}␊
␊
/**␊
 * Atributos efetivos = base + bônus do equipamento␊
 */␊
export function computeEffectiveAttrs(profile){␊
  const raw = (profile?.attrs && typeof profile.attrs === "object") ? profile.attrs : {};␊
  const base = { ...defaultAttributes(), ...raw };␊
  for (const k of ATTR_KEYS) base[k] = Math.max(1, Number(base[k] || 1));␊
␊
  const b = computeEquipmentBonuses(profile);␊
  const effective = { ...base };␊
␊
  for (const k of ATTR_KEYS) {␊
    effective[k] = Math.max(1, Number(base[k] || 1) + Number(b.attrAdds?.[k] || 0));␊
  }␊
␊
  return { baseAttrs: base, effectiveAttrs: effective, equipBonuses: b };␊
}␊
␊
export function applyXpBonus(baseXp, attrKey, profile){␊
  const b = computeEquipmentBonuses(profile);␊
  const pct = (b.globalXpPct || 0) + (b.xpPctByAttr?.[attrKey] || 0);␊
  return Math.max(0, Math.round(baseXp * (1 + pct)));␊
}␊
␊
// ------------- MISSÕES -------------␊
function taskBase({ id, label, xp, kind, attr }){␊
  return { id, label, xp, kind, attr, coins: COINS_PER_MISSION, attrDelta: 1 };␊
}␊
␊
export function tasksForDate(date, customMissions = []){␊
  const dow = dowKey(date);␊
␊
  const tasks = [␊
    taskBase({ id:"breakfast", label:"Café da manhã (decente)", xp:XP.breakfast, kind:"meal", attr:"con" }),␊
    taskBase({ id:"lunch",     label:"Almoço (sem sabotagem)",   xp:XP.lunch,     kind:"meal", attr:"con" }),␊
    taskBase({ id:"snack",     label:"Lanche (planejado)",       xp:XP.snack,     kind:"meal", attr:"con" }),␊
    taskBase({ id:"dinner",    label:"Jantar (equilibrado)",     xp:XP.dinner,    kind:"meal", attr:"con" }),␊
␊
    taskBase({ id:"water",     label:"Meta de água batida",      xp:XP.water,     kind:"nutrition", attr:"con" }),␊
    taskBase({ id:"protein",   label:"Meta de proteína batida",  xp:XP.protein,   kind:"nutrition", attr:"str" }),␊
    taskBase({ id:"calories",  label:"Meta calórica (no alvo)",  xp:XP.calories,  kind:"nutrition", attr:"con" }),␊
␊
    taskBase({ id:"steps",     label:"8k+ passos (ou equivalente)", xp:XP.steps,    kind:"habit", attr:"dex" }),␊
    taskBase({ id:"posture",   label:"Postura/pausas (check)",      xp:XP.posture,  kind:"habit", attr:"dex" }),␊
    taskBase({ id:"sunlight",  label:"Sol/Ar livre 10min",          xp:XP.sunlight, kind:"habit", attr:"con" }),␊
␊
    taskBase({ id:"reading",    label:"Leitura 10min",                 xp:XP.reading,    kind:"mind",   attr:"int" }),␊
    taskBase({ id:"meditation", label:"Meditação 5–10min",             xp:XP.meditation, kind:"mind",   attr:"int" }),␊
    taskBase({ id:"social",     label:"Interação social (conversa/ligação)", xp:XP.social, kind:"social", attr:"cha" }),␊
  ];␊
␊
  if (isWeekday(date)) {␊
    tasks.push(taskBase({␊
      id:"gym",␊
      label:`Academia: ${TRAINING_PLAN[dow]?.label || "Treino"}`,␊
      xp: TRAINING_PLAN[dow]?.xp || XP.gym,␊
      kind:"gym",␊
      attr:"str"␊
    }));␊
    tasks.push(taskBase({ id:"cardio", label:"Cardio 20–30min", xp:XP.cardio, kind:"gym", attr:"con" }));␊
    tasks.push(taskBase({ id:"run",    label:"Corrida/HIIT (agilidade)", xp:XP.run, kind:"gym", attr:"dex" }));␊
  } else {␊
    tasks.push(taskBase({␊
      id:"mobility",␊
      label:`Atividade: ${TRAINING_PLAN[dow]?.label || "Mobilidade"}`,␊
      xp: TRAINING_PLAN[dow]?.xp || XP.mobility,␊
      kind:"gym",␊
      attr:"con"␊
    }));␊
    tasks.push(taskBase({ id:"cardio", label:"Cardio leve 20–30min", xp:XP.cardio, kind:"gym", attr:"con" }));␊
    tasks.push(taskBase({ id:"run",    label:"Corrida/HIIT (agilidade)", xp:XP.run, kind:"gym", attr:"dex" }));␊
  }␊
␊
  for (const m of (customMissions || [])) {␊
    if (!m?.enabled || !m.repeatDaily) continue;␊
    const attrKey = ATTR_KEYS.includes(m.attrKey) ? m.attrKey : "con";␊
    tasks.push({␊
      id: `cm_${m.id}`,␊
      label: `Missão Custom: ${m.name}`,␊
      xp: CUSTOM_MISSION_XP,␊
      kind: "custom",␊
      coins: COINS_PER_MISSION,␊
      attr: attrKey,␊
      attrDelta: 1␊
    });␊
  }␊
␊
  return tasks;␊
}␊
␊
// -------- INVENTÁRIO / UPGRADES --------␊
export function inventoryUpgradeTable(){␊
  const table = [␊
    { cap: 15, cost: 0 },␊
    { cap: 20, cost: 50 },␊
    { cap: 25, cost: 75 },␊
    { cap: 30, cost: 100 },␊
  ];␊
  let cap = 35, cost = 125;␊
  while (cap <= 100) { table.push({ cap, cost }); cap += 5; cost += 25; }␊
  return table;␊
}␊
␊
export function nextInventoryUpgrade(currentCap){␊
  const t = inventoryUpgradeTable();␊
  const idx = t.findIndex(x => x.cap === currentCap);␊
  if (idx < 0) {␊
    const below = t.filter(x => x.cap <= currentCap).pop() || t[0];␊
    const i2 = t.findIndex(x => x.cap === below.cap);␊
    return t[i2 + 1] || null;␊
  }␊
  return t[idx + 1] || null;␊
}␊
␊
/* ============================================================␊
   ICONS (URL) — MAPEAMENTO␊
   - Coloque seus arquivos em: web/assets/store/␊
   - Você controla os nomes aqui␊
   ============================================================ */␊
␊
export const STORE_ICON_URL = {␊
  // poções␊
  p_str_1: "./assets/store/p_str_1.png",
  p_dex_1: "./assets/store/p_dex_1.png",
  p_con_1: "./assets/store/p_con_1.png",
  p_int_1: "./assets/store/p_int_1.png",
  p_cha_1: "./assets/store/p_cha_1.png",
␊
  // pergaminhos / selo␊
  scroll_xp_200: "./assets/store/scroll_xp_200.png",
  seal_debt: "./assets/store/seal_debt.png",
␊
  // itens␊
  item_whey: "./assets/store/whey.png",
  item_creatine: "./assets/store/creatine.png",
  item_bottle: "./assets/store/bottle.png",
␊
  // equipamentos (grupo por slot+tier) — funciona como fallback␊
  eq_head_C: "./assets/store/eq_head_C.png",
  eq_head_B: "./assets/store/eq_head_B.png",
  eq_head_A: "./assets/store/eq_head_A.png",
  eq_chest_C: "./assets/store/eq_chest_C.png",
  eq_chest_B: "./assets/store/eq_chest_B.png",
  eq_chest_A: "./assets/store/eq_chest_A.png",
  eq_arms_C: "./assets/store/eq_arms_C.png",
  eq_arms_B: "./assets/store/eq_arms_B.png",
  eq_arms_A: "./assets/store/eq_arms_A.png",
  eq_legs_C: "./assets/store/eq_legs_C.png",
  eq_legs_B: "./assets/store/eq_legs_B.png",
  eq_legs_A: "./assets/store/eq_legs_A.png",
␊
  // set S (Monarca)␊
  eq_head_S_monarca: "./assets/store/eq_head_S_monarca.png",
  eq_chest_S_monarca: "./assets/store/eq_chest_S_monarca.png",
  eq_arms_S_monarca: "./assets/store/eq_arms_S_monarca.png",
  eq_legs_S_monarca: "./assets/store/eq_legs_S_monarca.png",
};␊
␊
// tenta achar iconUrl por id; fallback por slot+tier␊
function resolveIconUrl(item){␊
  const byId = STORE_ICON_URL[item?.id];␊
  if (byId) return byId;␊
␊
  if (item?.type === "equip" && item?.slot && item?.tier) {␊
    // tenta S monarca específico␊
    const keyS = `eq_${item.slot}_S_monarca`;␊
    if (item.tier === "S" && STORE_ICON_URL[keyS]) return STORE_ICON_URL[keyS];␊
␊
    // fallback grupo␊
    const key = `eq_${item.slot}_${item.tier}`; // ex: eq_head_C␊
    if (STORE_ICON_URL[key]) return STORE_ICON_URL[key];␊
  }␊
␊
  return "";␊
}␊
␊
function applyIconUrls(items){␊
  return (items || []).map(it => {␊
    if (!it || typeof it !== "object") return it;␊
␊
    // 1) se já vier iconUrl, respeita␊
    if (it.iconUrl) return it;␊
␊
    // 2) se "icon" já for caminho, converte para iconUrl␊
    const iconLooksLikeUrl =␊
      typeof it.icon === "string" &&␊
      (it.icon.startsWith("./") || it.icon.startsWith("../") || it.icon.startsWith("/") || it.icon.startsWith("http"));␊
␊
    const iconUrl = iconLooksLikeUrl ? it.icon : resolveIconUrl(it);␊
␊
    // se icon era URL, evita mostrar URL como emoji␊
    const icon = iconLooksLikeUrl ? "" : (it.icon || "");␊
␊
    return { ...it, iconUrl, icon };␊
  });␊
}␊
␊
// -------- LOJA BASE (poções/itens) --------␊
export const STORE_BASE_ITEMS = [␊
  { id:"p_str_1", name:"Poção de Força (+1 FOR)",     icon:"🧪", cost: 30, type:"attr", attr:"str", amount:1, desc:"Aumenta FOR em +1." },␊
  { id:"p_dex_1", name:"Poção de Agilidade (+1 DES)", icon:"🧪", cost: 30, type:"attr", attr:"dex", amount:1, desc:"Aumenta DES em +1." },␊
  { id:"p_con_1", name:"Poção de Vigor (+1 CON)",     icon:"🧪", cost: 30, type:"attr", attr:"con", amount:1, desc:"Aumenta CON em +1." },␊
  { id:"p_int_1", name:"Poção da Mente (+1 INT)",     icon:"🧪", cost: 30, type:"attr", attr:"int", amount:1, desc:"Aumenta INT em +1." },␊
  { id:"p_cha_1", name:"Poção de Presença (+1 CAR)",  icon:"🧪", cost: 30, type:"attr", attr:"cha", amount:1, desc:"Aumenta CAR em +1." },␊
␊
  { id:"scroll_xp_200", name:"Pergaminho de XP (+200)", icon:"📜", cost: 60, type:"xp", amount:200, desc:"+200 XP instantâneo." },␊
  { id:"seal_debt", name:"Selo da Redenção (zera dívida)", icon:"🧿", cost: 80, type:"debt", amount:"clear", desc:"Zera sua dívida de XP." },␊
␊
  // seus itens viraram type:"attr" com +15␊
  { id:"item_whey",     name:"Whey Protein (item)",   icon:"🥤", cost: 100, type:"attr", attr:"str", amount:15, desc:"Aumenta FOR em +15." },␊
  { id:"item_creatine", name:"Creatina (item)",       icon:"💊", cost: 100, type:"attr", attr:"dex", amount:15, desc:"Aumenta DES em +15." },␊
  { id:"item_bottle",   name:"Garrafa de Água (item)",icon:"🚰", cost: 100, type:"attr", attr:"con", amount:15, desc:"Aumenta CON em +15." },␊
];␊
␊
// -------- EQUIPAMENTOS (linha a linha) --------␊
const SLOT_DEFAULT_ATTR = {␊
  head: "int",␊
  chest: "con",␊
  arms: "str",␊
  legs: "dex"␊
};␊
␊
const TIER_PREFIX = {␊
  C: "do Iniciado",␊
  B: "do Caçador",␊
  A: "do Mestre",␊
  S: "do Monarca"␊
};␊
␊
export const EQUIP_CATALOG = [␊
  // ---------------- HEAD ----------------␊
  {␊
    id: "eq_head_C_elmo",␊
    type: "equip",␊
    slot: "head",␊
    tier: "C",␊
    setName: "",␊
    name: `Elmo ${TIER_PREFIX.C}`,␊
    icon: "🪖",␊
    cost: TIER_COST.C,␊
    attrKey: SLOT_DEFAULT_ATTR.head,␊
    attrBonus: TIER_ATTR_BONUS.C,␊
    xpBonusPct: TIER_XP_BONUS_PCT.C,␊
    desc: `C • +${TIER_ATTR_BONUS.C} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]} • +${Math.round(TIER_XP_BONUS_PCT.C*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]}.`␊
  },␊
  {␊
    id: "eq_head_B_capuz",␊
    type: "equip",␊
    slot: "head",␊
    tier: "B",␊
    setName: "",␊
    name: `Capuz ${TIER_PREFIX.B}`,␊
    icon: "🪖",␊
    cost: TIER_COST.B,␊
    attrKey: SLOT_DEFAULT_ATTR.head,␊
    attrBonus: TIER_ATTR_BONUS.B,␊
    xpBonusPct: TIER_XP_BONUS_PCT.B,␊
    desc: `B • +${TIER_ATTR_BONUS.B} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]} • +${Math.round(TIER_XP_BONUS_PCT.B*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]}.`␊
  },␊
  {␊
    id: "eq_head_A_coroa",␊
    type: "equip",␊
    slot: "head",␊
    tier: "A",␊
    setName: "",␊
    name: `Coroa ${TIER_PREFIX.A}`,␊
    icon: "🪖",␊
    cost: TIER_COST.A,␊
    attrKey: SLOT_DEFAULT_ATTR.head,␊
    attrBonus: TIER_ATTR_BONUS.A,␊
    xpBonusPct: TIER_XP_BONUS_PCT.A,␊
    desc: `A • +${TIER_ATTR_BONUS.A} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]} • +${Math.round(TIER_XP_BONUS_PCT.A*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]}.`␊
  },␊
  {␊
    id: "eq_head_S_monarca",␊
    type: "equip",␊
    slot: "head",␊
    tier: "S",␊
    setName: SET_S_NAME,␊
    name: `Elmo do ${SET_S_NAME}`,␊
    icon: "🪖",␊
    cost: TIER_COST.S,␊
    attrKey: SLOT_DEFAULT_ATTR.head,␊
    attrBonus: TIER_ATTR_BONUS.S,␊
    xpBonusPct: TIER_XP_BONUS_PCT.S,␊
    desc: `S • +${TIER_ATTR_BONUS.S} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]} • +${Math.round(TIER_XP_BONUS_PCT.S*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.head]}. Set: +${Math.round(SET_S_GLOBAL_XP_PCT*100)}% XP global, -${SET_S_DEBT_REDUCE} dívida.`␊
  },␊
␊
  // ---------------- CHEST ----------------␊
  {␊
    id: "eq_chest_C_armadura",␊
    type: "equip",␊
    slot: "chest",␊
    tier: "C",␊
    setName: "",␊
    name: `Armadura ${TIER_PREFIX.C}`,␊
    icon: "🛡️",␊
    cost: TIER_COST.C,␊
    attrKey: SLOT_DEFAULT_ATTR.chest,␊
    attrBonus: TIER_ATTR_BONUS.C,␊
    xpBonusPct: TIER_XP_BONUS_PCT.C,␊
    desc: `C • +${TIER_ATTR_BONUS.C} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]} • +${Math.round(TIER_XP_BONUS_PCT.C*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]}.`␊
  },␊
  {␊
    id: "eq_chest_B_ladino",␊
    type: "equip",␊
    slot: "chest",␊
    tier: "B",␊
    setName: "",␊
    name: `Roupas do Ladino ${TIER_PREFIX.B}`,␊
    icon: "🛡️",␊
    cost: TIER_COST.B,␊
    attrKey: SLOT_DEFAULT_ATTR.chest,␊
    attrBonus: TIER_ATTR_BONUS.B,␊
    xpBonusPct: TIER_XP_BONUS_PCT.B,␊
    desc: `B • +${TIER_ATTR_BONUS.B} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]} • +${Math.round(TIER_XP_BONUS_PCT.B*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]}.`␊
  },␊
  {␊
    id: "eq_chest_A_tunica",␊
    type: "equip",␊
    slot: "chest",␊
    tier: "A",␊
    setName: "",␊
    name: `Túnica do Mago ${TIER_PREFIX.A}`,␊
    icon: "🛡️",␊
    cost: TIER_COST.A,␊
    attrKey: SLOT_DEFAULT_ATTR.chest,␊
    attrBonus: TIER_ATTR_BONUS.A,␊
    xpBonusPct: TIER_XP_BONUS_PCT.A,␊
    desc: `A • +${TIER_ATTR_BONUS.A} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]} • +${Math.round(TIER_XP_BONUS_PCT.A*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]}.`␊
  },␊
  {␊
    id: "eq_chest_S_monarca",␊
    type: "equip",␊
    slot: "chest",␊
    tier: "S",␊
    setName: SET_S_NAME,␊
    name: `Armadura do ${SET_S_NAME}`,␊
    icon: "🛡️",␊
    cost: TIER_COST.S,␊
    attrKey: SLOT_DEFAULT_ATTR.chest,␊
    attrBonus: TIER_ATTR_BONUS.S,␊
    xpBonusPct: TIER_XP_BONUS_PCT.S,␊
    desc: `S • +${TIER_ATTR_BONUS.S} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]} • +${Math.round(TIER_XP_BONUS_PCT.S*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.chest]}. Set: +${Math.round(SET_S_GLOBAL_XP_PCT*100)}% XP global, -${SET_S_DEBT_REDUCE} dívida.`␊
  },␊
␊
  // ---------------- ARMS ----------------␊
  {␊
    id: "eq_arms_C_protetor",␊
    type: "equip",␊
    slot: "arms",␊
    tier: "C",␊
    setName: "",␊
    name: `Protetor de Braços ${TIER_PREFIX.C}`,␊
    icon: "🧤",␊
    cost: TIER_COST.C,␊
    attrKey: SLOT_DEFAULT_ATTR.arms,␊
    attrBonus: TIER_ATTR_BONUS.C,␊
    xpBonusPct: TIER_XP_BONUS_PCT.C,␊
    desc: `C • +${TIER_ATTR_BONUS.C} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]} • +${Math.round(TIER_XP_BONUS_PCT.C*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]}.`␊
  },␊
  {␊
    id: "eq_arms_B_luvas",␊
    type: "equip",␊
    slot: "arms",␊
    tier: "B",␊
    setName: "",␊
    name: `Luvas ${TIER_PREFIX.B}`,␊
    icon: "🧤",␊
    cost: TIER_COST.B,␊
    attrKey: SLOT_DEFAULT_ATTR.arms,␊
    attrBonus: TIER_ATTR_BONUS.B,␊
    xpBonusPct: TIER_XP_BONUS_PCT.B,␊
    desc: `B • +${TIER_ATTR_BONUS.B} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]} • +${Math.round(TIER_XP_BONUS_PCT.B*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]}.`␊
  },␊
  {␊
    id: "eq_arms_A_cotoveleiras",␊
    type: "equip",␊
    slot: "arms",␊
    tier: "A",␊
    setName: "",␊
    name: `Cotoveleiras ${TIER_PREFIX.A}`,␊
    icon: "🧤",␊
    cost: TIER_COST.A,␊
    attrKey: SLOT_DEFAULT_ATTR.arms,␊
    attrBonus: TIER_ATTR_BONUS.A,␊
    xpBonusPct: TIER_XP_BONUS_PCT.A,␊
    desc: `A • +${TIER_ATTR_BONUS.A} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]} • +${Math.round(TIER_XP_BONUS_PCT.A*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]}.`␊
  },␊
  {␊
    id: "eq_arms_S_monarca",␊
    type: "equip",␊
    slot: "arms",␊
    tier: "S",␊
    setName: SET_S_NAME,␊
    name: `Luvas do ${SET_S_NAME}`,␊
    icon: "🧤",␊
    cost: TIER_COST.S,␊
    attrKey: SLOT_DEFAULT_ATTR.arms,␊
    attrBonus: TIER_ATTR_BONUS.S,␊
    xpBonusPct: TIER_XP_BONUS_PCT.S,␊
    desc: `S • +${TIER_ATTR_BONUS.S} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]} • +${Math.round(TIER_XP_BONUS_PCT.S*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.arms]}. Set: +${Math.round(SET_S_GLOBAL_XP_PCT*100)}% XP global, -${SET_S_DEBT_REDUCE} dívida.`␊
  },␊
␊
  // ---------------- LEGS ----------------␊
  {␊
    id: "eq_legs_C_botas_couro",␊
    type: "equip",␊
    slot: "legs",␊
    tier: "C",␊
    setName: "",␊
    name: `Botas de Couro ${TIER_PREFIX.C}`,␊
    icon: "🥾",␊
    cost: TIER_COST.C,␊
    attrKey: SLOT_DEFAULT_ATTR.legs,␊
    attrBonus: TIER_ATTR_BONUS.C,␊
    xpBonusPct: TIER_XP_BONUS_PCT.C,␊
    desc: `C • +${TIER_ATTR_BONUS.C} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]} • +${Math.round(TIER_XP_BONUS_PCT.C*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]}.`␊
  },␊
  {␊
    id: "eq_legs_B_botas_ladino",␊
    type: "equip",␊
    slot: "legs",␊
    tier: "B",␊
    setName: "",␊
    name: `Botas do Ladino ${TIER_PREFIX.B}`,␊
    icon: "🥾",␊
    cost: TIER_COST.B,␊
    attrKey: SLOT_DEFAULT_ATTR.legs,␊
    attrBonus: TIER_ATTR_BONUS.B,␊
    xpBonusPct: TIER_XP_BONUS_PCT.B,␊
    desc: `B • +${TIER_ATTR_BONUS.B} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]} • +${Math.round(TIER_XP_BONUS_PCT.B*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]}.`␊
  },␊
  {␊
    id: "eq_legs_A_botas_mago",␊
    type: "equip",␊
    slot: "legs",␊
    tier: "A",␊
    setName: "",␊
    name: `Botas do Mago ${TIER_PREFIX.A}`,␊
    icon: "🥾",␊
    cost: TIER_COST.A,␊
    attrKey: SLOT_DEFAULT_ATTR.legs,␊
    attrBonus: TIER_ATTR_BONUS.A,␊
    xpBonusPct: TIER_XP_BONUS_PCT.A,␊
    desc: `A • +${TIER_ATTR_BONUS.A} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]} • +${Math.round(TIER_XP_BONUS_PCT.A*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]}.`␊
  },␊
  {␊
    id: "eq_legs_S_monarca",␊
    type: "equip",␊
    slot: "legs",␊
    tier: "S",␊
    setName: SET_S_NAME,␊
    name: `Botas do ${SET_S_NAME}`,␊
    icon: "🥾",␊
    cost: TIER_COST.S,␊
    attrKey: SLOT_DEFAULT_ATTR.legs,␊
    attrBonus: TIER_ATTR_BONUS.S,␊
    xpBonusPct: TIER_XP_BONUS_PCT.S,␊
    desc: `S • +${TIER_ATTR_BONUS.S} ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]} • +${Math.round(TIER_XP_BONUS_PCT.S*100)}% XP em missões de ${ATTR_LABEL[SLOT_DEFAULT_ATTR.legs]}. Set: +${Math.round(SET_S_GLOBAL_XP_PCT*100)}% XP global, -${SET_S_DEBT_REDUCE} dívida.`␊
  },␊
];␊
␊
export function buildEquipmentCatalog(){␊
  return [...EQUIP_CATALOG];␊
}␊
␊
export function getStoreCatalog(){␊
  return applyIconUrls([...STORE_BASE_ITEMS, ...buildEquipmentCatalog()]);␊
}
