/* ===========================================================
   FreedomNumber – Calculator Logic (Pro Build, India)
   Adds: current corpus, monthly SIP (pre-freedom), retirement income,
         TER haircut, longevity presets, tax regime, stress test.
   =========================================================== */

/* ---------- Utilities ---------- */
const fmtINR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const pct = new Intl.NumberFormat("en-IN", {
  style: "percent",
  maximumFractionDigits: 1,
});
const R = (n) => (isFinite(n) ? fmtINR.format(Math.round(n)) : "—");
const P = (n) => (isFinite(n) ? pct.format(n) : "—");
const $ = (id) => document.getElementById(id);

/* ---------- Persistent State ---------- */
const LS_KEY = "freedomNumberState:v2"; // bump version to avoid old cache

// Indicative Indian defaults (used for seeding and Prefill)
const DEFAULT_INPUTS = {
  currentAge: 40,
  freedomAge: 55,
  lifeAge: 85,
  inflation: 0.06,  // used also as default row growth
  ret: 0.08,        // nominal post-tax return BEFORE TER
  buffer: 0.15,     // safety buffer on spending
  currentCorpus: 2000000,         // ₹
  monthlySIP: 30000,              // ₹ until freedom age (inclusive start, exclusive end)
  annualRetirementIncome: 240000, // ₹ after freedom age
  ter: 0.0075,                    // 0.75% p.a. haircut on return
  taxRegime: "new",               // "old" | "new" (placeholder for future tax logic)
  stress: "off",                  // "off" | "bear"
};

const DEFAULT_REGULAR = [
  { id: 1, category: "Housing & Utilities",            amountToday: 360000, growth: 0.05, tenure: 45,  startAge: 40 },
  { id: 2, category: "Groceries & Essentials",         amountToday: 240000, growth: 0.06, tenure: 999, startAge: 40 },
  { id: 3, category: "Transport",                      amountToday: 120000, growth: 0.05, tenure: 999, startAge: 40 },
  { id: 4, category: "Healthcare & Insurance",         amountToday: 150000, growth: 0.10, tenure: 999, startAge: 40 },
  { id: 5, category: "Discretionary (Dining/Travel)",  amountToday: 180000, growth: 0.07, tenure: 30,  startAge: 55 },
  { id: 6, category: "Parents Support",                amountToday: 120000, growth: 0.06, tenure: 10,  startAge: 40 },
  { id: 7, category: "Children Schooling",             amountToday: 200000, growth: 0.08, tenure: 10,  startAge: 40 },
];

const DEFAULT_PLANNED = [
  { id: 1, event: "Child Higher Education", eventAge: 45, amountToday: 10000000, infl: 0.06 },
  { id: 2, event: "Home Renovation",        eventAge: 50, amountToday: 2500000,  infl: 0.06 },
  { id: 3, event: "Car Replacement",        eventAge: 60, amountToday: 2000000,  infl: 0.05 },
  { id: 4, event: "Medical Contingency",    eventAge: 70, amountToday: 3000000,  infl: 0.10 },
];

// Live state
let inputs   = { ...DEFAULT_INPUTS };
let regular  = DEFAULT_REGULAR.map(x => ({ ...x }));
let planned  = DEFAULT_PLANNED.map(x => ({ ...x }));

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ inputs, regular, planned }));
  } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.inputs) inputs = { ...DEFAULT_INPUTS, ...s.inputs };
    if (Array.isArray(s.regular)) regular = s.regular;
    if (Array.isArray(s.planned)) planned = s.planned;
  } catch (e) {}
}

