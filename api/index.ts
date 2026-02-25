import express from "express";
import { google } from "googleapis";
import cookieParser from "cookie-parser";

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// Service Account Auth Helper
const getSheetsClient = () => {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("Service Account credentials (EMAIL/PRIVATE_KEY) are missing.");
  }

  // Clean the private key:
  // 1. Remove any surrounding quotes that might have been pasted accidentally
  privateKey = privateKey.trim().replace(/^["']|["']$/g, '');
  // 2. Convert literal \n strings into actual newlines
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new Error("Invalid Private Key format. It must start with '-----BEGIN PRIVATE KEY-----'. Check your environment variables.");
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

    // Mapping logic
    const allRows: { sheet: string, rows: any[][] }[] = [];

    if (data.category === 'Mini Dairy' || data.category === 'Cottage Industry') {
      const sheet = "Mini Dairies & Cottages";
      const rows = data.sales.map((sale: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        sale.avgVolPerDay || "", data.dboName, data.contacts, sale.avgVolPerDay || "", 
        data.permitNo, data.location, data.comments, sale.sellingPrice || "", data.traceability,
        `${sale.month} ${sale.year}`, sale.qtyDeclared, sale.verifiedQty, sale.underDeclared,
        data.startTime, data.endTime
      ]);
      allRows.push({ sheet, rows });
    } else if (data.category === 'Milk Bar' || data.category === 'Dispenser') {
      const sheet = "Dispensers & Milk Bars";
      const rows = data.sales.map((sale: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        sale.avgVolPerDay || "", sale.buyingPrice || "", sale.sellingPrice || "", data.traceability,
        `${sale.month} ${sale.year}`, sale.qtyDeclared, sale.verifiedQty, sale.underDeclared,
        data.startTime, data.endTime
      ]);
      allRows.push({ sheet, rows });
    } else if (data.category === 'CP<5,000 L/D' || data.category === 'CP>5,000 L/D' || data.category === 'Processor') {
      const sheet = "Cooling Plants";
      // Capture Intakes
      const intakeRows = data.intakes.map((intake: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        intake.avgVolPerDay || "", intake.farmerPrice || "", intake.processorPrice || "", data.traceability,
        `${intake.month} ${intake.year}`, intake.quantity, "INTAKE",
        data.startTime, data.endTime
      ]);
      allRows.push({ sheet, rows: intakeRows });
      
      // Capture Sales for Cooling Plants
      const salesRows = data.sales
        .filter((s: any) => s.qtyDeclared || s.verifiedQty)
        .map((sale: any) => [
          data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
          sale.avgVolPerDay || "", sale.buyingPrice || "", sale.sellingPrice || "", data.traceability,
          `${sale.month} ${sale.year}`, sale.qtyDeclared, "LOCAL SALES", sale.verifiedQty, sale.underDeclared,
          data.startTime, data.endTime
        ]);
      if (salesRows.length > 0) {
        allRows.push({ sheet, rows: salesRows });
      }
    }

    for (const item of allRows) {
      if (item.rows.length > 0) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${item.sheet}!A:Z`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: item.rows },
        });
      }
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
