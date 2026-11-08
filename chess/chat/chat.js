// ▼ 배포한 Cloudflare Worker 주소로 바꾸세요 (끝에 / 없이)
const API = "https://friends-chat.kimjy-friends.workers.dev";

const $ = (s) => document.querySelector(s);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

let token = store.get("fc_token");
let ws = null, retry = 0, lastId = 0, lastDay = "", lastUser = "", lastTs = 0, closing = false, signup = false, me = "";

function icon(id) {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  const u = document.createElementNS(NS, "use");
  u.setAttribute("href", "#" + id);
  s.appendChild(u);
  return s;
}

/* ───────── 로그인 ───────── */
function showLogin(msg) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#err").textContent = msg || "";
}
function showApp() {
  $("#login").hidden = true;
  $("#app").hidden = false;
}

$("#toggle").onclick = () => {
  signup = !signup;
  $("#invwrap").hidden = !signup;
  $("#toggle").textContent = signup ? "이미 가입했어요 (로그인)" : "처음이에요 (가입)";
  $("#go").textContent = signup ? "가입하고 들어가기" : "들어가기";
  $("#err").textContent = "";
};

$("#lf").onsubmit = async (e) => {
  e.preventDefault();
  const btn = $("#go");
  btn.disabled = true;
  $("#err").textContent = "";
  try {
    const r = await fetch(API + "/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("#name").value,
        password: $("#pw").value,
        invite: signup ? $("#inv").value : "",
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "실패했어요.");
    token = j.token;
    store.set("fc_token", token);
    $("#pw").value = "";
    $("#inv").value = "";
    start();
  } catch (err) {
    $("#err").textContent = err.message || "네트워크 오류";
  } finally {
    btn.disabled = false;
  }
};

$("#out").onclick = () => {
  $("#more").hidden = true;
  closing = true;
  store.del("fc_token");
  token = null;
  if (ws) ws.close(1000);
  showLogin();
};

/* ───────── 연결 ───────── */
function start() {
  closing = false;
  lastId = 0;
  lastDay = "";
  lastUser = "";
  lastTs = 0;
  $("#list").textContent = "";
  showApp();
  setTab(store.get("fc_tab") === "ai" ? "ai" : "chat");
  connect();
}

function setStatus(t) {
  const el = $("#status");
  el.hidden = !t;
  el.textContent = t || "";
}

function connect() {
  setStatus(retry ? "다시 연결하는 중…" : "연결하는 중…");
  ws = new WebSocket(API.replace(/^http/, "ws") + "/api/ws");
  ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === "init") {
      retry = 0;
      me = m.me;
      setStatus("");
      $("#list").textContent = "";
      lastId = 0;
      lastDay = "";
      lastUser = "";
      lastTs = 0;
      renderSummaries(m.summaries || []);
      (m.messages || []).forEach(addMsg);
      renderOnline(m.online || []);
      scrollDown(true);
      requestJob();
    } else if (m.type === "msg") {
      addMsg(m);
    } else if (m.type === "presence") {
      renderOnline(m.online || []);
    } else if (m.type === "summaries") {
      renderSummaries(m.summaries || []);
    } else if (m.type === "job_hint") {
      requestJob();
    } else if (m.type === "job") {
      runJob(m);
    } else if (m.type === "nojob") {
      working = false;
      hstat(helperOn ? "대기 중 — 요약할 대화가 아직 없어요." : "");
    } else if (m.type === "error") {
      setStatus(m.error);
      setTimeout(() => setStatus(""), 2500);
    }
  };
  ws.onclose = (ev) => {
    working = false;
    $("#conn").classList.add("off");
    if (closing) return;
    if (ev.code === 1008) {
      // 토큰 무효/만료 → 다시 로그인
      store.del("fc_token");
      token = null;
      showLogin("로그인이 만료됐어요. 다시 들어와 주세요.");
      return;
    }
    retry++;
    setTimeout(connect, Math.min(1000 * 2 ** Math.min(retry, 4), 15000));
  };
}

/* ───────── 렌더링 (textContent만 사용해 XSS 차단) ───────── */
function renderOnline(list) {
  $("#conn").classList.remove("off");
  $("#online").textContent = list.length ? "접속 중 · " + list.join(", ") : "접속 중";
}