/* ---------- Shareable URL (state in query) ---------- */
function encodeState() {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ inputs, regular, planned }))));
}
function decodeState(s) {
  try { return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  catch { return null; }
}
function maybeLoadFromURL() {
  const u = new URL(location.href);
  const s = u.searchParams.get("s");
  if (!s) return;
  const st = decodeState(s);
  if (!st) return;
  inputs  = { ...DEFAULT_INPUTS, ...st.inputs };
  regular = Array.isArray(st.regular) ? st.regular : regular;
  planned = Array.isArray(st.planned) ? st.planned : planned;
}
function writeShareURL() {
  const qs = new URL(location.href);
  qs.searchParams.set("s", encodeState());
  history.replaceState({}, "", qs.toString());
  if (navigator.clipboard) {
    navigator.clipboard.writeText(qs.toString());
    alert("Shareable link copied to clipboard.");
  } else {
    alert("Shareable link ready in the address bar.");
  }
}

/* ---------- Return engine (with TER + optional stress) ---------- */
function effectiveNominalReturn(age) {
  // Base effective nominal = user nominal post-tax minus TER
  let r = inputs.ret - inputs.ter; // could be < 0 in extreme cases; allowed
  // Stress: first 10 years AFTER freedom age → reduce REAL return by 2% (−0.02)
  if (inputs.stress === "bear" && age >= inputs.freedomAge && age < inputs.freedomAge + 10) {
    const realBase = (1 + r) / (1 + inputs.inflation) - 1;    // convert to real
    const realStressed = realBase - 0.02;                     // −2% real
    r = (1 + realStressed) * (1 + inputs.inflation) - 1;      // back to nominal
  }
  return r;
}

/* ---------- Core Math ---------- */
/**
 * simulate(startingLumpSumToday)
 * startingLumpSumToday: the EXTRA lump sum provided today (over and above currentCorpus)
 * Engine also adds monthly SIP (annualised) before freedom age.
 */
function simulate(startingLumpSumToday) {
  const years = [];
  let corpus = startingLumpSumToday + inputs.currentCorpus; // start with user corpus + extra

  for (let age = inputs.currentAge; age <= inputs.lifeAge; age++) {
    // Contributions before freedom age
    const sipAnnual = age < inputs.freedomAge ? inputs.monthlySIP * 12 : 0;
    corpus += sipAnnual; // assume start-of-year contribution for simplicity

    // Regular spend for this age
    const reg = regular.reduce((sum, r) => {
      const active = age >= r.startAge && age < r.startAge + r.tenure;
      if (!active) return sum;
      const yrs = Math.max(0, age - r.startAge);
      const amt = r.amountToday * Math.pow(1 + r.growth, yrs);
      return sum + amt;
    }, 0);

    // Planned events in this age
    const plannedThis = planned.reduce((sum, p) => {
      if (age !== p.eventAge) return sum;
      const yrs = Math.max(0, p.eventAge - inputs.currentAge);
      const amt = p.amountToday * Math.pow(1 + p.infl, yrs);
      return sum + amt;
    }, 0);

    // Spend + buffer
    const total = reg + plannedThis;
    let totalWithBuffer = total * (1 + inputs.buffer);

    // Retirement income offset (post-freedom)
    if (age >= inputs.freedomAge && inputs.annualRetirementIncome > 0) {
      totalWithBuffer = Math.max(0, totalWithBuffer - inputs.annualRetirementIncome);
    }

    // Return
    const rEff = effectiveNominalReturn(age);
    const ret = corpus * rEff;

    // End corpus
    const end = corpus + ret - totalWithBuffer;

    years.push({
      age,
      reg,
      planned: plannedThis,
      total,
      totalWithBuffer,
      startCorpus: corpus,
      contrib: sipAnnual,
      ret,
      endCorpus: end,
    });

    corpus = end;
  }

  return years;
}

// Goal-seek to find EXTRA lump sum needed today so that end corpus ~ 0
function goalSeek(targetEnd = 0, tol = 1) {
  let low = 0;
  let high = 1_00_00_000; // ₹1 cr bracket
  const endFor = (s) => simulate(s).slice(-1)[0].endCorpus;

  // Expand high upward until enough
  let eHigh = endFor(high), guard = 0;
  while (eHigh < targetEnd && guard < 40) {
    high *= 2;
    eHigh = endFor(high);
    guard++;
  }
  if (eHigh < targetEnd) return NaN;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const e = endFor(mid);
    if (Math.abs(e - targetEnd) <= tol) return mid;
    if (e > targetEnd) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

/* ---------- Projection Table (sort + paginate) ---------- */
let projection = [];
let projSortKey = "age";
let projSortAsc = true;
let page = 1;
const pageSize = 12;

function renderProjection() {
  const sorted = [...projection].sort((a, b) => {
    const k = projSortKey;
    return projSortAsc ? a[k] - b[k] : b[k] - a[k];
  });

  // Update aria-sort
  document.querySelectorAll("#projTable thead th.sortable").forEach((th) => {
    const key = th.dataset.key;
    th.setAttribute(
      "aria-sort",
      key === projSortKey ? (projSortAsc ? "ascending" : "descending") : "none"
    );
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  page = Math.min(page, totalPages);
  const slice = sorted.slice((page - 1) * pageSize, page * pageSize);

  const tb = document.querySelector("#projTable tbody");
  tb.innerHTML = "";
  for (const r of slice) {
    const tr = document.createElement("tr");
    tr.title = "Click to audit this year";
    tr.addEventListener("click", () => openAudit(r.age));
    tr.innerHTML = `
      <td>${r.age}</td>
      <td class="num">${R(r.reg)}</td>
      <td class="num">${R(r.planned)}</td>
      <td class="num">${R(r.total)}</td>
      <td class="num">${R(r.totalWithBuffer)}</td>
      <td class="num">${R(r.startCorpus)}</td>
      <td class="num">${R(r.ret)}</td>
      <td class="num">${R(r.endCorpus)}</td>
    `;
    tb.appendChild(tr);
  }

  // Pager
  const pager = $("pager");
  pager.innerHTML = "";
  const btnPrev = document.createElement("button");
  btnPrev.textContent = "Prev";
  btnPrev.disabled = page <= 1;
  btnPrev.onclick = () => { page--; renderProjection(); };

  const btnNext = document.createElement("button");
  btnNext.textContent = "Next";
  btnNext.disabled = page >= totalPages;
  btnNext.onclick = () => { page++; renderProjection(); };

  const info = document.createElement("div");
  info.style.margin = "auto 8px";
  info.className = "small";
  info.textContent = `Page ${page} / ${totalPages}`;
  pager.append(btnPrev, info, btnNext);

  $("rowCount").textContent = projection.length;
}

// Sorting: click header
Array.from(document.querySelectorAll("#projTable thead th.sortable")).forEach(
  (th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (projSortKey === key) projSortAsc = !projSortAsc;
      else { projSortKey = key; projSortAsc = true; }
      renderProjection();
    });
  }
);

/* ---------- Editable Tables (Regular & Planned) ---------- */
function renderEditableTable() {
  // Regular
  const rtb = document.querySelector("#regTable tbody");
  rtb.innerHTML = "";
  for (const r of regular) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input value="${r.category}" data-id="${r.id}" data-k="category"></td>
      <td class="num"><input type="number" inputmode="decimal" value="${r.amountToday}" data-id="${r.id}" data-k="amountToday"></td>
      <td class="num"><input type="number" inputmode="decimal" step="0.001" value="${r.growth}" data-id="${r.id}" data-k="growth"><span class="small"> 0.06 = 6%</span></td>
      <td class="num"><input type="number" inputmode="numeric" value="${r.tenure}" data-id="${r.id}" data-k="tenure"></td>
      <td class="num"><input type="number" inputmode="numeric" value="${r.startAge}" data-id="${r.id}" data-k="startAge"></td>
      <td><button class="btn btn--secondary" data-id="${r.id}" data-act="delReg">Remove</button></td>
    `;
    rtb.appendChild(tr);
  }

  // Planned
  const ptb = document.querySelector("#planTable tbody");
  ptb.innerHTML = "";
  for (const p of planned) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input value="${p.event}" data-id="${p.id}" data-k="event" data-type="planned"></td>
      <td class="num"><input type="number" inputmode="numeric" value="${p.eventAge}" data-id="${p.id}" data-k="eventAge" data-type="planned"></td>
      <td class="num"><input type="number" inputmode="decimal" value="${p.amountToday}" data-id="${p.id}" data-k="amountToday" data-type="planned"></td>
      <td class="num"><input type="number" inputmode="decimal" step="0.001" value="${p.infl}" data-id="${p.id}" data-k="infl" data-type="planned"><span class="small"> 0.06 = 6%</span></td>
      <td><button class="btn btn--secondary" data-id="${p.id}" data-act="delPlan">Remove</button></td>
    `;
    ptb.appendChild(tr);
  }

  // Bind inputs (regular)
  document.querySelectorAll("#regTable input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const id = Number(e.target.dataset.id);
      const k = e.target.dataset.k;
      const row = regular.find((x) => x.id === id);
      if (!row) return;
      row[k] = k === "category" ? e.target.value : Number(e.target.value);
      saveState();
      recompute();
    }, { passive: true });
  });

  // Bind inputs (planned)
  document.querySelectorAll("#planTable input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const id = Number(e.target.dataset.id);
      const k = e.target.dataset.k;
      const row = planned.find((x) => x.id === id);
      if (!row) return;
      row[k] = k === "event" ? e.target.value : Number(e.target.value);
      saveState();
      recompute();
    }, { passive: true });
  });

  // Delete buttons
  document.querySelectorAll('button[data-act="delReg"]').forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.dataset.id);
      regular = regular.filter((x) => x.id !== id);
      saveState();
      renderEditableTable();
      recompute();
    })
  );
  document.querySelectorAll('button[data-act="delPlan"]').forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.dataset.id);
      planned = planned.filter((x) => x.id !== id);
      saveState();
      renderEditableTable();
      recompute();
    })
  );
}

