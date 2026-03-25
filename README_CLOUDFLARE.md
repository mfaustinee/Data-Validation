# Cloudflare Deployment Guide

This application is configured for deployment on **Cloudflare Pages**.

## Setup Instructions

1.  **Create a Cloudflare Pages Project**:
    *   Connect your GitHub repository to Cloudflare Pages.
    *   Set the **Build command** to `npm run build`.
    *   Set the **Build output directory** to `dist`.

2.  **Configure Environment Variables**:
    In the Cloudflare Dashboard (Settings > Functions > Variables and Secrets), add the following:

    *   `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Your Google Service Account email.
    *   `GOOGLE_PRIVATE_KEY`: Your Google Service Account private key (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines).
    *   `GOOGLE_SPREADSHEET_ID`: The ID of your Google Sheet.

3.  **Enable Node.js Compatibility**:
    In the Cloudflare Dashboard (Settings > Functions > Compatibility Flags), add `nodejs_compat` to the **Production** and **Preview** environments.

## Local Development

To test the Cloudflare Functions locally:

```bash
npm run build
npm run pages:dev
```

This will start a local server using `wrangler` that simulates the Cloudflare Pages environment.
