/* ===========================================================
   FreedomNumber – Calculator Logic (Professional Build)
   Author: Babu Balasubramanian
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
const LS_KEY = "freedomNumberState:v1";

// Inputs (indicative Indian defaults)
let inputs = {
  currentAge: 40,
  freedomAge: 55,
  lifeAge: 85,
  inflation: 0.06, // default growth when adding new rows
  ret: 0.08,       // post-tax annual return
  buffer: 0.15,    // safety buffer on spending
};

// Regular expenses table
let regular = [
  { id: 1, category: "Housing & Utilities",       amountToday: 360000, growth: 0.05, tenure: 45, startAge: 40 },
  { id: 2, category: "Groceries & Essentials",    amountToday: 240000, growth: 0.06, tenure: 999, startAge: 40 },
  { id: 3, category: "Transport",                 amountToday: 120000, growth: 0.05, tenure: 999, startAge: 40 },
  { id: 4, category: "Healthcare & Insurance",    amountToday: 150000, growth: 0.10, tenure: 999, startAge: 40 },
  { id: 5, category: "Discretionary (Dining/Travel)", amountToday: 180000, growth: 0.07, tenure: 30, startAge: 55 },
  { id: 6, category: "Parents Support",           amountToday: 120000, growth: 0.06, tenure: 10, startAge: 40 },
  { id: 7, category: "Children Schooling",        amountToday: 200000, growth: 0.08, tenure: 10, startAge: 40 },
];

// Planned / one-time expenses table
let planned = [
  { id: 1, event: "Child Higher Education", eventAge: 45, amountToday: 10000000, infl: 0.06 },
  { id: 2, event: "Home Renovation",        eventAge: 50, amountToday: 2500000,  infl: 0.06 },
  { id: 3, event: "Car Replacement",        eventAge: 60, amountToday: 2000000,  infl: 0.05 },
  { id: 4, event: "Medical Contingency",    eventAge: 70, amountToday: 3000000,  infl: 0.10 },
];

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
    if (s.inputs) inputs = { ...inputs, ...s.inputs };
    if (Array.isArray(s.regular)) regular = s.regular;
    if (Array.isArray(s.planned)) planned = s.planned;
  } catch (e) {}
}

/* ---------- Shareable URL (state in query) ---------- */
function encodeState() {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ inputs, regular, planned }))));
}
function decodeState(s) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  } catch (e) {
    return null;
  }
}
function maybeLoadFromURL() {
  const u = new URL(location.href);
  const s = u.searchParams.get("s");
  if (!s) return;
  const st = decodeState(s);
  if (!st) return;
  inputs = { ...inputs, ...st.inputs };
  regular = st.regular || regular;
  planned = st.planned || planned;
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

/* ---------- Core Math ---------- */
function simulate(startingCorpus) {
  const years = [];
  let corpus = startingCorpus;

  for (let age = inputs.currentAge; age <= inputs.lifeAge; age++) {
    const reg = regular.reduce((sum, r) => {
      const active = age >= r.startAge && age < r.startAge + r.tenure;
      if (!active) return sum;
      const yrs = Math.max(0, age - r.startAge);
      const amt = r.amountToday * Math.pow(1 + r.growth, yrs);
      return sum + amt;
    }, 0);

    const plannedThis = planned.reduce((sum, p) => {
      if (age !== p.eventAge) return sum;
      const yrs = Math.max(0, p.eventAge - inputs.currentAge);
      const amt = p.amountToday * Math.pow(1 + p.infl, yrs);
      return sum + amt;
    }, 0);

    const total = reg + plannedThis;
    const totalWithBuffer = total * (1 + inputs.buffer);
    const ret = corpus * inputs.ret;
    const end = corpus + ret - totalWithBuffer;

    years.push({
      age,
      reg,
      planned: plannedThis,
      total,
      totalWithBuffer,
      startCorpus: corpus,
      ret,
      endCorpus: end,
    });
    corpus = end;
  }
  return years;
}

// Bisection goal-seek to make end corpus ~ 0 at lifeAge
function goalSeek(targetEnd = 0, tol = 1) {
  let low = 0;
  let high = 1_00_00_000; // ₹1 cr starting bracket
  const endFor = (s) => {
    const p = simulate(s);
    return p[p.length - 1].endCorpus;
  };
  // Expand high until end >= targetEnd
  let eHigh = endFor(high);
  let guard = 0;
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
  btnPrev.onclick = () => {
    page--;
    renderProjection();
  };
  const btnNext = document.createElement("button");
  btnNext.textContent = "Next";
  btnNext.disabled = page >= totalPages;
  btnNext.onclick = () => {
    page++;
    renderProjection();
  };
  const info = document.createElement("div");
  info.style.margin = "auto 8px";
  info.className = "small";
  info.textContent = `Page ${page} / ${totalPages}`;
  pager.append(btnPrev, info, btnNext);

  // Row count KPI
  $("rowCount").textContent = projection.length;
}

// Sorting: click header
Array.from(document.querySelectorAll("#projTable thead th.sortable")).forEach(
  (th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      if (projSortKey === key) projSortAsc = !projSortAsc;
      else {
        projSortKey = key;
        projSortAsc = true;
      }
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
    inp.addEventListener(
      "input",
      (e) => {
        const id = Number(e.target.dataset.id);
        const k = e.target.dataset.k;
        const row = regular.find((x) => x.id === id);
        if (!row) return;
        row[k] = k === "category" ? e.target.value : Number(e.target.value);
        saveState();
        recompute();
      },
      { passive: true }
    );
  });

  // Bind inputs (planned)
  document.querySelectorAll("#planTable input").forEach((inp) => {
    inp.addEventListener(
      "input",
      (e) => {
        const id = Number(e.target.dataset.id);
        const k = e.target.dataset.k;
        const row = planned.find((x) => x.id === id);
        if (!row) return;
        row[k] = k === "event" ? e.target.value : Number(e.target.value);
        saveState();
        recompute();
      },
      { passive: true }
    );
  });

  // Delete buttons
  document
    .querySelectorAll('button[data-act="delReg"]')
    .forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const id = Number(e.target.dataset.id);
        regular = regular.filter((x) => x.id !== id);
        saveState();
        renderEditableTable();
        recompute();
      })
    );

  document
    .querySelectorAll('button[data-act="delPlan"]')
    .forEach((btn) =>
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
  // top inputs
  inputs.currentAge = Number($("currentAge").value);
  inputs.freedomAge = Number($("freedomAge").value);
  inputs.lifeAge = Number($("lifeAge").value);
  $("lifeAgeEcho").textContent = inputs.lifeAge;
  inputs.inflation = Number($("inflation").value);
  inputs.ret = Number($("ret").value);
  inputs.buffer = Number($("buffer").value);

  saveState();

  // KPI: annual spend today
  const annualToday = regular.reduce((s, r) => {
    const active =
      inputs.currentAge >= r.startAge &&
      inputs.currentAge < r.startAge + r.tenure;
    return s + (active ? r.amountToday : 0);
  }, 0);
  $("kpiAnnual").textContent = R(annualToday);
  $("kpi40x").textContent = R(annualToday * 40);

  // Required starting corpus
  const req = goalSeek(0, 1); // ±₹1 tolerance
  $("kpiReq").textContent = isFinite(req) ? R(req) : "—";

  // Build projection
  projection = simulate(isFinite(req) ? req : 0);

  // KPI: max corpus
  const maxCorpus = projection.reduce(
    (m, y) => Math.max(m, y.endCorpus),
    -Infinity
  );
  $("kpiMax").textContent = R(maxCorpus);

  // KPI: implied SWR in first freedom year
  const yFreedom = projection.find((y) => y.age === inputs.freedomAge);
  let swr = NaN;
  if (yFreedom && yFreedom.startCorpus > 0) {
    swr = yFreedom.totalWithBuffer / yFreedom.startCorpus;
  }
  $("kpiSWR").textContent = P(swr);

  // Render table (page 1)
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
  )}</b> | Return: <b>${R(row.ret)}</b> | Spend+Buffer: <b>${R(
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
    `total = regular + planned = ${R(row.reg)} + ${R(row.planned)} = <b>${R(
      row.total
    )}</b>`,
    `totalWithBuffer = total × (1 + buffer) = ${R(row.total)} × ${
      (inputs.buffer * 100).toFixed(1)
    }% = <b>${R(row.totalWithBuffer)}</b>`,
    `return = startCorpus × returnRate = ${R(row.startCorpus)} × ${
      (inputs.ret * 100).toFixed(1)
    }% = <b>${R(row.ret)}</b>`,
    `endCorpus = startCorpus + return − totalWithBuffer = ${R(
      row.startCorpus
    )} + ${R(row.ret)} − ${R(row.totalWithBuffer)} = <b>${R(
      row.endCorpus
    )}</b>`,
  ]
    .map((x) => `<div>${x}</div>`)
    .join("");
}