function hue(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h % 360;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(ts) {
  return new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
}

function nearBottom() {
  const l = $("#list");
  return l.scrollHeight - l.scrollTop - l.clientHeight < 120;
}
function scrollDown(force) {
  const l = $("#list");
  if (force || nearBottom()) l.scrollTop = l.scrollHeight;
}

function addMsg(m) {
  if (m.id <= lastId) return;
  lastId = m.id;
  const stick = nearBottom();
  const day = fmtDay(m.ts);
  let newDay = false;
  if (day !== lastDay) {
    lastDay = day;
    newDay = true;
    const d = document.createElement("div");
    d.className = "day";
    d.textContent = day;
    $("#list").appendChild(d);
  }
  const mine = m.user === me;
  // 같은 사람이 3분 안에 이어서 보낸 메시지는 이름·아바타를 한 번만 보여줘요.
  const cont = !newDay && m.user === lastUser && m.ts - lastTs < 180000;
  lastUser = m.user;
  lastTs = m.ts;
  const row = document.createElement("div");
  row.className = "row " + (cont ? "cont" : "first") + (mine ? " mine" : "");
  if (!mine) {
    const av = document.createElement("div");
    av.className = "av" + (cont ? " sp" : "");
    if (!cont) {
      av.textContent = Array.from(m.user)[0] || "?";
      av.style.background = `hsl(${hue(m.user)} 62% 52%)`;
    }
    row.appendChild(av);
  }
  const col = document.createElement("div");
  col.className = "col";
  if (!mine && !cont) {
    const w = document.createElement("div");
    w.className = "who";
    w.textContent = m.user;
    col.appendChild(w);
  }
  const bub = document.createElement("div");
  bub.className = "bub";
  const t = document.createElement("div");
  t.className = "txt";
  t.textContent = m.text;
  const tm = document.createElement("span");
  tm.className = "tm";
  tm.textContent = fmtTime(m.ts);
  bub.append(t, tm);
  col.appendChild(bub);
  row.appendChild(col);
  $("#list").appendChild(row);
  if (stick || mine) scrollDown(true);
}

function renderSummaries(list) {
  const box = $("#sumlist");
  box.textContent = "";
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "아직 요약된 대화가 없어요.";
    box.appendChild(p);
    return;
  }
  list.forEach((s) => {
    const d = document.createElement("div");
    d.className = "s";
    const sm = document.createElement("small");
    sm.textContent = fmtDay(s.ts_from) + " ~ " + fmtDay(s.ts_to);
    d.append(sm, document.createTextNode(s.text));
    box.appendChild(d);
  });
}

/* ───────── 보내기 ───────── */
$("#send").onsubmit = (e) => {
  e.preventDefault();
  const ta = $("#msg");
  const text = ta.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "msg", text }));
  ta.value = "";
  ta.style.height = "auto";
};
$("#msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#send").requestSubmit();
  }
});
$("#msg").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
});

