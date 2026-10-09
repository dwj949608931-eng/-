/* overview-map.js
   冰岛真实地图渲染（Leaflet）+ 模板兼容层
   - 瓦片：高德地图优先，自动回退 Carto / OSM（国内可加载）
   - 地点：按 trip-data.json map.places 的地理坐标标注，中文名不重叠
   - 路线：routes.json 的真实导航路径（OSRM），无数据时直连示意
*/
(function () {
  "use strict";

  const ROUTE_COLORS = ["#d94b4b", "#1f7ae0", "#2e9e6b", "#d99a1e", "#8e5cd6", "#e05fb2", "#23a6b5", "#7b8c3f", "#d4574b", "#3e6fb0"];
  const TILE_SOURCES = [
    { name: "高德地图", url: "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}", subdomains: "0123", attribution: "© 高德地图" },
    { name: "Carto Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" },
    { name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", subdomains: "abc", attribution: "© OpenStreetMap" }
  ];

  function colorForDay(day) {
    return ROUTE_COLORS[(Math.max(1, Number(day) || 1) - 1) % ROUTE_COLORS.length];
  }

  function mapData() {
    const data = window.TRAVEL_PLAN_DATA || {};
    return data.map || { places: [], dailyRoutes: [] };
  }

  /* ---------- 兼容层（app.js / route-ui.js 需要） ---------- */
  function travelMapRegions() {
    return [{ id: "is", label: "冰岛" }];
  }
  function travelMapSource() {
    const map = mapData();
    return {
      id: "is",
      label: "冰岛",
      places: map.places || [],
      routes: map.dailyRoutes || [],
      dailyRoutes: map.dailyRoutes || [],
      disclaimer: map.disclaimer || ""
    };
  }
  function placeLayersFor() {
    return mapData().places || [];
  }
  function routeLayersFor() {
    const map = mapData();
    const list = map.dailyRoutes || [];
    return list.map((route) => ({
      day: Number(route.day),
      color: route.color || colorForDay(route.day),
      placeIds: Array.isArray(route.placeIds) ? route.placeIds : []
    }));
  }
  function travelOverviewArtwork() {
    return "";
  }
  function mapsSearch(query) {
    return `https://cn.bing.com/maps?q=${encodeURIComponent(String(query || "").trim())}`;
  }
  function navigationUrlFor(place) {
    const q = (place.navigation && place.navigation.query) || [place.nameZh || place.name, place.cityOrArea].filter(Boolean).join(", ");
    return mapsSearch(q);
  }

  /* ---------- 真实地图渲染 ---------- */
  const activeMaps = new Map();

  function latLngOf(place) {
    const geo = place && place.geo;
    if (!geo) return null;
    const lat = Number(geo.lat);
    const lng = Number(geo.lng);
    return isFinite(lat) && isFinite(lng) ? [lat, lng] : null;
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function pinIcon(place, order, color, numbered) {
    const label = numbered && order != null ? String(order) : "";
    const dot = numbered ? "real-map-pin--numbered" : "";
    return L.divIcon({
      className: "real-map-pin-wrap",
      html: `<span class="real-map-pin ${dot}" style="--pin:${color}">${label}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function popupHtml(place, dayNumber) {
    const zh = place.nameZh || place.name;
    const en = place.nameZh ? place.name : "";
    const nav = navigationUrlFor(place);
    return `
      <div class="real-map-popup">
        <strong>${esc(zh)}</strong>
        ${en ? `<em>${esc(en)}</em>` : ""}
        ${place.note ? `<p>${esc(place.note)}</p>` : ""}
        <a href="${esc(nav)}" target="_blank" rel="noopener noreferrer">必应地图导航 ↗</a>
      </div>`;
  }

  function addTiles(map) {
    let sourceIndex = 0;
    const add = () => {
      if (sourceIndex >= TILE_SOURCES.length) return;
      const source = TILE_SOURCES[sourceIndex];
      const layer = L.tileLayer(source.url, { subdomains: source.subdomains, attribution: source.attribution, maxZoom: 18 });
      layer.on("tileerror", () => {
        if (map.hasLayer(layer)) {
          map.removeLayer(layer);
          sourceIndex += 1;
          add();
        }
      });
      layer.addTo(map);
    };
    add();
  }

  function drawRoutePolylines(map, layerGroup, routeDef, places, opts) {
    const options = opts || {};
    const ids = routeDef.placeIds || [];
    const coords = ids.map((id) => {
      const place = places.find((p) => p.id === id);
      return place ? latLngOf(place) : null;
    }).filter(Boolean);
    if (coords.length < 2) return;
    const color = options.faint ? "#8a8a8a" : (routeDef.color || colorForDay(routeDef.day));
    const weight = options.faint ? 2 : 4;
    const opacity = options.faint ? 0.35 : 0.85;
    const dashArray = options.faint ? "6 8" : null;

    let drawn = false;
    if (!options.faint && window.TRAVEL_ROUTES) {
      const segments = window.TRAVEL_ROUTES[`day${routeDef.day}`];
      if (Array.isArray(segments) && segments.length) {
        segments.forEach((seg) => {
          const geom = (seg.geometry || []).map((pair) => [Number(pair[1]), Number(pair[0])]);
          if (geom.length >= 2) {
            layerGroup.addLayer(L.polyline(geom, { color, weight, opacity, lineCap: "round", lineJoin: "round" }));
            drawn = true;
          }
        });
      }
    }
    if (!drawn) {
      layerGroup.addLayer(L.polyline(coords, { color, weight, opacity, dashArray, lineCap: "round", lineJoin: "round" }));
    }
  }

  function initTravelRealMap(container, options) {
    const opts = options || {};
    if (activeMaps.has(container)) {
      activeMaps.get(container).remove();
      activeMaps.delete(container);
    }
    const source = opts.source || travelMapSource();
    const day = Number(opts.day) || 0;
    const routeDef = routeLayersFor().find((r) => r.day === day) || null;
    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true
    });
    activeMaps.set(container, map);
    addTiles(map);

    const places = source.places || [];
    const markerLayer = L.layerGroup().addTo(map);
    const visibleIds = routeDef ? routeDef.placeIds : null;
    const bounds = [];

    places.forEach((place, index) => {
      const ll = latLngOf(place);
      if (!ll) return;
      if (routeDef && visibleIds && !visibleIds.includes(place.id)) return;
      bounds.push(ll);
      const order = visibleIds ? visibleIds.indexOf(place.id) : -1;
      const color = routeDef ? routeDef.color : "#1f7ae0";
      const numbered = Boolean(routeDef);
      const marker = L.marker(ll, { icon: pinIcon(place, order >= 0 ? order + 1 : null, color, numbered), title: place.nameZh || place.name });
      marker.bindPopup(popupHtml(place, day));
      markerLayer.addLayer(marker);
    });

    if (routeDef) {
      drawRoutePolylines(map, markerLayer, routeDef, places, {});
    } else {
      routeLayersFor().forEach((r) => drawRoutePolylines(map, markerLayer, r, places, { faint: true }));
    }

    if (opts.fitBounds !== false && bounds.length) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.12));
    } else {
      map.setView([64.85, -19.2], 6);
    }

    return {
      map,
      flyToPlace(placeId) {
        const place = places.find((p) => p.id === placeId);
        const ll = latLngOf(place);
        if (ll) map.flyTo(ll, Math.max(map.getZoom(), 12));
      }
    };
  }

  /* 裸全局兼容（app.js 直接调用） */
  window.travelMapRegions = travelMapRegions;
  window.travelMapSource = travelMapSource;
  window.placeLayersFor = placeLayersFor;
  window.routeLayersFor = routeLayersFor;
  window.travelOverviewArtwork = travelOverviewArtwork;
  window.mapsSearch = mapsSearch;

  window.TravelOverviewMap = {
    travelMapRegions,
    travelMapSource,
    placeLayersFor,
    routeLayersFor,
    travelOverviewArtwork,
    mapsSearch,
    navigationUrlFor,
    colorForDay,
    ROUTE_COLORS,
    TILE_SOURCES,
    initTravelRealMap
  };
})();
