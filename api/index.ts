import express from "express";
import { google } from "googleapis";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Service Account Auth Helper
const getSheetsClient = () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error("Service Account credentials (EMAIL/PRIVATE_KEY) are missing.");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: "v4", auth });
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    mode: "service-account",
    configured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  });
});

app.post("/api/submit", async (req, res) => {
  const { data } = req.body;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || req.body.spreadsheetId;
  
  if (!spreadsheetId) return res.status(400).json({ error: "Spreadsheet ID missing. Please set GOOGLE_SPREADSHEET_ID environment variable." });

  try {
    const sheets = getSheetsClient();

    let targetSheet = "";
    let mainRow: any[] = [];

    // Mapping logic
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

    // Returns Validation logic
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
    console.error("Submit error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

export default app;