/* ───────── 탭 / 더보기 ───────── */
function setTab(t) {
  if (t === "more") { $("#more").hidden = false; return; }
  store.set("fc_tab", t);
  $("#pane-chat").hidden = t !== "chat";
  $("#pane-ai").hidden = t !== "ai";
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  if (t === "ai") aiOpen(); else scrollDown(true);
}
document.querySelectorAll("nav button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$("#more").onclick = (e) => { if (e.target.id === "more") $("#more").hidden = true; };

/* ───────── 요약 패널 ───────── */
$("#sumbtn").onclick = () => { $("#more").hidden = true; $("#sum").hidden = false; };
$("#sumclose").onclick = () => ($("#sum").hidden = true);
$("#sum").onclick = (e) => { if (e.target.id === "sum") $("#sum").hidden = true; };

/* ───────── 요약 도우미 (이 기기의 WebGPU로 요약) ───────── */
let helperOn = store.get("fc_helper") === "1";
let helperModel = store.get("fc_model") || "";
let working = false, cooldownUntil = 0, sm = null, wakeLock = null;

/* ── 모델 로딩 중 앱이 강제 종료되는 경우(메모리 부족) 대응 ──
   로딩을 시작할 때 표시(fc_loading)를 남기고, 끝나면 지워요. 페이지가 로딩 도중 사라졌다면(OS가 종료) 표시가 남아 있으니
   다음에 열 때 그걸 보고 메모리 부족으로 판단해서 더 가벼운 모델로 바꿔줘요. */
const badModels = () => { try { return JSON.parse(store.get("fc_bad") || "[]"); } catch { return []; } };
const markBad = (id) => store.set("fc_bad", JSON.stringify([...new Set([...badModels(), id])]));
let crashNote = "";

// AI 탭의 대화 길이(토큰). 아이폰은 2048로 시작하고, 종료되면 1024까지 줄여요.
function aiCtx(S) {
  const v = parseInt(store.get("fc_ctx"), 10);
  if (v > 0) return v;
  return S.IS_IOS ? 2048 : 4096;
}

async function loadGuarded(S, model, cb, ctx = 4096) {
  store.set("fc_loading", model);
  try {
    await S.loadModel(model, cb, ctx);
    store.set("fc_ok_" + model, "1");
  } finally {
    store.del("fc_loading");
  }
}
// 사용자가 직접 창을 닫거나 떠날 때는 강제 종료가 아니니 표시를 지워요.
window.addEventListener("pagehide", () => store.del("fc_loading"));

const getSm = async () => {
  if (!sm) {
    const S = await import("./summarizer.js?v=6");
    if (!S.MODELS[helperModel]) helperModel = S.DEFAULT_MODEL; // 예전에 저장된 모델이 목록에서 빠졌으면 기본값으로
    const crashed = store.get("fc_loading");
    if (crashed && S.MODELS[crashed] && aiCtx(S) > 1024) {
      // 1단계: 같은 모델을 대화 길이만 줄여서 다시 시도
      store.del("fc_loading");
      store.set("fc_ctx", "1024");
      crashNote = `"${S.MODELS[crashed].label}" 모델을 불러오다 앱이 종료됐어요. 대화 길이를 줄여서 다시 시도할 수 있게 했어요. 다시 불러와 보세요.`;
    } else if (crashed && S.MODELS[crashed]) {
      // 2단계: 대화 길이를 줄여도 안 되면 더 가벼운 모델로 바꿔요
      store.del("fc_loading");
      markBad(crashed);
      // 종료된 모델보다 가벼운 것 중에서, 실패한 적 없는 가장 가벼운 모델로 바꿔요.
      const bad = badModels();
      const next = Object.entries(S.MODELS)
        .filter(([k, m]) => m.vram < S.MODELS[crashed].vram && !bad.includes(k))
        .sort((a, b) => a[1].vram - b[1].vram)[0];
      if (next) {
        helperModel = next[0];
        store.set("fc_model", helperModel);
        crashNote = `"${S.MODELS[crashed].label}" 모델을 불러오다 앱이 종료됐어요. 기기 메모리가 부족해서예요. 더 가벼운 "${next[1].label}" 모델로 바꿨어요.`;
      } else {
        crashNote = `"${S.MODELS[crashed].label}" 모델을 불러오다 앱이 종료됐어요. 기기 메모리가 부족해서예요. 다른 앱·탭을 닫고 다시 시도하거나, 더 성능 좋은 기기에서 써주세요.`;
      }
    } else if (S.IS_IOS && S.MODELS[helperModel].vram > 1500 && !store.get("fc_ok_" + helperModel)) {
      // 아이폰에서 큰 모델을 한 번도 성공한 적 없이 고른 상태면 가벼운 모델로 시작해요.
      helperModel = S.DEFAULT_MODEL;
      store.set("fc_model", helperModel);
      crashNote = "아이폰은 메모리가 적어 큰 모델을 불러오면 앱이 다시 시작될 수 있어요. 가벼운 모델로 바꿨어요. (더 큰 모델은 직접 골라서 시도할 수 있어요.)";
    }
    sm = S;
  }
  return sm;
};
// 라이브러리는 "다운로드"와 "GPU에 올리기"를 각각 0~100%로 따로 알려줘요.
// 막대가 되돌아가지 않도록 하나의 진행률(0~100%)로 이어 붙여요.
function progTracker() {
  let sawFetch = false, max = 0;
  return (p) => {
    const t = String(p.text || "");
    const frac = typeof p.progress === "number" ? Math.min(1, Math.max(0, p.progress)) : 0;
    let stage = "준비 중", lo = max, hi = max;
    if (/Fetching/i.test(t)) { sawFetch = true; stage = "모델 다운로드 중"; lo = 0; hi = 0.65; }
    else if (/Loading model from cache/i.test(t)) { stage = "모델을 GPU에 올리는 중"; lo = sawFetch ? 0.65 : 0; hi = sawFetch ? 0.9 : 0.7; }
    else if (/shader/i.test(t)) { stage = "GPU 준비 중"; lo = sawFetch ? 0.9 : 0.7; hi = 1; }
    else if (/Finish/i.test(t)) { stage = "마무리 중"; lo = hi = 1; }
    max = Math.max(max, lo + (hi - lo) * frac);
    const mb = t.match(/(\d+)\s*MB/i);
    const parts = [];
    if (mb && frac > 0.01) parts.push(`${Number(mb[1]).toLocaleString()}MB / 약 ${Math.round(Number(mb[1]) / frac).toLocaleString()}MB`);
    if (typeof p.timeElapsed === "number" && p.timeElapsed > 0) parts.push(`${Math.round(p.timeElapsed)}초 경과`);
    return { pct: Math.min(100, Math.round(max * 100)), stage, sub: parts.join(" · ") };
  };
}

function hstat(t) { $("#hstat").textContent = t || ""; }
function hprog(v) {
  const p = $("#hprog");
  p.hidden = v == null;
  if (v != null) p.value = v;
}

function requestJob() {
  if (!helperOn || working || !ws || ws.readyState !== 1 || Date.now() < cooldownUntil) return;
  working = true;
  ws.send(JSON.stringify({ type: "job_request" }));
}

async function runJob(job) {
  const reply = (obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
  if (!helperOn) { reply({ type: "job_fail", jobId: job.jobId }); working = false; return; }
  try {
    const S = await getSm();
    try { wakeLock = (await navigator.wakeLock?.request("screen")) || null; } catch {}
    hstat("모델 준비 중… (처음엔 몇 분 걸릴 수 있어요)");
    const track = progTracker();
    await loadGuarded(S, helperModel || S.DEFAULT_MODEL, (p) => {
      const r = track(p);
      hprog(r.pct / 100);
      hstat(`${r.stage} ${r.pct}%` + (r.sub ? " · " + r.sub : ""));
    });
    hprog(null);
    hstat("요약하는 중…");
    const text = await S.summarize(job.kind, job.input);
    reply({ type: "job_done", jobId: job.jobId, text });
    hstat("요약 1건 완료 ✓");
    working = false;
    requestJob(); // 남은 일이 있으면 이어서
  } catch (err) {
    reply({ type: "job_fail", jobId: job.jobId });
    hprog(null);
    hstat("요약 실패: " + ((err && err.message) || err).toString().slice(0, 120));
    cooldownUntil = Date.now() + 60000;
    working = false;
  } finally {
    try { if (wakeLock) await wakeLock.release(); } catch {}
    wakeLock = null;
  }
}

// 요약 도우미와 AI 채팅은 한 기기에서 같은 모델 하나를 같이 써요 (GPU 메모리 절약).
function fillModels(S) {
  for (const id of ["#hmodel", "#amodel"]) {
    const sel = $(id);
    if (!sel.options.length) {
      const bad = badModels();
      for (const [k, m] of Object.entries(S.MODELS)) sel.add(new Option(m.label + (bad.includes(k) ? " ⚠ 이 기기에서 실패" : ""), k));
    }
    sel.value = helperModel;
  }
}

async function setModel(id) {
  crashNote = "";
  helperModel = id;
  store.set("fc_model", id);
  $("#hmodel").value = id;
  $("#amodel").value = id;
  if (sm) await sm.unload(); // 다음 작업 때 새 모델로 로딩
  if (ai.init) await refreshDl();
}

async function openHelper() {
  $("#more").hidden = true;
  $("#helper").hidden = false;
  const S = await getSm();
  fillModels(S);
  $("#hon").checked = helperOn;
  $("#gpu").textContent = "WebGPU 확인 중…";
  const g = await S.gpuInfo();
  $("#gpu").textContent = g.ok
    ? "✓ 이 기기·브라우저에서 WebGPU를 쓸 수 있어요."
    : "✕ " + g.reason + " 다른 기기에서 켜주세요.";
  $("#hon").disabled = !g.ok;
}

$("#hbtn").onclick = () => openHelper().catch((e) => ($("#gpu").textContent = "열 수 없어요: " + e.message));
$("#hclose").onclick = () => ($("#helper").hidden = true);
$("#helper").onclick = (e) => { if (e.target.id === "helper") $("#helper").hidden = true; };

$("#hmodel").onchange = (e) => setModel(e.target.value);
$("#amodel").onchange = (e) => setModel(e.target.value);

$("#hon").onchange = async (e) => {
  if (e.target.checked) {
    const S = await getSm();
    const mb = S.MODELS[helperModel || S.DEFAULT_MODEL].vram;
    if (!confirm(`처음 한 번 모델 파일(약 ${(mb / 1000).toFixed(1)}GB)을 내려받아요.\nWi-Fi에서 하는 걸 권장합니다. 계속할까요?`)) {
      e.target.checked = false;
      return;
    }
    helperOn = true;
    store.set("fc_helper", "1");
    cooldownUntil = 0;
    hstat("켜졌어요. 요약할 대화가 생기면 자동으로 작동해요.");
    requestJob();
  } else {
    helperOn = false;
    store.set("fc_helper", "0");
    hstat("꺼졌어요.");
  }
};

/* ───────── AI 채팅 (각자 기기의 GPU, 서버로 전송 안 함) ───────── */
const AIKEY = "fc_ai_hist";
const ai = { hist: [], busy: false, loading: false, init: false, gpu: null };
const SUGGEST = ["오늘 저녁 뭐 먹을지 추천해줘", "친구들이랑 주말에 할 만한 놀이 알려줘", "생일 축하 메시지 써줘", "오늘 일정 정리하는 법 알려줘"];

function loadHist() {
  try {
    const j = JSON.parse(store.get(AIKEY) || "[]");
    return Array.isArray(j)
      ? j.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-40)
      : [];
  } catch { return []; }
}
function saveHist() { store.set(AIKEY, JSON.stringify(ai.hist.slice(-40))); }

function aiBubble(role, text, isErr) {
  const row = document.createElement("div");
  row.className = "arow " + (role === "user" ? "user" : "bot");
  if (role !== "user") {
    const av = document.createElement("div");
    av.className = "aav";
    av.appendChild(icon("i-spark"));
    row.appendChild(av);
  }
  const t = document.createElement("div");
  t.className = "atxt" + (isErr ? " err" : "");
  t.textContent = text;
  row.appendChild(t);
  return row;
}

function typingDots() {
  const d = document.createElement("span");
  d.className = "typing";
  d.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  return d;
}

function renderAi() {
  const box = $("#alist");
  box.textContent = "";
  if (!ai.hist.length) {
    const e = document.createElement("div");
    e.className = "empty";
    const orb = document.createElement("div");
    orb.className = "orb";
    orb.appendChild(icon("i-spark"));
    const h = document.createElement("h2");
    h.textContent = "무엇이든 물어보세요";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "내 기기의 GPU가 직접 답해요. 처음 한 번 모델을 내려받고, 이후엔 인터넷 없이도 돼요.";
    const sugs = document.createElement("div");
    sugs.className = "sugs";
    SUGGEST.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sug";
      b.textContent = s;
      b.onclick = () => { $("#amsg").value = s; $("#aform").requestSubmit(); };
      sugs.appendChild(b);
    });
    e.append(orb, h, p, sugs);
    box.appendChild(e);
    return;
  }
  ai.hist.forEach((m) => box.appendChild(aiBubble(m.role, m.content)));
  box.scrollTop = box.scrollHeight;
}

