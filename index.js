const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 5000;

app.enable("trust proxy");
app.set("json spaces", 2);

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true })); // Untuk menangani form-data
app.use(express.json()); // Untuk menangani JSON
app.use(express.static(path.join(__dirname, "public"))); // Untuk melayani file statis

// Fungsi Database
const databasePath = path.join(__dirname, "public", "database.json");

const readDatabase = () => {
  if (!fs.existsSync(databasePath)) {
    fs.writeFileSync(databasePath, JSON.stringify({ users: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(databasePath));
};

const writeDatabase = (data) => {
  fs.writeFileSync(databasePath, JSON.stringify(data, null, 2));
};
// Middleware untuk memvalidasi API key
const validateApiKey = (req, res, next) => {
  const { apikey } = req.query;

  if (!apikey) {
    return res.status(403).json({ error: 'Missing API key.' });
  }

  const db = readDatabase();
  const user = db.users.find((user) => user.apikey === apikey);

  if (!user) {
    return res.status(403).json({ error: 'Invalid API key.' });
  }

  req.user = user; // Simpan data pengguna untuk digunakan di endpoint
  next();
};
// Halaman Register
app.get("/api/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.post("/api/register", (req, res) => {
  const { username, password, premium } = req.body;
  const db = readDatabase();

  // Cek apakah username sudah ada
  if (db.users.find((user) => user.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  // Tambahkan pengguna baru ke database
  db.users.push({
    username,
    password, // Jangan lupa untuk hashing password di produksi
    premium: premium === "true",
    apikey: null,
  });

  writeDatabase(db);
  res.json({ message: "Registration successful" });
});

// Halaman Login
app.get("/api/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDatabase();

  // Cari pengguna berdasarkan username dan password
  const user = db.users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(400).send("Invalid username or password");
  }

  // Jika API key belum ada, buat API key baru
  if (!user.apikey) {
    user.apikey = generateApiKey();
    writeDatabase(db);
  }

  res.json({
    message: "Login successful",
    apikey: user.apikey,
    premium: user.premium,
  });
});

// Halaman Dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get('/api/protected', validateApiKey, (req, res) => {
  res.json({
    message: 'Welcome to the protected API!',
    user: req.user.username,
  });
});

// Endpoint untuk servis dokumen HTML
app.get('/api', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get("/api/tiktok", validateApiKey, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL is required." });

  try {
    const { tiktokdl } = require("tiktokdl");
    const data = await tiktokdl(url);
    if (!data) return res.status(404).json({ error: "No data found." });
    res.json({ status: true, creator: "Rafael", result: data });
  } catch (e) {
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/orkut/createpayment", validateApiKey, async (req, res) => {
  const { amount, codeqr } = req.query;
  if (!amount) return res.status(400).json({ error: "Amount parameter is required." });
  if (!codeqr) return res.status(400).json({ error: "CodeQr parameter is required." });

  try {
    const qrData = await createQRIS(amount, codeqr);
    res.json({ status: true, creator: "Rafael", result: qrData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orkut/cekstatus", validateApiKey, async (req, res) => {
  const { merchant, keyorkut } = req.query;
  if (!merchant) return res.status(400).json({ error: "Merchant parameter is required." });
  if (!keyorkut) return res.status(400).json({ error: "Keyorkut parameter is required." });

  try {
    const apiUrl = `https://gateway.okeconnect.com/api/mutasi/qris/${merchant}/${keyorkut}`;
    const response = await axios.get(apiUrl);
    const result = response.data;

    const latestTransaction = result.data && result.data.length > 0 ? result.data[0] : null;
    if (latestTransaction) {
      res.json(latestTransaction);
    } else {
      res.json({ message: "No transactions found." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Middleware Error
app.use((req, res, next) => {
  res.status(404).send("Sorry can't find that!");
});

// Middleware untuk menangani error lainnya
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;