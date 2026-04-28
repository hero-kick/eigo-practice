const LESSONS_INDEX_URL = "../materials/lessons.json";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const State = {
  lessons: null,
  lesson: null,
  activeTab: "prose",
  passageCardIndex: 0,
  jaRevealed: false,
  structureRevealed: false,
};

/* ========================================================================
   Passage
   ======================================================================== */
function renderPassage(lesson) {
  renderPassageCard();
  renderProseView(lesson);
  applyJaReveal();
  applyStructureReveal();
}

function passageContainers() {
  return [$("#passage-stage")];
}
function setPassageClass(name, on) {
  passageContainers().forEach((c) => c.classList.toggle(name, on));
}

function renderPassageCard() {
  if (!State.lesson) return;
  const sentences = State.lesson.passage.sentences;
  const idx = State.passageCardIndex;
  const s = sentences[idx];

  const card = $("#passage-card");
  card.classList.add("transitioning");

  requestAnimationFrame(() => {
    $("#card-num").textContent = circled(s.id);
    renderSegments($("#card-en"), s.structure, s.en, " ", { jotTarget: true });
    renderSegments($("#card-ja"), s.ja_structure, s.ja, "");

    const patternEl = $("#card-pattern");
    patternEl.innerHTML = "";
    if (s.pattern) {
      patternEl.appendChild(document.createTextNode(s.pattern));
      if (s.pattern_note) {
        const note = document.createElement("span");
        note.className = "pattern-note";
        note.textContent = s.pattern_note;
        patternEl.appendChild(note);
      }
    }

    $("#card-progress-num").textContent = `${idx + 1} / ${sentences.length}`;
    $("#card-progress-fill").style.width = `${((idx + 1) / sentences.length) * 100}%`;
    $("#card-prev").disabled = idx === 0;
    $("#card-next").disabled = idx === sentences.length - 1;

    requestAnimationFrame(() => card.classList.remove("transitioning"));
  });
}

/* ----- Tap / hold-and-drag to jot annotation -----
   Tap a single word: cycles its role (? → S → V → O → C → M → ?).
   Hold and drag across multiple words: paints them all with the same
   role (the "next role" relative to the first word's current state).
   Adjacent same-role labels visually form a phrase. */
const JOT_CYCLE = ["", "S", "V", "O", "C", "M"];
function setJot(span, role) {
  span.dataset.jot = role;
  const jotEl = span.querySelector(".jot");
  if (jotEl) jotEl.textContent = role;
  refreshJotDedup();
}

function refreshJotDedup() {
  const cardEn = $("#card-en");
  if (!cardEn) return;
  const words = $$(".word.jot-target", cardEn);
  let prevRole = "";
  for (const w of words) {
    const cur = w.dataset.jot || "";
    w.classList.toggle("dup-jot", cur !== "" && cur === prevRole);
    prevRole = cur;
  }
}

const DRAG_THRESHOLD = 6; // px — below this, treat the gesture as a tap
let _gesture = null; // { word, x, y }
let _painting = false;
let _paintRole = null;
let _paintedWords = null;