function astat(t) {
  const el = $("#astat");
  el.hidden = !t;
  el.textContent = t || "";
}
function setBusy(b) {
  ai.busy = b;
  const btn = $("#abtn");
  btn.classList.toggle("stop", b);
  btn.querySelector("use").setAttribute("href", b ? "#i-stop" : "#i-send");
  btn.setAttribute("aria-label", b ? "멈추기" : "보내기");
  $("#amodel").disabled = b || ai.loading;
  $("#aclear").disabled = b;
}

/* ── 모델 다운로드 카드 ── */
// mode: "" 대기 · "active" 진행 중 · "done" 완료 · "fail" 실패
function setDl({ state, pct, sub, mode = "", btn, disabled }) {
  $("#dlcard").hidden = false;
  $("#dlstate").textContent = state;
  $("#dlpct").textContent = pct == null ? "" : pct + "%";
  const bar = $("#dlbarwrap");
  bar.className = "bar" + (mode ? " " + mode : "");
  bar.setAttribute("aria-valuenow", String(pct || 0));
  $("#dlbar").style.width = (pct || 0) + "%";
  const s = $("#dlsub");
  s.textContent = sub || "";
  s.className = "dlsub" + (mode === "fail" ? " bad" : "");
  const b = $("#dlbtn");
  b.textContent = btn;
  b.disabled = !!disabled;
}

