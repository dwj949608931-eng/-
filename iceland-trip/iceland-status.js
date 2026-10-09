/* iceland-status.js
   冰岛官网直连 + 实时状态卡
   官网：vedur.is 天气 / road.is 路况 / vedur.is 极光
   优先请求官方公开数据；失败时保留基于冬季气候规律的行程建议并提示官网查看。
*/
(function () {
  "use strict";

  const LINKS = [
    { key: "weather", label: "冰岛气象局 · 天气", href: "https://en.vedur.is/", desc: "实时天气 · 风暴预警" },
    { key: "road", label: "冰岛路况 Road.is", href: "https://www.road.is/", desc: "封路 · 路面 · 山口状态" },
    { key: "aurora", label: "极光预报 Vedur.is", href: "https://en.vedur.is/weather/forecasts/aurora/", desc: "极光 Kp 指数 · 云量" }
  ];

  const BASELINE = {
    weather: {
      level: "冬季常态",
      badgeClass: "status-badge--ok",
      text: "行程期（1/28-2/8）为冰岛冬季：白昼约 7-9 小时，常有风雪与阵风，沿海气温多在 0℃ 上下波动。",
      future: "未来几天：出发前重点看风力与降水，暴风预警时减少长途驾驶。"
    },
    road: {
      level: "注意",
      badgeClass: "status-badge--warn",
      text: "1 号公路（Ring Road）冬季多数路段可通行；山口、东海岸与斯奈山沿线需关注冰雪与横风，蓝冰洞集合点（杰古沙龙）停车场需防滑。",
      future: "未来几天：出发当天再次确认 Road.is 封路与山口状态，避开封路路段。"
    },
    aurora: {
      level: "机会较高",
      badgeClass: "status-badge--good",
      text: "2 月冰岛黑夜充足，是极光活跃季。只要晴空无云、远离市区灯光就有机会肉眼可见；Kp 指数实时值请以官网为准。",
      future: "最佳观测时段 21:00-01:00；云量低于 40% 时优先安排观测。"
    }
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 4000);
    return fetch(url, { signal: controller.signal, headers: { "Accept": "application/json" } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("bad status"))))
      .finally(() => clearTimeout(timer));
  }

  function renderLinks() {
    const row = document.getElementById("iceland-status-links");
    if (!row) return;
    row.innerHTML = LINKS.map((link) => `
      <a class="status-link" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">
        <strong>${esc(link.label)}</strong>
        <span>${esc(link.desc)}</span>
      </a>`).join("");
  }

  function renderCard(key, data, link) {
    const card = document.getElementById(`status-card-${key}`);
    if (!card) return;
    card.innerHTML = `
      <div class="status-card__head">
        <strong>${esc(link.label.split("·")[0].trim())}</strong>
        <span class="status-badge ${data.badgeClass}">${esc(data.level)}</span>
      </div>
      <p>${esc(data.text)}</p>
      <div class="status-card__future"><strong>未来几天：</strong>${esc(data.future)}</div>
      <a class="status-card__link" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer">前往官网查看实时数据 ↗</a>`;
  }

  function renderCards() {
    const grid = document.getElementById("iceland-status-cards");
    if (!grid) return;
    grid.innerHTML = LINKS.map((link) => `<div class="status-card" id="status-card-${link.key}"><div class="status-card__head"><strong>加载中…</strong></div></div>`).join("");
    LINKS.forEach((link) => renderCard(link.key, BASELINE[link.key], link));
  }

  function tryLiveData() {
    /* 尝试读取官方公开 JSON；跨域/CORS 失败则忽略，保留基线结论 */
    fetchWithTimeout("https://api.vedur.is/sk/hlutar/vedur/aurora", 3500)
      .then((json) => {
        const level = detectAuroraLevel(json);
        if (level) {
          const data = {
            level: level.label,
            badgeClass: level.cls,
            text: `实时极光预报：${level.label}。${level.detail}`,
            future: "未来几天：观测前 30 分钟再次刷新官网云量与 Kp 指数。"
          };
          renderCard("aurora", data, LINKS[2]);
        }
      })
      .catch(() => { /* 保留基线 */ });

    fetchWithTimeout("https://api.vedur.is/sk/hlutar/vedur/stod-uppl?stod=1", 3500)
      .then((json) => {
        const summary = summarizeWeather(json);
        if (summary) {
          const data = {
            level: summary.level,
            badgeClass: "status-badge--ok",
            text: summary.text,
            future: "未来几天：以官网 24 小时预报为准，风暴预警时减少长途驾驶。"
          };
          renderCard("weather", data, LINKS[0]);
        }
      })
      .catch(() => { /* 保留基线 */ });
  }

  function detectAuroraLevel(json) {
    try {
      const value = Number(json && (json.forecast || json.aurora || json.kp) || NaN);
      if (!isFinite(value)) return null;
      if (value >= 5) return { label: "强（推荐观测）", cls: "status-badge--good", detail: "Kp ≥ 5，预报活跃，晴空下肉眼可见概率高。" };
      if (value >= 3) return { label: "中等（机会较好）", cls: "status-badge--good", detail: `Kp ≈ ${value}，避开灯光、云量低时值得蹲守。` };
      return { label: "较弱", cls: "status-badge--ok", detail: `Kp ≈ ${value}，长曝光可拍，肉眼可能较弱。` };
    } catch (err) {
      return null;
    }
  }

  function summarizeWeather(json) {
    try {
      const t = Number(json && (json.temperature || json.T || json.t) || NaN);
      if (!isFinite(t)) return null;
      const round = Math.round(t);
      return {
        level: `${round}℃`,
        text: `官方实时观测：雷克雅未克附近气温约 ${round}℃，冬季体感更低，注意防风保暖。`,
        future: "未来几天：以官网 24 小时预报为准，风暴预警时减少长途驾驶。"
      };
    } catch (err) {
      return null;
    }
  }

  function init() {
    const section = document.getElementById("iceland-status");
    if (!section) return;
    const label = document.getElementById("status-date-label");
    if (label) label.textContent = "行程期 1/28 - 2/8";
    renderLinks();
    renderCards();
    tryLiveData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