/* ---------- Recompute Pipeline ---------- */
function recompute() {
  inputs.currentAge            = Number($("currentAge").value);
  inputs.freedomAge            = Number($("freedomAge").value);
  inputs.lifeAge               = Number($("lifeAge").value);
  $("lifeAgeEcho").textContent = inputs.lifeAge;
  inputs.inflation             = Number($("inflation").value);
  inputs.ret                   = Number($("ret").value);
  inputs.buffer                = Number($("buffer").value);

  // New fields
  inputs.currentCorpus         = Number($("currentCorpus").value);
  inputs.monthlySIP            = Number($("monthlySIP").value);
  inputs.annualRetirementIncome= Number($("annualRetirementIncome").value);
  inputs.ter                   = Number($("ter").value);

  saveState();

  // KPI: annual spend today
  const annualToday = regular.reduce((s, r) => {
    const active = inputs.currentAge >= r.startAge && inputs.currentAge < r.startAge + r.tenure;
    return s + (active ? r.amountToday : 0);
  }, 0);
  $("kpiAnnual").textContent = R(annualToday);
  $("kpi40x").textContent    = R(annualToday * 40);

  // Required EXTRA starting lump sum (over and above current corpus + SIP)
  const extraReq = goalSeek(0, 1); // ±₹1 tolerance
  $("kpiReq").textContent = isFinite(extraReq) ? R(extraReq) : "—";

  // Build projection using EXTRA lump sum
  projection = simulate(isFinite(extraReq) ? extraReq : 0);

  // KPI: max corpus
  const maxCorpus = projection.reduce((m, y) => Math.max(m, y.endCorpus), -Infinity);
  $("kpiMax").textContent = R(maxCorpus);

  // KPI: implied SWR in first freedom year (after income offset)
  const yFreedom = projection.find((y) => y.age === inputs.freedomAge);
  let swr = NaN;
  if (yFreedom && yFreedom.startCorpus > 0) {
    swr = yFreedom.totalWithBuffer / yFreedom.startCorpus;
  }
  $("kpiSWR").textContent = P(swr);

  // Render table
  page = 1;
  renderProjection();
}