// 모델이 이미 올라와 있는지 / 이 기기에 저장돼 있는지에 따라 카드와 버튼을 맞춰요.
async function refreshDl() {
  if (!ai.gpu || !ai.gpu.ok) { $("#dlcard").hidden = true; return; }
  if (ai.loading) return;
  const S = await getSm();
  const model = helperModel || S.DEFAULT_MODEL;
  const loaded = S.currentModel() === model;
  const chip = $("#agpu");
  chip.className = "chip ok";
  chip.textContent = loaded ? "준비 완료" : "GPU 사용 가능";
  if (loaded) { $("#dlcard").hidden = true; return; }
  const cached = await S.isCached(model);
  if (ai.loading) return;
  const gb = (S.MODELS[model].vram / 1000).toFixed(1);
  const heavyIos = S.IS_IOS && S.MODELS[model].vram > 1500;
  $("#dlname").textContent = S.MODELS[model].label;
  setDl({
    state: crashNote ? "앱이 메모리 부족으로 종료됐어요" : cached ? "이 기기에 저장돼 있어요" : "모델을 내려받아야 해요",
    pct: 0,
    sub:
      crashNote ||
      (cached ? "불러오면 바로 대화할 수 있어요." : `약 ${gb}GB · Wi-Fi 권장 · 한 번만 받으면 다음부터는 다시 받지 않아요.`) +
        (heavyIos ? " 아이폰은 메모리가 부족하면 앱이 다시 시작될 수 있어요." : ""),
    mode: crashNote ? "fail" : "",
    btn: cached ? "모델 불러오기" : `모델 다운로드 (약 ${gb}GB)`,
  });
}