function setupJotDragPaint() {
  const inCardEn = (el) => {
    const cardEn = $("#card-en");
    return !!cardEn && cardEn.contains(el);
  };

  document.addEventListener("pointerdown", (e) => {
    const word = e.target instanceof Element ? e.target.closest(".word.jot-target") : null;
    if (!word || !inCardEn(word)) return;

    e.stopPropagation();
    e.preventDefault();

    // Don't change anything yet. Decide tap vs drag on movement / release.
    _gesture = { word, x: e.clientX, y: e.clientY };
    _painting = false;
    _paintRole = null;
    _paintedWords = null;
  });

  document.addEventListener("pointermove", (e) => {
    if (!_gesture) return;

    if (!_painting) {
      const dx = e.clientX - _gesture.x;
      const dy = e.clientY - _gesture.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;

      // Movement threshold passed → enter paint mode.
      // If start is empty, advance to S; otherwise keep current role
      // so that holding-and-extending an "S" stays "S".
      const cur = _gesture.word.dataset.jot || "";
      _paintRole = cur === "" ? JOT_CYCLE[1] : cur;
      _painting = true;
      _paintedWords = new Set();
      setJot(_gesture.word, _paintRole);
      _gesture.word.classList.add("painting");
      _paintedWords.add(_gesture.word);
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const w = el.closest && el.closest(".word.jot-target");
    if (w && !_paintedWords.has(w) && inCardEn(w)) {
      setJot(w, _paintRole);
      w.classList.add("painting");
      _paintedWords.add(w);
    }
  });

  const stop = () => {
    // No drag occurred → treat as a single tap on the start word: cycle.
    if (_gesture && !_painting) {
      const w = _gesture.word;
      const cur = w.dataset.jot || "";
      const idx = JOT_CYCLE.indexOf(cur);
      const next = JOT_CYCLE[(idx + 1) % JOT_CYCLE.length];
      setJot(w, next);
    }
    if (_paintedWords) _paintedWords.forEach((w) => w.classList.remove("painting"));
    _gesture = null;
    _painting = false;
    _paintRole = null;
    _paintedWords = null;
  };
  document.addEventListener("pointerup", stop);
  document.addEventListener("pointercancel", stop);
}

function renderSegments(el, structure, fallback, sep, opts = {}) {
  const { jotTarget = false } = opts;
  el.innerHTML = "";
  if (Array.isArray(structure) && structure.length > 0) {
    structure.forEach((seg, i) => {
      const segSpan = document.createElement("span");
      segSpan.className = `seg seg-${seg.role}`;

      if (jotTarget) {
        // Word-level chips: tokenize segment text into words so the user
        // can mark each word independently. Adjacent same-role labels
        // visually form a phrase.
        const tokens = tokenizeWords(seg.text);
        tokens.forEach((t, j) => {
          const word = document.createElement("span");
          word.className = "word jot-target";
          word.dataset.jot = "";
          word.appendChild(document.createTextNode(t.word));

          const jotEl = document.createElement("span");
          jotEl.className = "jot";
          word.appendChild(jotEl);

          // Click is intercepted at pointerdown (drag-paint). Just stop
          // propagation so it does not bubble to the card click navigator.
          word.addEventListener("click", (e) => e.stopPropagation());

          segSpan.appendChild(word);
          if (t.space) segSpan.appendChild(document.createTextNode(t.space));
        });
      } else {
        segSpan.textContent = seg.text;
      }

      el.appendChild(segSpan);
      if (sep && i < structure.length - 1) el.appendChild(document.createTextNode(sep));
    });
  } else {
    el.textContent = fallback;
  }
}

function tokenizeWords(text) {
  // Split into [{word, space}] preserving punctuation attached to words
  // and the whitespace that follows each word.
  const result = [];
  const re = /(\S+)(\s*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    result.push({ word: m[1], space: m[2] });
  }
  return result;
}

function navigateCard(delta) {
  if (!State.lesson) return;
  const total = State.lesson.passage.sentences.length;
  const next = Math.max(0, Math.min(total - 1, State.passageCardIndex + delta));
  if (next !== State.passageCardIndex) {
    State.passageCardIndex = next;
    // Reset reveal on each new card (jots wiped via re-render)
    State.jaRevealed = false;
    State.structureRevealed = false;
    applyJaReveal();
    applyStructureReveal();
    renderPassageCard();
  }
}

function setupCardInteraction() {
  $("#card-prev").addEventListener("click", (e) => {
    e.stopPropagation();
    navigateCard(-1);
  });
  $("#card-next").addEventListener("click", (e) => {
    e.stopPropagation();
    navigateCard(1);
  });
  $("#passage-card").addEventListener("click", (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) navigateCard(-1);
    else navigateCard(1);
  });
  $("#reveal-ja").addEventListener("click", (e) => {
    e.stopPropagation();
    State.jaRevealed = !State.jaRevealed;
    applyJaReveal();
  });
  $("#reveal-structure").addEventListener("click", (e) => {
    e.stopPropagation();
    State.structureRevealed = !State.structureRevealed;
    applyStructureReveal();
  });
}

