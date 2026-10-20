const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = 3000;
const QUESTIONS_PER_USER = 17; // bir kullanıcıya kaç soru
const TOLERANCE = 2; // dengeleme toleransı

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Veri ----------
const pairs = JSON.parse(
  fs.readFileSync(path.join(__dirname, "pairs.json"), "utf8"),
);
const pairMap = Object.fromEntries(pairs.map((p) => [p.id, p]));

const DB_FILE = path.join(__dirname, "data", "db.json");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

let db = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE, "utf8"))
  : { pairs: {}, answers: [] };

pairs.forEach((p) => {
  if (!db.pairs[p.id])
    db.pairs[p.id] = { served: 0, pickedAI: 0, pickedReal: 0 };
});

function save() {
  fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db, null, 2));
  fs.renameSync(DB_FILE + ".tmp", DB_FILE);
}
save();

// ---------- Seçim algoritması ----------
function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pickPairs(count) {
  const chosen = [];
  const pool = pairs.map((p) => p.id);

  while (chosen.length < count && pool.length) {
    const min = Math.min(...pool.map((id) => db.pairs[id].served));
    // Dengeleme: min + tolerans üstüne çıkanları şimdilik havuzdan çıkar
    const eligible = pool.filter(
      (id) => db.pairs[id].served <= min + TOLERANCE,
    );
    // Ağırlık: çok gösterilen -> düşük ağırlık
    const weights = eligible.map(
      (id) => 1 / Math.pow(1 + db.pairs[id].served, 2),
    );
    const id = weightedPick(eligible, weights);
    chosen.push(id);
    pool.splice(pool.indexOf(id), 1);
  }
  return chosen;
}

// ---------- API ----------
app.post("/api/start", (req, res) => {
  const name = String(req.body.name || "")
    .trim()
    .slice(0, 40);
  if (!name) return res.status(400).json({ error: "İsim gerekli." });

  const ids = pickPairs(Math.min(QUESTIONS_PER_USER, pairs.length));
  const questions = ids.map((id) => {
    const p = pairMap[id];
    db.pairs[id].served++;
    // Sağ/sol konumunu rastgele karıştır (hangisinin AI olduğu gönderilmez)
    const images = [
      { key: "a", src: p.a },
      { key: "b", src: p.b },
    ];
    if (Math.random() < 0.5) images.reverse();
    return { pairId: id, images };
  });
  save();
  res.json({ questions });
});

app.post("/api/answer", (req, res) => {
  const { name, pairId, pick } = req.body;
  const p = pairMap[pairId];
  if (!p || !["a", "b"].includes(pick)) {
    return res.status(400).json({ error: "Geçersiz istek." });
  }

  const pickedAI = pick === p.ai; // AI olan görseli seçtiyse doğru bildi
  const s = db.pairs[pairId];
  if (pickedAI) s.pickedAI++;
  else s.pickedReal++;

  db.answers.push({
    name: String(name || "").slice(0, 40),
    pairId,
    pickedAI,
    ts: new Date().toISOString(),
  });
  save();

  const total = s.pickedAI + s.pickedReal;
  res.json({
    correct: pickedAI,
    aiKey: p.ai,
    stats: {
      total,
      aiPct: Math.round((s.pickedAI / total) * 100),
      realPct: Math.round((s.pickedReal / total) * 100),
    },
  });
});

// Analiz için ham veri (Excel / dashboard'a aktarabilirsin)
app.get("/api/export.csv", (req, res) => {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    "name,pair_id,picked_ai,timestamp",
    ...db.answers.map((a) =>
      [esc(a.name), a.pairId, a.pickedAI, a.ts].join(","),
    ),
  ];
  res.type("text/csv").send("\ufeff" + rows.join("\n"));
});

// ---------- Başlat ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nBilgisayarda:  http://localhost:${PORT}`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i.family === "IPv4" && !i.internal)
    .forEach((i) => console.log(`Telefonda:     http://${i.address}:${PORT}`));
});