// 다운로드 버튼과 첫 질문이 같이 쓰는 로딩 함수. 진행 상황을 실시간으로 카드에 보여줘요.
async function aiLoadModel(S, model) {
  const track = progTracker();
  ai.loading = true;
  crashNote = "";
  $("#amodel").disabled = true;
  $("#dlname").textContent = S.MODELS[model].label;
  setDl({ state: "준비하는 중…", pct: 0, mode: "active", btn: "진행 중…", disabled: true });
  let wl = null;
  try { wl = (await navigator.wakeLock?.request("screen")) || null; } catch {}
  try {
    await loadGuarded(S, model, (p) => {
      const r = track(p);
      setDl({ state: r.stage, pct: r.pct, sub: r.sub, mode: "active", btn: "진행 중…", disabled: true });
    }, aiCtx(S));
    setDl({ state: "준비 완료 ✓", pct: 100, sub: "이제 AI와 대화할 수 있어요.", mode: "done", btn: "완료", disabled: true });
    setTimeout(() => { if (!ai.loading) refreshDl(); }, 1500);
  } catch (err) {
    setDl({
      state: "실패했어요",
      pct: 0,
      sub: ((err && err.message) || String(err)).slice(0, 140) + " (GPU 메모리가 부족하면 더 작은 모델을 골라보세요.)",
      mode: "fail",
      btn: "다시 시도",
    });
    throw err;
  } finally {
    ai.loading = false;
    $("#amodel").disabled = ai.busy;
    try { if (wl) await wl.release(); } catch {}
  }
}

async function aiOpen() {
  if (!ai.init) {
    ai.init = true;
    ai.hist = loadHist();
    renderAi();
  }
  const S = await getSm();
  fillModels(S);
  if (!ai.gpu) ai.gpu = await S.gpuInfo();
  $("#amsg").disabled = !ai.gpu.ok;
  $("#abtn").disabled = !ai.gpu.ok;
  if (!ai.gpu.ok) {
    $("#agpu").className = "chip bad";
    $("#agpu").textContent = "GPU 없음";
  }
  astat(ai.gpu.ok ? "" : ai.gpu.reason + " 다른 기기에서 써주세요.");
  await refreshDl();
}