function applyJaReveal() {
  setPassageClass("ja-revealed", State.jaRevealed);
  const btn = $("#reveal-ja");
  btn.classList.toggle("revealed", State.jaRevealed);
  btn.setAttribute("aria-pressed", String(State.jaRevealed));
  $(".reveal-label", btn).textContent = State.jaRevealed ? "和訳を隠す" : "和訳を見る";
}

function applyStructureReveal() {
  const on = State.structureRevealed;
  setPassageClass("show-structure", on);
  setPassageClass("with-color", on);
  setPassageClass("with-brackets", on);
  const legend = $(".legend");
  if (legend) {
    legend.classList.toggle("visible", on);
    legend.classList.toggle("with-brackets", on);
  }
  const btn = $("#reveal-structure");
  btn.classList.toggle("revealed", on);
  btn.setAttribute("aria-pressed", String(on));
  $(".reveal-label", btn).textContent = on ? "文型を隠す" : "文型を見る";
}

function renderProseView(lesson) {
  const root = $("#passage-prose");
  root.innerHTML = "";

  const book = document.createElement("div");
  book.className = "prose-book mode-en";

  // Title block
  const title = document.createElement("h2");
  title.className = "prose-title";
  title.textContent = lesson.title;
  book.appendChild(title);

  if (lesson.title_ja) {
    const titleJa = document.createElement("div");
    titleJa.className = "prose-title-ja";
    titleJa.textContent = lesson.title_ja;
    book.appendChild(titleJa);
  }

  const meta = document.createElement("div");
  meta.className = "prose-meta";
  const lessonNum = lesson.id.replace(/^lesson-/, "");
  meta.textContent = [`Lesson ${lessonNum}`, lesson.level].filter(Boolean).join(" · ");
  book.appendChild(meta);

  const divider = document.createElement("hr");
  divider.className = "prose-divider";
  book.appendChild(divider);

  // Mode picker (英文 / 対訳 / 日本語)
  const modes = document.createElement("div");
  modes.className = "prose-modes";
  const modeLabels = { en: "英文", bilingual: "対訳", ja: "日本語" };
  for (const m of ["en", "bilingual", "ja"]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prose-mode-btn" + (m === "en" ? " active" : "");
    btn.dataset.mode = m;
    btn.textContent = modeLabels[m];
    btn.addEventListener("click", () => {
      $$(".prose-mode-btn", book).forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      book.className = `prose-book mode-${m}`;
    });
    modes.appendChild(btn);
  }
  book.appendChild(modes);

  // Per-paragraph blocks: EN + reveal-button + JA
  const enParas = lesson.passage.english.split(/\n\n+/);
  const jaParas = lesson.passage.japanese.split(/\n\n+/);
  const count = Math.max(enParas.length, jaParas.length);
  for (let i = 0; i < count; i++) {
    const para = document.createElement("div");
    para.className = "prose-paragraph";

    if (enParas[i]) {
      const pEn = document.createElement("p");
      pEn.className = "para-en";
      pEn.textContent = enParas[i].trim();
      para.appendChild(pEn);
    }

    if (jaParas[i]) {
      const btnJa = document.createElement("button");
      btnJa.type = "button";
      btnJa.className = "para-reveal-ja";
      btnJa.textContent = "和訳を見る";
      btnJa.addEventListener("click", () => {
        const isRevealed = para.classList.toggle("revealed");
        btnJa.textContent = isRevealed ? "和訳を隠す" : "和訳を見る";
      });
      para.appendChild(btnJa);

      const pJa = document.createElement("p");
      pJa.className = "para-ja";
      pJa.textContent = jaParas[i].trim();
      para.appendChild(pJa);
    }

    book.appendChild(para);
  }

  root.appendChild(book);
}

