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
        ? "MD & CI - Distribution" 
        : "Dispensers & Milk Bars";
        
      const isMiniOrCottage = data.category === 'Mini Dairy' || data.category === 'Cottage Industry';
      
      let distNameFormatted = "";
      let distContactsFormatted = "";
      let distVolPerDayFormatted = "";
      let distPermitNoFormatted = "";
      let distAreaOfSaleFormatted = "";
      let distOutletsFormatted = "";
      let distNatureOfProduceFormatted = "";
      let distPriceFormatted = "";

      if (isMiniOrCottage) {
        const distributors = Array.isArray(data.distributors) && data.distributors.length > 0
          ? data.distributors
          : [{
              name: data.distName,
              contacts: data.distContacts,
              volPerDay: data.distVolPerDay,
              permitNo: data.distPermitNo,
              areaOfSale: data.distAreaOfSale,
              outlets: data.distOutlets || [],
              natureOfProduce: data.distNatureOfProduce || [],
              prices: { [data.distNatureOfProduce?.[0] || 'Produce']: data.distPrice }
            }];

        distNameFormatted = distributors.map((d: any) => d.name || "").join(' | ');
        distContactsFormatted = distributors.map((d: any) => d.contacts || "").join(' | ');
        distVolPerDayFormatted = distributors.map((d: any) => d.volPerDay || "").join(' | ');
        distPermitNoFormatted = distributors.map((d: any) => d.permitNo || "").join(' | ');
        distAreaOfSaleFormatted = distributors.map((d: any) => d.areaOfSale || "").join(' | ');
        
        distOutletsFormatted = distributors.map((d: any, dIdx: number) => {
          const outletsStr = Array.isArray(d.outlets)
            ? d.outlets.map((o: any) => `${o.location} (Vol: ${o.volPerDay}, Permit: ${o.permitStatus}, Levy: ${o.levyInfo})`).join(', ')
            : "";
          return `Distributor #${dIdx + 1}: ${outletsStr}`;
        }).join(' | ');

        distNatureOfProduceFormatted = distributors.map((d: any, dIdx: number) => {
          const prodStr = Array.isArray(d.natureOfProduce) ? d.natureOfProduce.join(', ') : "";
          return `Distributor #${dIdx + 1}: ${prodStr}`;
        }).join(' | ');

        distPriceFormatted = distributors.map((d: any, dIdx: number) => {
          const priceStr = d.prices && Object.keys(d.prices).length > 0
            ? Object.entries(d.prices).map(([prod, price]) => `${prod}: ${price}`).join(', ')
            : "";
          return `Distributor #${dIdx + 1}: ${priceStr}`;
        }).join(' | ');
      }

      const rows = data.sales.map((sale: any) => [
        data.dboName, data.location, data.contacts, data.permitNo, data.expiryDate, 
        sale.avgVolPerDay || "", sale.buyingPrice || "", sale.sellingPrice || "", data.traceability,
        `${sale.month} ${sale.year}`, sale.qtyDeclared, sale.verifiedQty, sale.underDeclared,
        data.date, data.startTime, data.endTime,
        Array.isArray(data.natureOfProduce) ? data.natureOfProduce.join(', ') : data.natureOfProduce,
        // Appended Option A Columns (for MD & CI - Distribution sheet)
        distNameFormatted,
        distContactsFormatted,
        distVolPerDayFormatted,
        distPermitNoFormatted,
        distAreaOfSaleFormatted,
        distOutletsFormatted,
        distNatureOfProduceFormatted,
        distPriceFormatted
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

    const isAmendment = body.isAmendment === true;

    for (const item of allRows) {
      if (item.rows.length > 0) {
        let overwriteCompleted = false;

        if (isAmendment) {
          try {
            // Fetch existing values to locate matching rows
            const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(item.sheet)}!A:Z`;
            const getRes = await fetch(getUrl, {
              headers: {
                "Authorization": `Bearer ${accessToken}`,
              },
            });

            if (getRes.ok) {
              const getData: any = await getRes.json();
              const existingRows: any[][] = getData.values || [];

              for (const newRow of item.rows) {
                let foundMatch = false;

                // Search for matching row
                for (let rIdx = 0; rIdx < existingRows.length; rIdx++) {
                  const existingRow = existingRows[rIdx];
                  if (existingRow.length > 9) {
                    const permitMatches = String(existingRow[3] || '').trim().toLowerCase() === String(newRow[3] || '').trim().toLowerCase();
                    const periodMatches = String(existingRow[9] || '').trim().toLowerCase() === String(newRow[9] || '').trim().toLowerCase();
                    
                    let isMatch = permitMatches && periodMatches;
                    if (item.sheet === "Cooling Plants") {
                      const typeMatches = String(existingRow[11] || '').trim().toLowerCase() === String(newRow[11] || '').trim().toLowerCase();
                      isMatch = isMatch && typeMatches;
                    }

                    if (isMatch) {
                      // Overwrite existing row
                      const rowNum = rIdx + 1;
                      const endCol = newRow.length > 20 ? 'Y' : 'R';
                      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(item.sheet)}!A${rowNum}:${endCol}${rowNum}?valueInputOption=USER_ENTERED`;
                      
                      const updateRes = await fetch(updateUrl, {
                        method: "PUT",
                        headers: {
                          "Authorization": `Bearer ${accessToken}`,
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ values: [newRow] }),
                      });

                      if (updateRes.ok) {
                        foundMatch = true;
                        break;
                      }
                    }
                  }
                }

                // If no match found for this row, append it instead
                if (!foundMatch) {
                  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(item.sheet)}!A:Z:append?valueInputOption=USER_ENTERED`;
                  await fetch(appendUrl, {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${accessToken}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ values: [newRow] }),
                  });
                }
              }
              overwriteCompleted = true;
            } else {
              console.error("Failed to fetch Google Sheet rows, falling back to append:", await getRes.text());
            }
          } catch (overwriteErr) {
            console.error("Error during overwrite process, falling back to append:", overwriteErr);
          }
        }

        // Standard append if not in amendment mode OR if amendment overwrite failed to execute
        if (!isAmendment || !overwriteCompleted) {
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
