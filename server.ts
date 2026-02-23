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

const db = new Database("auth.db");
db.exec("CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY, access_token TEXT, refresh_token TEXT, scope TEXT, token_type TEXT, expiry_date INTEGER)");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Helper to get tokens from DB
function getStoredTokens() {
  return db.prepare("SELECT * FROM tokens ORDER BY id DESC LIMIT 1").get() as any;
}

// API routes
app.get("/api/auth/url", (req, res) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(400).json({ error: "Google OAuth credentials not configured in environment variables." });
  }

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    
    // Store tokens in DB
    db.prepare("DELETE FROM tokens").run(); // Keep only one for simplicity
    db.prepare("INSERT INTO tokens (access_token, refresh_token, scope, token_type, expiry_date) VALUES (?, ?, ?, ?, ?)")
      .run(tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, tokens.expiry_date);

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error exchanging code for tokens:", error);
    res.status(500).send("Authentication failed.");
  }
});

app.get("/api/auth/status", (req, res) => {
  const tokens = getStoredTokens();
  res.json({ connected: !!tokens });
});

app.post("/api/submit", async (req, res) => {
  const tokens = getStoredTokens();
  if (!tokens) {
    return res.status(401).json({ error: "Not connected to Google Sheets" });
  }

  const spreadsheetId = req.body.spreadsheetId;
  if (!spreadsheetId) {
    return res.status(400).json({ error: "Spreadsheet ID is required" });
  }

  oauth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  try {
    const formData = req.body.data;
    const pdfBase64 = req.body.pdf;

    // 1. Determine which sheet to append to and prepare the row
    let targetSheet = "";
    let mainRow: any[] = [];

    if (formData.category === 'Mini Dairy' || formData.category === 'Cottage Industry') {
      targetSheet = "Mini Dairies & Cottages";
      mainRow = [
        formData.dboName,
        formData.location,
        formData.contacts,
        formData.permitNo,
        formData.expiryDate,
        formData.sales[0]?.avgVolPerDay || "", // Avg volume per day
        formData.dboName, // Name (provision to add) - using DBO name as default
        formData.contacts, // Contact
        formData.sales[0]?.avgVolPerDay || "", // Volume/day
        formData.permitNo, // Permit No
        formData.location, // Area of sale
        formData.comments, // List of outlets (provision to add)
        formData.sales[0]?.sellingPrice || "", // Selling price
        formData.traceability // Traceability and records
      ];
    } else if (formData.category === 'Milk Bar' || formData.category === 'Dispenser') {
      targetSheet = "Dispensers & Milk Bars";
      mainRow = [
        formData.dboName,
        formData.location,
        formData.contacts,
        formData.permitNo,
        formData.expiryDate,
        formData.sales[0]?.avgVolPerDay || "",
        formData.sales[0]?.buyingPrice || "",
        formData.sales[0]?.sellingPrice || "",
        formData.traceability
      ];
    } else if (formData.category === 'CP<5,000 L/D' || formData.category === 'CP>5,000 L/D' || formData.category === 'Processor') {
      targetSheet = "Cooling Plants";
      mainRow = [
        formData.dboName,
        formData.location,
        formData.contacts,
        formData.permitNo,
        formData.expiryDate,
        formData.intakes[0]?.avgVolPerDay || "",
        formData.intakes[0]?.farmerPrice || "", // Buying price from total intake
        formData.intakes[0]?.processorPrice || "", // Selling price from total intake
        formData.traceability,
        formData.intakes.map((i: any) => `${i.month} ${i.year}: ${i.quantity}L`).join("\n") // Monthly data summary
      ];
    }

    // Append to the specific category sheet if applicable
    if (targetSheet) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${targetSheet}!A:Z`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [mainRow] },
      });
    }

    // 2. Append to Returns Validation sheet (Sheet 4)
    // One row for every month that has under-declaration
    const returnsRows = formData.sales
      .filter((s: any) => parseFloat(s.underDeclared) > 0)
      .map((s: any) => [
        formData.dboName,
        `${s.month} ${s.year}`,
        s.qtyDeclared,
        s.verifiedQty,
        s.underDeclared
      ]);

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
    console.error("Error processing submission:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