function circled(n) {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
  if (n >= 21 && n <= 35) return String.fromCodePoint(0x3251 + n - 21);
  if (n >= 36 && n <= 50) return String.fromCodePoint(0x32B1 + n - 36);
  return String(n);
}


/* ========================================================================
   Vocab
   ======================================================================== */
let vocabOriginalOrder = null;

function renderVocab(lesson) {
  const root = $("#vocab-list");
  root.innerHTML = "";
  vocabOriginalOrder = [...lesson.vocabulary];
  drawVocab(vocabOriginalOrder);

  $("#vocab-counter").textContent = `${lesson.vocabulary.length} 語`;

  bindToggle($("#toggle-meaning"), (on) => {
    root.classList.toggle("hide-meaning", !on);
    if (on) $$(".vocab-card.flipped", root).forEach((el) => el.classList.remove("flipped"));
  });

  $("#vocab-shuffle").addEventListener("click", () => {
    const shuffled = [...lesson.vocabulary].sort(() => Math.random() - 0.5);
    drawVocab(shuffled);
  });
  $("#vocab-reset").addEventListener("click", () => {
    drawVocab(vocabOriginalOrder);
  });
}

function drawVocab(items) {
  const root = $("#vocab-list");
  root.innerHTML = "";
  for (const v of items) {
    const card = document.createElement("div");
    card.className = "vocab-card";
    card.innerHTML = `
      <span class="word">${escapeHtml(v.word)}</span>
      <span class="meaning">${escapeHtml(v.meaning)}</span>
    `;
    card.addEventListener("click", () => {
      if (root.classList.contains("hide-meaning")) {
        card.classList.toggle("flipped");
      }
    });
    root.appendChild(card);
  }
}

/* ========================================================================
   Grammar
   ======================================================================== */
function renderGrammar(lesson) {
  const root = $("#grammar-list");
  root.innerHTML = "";
  for (const g of lesson.grammar_points) {
    const card = document.createElement("div");
    card.className = "grammar-card";
    card.innerHTML = `
      <div class="gh">
        <div class="gh-num">${g.id}</div>
        <div class="gh-title">${escapeHtml(g.title)}</div>
      </div>
      <p class="desc">${escapeHtml(g.explanation)}</p>
      <div class="ex">
        <p class="ex-en">${escapeHtml(g.example_en)}</p>
        <p class="ex-ja">${escapeHtml(g.example_ja)}</p>
      </div>
    `;
    root.appendChild(card);
  }
  $("#grammar-counter").textContent = `${lesson.grammar_points.length} 項目`;
}

/* ========================================================================
   Quiz
   ======================================================================== */
