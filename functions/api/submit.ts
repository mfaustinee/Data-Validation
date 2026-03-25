// Helper to sign JWT for Google Auth on Workers
async function getAccessToken(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: expiry,
    iat: now,
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Clean and import the private key
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKey
    .replace(/\\n/g, "\n")
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${encodedSignature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data: any = await response.json();
  if (!data.access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

export const onRequestPost: PagesFunction = async (context) => {
  const env = context.env as any;
  const body: any = await context.request.json();
  const { data } = body;
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID || body.spreadsheetId;
  
  if (!spreadsheetId) {
    return new Response(JSON.stringify({ error: "Spreadsheet ID missing." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const clientEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    return new Response(JSON.stringify({ error: "Credentials missing in Cloudflare environment." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const accessToken = await getAccessToken(clientEmail, privateKey);

    // Mapping logic
    const allRows: { sheet: string, rows: any[][] }[] = [];

    if (data.category === 'Mini Dairy' || data.category === 'Cottage Industry' || data.category === 'Milk Bar' || data.category === 'Dispenser') {
      const sheet = (data.category === 'Mini Dairy' || data.category === 'Cottage Industry') 
        ? "Mini Dairies & Cottages" 
        : "Dispensers & Milk Bars";
        
      const rows = data.sales.map((sale: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        sale.avgVolPerDay || "", sale.buyingPrice || "", sale.sellingPrice || "", data.traceability,
        `${sale.month} ${sale.year}`, sale.qtyDeclared, sale.verifiedQty, sale.underDeclared,
        data.date, data.startTime, data.endTime,
        Array.isArray(data.natureOfProduce) ? data.natureOfProduce.join(', ') : data.natureOfProduce
      ]);
      allRows.push({ sheet, rows });
    } else if (data.category === 'CP<5,000 L/D' || data.category === 'CP>5,000 L/D' || data.category === 'Processor') {
      const sheet = "Cooling Plants";
      const intakeRows = data.intakes.map((intake: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        intake.avgVolPerDay || "", intake.farmerPrice || "", intake.processorPrice || "", data.traceability,
        `${intake.month} ${intake.year}`, intake.quantity, "TOTAL INTAKE", "", "",
        data.date, data.startTime, data.endTime
      ]);
      allRows.push({ sheet, rows: intakeRows });
      
      const salesRows = data.sales
        .filter((s: any) => s.qtyDeclared || s.verifiedQty)
        .map((sale: any) => [
          data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
          sale.avgVolPerDay || "", sale.buyingPrice || "", sale.sellingPrice || "", data.traceability,
          `${sale.month} ${sale.year}`, sale.qtyDeclared, "LOCAL SALES", sale.verifiedQty, sale.underDeclared,
          data.date, data.startTime, data.endTime
        ]);
      if (salesRows.length > 0) {
        allRows.push({ sheet, rows: salesRows });
      }
    }

    for (const item of allRows) {
      if (item.rows.length > 0) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(item.sheet)}!A:Z:append?valueInputOption=USER_ENTERED`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: item.rows }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Google Sheets API error: ${errorText}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Submit error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
