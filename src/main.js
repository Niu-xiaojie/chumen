import { PLACES, SOURCES, SEEDED_WISHES, WISH_SEARCH } from "./data.js";

const KEY = "goodnight-v1";

const defaultState = {
  tab: "today",
  session: {
    locked: "none",
    weather: "ok",
    vibe: "nature",
  },
  liked: [],
  disliked: [],
  lockedPlace: null,
  wishes: SEEDED_WISHES,
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    const session = { ...defaultState.session, ...parsed.session };
    if (!session.weather && session.heat) session.weather = session.heat;
    return {
      ...structuredClone(defaultState),
      ...parsed,
      session,
      wishes: parsed.wishes?.length ? parsed.wishes : SEEDED_WISHES,
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();
state.weatherLive = { status: "idle", text: "" };
state.weatherManual = false;

const XIXIANG = { lat: 22.582, lon: 113.876 };

function weatherCodeText(code) {
  if (code === 0 || code === 1) return "晴";
  if (code === 2 || code === 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code === 61 || code === 80) return "小雨";
  if (code === 63 || code === 81) return "中雨";
  if (code === 65 || code === 82) return "大雨";
  if (code >= 66 && code <= 67) return "冻雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 95) return "雷雨";
  return "天气有变化";
}

function mapObservedWeather({ temp, precip, code, windKmh, pm25 }) {
  if (windKmh >= 62) return "typhoon";
  if (
    precip >= 0.2 ||
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code >= 95
  ) {
    return "rain";
  }
  if (pm25 >= 75) return "haze";
  if (temp >= 33) return "hot";
  return "ok";
}

async function fetchWeather() {
  state.weatherLive = { status: "loading", text: "正在查西乡附近的天气…" };
  render();
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${XIXIANG.lat}&longitude=${XIXIANG.lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=Asia%2FShanghai`;
  const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${XIXIANG.lat}&longitude=${XIXIANG.lon}&current=pm2_5&timezone=Asia%2FShanghai`;
  try {
    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!weatherRes.ok) throw new Error("weather");
    const weatherJson = await weatherRes.json();
    const airJson = airRes.ok ? await airRes.json() : { current: {} };
    const cur = weatherJson.current || {};
    const temp = cur.temperature_2m;
    const precip = cur.precipitation ?? 0;
    const code = cur.weather_code;
    const windKmh = cur.wind_speed_10m ?? 0;
    const pm25 = airJson.current?.pm2_5;
    const mapped = mapObservedWeather({ temp, precip, code, windKmh, pm25 });
    const bits = [
      `${Math.round(temp)}°C`,
      weatherCodeText(code),
      windKmh >= 40 ? `风 ${Math.round(windKmh)} km/h` : "",
      pm25 != null ? `PM2.5 ${Math.round(pm25)}` : "",
    ].filter(Boolean);
    if (!state.weatherManual) state.session.weather = mapped;
    state.weatherLive = {
      status: "ok",
      text: `西乡附近现在：${bits.join(" · ")}`,
      mapped,
    };
    save(state);
    render();
  } catch {
    state.weatherLive = {
      status: "fail",
      text: "天气没查到。可能是网络或国内访问接口不稳，下面可以手选。",
    };
    render();
  }
}

function weatherNow() {
  return state.session.weather || state.session.heat || "ok";
}

function score(place, relax) {
  const { locked, vibe } = state.session;
  const weather = weatherNow();
  let s = 20;
  if (state.disliked.includes(place.id)) return -999;
  if (place.id === "home" && weather !== "rain" && weather !== "typhoon") return -200;
  if (place.far && !relax.far) return -200;
  if (!relax.concert && (locked === "concert" || locked === "other") && place.far) s -= 80;
  if (!relax.concert && locked === "concert" && place.id !== "xixiang-river" && place.id !== "imax" && place.id !== "old-street" && place.id !== "yantian" && place.id !== "home") {
    if (!place.far) s -= 8;
    if (["pingluan", "tiegang", "qilong", "tiezai"].includes(place.id)) s -= 70;
  }
  if (!relax.weather) {
    if (weather === "typhoon" && !place.indoor) return -400;
    if (weather === "rain" && !place.indoor) return -300;
    if (weather === "haze" && place.vibe === "nature" && !place.indoor) s -= 45;
    if (weather === "haze" && place.indoor) s += 20;
    if (weather === "hot" && place.overpassBike) s -= 50;
    if (weather === "hot" && !place.shade) s -= 12;
    if (weather === "hot" && place.indoor) s += 8;
  }
  if (vibe === "nature" && place.vibe !== "nature" && place.id !== "home" && weather !== "rain" && weather !== "typhoon") s -= 18;
  if (vibe === "city" && place.vibe === "nature") s -= 12;
  if (state.liked.includes(place.id)) s += 16;
  if (place.crowded === "low") s += 4;
  if (place.crowded === "high") s -= 6;
  return s;
}

function rank(relax) {
  return [...PLACES]
    .map((p) => ({ ...p, s: score(p, relax) }))
    .filter((p) => p.s > -50)
    .sort((a, b) => b.s - a.s);
}

function pick() {
  const weather = weatherNow();
  const harsh = weather === "rain" || weather === "typhoon";
  let list = rank({ far: false, concert: false, weather: false });
  let note = "";
  if (weather === "typhoon") note = "台风天别往外跑。只留室内，或待在家。";
  if (weather === "rain") note = "下大雨，山、海、河边先放下。只留室内。";
  if (weather === "haze") note = "雾霾天少爬山看海，偏室内或短走。";
  if (weather === "hot") note = note || "太热就少爬坡、少推车上桥。";
  if (!list.length && !harsh) {
    list = rank({ far: false, concert: true, weather: true });
    if (list.length) note = "按现在的天气和安排，近处不够了。下面这些条件松一点。";
  }
  if (!list.length && !harsh) {
    list = rank({ far: true, concert: true, weather: true });
    if (list.length) note = "近的你都划掉了。这些更远，还可以看。";
  }
  return {
    cards: list.slice(0, 4),
    note,
    drained: list.length === 0,
  };
}

function choice(group, value, label) {
  const on = state.session[group] === value ? "on" : "";
  return `<button type="button" class="${on}" data-set="${group}:${value}">${label}</button>`;
}

function renderToday() {
  const { cards, note, drained } = pick();
  const lockedName = PLACES.find((p) => p.id === state.lockedPlace)?.name;
  const lockedNote =
    state.lockedPlace && lockedName
      ? `这周末就去「${lockedName}」。路怎么走看卡片。不想去了就按「换一个」。`
      : state.session.locked === "concert"
        ? "有演唱会就先办这场，下面只留近的，少跑腿。"
        : "";

  const list = drained
    ? `<div class="block">
        <p class="empty" style="margin:0 0 10px">能推的你都划掉了。可以清空「不喜欢」，或改上面的天气、想去哪类，我再给。</p>
        <button class="btn primary" type="button" id="reset-disliked">清空不喜欢，再推荐</button>
      </div>`
    : cards
        .map((p) => {
          const liked = state.liked.includes(p.id);
          const chosen = state.lockedPlace === p.id;
          return `
            <article class="card" data-place="${p.id}">
              <div class="kind">${p.kind}</div>
              <h3>${p.name}</h3>
              <p>${p.why}</p>
              <p class="how">${p.how}</p>
              ${liked ? `<div class="mark">喜欢</div>` : ""}
              ${chosen ? `<div class="mark">这周末就去这儿</div>` : ""}
              <div class="row">
                <button type="button" data-like="${p.id}">喜欢</button>
                <button type="button" data-no="${p.id}">不喜欢</button>
                <button type="button" data-lock="${p.id}">${chosen ? "换一个" : "就去这儿"}</button>
              </div>
            </article>`;
        })
        .join("");

  return `
    <div class="block">
      <div class="q">
        <label>今天已经定了什么？定了的会优先，推荐给空档。</label>
        <div class="choices">
          ${choice("locked", "none", "没有")}
          ${choice("locked", "concert", "有演唱会 / 大事")}
          ${choice("locked", "other", "有别的安排")}
        </div>
      </div>
      <div class="q">
        <label>今天天气怎么样？打开页面会按西乡查一遍，和实际不符再点下面改。</label>
        <p class="empty" style="margin:0 0 10px">${state.weatherLive?.text || "还没查天气。"}</p>
        <div class="choices">
          ${choice("weather", "ok", "还行")}
          ${choice("weather", "hot", "很热")}
          ${choice("weather", "rain", "下大雨")}
          ${choice("weather", "typhoon", "台风")}
          ${choice("weather", "haze", "雾霾")}
        </div>
        <button class="btn ghost" type="button" id="refresh-weather">再查一次西乡天气</button>
      </div>
      <div class="q">
        <label>更想哪类？</label>
        <div class="choices">
          ${choice("vibe", "nature", "自然")}
          ${choice("vibe", "city", "城市")}
          ${choice("vibe", "either", "都行")}
        </div>
      </div>
    </div>
    ${lockedNote ? `<div class="lock">${lockedNote}</div>` : ""}
    ${note ? `<div class="lock">${note}</div>` : ""}
    <h2 style="margin:16px 4px 8px;font-size:13px;color:var(--muted);font-weight:500;">按你的选择，这几个比较合适</h2>
    ${list}
  `;
}

function renderWishes() {
  const items = state.wishes
    .map((w) => {
      const status =
        w.status === "none"
          ? "还没搜到在售或官宣。"
          : w.status === "hit"
            ? "有消息，去源里打开。"
            : "待查。";
      return `
      <article class="card">
        <div class="kind">心愿</div>
        <h3>${w.text}</h3>
        <p class="wish-status">${status}${w.note ? " " + w.note : ""}</p>
        <p class="wish-status">上次查：${w.checkedAt ?? "还没有"}</p>
        <div class="links">
          <a href="${WISH_SEARCH.damai(w.keyword)}" target="_blank" rel="noreferrer">大麦</a>
          <a href="${WISH_SEARCH.showstart(w.keyword)}" target="_blank" rel="noreferrer">秀动</a>
          <a href="${WISH_SEARCH.weibo(w.keyword)}" target="_blank" rel="noreferrer">微博</a>
          <button type="button" data-found="${w.id}">我搜到了</button>
          <button type="button" data-miss="${w.id}">还是没有</button>
        </div>
      </article>`;
    })
    .join("");

  return `
    <div class="block">
      <h2>许一个愿</h2>
      <p class="empty" style="margin:0 0 10px">写「听刘惜君的现场」这种。打开这页会先用已查到的结论；要点源自己再搜一眼。</p>
      <input id="wish-input" type="text" placeholder="我想去…" />
      <button class="btn primary" type="button" id="wish-add">记下</button>
    </div>
    ${items || `<p class="empty">还没有心愿。</p>`}
  `;
}

function renderSources() {
  return `
    <p class="empty" style="margin:0 0 12px">活动不靠猜。从这些源里找这周能参加的。</p>
    ${SOURCES.map(
      (s) => `
      <article class="card">
        <div class="kind">${s.kind}</div>
        <h3>${s.name}</h3>
        <p>${s.use}</p>
        ${s.searchHint ? `<p class="how">${s.searchHint}</p>` : ""}
        <div class="links">
          <a href="${s.web}" target="_blank" rel="noreferrer">打开</a>
        </div>
      </article>`
    ).join("")}
  `;
}

function renderTaste() {
  const likes = state.liked
    .map((id) => PLACES.find((p) => p.id === id)?.name)
    .filter(Boolean);
  const nos = state.disliked
    .map((id) => PLACES.find((p) => p.id === id)?.name)
    .filter(Boolean);
  return `
    <div class="block">
      <h2>家</h2>
      <p class="empty" style="margin:0">深圳宝安 · 西乡路口 · 广深路北边。热天推自行车上天桥会累。不要纯商场。要自然。</p>
    </div>
    <div class="block">
      <h2>喜欢</h2>
      <p class="empty" style="margin:0">${likes.join("、") || "还没标"}</p>
    </div>
    <div class="block">
      <h2>不喜欢</h2>
      <p class="empty" style="margin:0">${nos.join("、") || "还没标"}</p>
    </div>
    <button class="btn ghost" type="button" id="reset-taste">清空喜欢 / 不喜欢</button>
  `;
}

function render() {
  const app = document.getElementById("app");
  const tab = state.tab;
  const body =
    tab === "today"
      ? renderToday()
      : tab === "wishes"
        ? renderWishes()
        : tab === "sources"
          ? renderSources()
          : renderTaste();

  app.innerHTML = `
    <header class="app">
      <h1>出门</h1>
      <p>先勾今天的安排和天气，不喜欢的划掉，剩下的里定一个去处。</p>
    </header>
    <nav class="tabs">
      <button type="button" class="${tab === "today" ? "on" : ""}" data-tab="today">今天</button>
      <button type="button" class="${tab === "wishes" ? "on" : ""}" data-tab="wishes">心愿</button>
      <button type="button" class="${tab === "sources" ? "on" : ""}" data-tab="sources">来源</button>
      <button type="button" class="${tab === "taste" ? "on" : ""}" data-tab="taste">口味</button>
    </nav>
    <main>${body}</main>
  `;
}

function keywordFromWish(text) {
  const t = text.trim();
  const m = t.match(/听?(.+?)的?(现场|演唱会|live)/i);
  if (m) return m[1].replace(/^(去)?/, "");
  return t.replace(/^我想/, "").replace(/^去/, "").slice(0, 20);
}

document.getElementById("app").addEventListener("click", (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.dataset.tab) {
    state.tab = t.dataset.tab;
    save(state);
    render();
    return;
  }
  if (t.dataset.set) {
    const [k, v] = t.dataset.set.split(":");
    state.session[k] = v;
    if (k === "weather") state.weatherManual = true;
    if (v === "concert") state.lockedPlace = null;
    save(state);
    render();
    return;
  }
  if (t.id === "refresh-weather") {
    state.weatherManual = false;
    fetchWeather();
    return;
  }
  if (t.dataset.like) {
    const id = t.dataset.like;
    state.liked = [...new Set([...state.liked.filter((x) => x !== id), id])];
    state.disliked = state.disliked.filter((x) => x !== id);
    save(state);
    render();
    return;
  }
  if (t.dataset.no) {
    const id = t.dataset.no;
    state.disliked = [...new Set([...state.disliked.filter((x) => x !== id), id])];
    state.liked = state.liked.filter((x) => x !== id);
    if (state.lockedPlace === id) state.lockedPlace = null;
    save(state);
    render();
    return;
  }
  if (t.dataset.lock) {
    const id = t.dataset.lock;
    state.lockedPlace = state.lockedPlace === id ? null : id;
    save(state);
    render();
    return;
  }
  if (t.id === "reset-disliked") {
    state.disliked = [];
    state.lockedPlace = null;
    save(state);
    render();
    return;
  }
  if (t.id === "wish-add") {
    const input = document.getElementById("wish-input");
    const text = input?.value.trim();
    if (!text) return;
    state.wishes = [
      {
        id: crypto.randomUUID(),
        text,
        keyword: keywordFromWish(text),
        checkedAt: null,
        status: "pending",
        note: "记下了。点大麦 / 秀动 / 微博搜；有结果就按「我搜到了」。",
      },
      ...state.wishes,
    ];
    save(state);
    render();
    return;
  }
  if (t.dataset.found) {
    const today = new Date().toISOString().slice(0, 10);
    state.wishes = state.wishes.map((w) =>
      w.id === t.dataset.found ? { ...w, status: "hit", checkedAt: today, note: "你标记搜到了。下次打开会置顶。" } : w
    );
    save(state);
    render();
    return;
  }
  if (t.dataset.miss) {
    const today = new Date().toISOString().slice(0, 10);
    state.wishes = state.wishes.map((w) =>
      w.id === t.dataset.miss ? { ...w, status: "none", checkedAt: today } : w
    );
    save(state);
    render();
    return;
  }
  if (t.id === "reset-taste") {
    state.liked = [];
    state.disliked = [];
    state.lockedPlace = null;
    save(state);
    render();
  }
});

render();
fetchWeather();