function renderQuiz(lesson) {
  const root = $("#quiz-list");
  root.innerHTML = "";
  const total = lesson.comprehension_questions.length;
  const state = new Map();

  const updateScore = () => {
    const solved = [...state.values()].filter((v) => v === "correct").length;
    const scoreEl = $("#quiz-score");
    scoreEl.textContent = `${solved} / ${total}`;
    scoreEl.classList.toggle("has-progress", solved > 0);
  };

  for (const q of lesson.comprehension_questions) {
    const card = document.createElement("div");
    card.className = "quiz-card";

    const qh = document.createElement("div");
    qh.className = "qh";
    qh.innerHTML = `
      <div class="q-num">Q${q.id}</div>
      <div class="q-text">${escapeHtml(q.question)}</div>
    `;

    const choices = document.createElement("div");
    choices.className = "quiz-choices";
    const buttons = [];

    for (const [key, text] of Object.entries(q.choices)) {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.dataset.key = key;
      btn.textContent = text;
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (key === q.answer) {
          btn.classList.add("correct");
          card.classList.remove("solved-wrong");
          card.classList.add("solved-correct");
          state.set(q.id, "correct");
          buttons.forEach((b) => (b.disabled = true));
        } else {
          btn.classList.add("wrong");
          card.classList.add("solved-wrong");
          state.set(q.id, "wrong");
        }
        updateScore();
      });
      buttons.push(btn);
      choices.appendChild(btn);
    }

    const actions = document.createElement("div");
    actions.className = "quiz-actions";
    const reveal = document.createElement("button");
    reveal.className = "btn-link";
    reveal.textContent = "答えを表示";
    reveal.addEventListener("click", () => {
      buttons.forEach((b) => {
        if (b.dataset.key === q.answer) b.classList.add("reveal");
      });
    });
    const reset = document.createElement("button");
    reset.className = "btn-link";
    reset.textContent = "リセット";
    reset.addEventListener("click", () => {
      buttons.forEach((b) => {
        b.classList.remove("correct", "wrong", "reveal");
        b.disabled = false;
      });
      card.classList.remove("solved-correct", "solved-wrong");
      state.delete(q.id);
      updateScore();
    });
    actions.append(reveal, reset);

    card.append(qh, choices, actions);
    root.appendChild(card);
  }

  $("#quiz-reset-all").addEventListener("click", () => {
    $$(".quiz-card", root).forEach((card) => {
      card.classList.remove("solved-correct", "solved-wrong");
      $$(".choice", card).forEach((b) => {
        b.classList.remove("correct", "wrong", "reveal");
        b.disabled = false;
      });
    });
    state.clear();
    updateScore();
  });

  updateScore();
}

/* ========================================================================
   Discussion
   ======================================================================== */
function renderDiscussion(lesson) {
  const ol = $("#discussion-list");
  ol.innerHTML = "";
  for (const d of lesson.discussion_questions) {
    const li = document.createElement("li");
    li.textContent = d;
    ol.appendChild(li);
  }
}

/* ========================================================================
   Tab nav
   ======================================================================== */
function setupTabs() {
  $$(".tab").forEach((t) => t.addEventListener("click", () => activateTab(t.dataset.tab)));
}
function activateTab(name) {
  State.activeTab = name;
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
}

/* ========================================================================
   Help overlay
   ======================================================================== */
function setupHelp() {
  const overlay = $("#help-overlay");
  const open = () => overlay.classList.remove("hidden");
  const close = () => overlay.classList.add("hidden");
  $("#help-btn").addEventListener("click", open);
  $("#help-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  return { open, close, isOpen: () => !overlay.classList.contains("hidden") };
}

/* ========================================================================
   Keyboard shortcuts
   ======================================================================== */
function setupKeyboard(help) {
  const tabKeys = { "1": "prose", "2": "passage", "3": "vocab", "4": "grammar", "5": "quiz", "6": "discussion" };
  const inSelector = () => !$("#lesson-selector").classList.contains("hidden");

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (help.isOpen()) {
      if (e.key === "Escape") { help.close(); e.preventDefault(); }
      return;
    }

    if (inSelector()) return;

    if (e.key === "?" || (e.key === "/" && e.shiftKey)) { help.open(); e.preventDefault(); return; }

    if (tabKeys[e.key]) {
      const tab = $(`.tab[data-tab="${tabKeys[e.key]}"]`);
      if (tab) { tab.click(); e.preventDefault(); }
      return;
    }

    if (State.activeTab === "passage") {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { navigateCard(1); e.preventDefault(); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { navigateCard(-1); e.preventDefault(); return; }
      if (e.key === "h" || e.key === "H") { $("#reveal-ja").click(); e.preventDefault(); return; }
      if (e.key === "s" || e.key === "S") { $("#reveal-structure").click(); e.preventDefault(); return; }
    }
  });
}

/* ========================================================================
   Utils
   ======================================================================== */