/* ---------- Audit Modal ---------- */
const backdrop = $("auditBackdrop");
const auditAgeInput = $("auditAge");

function openAudit(age) {
  if (!projection.length) return;
  auditAgeInput.value = age ?? inputs.currentAge;
  buildAudit(Number(auditAgeInput.value));
  backdrop.style.display = "flex";
}
function closeAudit() {
  backdrop.style.display = "none";
}
$("auditBtn").addEventListener("click", () => openAudit(inputs.freedomAge));
$("auditClose").addEventListener("click", closeAudit);
$("auditGo").addEventListener("click", () =>
  buildAudit(Number(auditAgeInput.value))
);
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeAudit();
});

function buildAudit(age) {
  const row = projection.find((r) => r.age === age);
  if (!row) {
    $("auditSummary").textContent = "No data for the selected age.";
    $("auditRegular").innerHTML = "";
    $("auditPlanned").innerHTML = "";
    $("auditAgg").innerHTML = "";
    return;
  }

  $("auditSummary").innerHTML = `Age <b>${age}</b> | Start: <b>${R(
    row.startCorpus
  )}</b> | Contribution: <b>${R(row.contrib)}</b> | Return: <b>${R(row.ret)}</b> | Spend+Buffer: <b>${R(
    row.totalWithBuffer
  )}</b> | End: <b>${R(row.endCorpus)}</b>`;

  // regular breakdown
  const regs = regular
    .map((r) => {
      const active = age >= r.startAge && age < r.startAge + r.tenure;
      if (!active) return null;
      const yrs = age - r.startAge;
      const val = r.amountToday * Math.pow(1 + r.growth, yrs);
      return `${r.category}: ${R(r.amountToday)} × (1+${
        (r.growth * 100).toFixed(1)
      }%)^${yrs} = <b>${R(val)}</b>`;
    })
    .filter(Boolean);
  $("auditRegular").innerHTML = regs.length
    ? regs.map((x) => `<div>${x}</div>`).join("")
    : '<div class="small">— none —</div>';

  // planned breakdown
  const plans = planned
    .map((p) => {
      if (age !== p.eventAge) return null;
      const yrs = p.eventAge - inputs.currentAge;
      const val = p.amountToday * Math.pow(1 + p.infl, yrs);
      return `${p.event}: ${R(p.amountToday)} × (1+${
        (p.infl * 100).toFixed(1)
      }%)^${yrs} = <b>${R(val)}</b>`;
    })
    .filter(Boolean);
  $("auditPlanned").innerHTML = plans.length
    ? plans.map((x) => `<div>${x}</div>`).join("")
    : '<div class="small">— none —</div>';

  // aggregation
  $("auditAgg").innerHTML = [
    `total = regular + planned = ${R(row.reg)} + ${R(row.planned)} = <b>${R(row.total)}</b>`,
    `totalWithBuffer = total × (1 + buffer) ${age >= inputs.freedomAge && inputs.annualRetirementIncome>0 ? `− retirement income ${R(inputs.annualRetirementIncome)} ` : ""}= <b>${R(row.totalWithBuffer)}</b>`,
    `return = startCorpus × effectiveRate(age)`,
    `endCorpus = startCorpus + return + contribution − totalWithBuffer = ${R(row.startCorpus)} + ${R(row.ret)} + ${R(row.contrib)} − ${R(row.totalWithBuffer)} = <b>${R(row.endCorpus)}</b>`,
  ].map((x) => `<div>${x}</div>`).join("");
}

