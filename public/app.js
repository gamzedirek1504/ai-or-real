const $ = (s) => document.querySelector(s);
const screens = {
  start: $("#screen-start"),
  quiz: $("#screen-quiz"),
  result: $("#screen-result"),
};

let state = { name: "", questions: [], index: 0, score: 0, locked: false };

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

async function api(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Bir hata oluştu.");
  return data;
}

// ---------- Başlat ----------
async function startGame() {
  const name = $("#name-input").value.trim();
  if (!name) {
    $("#start-error").textContent = "Lütfen adını yaz.";
    return;
  }
  $("#start-error").textContent = "";
  try {
    const data = await api("/api/start", { name });
    state = {
      name,
      questions: data.questions,
      index: 0,
      score: 0,
      locked: false,
    };
    show("quiz");
    renderQuestion();
  } catch (e) {
    $("#start-error").textContent = e.message;
  }
}

$("#start-btn").addEventListener("click", startGame);
$("#name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

// ---------- Soru ----------
function renderQuestion() {
  const q = state.questions[state.index];
  state.locked = false;

  $("#progress").textContent = `${state.index + 1} / ${state.questions.length}`;
  $("#bar-fill").style.width =
    `${(state.index / state.questions.length) * 100}%`;
  $("#feedback").classList.add("hidden");

  q.images.forEach((img, i) => {
    const btn = $("#opt-" + i);
    btn.className = "option";
    btn.dataset.key = img.key;
    btn.querySelector("img").src = img.src;
    btn.querySelector(".badge").textContent = "";
  });

  // Sıradaki soruyu önceden yükle (mobil veride akıcılık)
  const next = state.questions[state.index + 1];
  if (next)
    next.images.forEach((img) => {
      new Image().src = img.src;
    });
}

document.querySelectorAll(".option").forEach((btn) => {
  btn.addEventListener("click", () => choose(btn));
});

async function choose(btn) {
  if (state.locked) return;
  state.locked = true;

  const q = state.questions[state.index];
  try {
    const r = await api("/api/answer", {
      name: state.name,
      pairId: q.pairId,
      pick: btn.dataset.key,
    });

    if (r.correct) state.score++;

    document.querySelectorAll(".option").forEach((o) => {
      const isAI = o.dataset.key === r.aiKey;
      o.classList.add("revealed", isAI ? "is-ai" : "is-real");
      o.querySelector(".badge").textContent = isAI
        ? "🤖 Yapay zekâ"
        : "📷 Gerçek";
    });
    btn.classList.add("picked", r.correct ? "right" : "wrong");

    $("#feedback-text").textContent = r.correct
      ? "✅ Doğru bildin!"
      : "❌ Yanlış! Yapay zekâ olan diğeriydi.";
    $("#feedback-stats").textContent =
      `Bu soruyu cevaplayan ${r.stats.total} kişinin %${r.stats.aiPct}'i yapay zekâyı, ` +
      `%${r.stats.realPct}'i gerçek fotoğrafı seçti.`;

    const isLast = state.index === state.questions.length - 1;
    $("#next-btn").textContent = isLast ? "Sonucu gör" : "Sonraki";
    $("#feedback").classList.remove("hidden");
  } catch (e) {
    state.locked = false;
    alert(e.message);
  }
}

$("#next-btn").addEventListener("click", () => {
  state.index++;
  if (state.index >= state.questions.length) {
    finish();
  } else {
    renderQuestion();
  }
});

// ---------- Sonuç ----------
function finish() {
  $("#result-name").textContent = state.name;
  $("#result-score").textContent = `${state.score} / ${state.questions.length}`;
  show("result");
}

$("#restart-btn").addEventListener("click", () => {
  $("#name-input").value = state.name;
  show("start");
});
