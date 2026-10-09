/* route-ui.js
   路线浏览器：总览/每日切换 + Leaflet 真实地图
   依赖 overview-map.js 的 initTravelRealMap
*/
(function () {
  "use strict";

  const DAY_LABELS = {
    0: "总览",
    1: "DAY 1 抵达",
    2: "DAY 2 雷市",
    3: "DAY 3 黄金圈",
    4: "DAY 4 休整",
    5: "DAY 5 南岸",
    6: "DAY 6 东线",
    7: "DAY 7 蓝冰洞",
    8: "DAY 8 雷市",
    9: "DAY 9 斯奈山",
    10: "DAY 10 温泉",
    11: "DAY 11 观鲸",
    12: "DAY 12 返程"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  /* 兼容原模板接口 */
  function travelMapMarkup() {
    return "";
  }
  function dailyMapLayoutFor() {
    return null;
  }
  function placeOptions(source, placeId) {
    const place = (source && source.places || []).find((p) => p.id === placeId);
    return place ? [[place.nameZh || place.name, place.nameZh || place.name]] : [[placeId, placeId]];
  }
  function scheduleItemsForPin() {
    return [];
  }

  let routesJsonLoaded = null;

  function loadRoutesJson() {
    if (routesJsonLoaded) return routesJsonLoaded;
    routesJsonLoaded = fetch("assets/routes.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { window.TRAVEL_ROUTES = (data && data.routes) || {}; })
      .catch(() => { window.TRAVEL_ROUTES = {}; });
    return routesJsonLoaded;
  }

  function dayButtons() {
    const routeDays = (window.TRAVEL_PLAN_DATA && window.TRAVEL_PLAN_DATA.map && window.TRAVEL_PLAN_DATA.map.dailyRoutes || [])
      .map((r) => Number(r.day));
    const days = [0, ...routeDays.sort((a, b) => a - b)];
    return days.map((day) => `<button type="button" class="route-day-tab${day === 0 ? " is-active" : ""}" data-day="${day}">${esc(DAY_LABELS[day] || `DAY ${day}`)}</button>`).join("");
  }

  function renderPanel(root, dayNumber) {
    const previousScroll = root.scrollTop;
    root.innerHTML = `
      <div class="route-day-tabs" role="tablist" aria-label="路线天数">${dayButtons()}</div>
      <div class="real-map-shell" id="real-map-shell"></div>
      <p class="route-caption">路线为驾车导航示意（OSRM 路径）；导航点坐标已按地理坐标标注，点击图钉可查看地点，外部导航使用必应地图（国内可访问）。</p>`;
    const tabs = root.querySelector(".route-day-tabs");
    tabs.onclick = (event) => {
      const button = event.target.closest("[data-day]");
      if (!button) return;
      root.querySelectorAll("[data-day]").forEach((b) => b.classList.toggle("is-active", b === button));
      renderPanel(root, Number(button.dataset.day));
    };
    const shell = root.querySelector("#real-map-shell");
    const source = window.TravelOverviewMap.travelMapSource();
    window.TravelOverviewMap.initTravelRealMap(shell, { source, day: dayNumber, fitBounds: true });
    root.scrollTop = previousScroll;
  }

  function setupRouteExplorer() {
    const root = document.getElementById("route-explorer");
    if (!root) return;
    root.innerHTML = `<div class="route-day-tabs">${dayButtons()}</div><div class="real-map-shell" id="real-map-shell"></div><p class="route-caption">正在加载真实地图与路线…</p>`;
    loadRoutesJson().then(() => renderPanel(root, 0));
  }

  function renderRoutePanel(regionId, dayNumber) {
    const root = document.getElementById("route-explorer");
    if (!root) return;
    const day = Number(dayNumber) || 0;
    renderPanel(root, day);
  }

  /* 裸全局兼容（app.js 直接调用） */
  window.setupRouteExplorer = setupRouteExplorer;
  window.renderRoutePanel = renderRoutePanel;

  window.RouteUI = {
    renderRoutePanel,
    setupRouteExplorer,
    travelMapMarkup,
    dailyMapLayoutFor,
    placeOptions,
    scheduleItemsForPin
  };
})();