/* ---------- Exports & Buttons ---------- */
$("exportBtn").addEventListener("click", () => {
  const rows = ["Age,Contribution,Regular,Planned,Total,Buffer,StartCorpus,Return,EndCorpus"];
  rows.push(
    ...projection.map((r) =>
      [
        r.age,
        r.contrib,
        r.reg,
        r.planned,
        r.total,
        r.totalWithBuffer,
        r.startCorpus,
        r.ret,
        r.endCorpus,
      ].join(",")
    )
  );
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "projection.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("shareBtn").addEventListener("click", writeShareURL);

$("resetBtn")?.addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  location.href = location.pathname;
});

$("loadIndicative")?.addEventListener("click", () => {
  inputs  = { ...DEFAULT_INPUTS };
  regular = DEFAULT_REGULAR.map(x => ({ ...x }));
  planned = DEFAULT_PLANNED.map(x => ({ ...x }));

  // Push values to inputs
  $("currentAge").value             = inputs.currentAge;
  $("freedomAge").value             = inputs.freedomAge;
  $("lifeAge").value                = inputs.lifeAge;
  $("inflation").value              = inputs.inflation;
  $("ret").value                    = inputs.ret;
  $("buffer").value                 = inputs.buffer;
  $("currentCorpus").value          = inputs.currentCorpus;
  $("monthlySIP").value             = inputs.monthlySIP;
  $("annualRetirementIncome").value = inputs.annualRetirementIncome;
  $("ter").value                    = inputs.ter;

  renderEditableTable();
  recompute();
  saveState();
});

