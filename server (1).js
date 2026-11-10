// Bozor — oddiy onlayn do'kon serveri. Qo'shimcha kutubxona kerak emas (Node 18+).
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const PASS = process.env.ADMIN_PASSWORD || "";
const DIR = process.env.DATA_DIR || __dirname;          // buyurtmalar shu papkada saqlanadi
const FP = path.join(DIR, "products.json"), FO = path.join(DIR, "orders.json");
const STATUSES = ["Yangi", "Qabul qilindi", "Yetkazilmoqda", "Yakunlandi", "Bekor qilindi"];

if (!PASS) { console.error("ADMIN_PASSWORD o'rnatilmagan. Masalan: ADMIN_PASSWORD=maxfiyparol node server.js"); process.exit(1); }

const seed = [
  { id: 1, n: "Simsiz quloqchin", c: "Elektronika", e: "🎧", p: 189000, o: 259000, r: 4.7 },
  { id: 2, n: "Smart soat", c: "Elektronika", e: "⌚", p: 349000, o: 450000, r: 4.5 },
  { id: 3, n: "Telefon uchun zaryadka", c: "Elektronika", e: "🔌", p: 59000, o: 0, r: 4.6 },
  { id: 4, n: "Erkaklar krossovkasi", c: "Kiyim", e: "👟", p: 279000, o: 350000, r: 4.4 },
  { id: 5, n: "Ayollar sumkasi", c: "Kiyim", e: "👜", p: 165000, o: 0, r: 4.8 },
  { id: 6, n: "Qishki kurtka", c: "Kiyim", e: "🧥", p: 520000, o: 690000, r: 4.6 },
  { id: 7, n: "Choynak, 1.5 litr", c: "Uy-roʻzgʻor", e: "🫖", p: 89000, o: 0, r: 4.3 },
  { id: 8, n: "Oshxona pichoqlari toʻplami", c: "Uy-roʻzgʻor", e: "🔪", p: 120000, o: 160000, r: 4.7 },
  { id: 9, n: "Bolalar konstruktori", c: "Bolalar", e: "🧱", p: 99000, o: 130000, r: 4.9 },
  { id: 10, n: "Maktab ryukzagi", c: "Bolalar", e: "🎒", p: 135000, o: 180000, r: 4.5 }
];

const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const store = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));
if (!fs.existsSync(FP)) store(FP, seed);

const sha = x => crypto.createHash("sha256").update(String(x)).digest();
const isAdmin = req => crypto.timingSafeEqual(sha(req.headers["x-admin"] || ""), sha(PASS));
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, no) => {
  let s = "";
  req.on("data", c => { s += c; if (s.length > 20000) { no(new Error("big")); req.destroy(); } });
  req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(e); } });
});
const text = (v, n) => String(v || "").trim().slice(0, n);

http.createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://x").pathname;

    if (p === "/api/products" && req.method === "GET") return send(res, 200, load(FP, []));

    if (p === "/api/orders" && req.method === "POST") {
      const b = await body(req), prods = load(FP, []);
      const name = text(b.name, 80), phone = text(b.phone, 30), address = text(b.address, 200);
      if (!name || phone.replace(/\D/g, "").length < 9 || !address)
        return send(res, 400, { error: "Ism, telefon va manzilni toʻldiring" });
      const items = []; let total = 0;
      for (const it of Array.isArray(b.items) ? b.items.slice(0, 50) : []) {
        const pr = prods.find(x => x.id === it.id), q = Math.floor(Number(it.qty));
        if (pr && q > 0 && q <= 99) { items.push({ id: pr.id, name: pr.n, price: pr.p, qty: q }); total += pr.p * q; }
      }
      if (!items.length) return send(res, 400, { error: "Savat boʻsh" });
      const orders = load(FO, []);
      const id = orders.reduce((m, o) => Math.max(m, o.id), 0) + 1;
      orders.push({ id, at: new Date().toISOString(), name, phone, address, items, total, status: "Yangi" });
      store(FO, orders);
      return send(res, 200, { ok: true, id });
    }

    if (p.startsWith("/api/admin/")) {
      if (!isAdmin(req)) return send(res, 401, { error: "Parol notoʻgʻri" });
      if (p === "/api/admin/orders") return send(res, 200, load(FO, []).reverse());
      if (req.method !== "POST") return send(res, 405, { error: "Notoʻgʻri usul" });
      const b = await body(req);
      if (p === "/api/admin/status") {
        const orders = load(FO, []), o = orders.find(x => x.id === b.id);
        if (!o || !STATUSES.includes(b.status)) return send(res, 400, { error: "Xato" });
        o.status = b.status; store(FO, orders); return send(res, 200, { ok: true });
      }
      if (p === "/api/admin/add") {
        const prods = load(FP, []), price = Number(b.p), old = Number(b.o) || 0;
        if (!text(b.n, 100) || !(price > 0)) return send(res, 400, { error: "Nom va narxni kiriting" });
        prods.push({ id: prods.reduce((m, x) => Math.max(m, x.id), 0) + 1, n: text(b.n, 100), c: text(b.c, 40) || "Boshqa", e: text(b.e, 8) || "📦", p: price, o: old > price ? old : 0, r: 5 });
        store(FP, prods); return send(res, 200, { ok: true });
      }
      if (p === "/api/admin/delete") {
        store(FP, load(FP, []).filter(x => x.id !== b.id)); return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "Topilmadi" });
    }

    const pages = { "/": "index.html", "/admin": "admin.html" };
    if (!pages[p]) { res.writeHead(404); return res.end("Topilmadi"); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(__dirname, pages[p])).pipe(res);
  } catch (e) { send(res, 400, { error: "Xato soʻrov" }); }
}).listen(PORT, () => console.log("Sayt ishga tushdi: http://localhost:" + PORT + "  Admin: /admin"));