function bindToggle(btn, onChange) {
  btn.addEventListener("click", () => {
    const next = !btn.classList.contains("active");
    btn.classList.toggle("active", next);
    btn.setAttribute("aria-pressed", String(next));
    onChange(next);
  });
}
function bindLinkedToggle(btns, onChange) {
  if (!btns.length) return;
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = !btn.classList.contains("active");
      btns.forEach((b) => {
        b.classList.toggle("active", next);
        b.setAttribute("aria-pressed", String(next));
      });
      onChange(next);
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ========================================================================
   Init
   ======================================================================== */
/* ========================================================================
   Lesson selector + routing
   ======================================================================== */
function renderLessonSelector(lessons) {
  const root = $("#lesson-list");
  root.innerHTML = "";
  for (const l of lessons) {
    const card = document.createElement("a");
    card.className = "lesson-card";
    card.href = `#/${l.id}`;

    const num = document.createElement("div");
    num.className = "lesson-card-num";
    num.textContent = `Lesson ${l.id.replace(/^lesson-/, "")}`;
    card.appendChild(num);

    const en = document.createElement("div");
    en.className = "lesson-card-title-en";
    en.textContent = l.title;
    card.appendChild(en);

    if (l.title_ja) {
      const ja = document.createElement("div");
      ja.className = "lesson-card-title-ja";
      ja.textContent = l.title_ja;
      card.appendChild(ja);
    }
    if (l.level) {
      const lev = document.createElement("div");
      lev.className = "lesson-card-level";
      lev.textContent = l.level;
      card.appendChild(lev);
    }

    root.appendChild(card);
  }
}

async function showLesson(lessonId) {
  const info = (State.lessons || []).find((l) => l.id === lessonId);
  if (!info) {
    console.warn("Unknown lesson:", lessonId);
    showSelector();
    return;
  }
  if (!State.lesson || State.lesson.id !== lessonId) {
    const lesson = await fetch(`../materials/${info.path}`).then((r) => {
      if (!r.ok) throw new Error("lesson fetch failed");
      return r.json();
    });
    State.lesson = lesson;
    renderPassage(lesson);
    renderVocab(lesson);
    renderGrammar(lesson);
    renderQuiz(lesson);
    renderDiscussion(lesson);
    $("#brand-sub").textContent = `${lesson.id.toUpperCase()} · ${lesson.level || ""}`;
    document.title = `${lesson.title} · EigoPracitice`;
  }
  // Reset card state on entry
  State.passageCardIndex = 0;
  State.jaRevealed = false;
  State.structureRevealed = false;
  applyJaReveal();
  applyStructureReveal();
  renderPassageCard();
  activateTab("prose");
  $("#lesson-selector").classList.add("hidden");
}

function showSelector() {
  $("#lesson-selector").classList.remove("hidden");
}

function route() {
  const m = location.hash.match(/^#\/?(lesson-[\w-]+)/);
  if (m) showLesson(m[1]);
  else showSelector();
}

function setupBrandBack() {
  $("#brand-back").addEventListener("click", () => {
    if (location.hash) {
      history.pushState(null, "", location.pathname + location.search);
    }
    showSelector();
  });
}

(async function init() {
  try {
    const index = await fetch(LESSONS_INDEX_URL).then((r) => {
      if (!r.ok) throw new Error("lessons.json fetch failed");
      return r.json();
    });
    State.lessons = index.lessons || [];

    renderLessonSelector(State.lessons);
    setupTabs();
    setupBrandBack();
    setupCardInteraction();
    setupJotDragPaint();
    const help = setupHelp();
    setupKeyboard(help);
    window.addEventListener("hashchange", route);
    route();

    $("#loading").classList.add("hidden");
    setTimeout(() => $("#loading").remove(), 300);
  } catch (err) {
    console.error(err);
    $("#loading").innerHTML = `
      <div style="max-width:480px; padding:24px; text-align:center;">
        <div style="font-size:15px; font-weight:600; color:#dc2626; margin-bottom:8px;">教材データの読み込みに失敗しました</div>
        <div style="font-size:13px; color:#475569; line-height:1.6;">URL を確認してください。</div>
      </div>
    `;
  }
})();
