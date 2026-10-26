/* Knesset Slots — механика, рендер, карточка. Без зависимостей. */
(() => {
  "use strict";

  const PARTIES = window.PARTIES;
  const JOKER = window.JOKER;
  const SYMBOLS = PARTIES.concat([JOKER]);
  const byId = new Map(SYMBOLS.map(s => [s.id, s]));

  // Механика живёт в engine.js — здесь только рендер и состояние.
  const E = window.KSEngine;
  const { LINES, REELS, ROWS } = E;
  const IDS = SYMBOLS.map(s => s.id);
  const generate = (seed, spin) => E.generate(seed, spin, IDS);

  // ── состояние ─────────────────────────────────────────────────────────────

  const LS = {
    get(k, d) { try { const v = localStorage.getItem("ks." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("ks." + k, JSON.stringify(v)); } catch {} }
  };

  const params = new URLSearchParams(location.search);
  const urlSeed = params.get("s");
  const urlSpin = params.get("i");

  const state = {
    lang: LS.get("lang", detectLang()),
    seed: urlSeed || LS.get("seed", null) || newSeed(),
    spins: urlSpin ? 0 : LS.get("spins", 0),
    turbo: LS.get("turbo", false),
    sound: LS.get("sound", false),
    spinning: false,
    foreign: !!urlSpin,
    verdict: null
  };

  // сид обязан переживать перезагрузку, иначе сетка после F5 не совпадёт с вердиктом
  if (!urlSeed) LS.set("seed", state.seed);

  function newSeed() {
    return Math.floor(Math.random() * 2176782336).toString(36).padStart(6, "0").slice(-6);
  }

  function detectLang() {
    const nav = (navigator.language || "ru").slice(0, 2).toLowerCase();
    return ["ru", "he", "en"].includes(nav) ? nav : "en";
  }

  function spinWord(n) {
    if (state.lang === "ru") {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return t("spinOne");
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return t("spinFew");
      return t("spinMany");
    }
    return n === 1 ? t("spinOne") : t("spinMany");
  }

  const t = (key, vars) => {
    const pack = (window.I18N[state.lang] || window.I18N.ru);
    let s = pack[key] != null ? pack[key] : window.I18N.ru[key] || key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll("{" + k + "}", v);
    return s;
  };

  // ── DOM ───────────────────────────────────────────────────────────────────

  const $ = sel => document.querySelector(sel);
  const el = {
    eyebrow: $("#eyebrow"), bodyName: $("#bodyName"), subtitle: $("#subtitle"), status: $("#status"),
    langs: $("#langs"), window: $("#window"), payline: $("#payline"),
    spin: $("#spin"), spinLabel: $("#spinLabel"),
    spins: $("#spins"), seed: $("#seed"), turbo: $("#turbo"), sound: $("#sound"),
    slip: $("#slip"), slipLabel: $("#slipLabel"), slipPhoto: $("#slipPhoto"),
    slipParty: $("#slipParty"), slipLeader: $("#slipLeader"), slipReason: $("#slipReason"),
    slipDetermined: $("#slipDetermined"), slipLines: $("#slipLines"),
    share: $("#share"), download: $("#download"), again: $("#again"),
    legendTitle: $("#legendTitle"), legendList: $("#legendList"), jokerNote: $("#jokerNote"),
    linesNote: $("#linesNote"), footerText: $("#footerText"), creditsLink: $("#creditsLink"),
    modal: $("#modal"), modalTitle: $("#modalTitle"), modalP: $("#modalP"),
    modalPhotos: $("#modalPhotos"), modalOk: $("#modalOk"), card: $("#card")
  };

  // ── символы ───────────────────────────────────────────────────────────────

  function jokerSvg() {
    return `<svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="8" y="5" width="48" height="54" rx="2" fill="#fdf9ee" stroke="#8c2f2f" stroke-width="1.6"/>
      <rect x="13" y="10" width="38" height="7" rx="1" fill="#8c2f2f" opacity=".85"/>
      <g stroke="#8c2f2f" stroke-width="1.3" opacity=".55">
        <path d="M15 25h34M15 31h34M15 37h22"/>
      </g>
      <circle cx="43" cy="44" r="7" fill="none" stroke="#8c2f2f" stroke-width="1.4" opacity=".7"/>
      <path d="M39 44l3 3 5-6" fill="none" stroke="#8c2f2f" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  }

  function cellNode(id) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const sym = byId.get(id);
    cell.style.setProperty("--accent", sym.accent);
    if (id === "joker") {
      cell.classList.add("joker-cell");
      cell.innerHTML = jokerSvg();
    } else {
      const img = document.createElement("img");
      img.src = "assets/portraits/" + id + ".webp";
      img.alt = sym[state.lang] || sym.ru;
      img.draggable = false;
      cell.appendChild(img);
    }
    return cell;
  }

  // ── барабаны ──────────────────────────────────────────────────────────────

  function buildEmptyWindow() {
    el.window.innerHTML = "";
    for (let r = 0; r < REELS; r++) {
      const reel = document.createElement("div");
      reel.className = "reel";
      const strip = document.createElement("div");
      strip.className = "strip";
      reel.appendChild(strip);
      el.window.appendChild(reel);
    }
  }

  function drawPaylines(wins) {
    el.payline.innerHTML = "";
    if (!wins.length) { el.payline.classList.remove("on"); return; }
    wins.forEach(w => {
      // точки считаем в процентах: 5 колонок, 3 ряда
      const pts = w.line.cells
        .map(([reel, row]) => `${(reel + 0.5) * 20},${((row + 0.5) * 100) / 3}`)
        .join(" ");
      el.payline.insertAdjacentHTML("beforeend", `<polyline points="${pts}"></polyline>`);
    });
    el.payline.classList.add("on");
  }

  function settleWindow(grid, wins) {
    const reels = [...el.window.children];
    el.window.classList.toggle("has-win", wins.length > 0);
    drawPaylines(wins);
    const winCells = new Set();
    wins.forEach(w => w.line.cells.forEach(([r, y]) => winCells.add(r + ":" + y)));

    reels.forEach((reel, r) => {
      const strip = document.createElement("div");
      strip.className = "strip";
      for (let y = 0; y < ROWS; y++) {
        const cell = cellNode(grid[r][y]);
        if (winCells.has(r + ":" + y)) {
          cell.classList.add("win");
          const hit = wins.find(w => w.line.cells.some(([rr, yy]) => rr === r && yy === y));
          const sym = hit && hit.partyId ? byId.get(hit.partyId) : null;
          cell.style.setProperty("--win-accent", sym ? sym.accent : JOKER.accent);
        }
        strip.appendChild(cell);
      }
      reel.innerHTML = "";
      reel.appendChild(strip);
    });
  }

  function animate(grid, spin) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turbo = state.turbo;
    const dur = reduced ? 1 : (turbo ? 420 : 900);
    const stagger = reduced ? 0 : (turbo ? 55 : 140);
    const filler = 11;

    el.window.classList.remove("has-win");
    drawPaylines([]);

    const reels = [...el.window.children];
    const cellH = reels[0].clientHeight / ROWS;

    return new Promise(resolve => {
      let done = 0;
      reels.forEach((reel, r) => {
        const strip = document.createElement("div");
        strip.className = "strip";
        strip.style.transition = "none";

        for (let i = 0; i < filler; i++) {
          strip.appendChild(cellNode(SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].id));
        }
        for (let y = 0; y < ROWS; y++) strip.appendChild(cellNode(grid[r][y]));

        reel.innerHTML = "";
        reel.appendChild(strip);
        void strip.offsetHeight;

        strip.style.transition = `transform ${dur}ms cubic-bezier(.16,.72,.24,1) ${r * stagger}ms`;
        strip.style.transform = `translate3d(0, ${-filler * cellH}px, 0)`;

        const stopAt = (r * stagger + dur) + 20;
        setTimeout(() => {
          playClick(r);
          if (++done === REELS) setTimeout(resolve, reduced ? 0 : 90);
        }, reduced ? 0 : stopAt);
      });
    });
  }

  // ── звук ──────────────────────────────────────────────────────────────────

  let audio = null;
  function ac() {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio = new Ctx();
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  }

  function playClick(i) {
    if (!state.sound) return;
    const ctx = ac(); if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180 + i * 34, t0);
    osc.frequency.exponentialRampToValueAtTime(90 + i * 12, t0 + 0.07);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.045, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.14);
  }

  function playWin() {
    if (!state.sound) return;
    const ctx = ac(); if (!ctx) return;
    const t0 = ctx.currentTime;
    [392, 523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t0 + i * 0.11;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start); osc.stop(start + 1);
    });
  }

  // ── вердикт ───────────────────────────────────────────────────────────────

  function verdictOf(wins) {
    if (!wins.length) return null;
    const main = wins[0];
    return { wins, party: main.partyId ? byId.get(main.partyId) : null, blank: !!main.blank };
  }

  function partyName(p) { return p ? (p[state.lang] || p.ru) : t("blankBallot"); }
  function leaderName(p) { return p ? (p["leader" + state.lang[0].toUpperCase() + state.lang.slice(1)] || p.leaderEn) : ""; }

  function renderSlip(v, spinCount) {
    el.slip.hidden = false;
    el.slipLabel.textContent = t("resultLabel");

    const name = partyName(v.party);
    const reason = v.party ? v.party.reason[state.lang] : JOKER.reason[state.lang];
    const accent = v.party ? v.party.accent : JOKER.accent;

    el.slip.style.setProperty("--slip-accent", accent);
    el.slipPhoto.innerHTML = v.party
      ? `<img src="assets/portraits/${v.party.id}.webp" alt="">`
      : jokerSvg();
    el.slipPhoto.style.background = v.party ? accent : "#f7f3e6";

    el.slipParty.innerHTML = `${escapeHtml(name)}` +
      (v.party && v.party.he !== v.party[state.lang]
        ? `<span class="he" lang="he" dir="rtl">${escapeHtml(v.party.he)}</span>` : "");
    el.slipLeader.textContent = v.party ? leaderName(v.party) : "";
    el.slipReason.textContent = reason;
    el.slipDetermined.textContent = t("determined", { n: spinCount, word: spinWord(spinCount) });

    if (v.wins.length > 1) {
      el.slipLines.hidden = false;
      el.slipLines.textContent = t("lines", { n: v.wins.length });
    } else {
      el.slipLines.hidden = true;
    }

    el.again.textContent = state.foreign ? t("foreignCta") : t("again");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── прокрут ───────────────────────────────────────────────────────────────

  async function doSpin() {
    if (state.spinning) return;
    state.spinning = true;
    el.spin.disabled = true;
    el.slip.hidden = true;

    const spin = state.spins + 1;
    const result = generate(state.seed, spin);

    await animate(result.grid, spin);
    settleWindow(result.grid, result.wins);

    state.spins = spin;
    LS.set("spins", spin);

    const v = verdictOf(result.wins);
    if (v) {
      state.verdict = { partyId: v.party ? v.party.id : "joker", blank: v.blank, spins: spin, lines: v.wins.length };
      renderSlip(v, spin);
      playWin();
      setTimeout(() => el.slip.scrollIntoView({ behavior: "smooth", block: "nearest" }), 900);
      LS.set("last", state.verdict);
    }

    el.spins.textContent = t("spinsLabel", { n: spin });
    el.spin.disabled = false;
    state.spinning = false;
  }

  // ── карточка ──────────────────────────────────────────────────────────────

  const CARD_W = 1080, CARD_H = 1350;

  function wrapLines(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (ctx.measureText(next).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circularText(ctx, text, cx, cy, radius, startAngle, font) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = [...text];
    const step = (Math.PI * 2) / chars.length;
    let angle = startAngle;
    for (const ch of chars) {
      ctx.save();
      ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      angle += step;
    }
    ctx.restore();
  }

  function loadPortrait(id) {
    return new Promise(resolve => {
      if (id === "joker") return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "assets/portraits/" + id + ".webp";
    });
  }

  async function drawCard(verdict, spinCount) {
    const c = el.card;
    const ctx = c.getContext("2d");
    const p = verdict.party;
    const accent = p ? p.accent : JOKER.accent;
    const name = partyName(p);
    const reason = p ? p.reason[state.lang] : JOKER.reason[state.lang];
    const serif = state.lang === "he" ? "'Frank Ruhl Libre', serif" : "'PT Serif', Georgia, serif";
    const sans = state.lang === "he" ? "'Noto Sans Hebrew', sans-serif" : "'Noto Sans', system-ui, sans-serif";
    const heSerif = "'Frank Ruhl Libre', serif";

    await document.fonts.ready;
    const portrait = await loadPortrait(p ? p.id : "joker");

    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // бумага
    const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, "#f6f0e3");
    bg.addColorStop(0.55, "#efe7d6");
    bg.addColorStop(1, "#e6dcc7");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // волокна бумаги
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#6d5120";
    for (let i = 0; i < 260; i++) {
      const x = (i * 137.5) % CARD_W;
      const y = (i * 271.3) % CARD_H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 40 + (i % 30), y + 2);
      ctx.stroke();
    }
    ctx.restore();

    // рамки
    ctx.strokeStyle = "rgba(109,81,32,.75)"; ctx.lineWidth = 3;
    ctx.strokeRect(38, 38, CARD_W - 76, CARD_H - 76);
    ctx.strokeStyle = "rgba(109,81,32,.3)"; ctx.lineWidth = 1;
    ctx.strokeRect(52, 52, CARD_W - 104, CARD_H - 104);

    ctx.textAlign = "center";
    ctx.fillStyle = "#837a68";
    ctx.font = `600 22px ${sans}`;
    ctx.fillText(spaced(t("bodyName").toUpperCase()), CARD_W / 2, 118, 860);

    ctx.fillStyle = "#4c463c";
    ctx.font = `400 20px ${sans}`;
    ctx.fillText(t("subtitle"), CARD_W / 2, 155);

    // линия-разделитель
    ctx.strokeStyle = "rgba(27,26,23,.55)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(120, 185); ctx.lineTo(CARD_W - 120, 185); ctx.stroke();

    // медальон
    const cx = CARD_W / 2, cy = 400, R = 150;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = accent; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    if (portrait) {
      const g = ctx.createRadialGradient(cx, cy - R * 0.35, R * 0.2, cx, cy, R);
      g.addColorStop(0, accent + "cc");
      g.addColorStop(1, accent);
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      const scale = Math.min((R * 2) / portrait.width, (R * 2) / portrait.height);
      const w = portrait.width * scale, h = portrait.height * scale;
      ctx.drawImage(portrait, cx - w / 2, cy + R - h, w, h);
    } else {
      ctx.fillStyle = "#f7f3e6"; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
      ctx.fillStyle = JOKER.accent; ctx.font = `700 96px ${heSerif}`;
      ctx.fillText("פתק", cx, cy + 26);
    }
    ctx.restore();

    // «твой голос»
    ctx.fillStyle = "#8c2f2f";
    ctx.font = `600 26px ${sans}`;
    ctx.fillText(spaced(t("resultLabel").toUpperCase()), CARD_W / 2, 625);

    // название партии
    ctx.fillStyle = "#1b1a17";
    const nameSize = name.length > 16 ? 54 : 66;
    ctx.font = `700 ${nameSize}px ${serif}`;
    ctx.fillText(name, CARD_W / 2, 705);
    if (p) {
      ctx.fillStyle = "#4c463c";
      ctx.font = `700 38px ${heSerif}`;
      ctx.fillText(p.he, CARD_W / 2, 758);
    }

    if (p) {
      ctx.fillStyle = "#837a68";
      ctx.font = `400 24px ${sans}`;
      ctx.fillText(leaderName(p), CARD_W / 2, 806);
    }

    // причина
    ctx.fillStyle = "#4c463c";
    ctx.font = `italic 400 32px ${serif}`;
    const lines = wrapLines(ctx, reason, CARD_W - 240);
    lines.forEach((ln, i) => ctx.fillText(ln, CARD_W / 2, 890 + i * 44));

    // реквизиты
    ctx.strokeStyle = "rgba(27,26,23,.35)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(150, 1000); ctx.lineTo(CARD_W - 150, 1000); ctx.stroke();

    ctx.fillStyle = "#4c463c";
    ctx.font = `600 24px ${sans}`;
    ctx.fillText(t("determined", { n: spinCount, word: spinWord(spinCount) }), CARD_W / 2, 1052);
    if (verdict.wins.length > 1) {
      ctx.fillStyle = "#8c2f2f";
      ctx.font = `600 22px ${sans}`;
      ctx.fillText(t("lines", { n: verdict.wins.length }), CARD_W / 2, 1092);
    }

    ctx.fillStyle = "#837a68";
    ctx.font = `400 20px ${sans}`;
    const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|)$/.test(location.hostname);
    const site = local
      ? "knesset-slots"
      : location.host + location.pathname.replace(/index\.html$/, "").replace(/\/?$/, "/");
    ctx.fillText(`27.10.2026 · ${site} · ${t("seedLabel")} ${state.seed}`, CARD_W / 2, 1180);

    ctx.fillStyle = "#837a68";
    ctx.font = `400 17px ${sans}`;
    const foot = wrapLines(ctx, t("footer"), 560);
    foot.forEach((ln, i) => ctx.fillText(ln, CARD_W / 2 + 40, 1205 + i * 26));

    // печать
    ctx.save();
    ctx.translate(168, CARD_H - 190);
    ctx.rotate(-0.16);
    ctx.strokeStyle = "rgba(140,47,47,.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 86, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(140,47,47,.62)";
    circularText(ctx, "KNESSET DIVINATION · 27.10.2026 ·", 0, 0, 66, -Math.PI / 2, `600 13px ${sans}`);
    ctx.font = `700 44px ${heSerif}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("ג", 0, 2);
    ctx.restore();

    return c;
  }

  function spaced(text) {
    return [...text].join("\u2009");
  }

  function canvasBlob() {
    return new Promise(resolve => el.card.toBlob(resolve, "image/png"));
  }

  function shareUrl(spin) {
    const base = location.href.split("?")[0].split("#")[0];
    return `${base}?s=${encodeURIComponent(state.seed)}&i=${spin}`;
  }

  function shareText(v, spin) {
    const p = v.party;
    const name = partyName(p);
    const reason = p ? p.reason[state.lang] : JOKER.reason[state.lang];
    const url = shareUrl(spin);
    return `${t("shareHead", { party: name })}: ${reason}. ${t("determined", { n: spin, word: spinWord(spin) })}. ${url}`;
  }

  async function doShare() {
    if (!state.verdict) return;
    const v = currentVerdict();
    const spin = state.verdict.spins;
    const text = shareText(v, spin);
    const blob = await canvasBlob();
    const file = new File([blob], "knesset-slot.png", { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text, title: t("resultLabel") });
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    await copy(text);
    downloadBlob(blob);
    flash(t("copied"));
  }

  function copy(text) {
    if (navigator.clipboard && location.protocol !== "file:") {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    legacyCopy(text);
    return Promise.resolve();
  }

  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch {}
    ta.remove();
  }

  function downloadBlob(blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `knesset-slot-${state.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function currentVerdict() {
    const wantsBlank = state.verdict.blank;
    const party = wantsBlank ? null : byId.get(state.verdict.partyId);
    return { party, blank: wantsBlank, wins: new Array(state.verdict.lines || 1).fill(null) };
  }

  let flashTimer = null;
  function flash(msg) {
    el.spinLabel.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.spinLabel.textContent = t("spin"); }, 1800);
  }

  // ── статус участков ───────────────────────────────────────────────────────

  function tzOffsetMinutes(zone, date) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
    const p = dtf.formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function jerusalemDate(y, m, d, h, min) {
    const guess = Date.UTC(y, m - 1, d, h, min, 0);
    const off = tzOffsetMinutes("Asia/Jerusalem", new Date(guess));
    return new Date(guess - off * 60000);
  }

  function fmtLeft(ms) {
    const total = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(total / 60), m = total % 60;
    if (state.lang === "he") return `${h} ש׳ ${m} ד׳`;
    if (state.lang === "en") return `${h}h ${String(m).padStart(2, "0")}m`;
    return `${h} ч ${m} мин`;
  }

  function updateStatus() {
    const now = new Date();
    const open = jerusalemDate(2026, 10, 27, 7, 0);
    const close = jerusalemDate(2026, 10, 27, 22, 0);
    let txt, st;
    if (now < open) { txt = t("statusBefore", { t: fmtLeft(open - now) }); st = "before"; }
    else if (now < close) { txt = t("statusOpen", { t: fmtLeft(close - now) }); st = "open"; }
    else { txt = t("statusClosed"); st = "closed"; }
    el.status.textContent = txt;
    el.status.dataset.state = st;
  }

  // ── язык и статика ────────────────────────────────────────────────────────

  function applyLang() {
    const pack = window.I18N[state.lang];
    document.documentElement.lang = state.lang;
    document.documentElement.dir = pack.dir;

    el.eyebrow.innerHTML = t("eyebrow");
    el.bodyName.textContent = t("bodyName");
    el.subtitle.textContent = t("subtitle");
    el.spinLabel.textContent = t("spin");
    el.spins.textContent = t("spinsLabel", { n: state.spins });
    el.turbo.textContent = t("turbo");
    el.sound.textContent = t("sound");
    el.legendTitle.textContent = t("legend");
    el.jokerNote.textContent = t("jokerNote");
    el.linesNote.textContent = t("linesNote");
    el.footerText.textContent = t("footer");
    el.creditsLink.textContent = t("credits");
    el.share.textContent = t("share");
    el.download.textContent = t("download");
    el.again.textContent = state.foreign ? t("foreignCta") : t("again");
    el.modalTitle.textContent = t("modalTitle");
    el.modalP.textContent = t("modalP");
    el.modalPhotos.textContent = t("modalPhotos");
    el.modalOk.textContent = t("modalOk");
    el.seed.textContent = t("seedLabel") + " " + state.seed;

    [...el.langs.children].forEach(b => {
      b.setAttribute("aria-current", b.dataset.lang === state.lang ? "true" : "false");
    });

    document.title = t("bodyName");
    buildLegend();
    updateStatus();
    if (state.verdict) renderSlip(currentVerdict(), state.verdict.spins);
  }

  function buildLegend() {
    el.legendList.innerHTML = "";
    PARTIES.forEach(p => {
      const li = document.createElement("li");
      li.innerHTML = `<img src="assets/portraits/${p.id}.webp" alt="">
        <span class="names"><b>${escapeHtml(p[state.lang] || p.ru)}</b>
        <span>${escapeHtml(p["leader" + state.lang[0].toUpperCase() + state.lang.slice(1)] || p.leaderEn)}</span></span>`;
      li.querySelector("img").style.setProperty("--dot", p.accent);
      el.legendList.appendChild(li);
    });
  }

  // ── восстановление состояния ──────────────────────────────────────────────

  function restore() {
    if (urlSpin) {
      const n = Math.max(1, Math.min(9999, parseInt(urlSpin, 10) || 1));
      const r = generate(state.seed, n);
      settleWindow(r.grid, r.wins);
      const v = verdictOf(r.wins);
      if (v) {
        state.verdict = { partyId: v.party ? v.party.id : "joker", blank: v.blank, spins: n, lines: v.wins.length };
        renderSlip(v, n);
      }
      el.slip.hidden = !v;
      return;
    }
    const last = LS.get("last", null);
    if (last) {
      const r = generate(state.seed, last.spins);
      settleWindow(r.grid, r.wins);
      state.verdict = last;
      renderSlip(currentVerdict(), last.spins);
    } else {
      const r = generate(state.seed, 0);
      settleWindow(r.grid, r.wins);
    }
  }

  // ── события ───────────────────────────────────────────────────────────────

  el.spin.addEventListener("click", () => { ac(); doSpin(); });

  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !e.repeat && document.activeElement.tagName !== "BUTTON") {
      e.preventDefault(); ac(); doSpin();
    }
    if (e.key === "Escape" && !el.modal.hidden) closeModal();
  });

  el.turbo.addEventListener("click", () => {
    state.turbo = !state.turbo;
    el.turbo.setAttribute("aria-pressed", String(state.turbo));
    LS.set("turbo", state.turbo);
  });

  el.sound.addEventListener("click", () => {
    state.sound = !state.sound;
    el.sound.setAttribute("aria-pressed", String(state.sound));
    LS.set("sound", state.sound);
    if (state.sound) { ac(); playClick(0); }
  });

  el.again.addEventListener("click", () => {
    if (state.foreign) {
      state.foreign = false;
      const url = location.href.split("?")[0];
      history.replaceState(null, "", url);
      state.seed = newSeed();
      state.spins = 0;
      LS.set("seed", state.seed);
      LS.set("spins", 0);
      LS.set("last", null);
      state.verdict = null;
      el.slip.hidden = true;
      el.seed.textContent = t("seedLabel") + " " + state.seed;
      el.spins.textContent = t("spinsLabel", { n: 0 });
      const r = generate(state.seed, 0);
      settleWindow(r.grid, r.wins);
      el.again.textContent = t("again");
      return;
    }
    doSpin();
  });

  el.download.addEventListener("click", async () => {
    if (!state.verdict) return;
    await drawCard(currentVerdict(), state.verdict.spins);
    downloadBlob(await canvasBlob());
    flash(t("saveHint"));
  });

  el.share.addEventListener("click", doShare);

  el.langs.addEventListener("click", e => {
    const b = e.target.closest("button[data-lang]");
    if (!b) return;
    state.lang = b.dataset.lang;
    LS.set("lang", state.lang);
    applyLang();
  });

  function closeModal() {
    el.modal.hidden = true;
    LS.set("seen", true);
    el.spin.focus();
  }
  el.modalOk.addEventListener("click", closeModal);
  el.modal.addEventListener("click", e => { if (e.target === el.modal) closeModal(); });

  // ── запуск ────────────────────────────────────────────────────────────────

  buildEmptyWindow();
  el.turbo.setAttribute("aria-pressed", String(state.turbo));
  el.sound.setAttribute("aria-pressed", String(state.sound));
  applyLang();
  restore();
  setInterval(updateStatus, 30000);

  if (!LS.get("seen", false)) el.modal.hidden = false;

  // отладочный хук для проверки частоты выигрышей в консоли
  window.__ks = { generate, LINES, state };
})();
