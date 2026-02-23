console.log("Server script starting...");

import express from "express";
import { createServer as createViteServer } from "vite";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = (() => {
  try {
    const database = new Database("auth.db");
    database.exec("CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY, access_token TEXT, refresh_token TEXT, scope TEXT, token_type TEXT, expiry_date INTEGER)");
    return database;
  } catch (err) {
    console.error("Failed to initialize database:", err);
    const database = new Database(":memory:");
    database.exec("CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY, access_token TEXT, refresh_token TEXT, scope TEXT, token_type TEXT, expiry_date INTEGER)");
    return database;
  }
})();

const app = express();
const PORT = 3000;

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const REDIRECT_URI = `${APP_URL.replace(/\/$/, "")}/auth/callback`;

console.log("OAuth Config Check:");
console.log("- CLIENT_ID:", CLIENT_ID ? `${CLIENT_ID.slice(0, 10)}...` : "MISSING");
console.log("- CLIENT_SECRET:", CLIENT_SECRET ? "PRESENT" : "MISSING");
console.log("- APP_URL:", APP_URL);
console.log("- REDIRECT_URI:", REDIRECT_URI);

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Helper to get tokens from DB
function getStoredTokens() {
  return db.prepare("SELECT * FROM tokens ORDER BY id DESC LIMIT 1").get() as any;
}

// API Routes (Directly on app)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/auth/url", (req, res) => {
  console.log("Handling /api/auth/url");
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(400).json({ error: "Google OAuth credentials missing" });
  }
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/spreadsheets"],
      prompt: "consent",
    });
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/auth/status", (req, res) => {
  const tokens = getStoredTokens();
  res.json({ connected: !!tokens });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    db.prepare("DELETE FROM tokens").run();
    db.prepare("INSERT INTO tokens (access_token, refresh_token, scope, token_type, expiry_date) VALUES (?, ?, ?, ?, ?)")
      .run(tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date);

    res.send(`
      <html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
          window.close();
        } else { window.location.href = '/'; }
      </script></body></html>
    `);
  } catch (error) {
    res.status(500).send("Auth failed");
  }
});

app.post("/api/submit", async (req, res) => {
  const tokens = getStoredTokens();
  if (!tokens) return res.status(401).json({ error: "Not connected" });
  
  const { spreadsheetId, data, pdf } = req.body;
  if (!spreadsheetId) return res.status(400).json({ error: "Spreadsheet ID missing" });

  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  try {
    // Logic for appending to sheets...
    // (I'll keep the logic from before)
    let targetSheet = "";
    let mainRow: any[] = [];

    if (data.category === 'Mini Dairy' || data.category === 'Cottage Industry') {
      targetSheet = "Mini Dairies & Cottages";
      mainRow = [data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, data.sales[0]?.avgVolPerDay || "", data.dboName, data.contacts, data.sales[0]?.avgVolPerDay || "", data.permitNo, data.location, data.comments, data.sales[0]?.sellingPrice || "", data.traceability];
    } else if (data.category === 'Milk Bar' || data.category === 'Dispenser') {
      targetSheet = "Dispensers & Milk Bars";
      mainRow = [data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, data.sales[0]?.avgVolPerDay || "", data.sales[0]?.buyingPrice || "", data.sales[0]?.sellingPrice || "", data.traceability];
    } else if (data.category === 'CP<5,000 L/D' || data.category === 'CP>5,000 L/D' || data.category === 'Processor') {
      targetSheet = "Cooling Plants";
      mainRow = [data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, data.intakes[0]?.avgVolPerDay || "", data.intakes[0]?.farmerPrice || "", data.intakes[0]?.processorPrice || "", data.traceability, data.intakes.map((i: any) => `${i.month} ${i.year}: ${i.quantity}L`).join("\n")];
    }

    if (targetSheet) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${targetSheet}!A:Z`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [mainRow] },
      });
    }

    const returnsRows = data.sales
      .filter((s: any) => parseFloat(s.underDeclared) > 0)
      .map((s: any) => [data.dboName, `${s.month} ${s.year}`, s.qtyDeclared, s.verifiedQty, s.underDeclared]);

    if (returnsRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Returns Validation!A:Z",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: returnsRows },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist", "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server on port ${PORT}`));
}

startServer();
