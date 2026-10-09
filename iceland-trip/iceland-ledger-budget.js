/* iceland-ledger-budget.js
   记账预算卡：每人预算 / 已花费 / 剩余 + 计划花费明细
   数据源：trip-data.json → ledger.budget；已花费实时读取 ledger 本地存储（bills 均摊）
   首次打开自动预填 4 名成员与已支付账单（机票、租车），记账开箱即用。
*/
(function () {
  "use strict";

  const STORAGE_KEY = "travel-plan:runtime:v1:iceland-feb-2026";
  const BUDGET_JSON_URL = "trip-data.json";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad status"))));
  }

  function centsOfBill(bill) {
    const cents = Number(bill && bill.baseAmountCents);
    return isFinite(cents) ? cents : 0;
  }

  function readLedgerSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function sumBills(snapshot) {
    const bills = Array.isArray(snapshot && snapshot.bills) ? snapshot.bills : [];
    let totalCents = 0;
    const travelerCount = Array.isArray(snapshot && snapshot.travelers) && snapshot.travelers.length
      ? snapshot.travelers.length
      : Math.max(1, bills.length);
    bills.forEach((bill) => { totalCents += centsOfBill(bill); });
    return { totalCents, perHead: Math.round(totalCents / Math.max(1, travelerCount)) };
  }

  function seedIfEmpty() {
    const snapshot = readLedgerSnapshot();
    if (snapshot && (snapshot.travelers?.length || snapshot.bills?.length)) return;
    const now = new Date().toISOString();
    const members = [
      { id: "lutou", name: "卤蛋", color: "#7c5cff", initial: "卤" },
      { id: "paidabao", name: "派大宝", color: "#1f7ae0", initial: "派" },
      { id: "heihei", name: "嘿嘿", color: "#2e9e6b", initial: "嘿" },
      { id: "feizhoudeshi", name: "非洲的屎", color: "#d99a1e", initial: "非" }
    ];
    const participantIds = members.map((member) => member.id);
    const paidItems = [
      { id: "bill-flight", note: "机票（含税往返）", category: "交通", amountCents: 772800 },
      { id: "bill-rental", note: "租车（全程分摊）", category: "交通", amountCents: 449600 }
    ];
    const bills = paidItems.map((item) => ({
      id: item.id,
      originalAmountCents: item.amountCents,
      baseAmountCents: item.amountCents,
      currency: "CNY",
      category: item.category,
      note: item.note,
      orderedAt: "",
      payerId: "lutou",
      participantIds,
      createdAt: now,
      updatedAt: now
    }));
    const seed = {
      version: 1,
      settings: { baseCurrency: "CNY", commonCurrencies: ["CNY", "ISK"], lastCurrency: "CNY" },
      travelers: members,
      bills,
      updatedAt: now
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seed)); } catch (error) { /* 忽略写入失败 */ }
  }

  function render(root, budget) {
    if (!root) return;
    const snapshot = readLedgerSnapshot() || {};
    const spent = sumBills(snapshot);
    const perPerson = Number(budget.perPerson) || 30000;
    const spentPerHead = Math.round(spent.perHead / 100);
    const remaining = Math.max(0, perPerson - spentPerHead);
    const items = Array.isArray(budget.items) ? budget.items : [];
    const pendingSum = items.filter((item) => !item.paid).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    const itemRows = items.map((item) => `
      <tr>
        <td>${esc(item.label)}</td>
        <td class="ledger-budget-num">¥${(Number(item.amount) || 0).toLocaleString()}</td>
        <td><span class="status-badge ${item.paid ? "status-badge--good" : "status-badge--warn"}">${item.paid ? "已支付" : "待支付"}</span></td>
      </tr>`).join("");

    root.innerHTML = `
      <section class="ledger-budget-card" aria-labelledby="ledger-budget-title">
        <div class="ledger-budget__head">
          <h3 id="ledger-budget-title">💰 冰岛行程预算 · 每人</h3>
          <span class="ledger-budget__currency">CNY</span>
        </div>
        <div class="ledger-budget__numbers">
          <div class="ledger-budget__stat"><span>总预算</span><strong>¥${perPerson.toLocaleString()}</strong></div>
          <div class="ledger-budget__stat"><span>已花费</span><strong>¥${spentPerHead.toLocaleString()}</strong></div>
          <div class="ledger-budget__stat is-remain"><span>剩余</span><strong>¥${remaining.toLocaleString()}</strong></div>
        </div>
        <p class="ledger-budget__hint">已花费按 4 人均摊（合计已支付 ¥${(Math.round(spent.totalCents / 100)).toLocaleString()}），随记账实时更新；待支付预留合计 ¥${pendingSum.toLocaleString()}。</p>
        <table class="ledger-budget__table">
          <thead><tr><th>计划项目</th><th>金额/人</th><th>状态</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </section>`;
  }

  async function init() {
    const root = document.getElementById("ledger-budget");
    if (!root) return;
    seedIfEmpty();
    let budget = null;
    try {
      const data = await fetchJson(BUDGET_JSON_URL);
      budget = data && data.ledger && data.ledger.budget;
    } catch (error) { /* 保留默认 */ }
    const fallback = { perPerson: 30000, items: [] };
    render(root, budget || fallback);
    window.addEventListener("storage", () => render(root, budget || fallback));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