/* ---------- Exports & Buttons ---------- */
$("exportBtn").addEventListener("click", () => {
  const rows = [
    "Age,Regular,Planned,Total,Buffer,StartCorpus,Return,EndCorpus",
  ];
  rows.push(
    ...projection.map((r) =>
      [
        r.age,
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
  inputs = {
    currentAge: 40,
    freedomAge: 55,
    lifeAge: 85,
    inflation: 0.06,
    ret: 0.08,
    buffer: 0.15,
  };
  regular = [
    { id: 1, category: "Housing & Utilities",       amountToday: 360000, growth: 0.05, tenure: 45, startAge: 40 },
    { id: 2, category: "Groceries & Essentials",    amountToday: 240000, growth: 0.06, tenure: 999, startAge: 40 },
    { id: 3, category: "Transport",                 amountToday: 120000, growth: 0.05, tenure: 999, startAge: 40 },
    { id: 4, category: "Healthcare & Insurance",    amountToday: 150000, growth: 0.10, tenure: 999, startAge: 40 },
    { id: 5, category: "Discretionary (Dining/Travel)", amountToday: 180000, growth: 0.07, tenure: 30, startAge: 55 },
    { id: 6, category: "Parents Support",           amountToday: 120000, growth: 0.06, tenure: 10, startAge: 40 },
    { id: 7, category: "Children Schooling",        amountToday: 200000, growth: 0.08, tenure: 10, startAge: 40 },
  ];
  planned = [
    { id: 1, event: "Child Higher Education", eventAge: 45, amountToday: 10000000, infl: 0.06 },
    { id: 2, event: "Home Renovation",        eventAge: 50, amountToday: 2500000,  infl: 0.06 },
    { id: 3, event: "Car Replacement",        eventAge: 60, amountToday: 2000000,  infl: 0.05 },
    { id: 4, event: "Medical Contingency",    eventAge: 70, amountToday: 3000000,  infl: 0.10 },
  ];
  // Push values to inputs
  $("currentAge").value = inputs.currentAge;
  $("freedomAge").value = inputs.freedomAge;
  $("lifeAge").value = inputs.lifeAge;
  $("inflation").value = inputs.inflation;
  $("ret").value = inputs.ret;
  $("buffer").value = inputs.buffer;
  renderEditableTable();
  recompute();
  saveState();
});

/* ---------- Init ---------- */
(function init() {
  // Maybe load from ?s=
  maybeLoadFromURL();
  // Load from localStorage
  loadState();

  // Ensure inputs are reflected in UI
  $("currentAge").value = inputs.currentAge;
  $("freedomAge").value = inputs.freedomAge;
  $("lifeAge").value = inputs.lifeAge;
  $("inflation").value = inputs.inflation;
  $("ret").value = inputs.ret;
  $("buffer").value = inputs.buffer;

  // Bind top inputs
  ["currentAge", "freedomAge", "lifeAge", "inflation", "ret", "buffer"].forEach(
    (id) => $(id).addEventListener("input", recompute)
  );

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

  // Render editable tables & compute first time
  renderEditableTable();
  recompute();
})();