// 모델 컨텍스트가 4096토큰이라 최근 대화만 잘라서 보내요.
function recentForModel(budget) {
  const out = [];
  let n = 0;
  for (let i = ai.hist.length - 1; i >= 0; i--) {
    n += ai.hist[i].content.length;
    if (n > budget && out.length) break;
    out.unshift(ai.hist[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function aiSend(text) {
  const box = $("#alist");
  const S = await getSm();
  const model = helperModel || S.DEFAULT_MODEL;
  const loaded = S.currentModel() === model;
  if (ai.loading) {
    astat("모델을 준비하는 중이에요. 끝나면 다시 보내주세요.");
    setTimeout(() => astat(""), 2500);
    $("#amsg").value = text;
    return;
  }
  if (!loaded && !(await S.isCached(model))) {
    const mb = S.MODELS[model].vram;
    if (!confirm(`처음 한 번 모델 파일(약 ${(mb / 1000).toFixed(1)}GB)을 내려받아요.\nWi-Fi에서 하는 걸 권장합니다. 계속할까요?`)) {
      $("#amsg").value = text;
      return;
    }
  }

  ai.hist.push({ role: "user", content: text });
  renderAi();
  const bot = aiBubble("assistant", "");
  const atxt = bot.querySelector(".atxt");
  atxt.appendChild(typingDots());
  box.appendChild(bot);
  box.scrollTop = box.scrollHeight;
  setBusy(true);

  let wl = null;
  try {
    try { wl = (await navigator.wakeLock?.request("screen")) || null; } catch {}
    if (!loaded) await aiLoadModel(S, model);
    const ctx = aiCtx(S);
    const budget = ctx >= 4096 ? 2200 : ctx >= 2048 ? 1000 : 500; // 대화 길이에 맞춰 보낼 기록을 줄여요
    const answer = await S.chat(recentForModel(budget), (t) => {
      const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      atxt.textContent = t;
      if (stick) box.scrollTop = box.scrollHeight;
    }, ctx);
    if (!answer.trim()) throw new Error("답이 비어 있어요. 다시 시도해 주세요.");
    ai.hist.push({ role: "assistant", content: answer });
    saveHist();
  } catch (err) {
    ai.hist.pop(); // 실패한 질문은 기록에서 빼고 입력창에 되돌려줘요
    const prev = bot.previousElementSibling;
    if (prev && prev.classList.contains("user")) prev.remove();
    $("#amsg").value = text;
    atxt.className = "atxt err";
    atxt.textContent = "실패했어요: " + ((err && err.message) || err).toString().slice(0, 140);
  } finally {
    try { if (wl) await wl.release(); } catch {}
    setBusy(false);
  }
}

$("#aform").onsubmit = async (e) => {
  e.preventDefault();
  if (ai.busy) { if (sm) await sm.stopChat(); return; }
  const ta = $("#amsg");
  const text = ta.value.trim();
  if (!text || !ai.gpu || !ai.gpu.ok) return;
  ta.value = "";
  ta.style.height = "auto";
  aiSend(text);
};
$("#amsg").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#aform").requestSubmit();
  }
});
$("#amsg").addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px";
});
$("#dlbtn").onclick = async () => {
  if (ai.loading || ai.busy) return;
  const S = await getSm();
  const model = helperModel || S.DEFAULT_MODEL;
  if (!(await S.isCached(model))) {
    const mb = S.MODELS[model].vram;
    if (!confirm(`모델 파일(약 ${(mb / 1000).toFixed(1)}GB)을 내려받아요.\nWi-Fi에서 하는 걸 권장합니다. 계속할까요?`)) return;
  }
  try { await aiLoadModel(S, model); } catch {} // 실패 표시는 카드가 해줘요
};
$("#aclear").onclick = () => {
  if (ai.busy) return;
  if (ai.hist.length && !confirm("이 AI 대화를 지울까요?")) return;
  ai.hist = [];
  saveHist();
  renderAi();
};

/* ───────── 시작 ───────── */
if (token) start(); else showLogin();
