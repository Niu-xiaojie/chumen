import { PLACES, SOURCES, SEEDED_WISHES, WISH_SEARCH } from "./data.js";

const KEY = "goodnight-v1";

const defaultState = {
  tab: "today",
  session: {
    locked: "none",
    heat: "ok",
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
    return {
      ...structuredClone(defaultState),
      ...parsed,
      session: { ...defaultState.session, ...parsed.session },
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

function score(place) {
  const { locked, heat, vibe } = state.session;
  let s = 20;
  if (state.disliked.includes(place.id)) return -999;
  if (locked === "concert" && place.id !== "xixiang-river" && place.id !== "imax" && place.id !== "old-street") {
    if (place.id === "pingluan" || place.id === "tiegang" || place.id === "qilong" || place.id === "tiezai") s -= 80;
  }
  if (heat === "hot" && place.overpassBike) s -= 50;
  if (heat === "hot" && !place.shade) s -= 12;
  if (vibe === "nature" && place.vibe !== "nature") s -= 18;
  if (vibe === "city" && place.vibe === "nature") s -= 12;
  if (state.liked.includes(place.id)) s += 16;
  if (place.crowded === "low") s += 4;
  return s;
}

function pick() {
  return [...PLACES]
    .map((p) => ({ ...p, s: score(p) }))
    .filter((p) => p.s > -50)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4);
}

function choice(group, value, label) {
  const on = state.session[group] === value ? "on" : "";
  return `<button type="button" class="${on}" data-set="${group}:${value}">${label}</button>`;
}

function renderToday() {
  const cards = pick();
  const lockedNote =
    state.session.locked === "concert"
      ? "这周末有演唱会，远的山和湖先放下。只留近的。"
      : state.lockedPlace
        ? `已锁：${PLACES.find((p) => p.id === state.lockedPlace)?.name ?? ""}`
        : "";

  return `
    <div class="block">
      <div class="q">
        <label>已经定了什么？</label>
        <div class="choices">
          ${choice("locked", "none", "没有")}
          ${choice("locked", "concert", "有演唱会 / 大事")}
          ${choice("locked", "other", "有别的安排")}
        </div>
      </div>
      <div class="q">
        <label>热不热？</label>
        <div class="choices">
          ${choice("heat", "ok", "还行")}
          ${choice("heat", "hot", "很热")}
        </div>
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
    <h2 style="margin:16px 4px 8px;font-size:13px;color:var(--muted);font-weight:500;">给你这几个</h2>
    ${
      cards.length
        ? cards
            .map((p) => {
              const liked = state.liked.includes(p.id);
              const no = state.disliked.includes(p.id);
              return `
            <article class="card" data-place="${p.id}">
              <div class="kind">${p.kind}</div>
              <h3>${p.name}</h3>
              <p>${p.why}</p>
              <p class="how">${p.how}</p>
              ${liked ? `<div class="mark">喜欢</div>` : ""}
              ${no ? `<div class="mark warn">不喜欢</div>` : ""}
              <div class="row">
                <button type="button" data-like="${p.id}">喜欢</button>
                <button type="button" data-no="${p.id}">不喜欢</button>
                <button type="button" data-lock="${p.id}">锁这场</button>
              </div>
            </article>`;
            })
            .join("")
        : `<p class="empty">这组条件太窄了。把「很热」或「有演唱会」松开一档再看。</p>`
    }
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
      <p>先看已经定了什么，再给几个能去的。不喊你，不排整周。</p>
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
    if (v === "concert") state.lockedPlace = null;
    save(state);
    render();
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
    state.lockedPlace = t.dataset.lock;
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