/* ---------- Top Controls (longevity, tax, stress) ---------- */
function markActive(groupIds, activeId) {
  groupIds.forEach(id => {
    const btn = $(id);
    if (!btn) return;
    if (id === activeId) {
      btn.setAttribute("aria-pressed", "true");
      btn.style.filter = "brightness(1.12)";
    } else {
      btn.setAttribute("aria-pressed", "false");
      btn.style.filter = "brightness(1)";
    }
  });
}

$("life85")?.addEventListener("click", () => {
  inputs.lifeAge = 85; $("lifeAge").value = 85; markActive(["life85","life90","life95"], "life85"); recompute();
});
$("life90")?.addEventListener("click", () => {
  inputs.lifeAge = 90; $("lifeAge").value = 90; markActive(["life85","life90","life95"], "life90"); recompute();
});
$("life95")?.addEventListener("click", () => {
  inputs.lifeAge = 95; $("lifeAge").value = 95; markActive(["life85","life90","life95"], "life95"); recompute();
});

$("taxOld")?.addEventListener("click", () => {
  inputs.taxRegime = "old"; markActive(["taxOld","taxNew"], "taxOld"); saveState();
});
$("taxNew")?.addEventListener("click", () => {
  inputs.taxRegime = "new"; markActive(["taxOld","taxNew"], "taxNew"); saveState();
});

$("stressOff")?.addEventListener("click", () => {
  inputs.stress = "off"; markActive(["stressOff","stressOn"], "stressOff"); recompute();
});
$("stressOn")?.addEventListener("click", () => {
  inputs.stress = "bear"; markActive(["stressOff","stressOn"], "stressOn"); recompute();
});

/* ---------- Init ---------- */
(function init() {
  // URL → state, then localStorage → state
  maybeLoadFromURL();
  loadState();

  // Seed defaults if tables are empty
  if (!Array.isArray(regular) || regular.length === 0) regular = DEFAULT_REGULAR.map(x => ({ ...x }));
  if (!Array.isArray(planned) || planned.length === 0) planned = DEFAULT_PLANNED.map(x => ({ ...x }));

  // Reflect inputs to UI
  $("currentAge").value             = inputs.currentAge;
  $("freedomAge").value             = inputs.freedomAge;
  $("lifeAge").value                = inputs.lifeAge;
  $("inflation").value              = inputs.inflation;
  $("ret").value                    = inputs.ret;
  $("buffer").value                 = inputs.buffer;
  $("currentCorpus").value          = inputs.currentCorpus;
  $("monthlySIP").value             = inputs.monthlySIP;
  $("annualRetirementIncome").value = inputs.annualRetirementIncome;
  $("ter").value                    = inputs.ter;

  // Set button visual states
  markActive(["life85","life90","life95"], `life${inputs.lifeAge}`);
  markActive(["taxOld","taxNew"], inputs.taxRegime === "old" ? "taxOld" : "taxNew");
  markActive(["stressOff","stressOn"], inputs.stress === "bear" ? "stressOn" : "stressOff");

  // Bind top inputs
  ["currentAge","freedomAge","lifeAge","inflation","ret","buffer","currentCorpus","monthlySIP","ter","annualRetirementIncome"]
    .forEach(id => $(id).addEventListener("input", recompute));

  // Add-row buttons
  $("addReg").addEventListener("click", () => {
    regular.push({
      id: Date.now(),
      category: "New Item",
      amountToday: 0,
      growth: inputs.inflation,
      tenure: 10,
      startAge: inputs.currentAge,
    });
    saveState();
    renderEditableTable();
    recompute();
  });

  $("addPlan").addEventListener("click", () => {
    planned.push({
      id: Date.now(),
      event: "New Event",
      eventAge: inputs.currentAge + 1,
      amountToday: 0,
      infl: inputs.inflation,
    });
    saveState();
    renderEditableTable();
    recompute();
  });

  // Render & compute
  renderEditableTable();
  recompute();
})();
