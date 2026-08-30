#!/usr/bin/env node

import 'dotenv/config';
import { google } from 'googleapis';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Strict Environment Variable Validation
// ---------------------------------------------------------------------------
const REQUIRED_ENV_VARS = [
  'SPREADSHEET_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'CELL_GOLD_VALUE',
  'CELL_GOLD_CHANGE',
  'CELL_GOLD_CHANGE_PCT',
  'NSE_SYMBOL_1',
  'CELL_NSE_SYMBOL_1_NAME',
  'CELL_NSE_SYMBOL_1_PRICE',
  'NSE_SYMBOL_2',
  'CELL_NSE_SYMBOL_2_NAME',
  'CELL_NSE_SYMBOL_2_PRICE',
];

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error(
    `[${new Date().toISOString()}] Error: Missing required environment variable(s) in .env:`
  );
  missingVars.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Path Normalization Helper
// ---------------------------------------------------------------------------
function resolvePath(filePath) {
  let expanded = filePath.replace(/\${?HOME}?/g, os.homedir());
  if (expanded.startsWith('~')) {
    expanded = path.join(os.homedir(), expanded.slice(1));
  }
  return path.resolve(expanded);
}

// ---------------------------------------------------------------------------
// Configuration Loading
// ---------------------------------------------------------------------------
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const KEY_PATH = resolvePath(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Gold Spot Cells
const CELL_GOLD_VALUE = process.env.CELL_GOLD_VALUE;
const CELL_GOLD_CHANGE = process.env.CELL_GOLD_CHANGE;
const CELL_GOLD_CHANGE_PCT = process.env.CELL_GOLD_CHANGE_PCT;

// Generic Symbol 1 Configuration
const NSE_SYMBOL_1 = process.env.NSE_SYMBOL_1;
const CELL_NSE_SYMBOL_1_NAME = process.env.CELL_NSE_SYMBOL_1_NAME;
const CELL_NSE_SYMBOL_1_PRICE = process.env.CELL_NSE_SYMBOL_1_PRICE;

// Generic Symbol 2 Configuration
const NSE_SYMBOL_2 = process.env.NSE_SYMBOL_2;
const CELL_NSE_SYMBOL_2_NAME = process.env.CELL_NSE_SYMBOL_2_NAME;
const CELL_NSE_SYMBOL_2_PRICE = process.env.CELL_NSE_SYMBOL_2_PRICE;

const COMMON_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Data Fetchers
// ---------------------------------------------------------------------------

// 1. Fetch international Gold Spot Data (USD)
async function fetchGoldData() {
  const url = 'https://data-asg.goldprice.org/dbXRates/USD';

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      origin: 'https://goldprice.org',
      referer: 'https://goldprice.org/',
      'user-agent': COMMON_USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch gold data: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const item = data?.items?.[0];

  if (
    !item ||
    item.xauPrice === undefined ||
    item.chgXau === undefined ||
    item.pcXau === undefined
  ) {
    throw new Error('Required fields not found in goldprice.org response');
  }

  return {
    xauPrice: item.xauPrice,
    chgXau: item.chgXau,
    pcXau: item.pcXau / 100, // Divided by 100 for native Google Sheets % formatting
  };
}

// 2. Reusable function to fetch NSE Quote data for any symbol
async function fetchNseSymbolData(symbol, series = 'GB') {
  const quoteUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getSymbolData&marketType=N&series=${series}&symbol=${encodeURIComponent(
    symbol
  )}`;

  // Grab session cookies to satisfy NSE bot protection
  const initRes = await fetch('https://www.nseindia.com', {
    headers: { 'user-agent': COMMON_USER_AGENT },
  });
  const rawCookies = initRes.headers.get('set-cookie') || '';
  const cookies = rawCookies
    .split(',')
    .map((c) => c.split(';')[0].trim())
    .join('; ');

  // Fetch symbol data
  const res = await fetch(quoteUrl, {
    method: 'GET',
    headers: {
      referer: `https://www.nseindia.com/get-quote/bonds/${symbol}`,
      'user-agent': COMMON_USER_AGENT,
      cookie: cookies,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
    },
  });

  if (!res.ok) {
    throw new Error(`NSE API error for ${symbol}: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const entry = data?.equityResponse?.[0];

  if (!entry?.metaData) {
    throw new Error(`Unexpected payload format for NSE symbol ${symbol}`);
  }

  return {
    symbol: entry.metaData.symbol,
    companyName: entry.metaData.companyName,
    lastPrice:
      entry.priceInfo?.lastPrice ||
      entry.tradeInfo?.lastPrice ||
      entry.metaData.closePrice,
    change: entry.metaData.change,
    pChange: entry.metaData.pChange,
  };
}

// ---------------------------------------------------------------------------
// Main Sync Runner
// ---------------------------------------------------------------------------
async function run() {
  try {
    console.log(`[${new Date().toISOString()}] Using key file: ${KEY_PATH}`);
    console.log(`[${new Date().toISOString()}] Fetching market data...`);

    // Fetch spot gold and parameterized NSE symbols concurrently
    const [goldData, symbol1Data, symbol2Data] = await Promise.all([
      fetchGoldData(),
      fetchNseSymbolData(NSE_SYMBOL_1),
      fetchNseSymbolData(NSE_SYMBOL_2),
    ]);

    console.log(`[${new Date().toISOString()}] Fetched Gold Spot: $${goldData.xauPrice}`);
    console.log(
      `[${new Date().toISOString()}] Fetched ${symbol1Data.symbol}: ${symbol1Data.companyName} @ ₹${symbol1Data.lastPrice}`
    );
    console.log(
      `[${new Date().toISOString()}] Fetched ${symbol2Data.symbol}: ${symbol2Data.companyName} @ ₹${symbol2Data.lastPrice}`
    );

    // Initialize Sheets Client
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Prepare Batch Updates
    const updatePayload = [
      // Spot Gold
      { range: CELL_GOLD_VALUE, values: [[goldData.xauPrice]] },
      { range: CELL_GOLD_CHANGE, values: [[goldData.chgXau]] },
      { range: CELL_GOLD_CHANGE_PCT, values: [[goldData.pcXau]] },

      // NSE Symbol 1
      { range: CELL_NSE_SYMBOL_1_NAME, values: [[symbol1Data.companyName]] },
      { range: CELL_NSE_SYMBOL_1_PRICE, values: [[symbol1Data.lastPrice]] },

      // NSE Symbol 2
      { range: CELL_NSE_SYMBOL_2_NAME, values: [[symbol2Data.companyName]] },
      { range: CELL_NSE_SYMBOL_2_PRICE, values: [[symbol2Data.lastPrice]] },
    ];

    const res = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updatePayload,
      },
    });

    console.log(
      `[${new Date().toISOString()}] Success: Updated ${res.data.totalUpdatedCells} cells.`
    );
    process.exit(0);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failure:`, err.message);
    process.exit(1);
  }
}

run();
