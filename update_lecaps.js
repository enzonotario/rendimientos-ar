#!/usr/bin/env node
/**
 * Update LECAP/BONCAP prices from BYMA free API (lebacs endpoint)
 * Uses settlement type 2 (T+1) offer prices
 * Tickers not found in the API keep their existing prices
 */

const fs = require('fs');
const path = require('path');

const BYMA_URL = 'https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/lebacs';
const CONFIG_PATH = path.join(__dirname, 'public', 'config.json');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching BYMA lebacs data...');
  const res = await fetch(BYMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  if (!res.ok) throw new Error(`BYMA API error: ${res.status}`);
  const json = await res.json();
  const data = json.data || [];

  // Build lookup: symbol -> T+1 (settlementType=2) data
  const byma = {};
  for (const item of data) {
    if (item.settlementType === '2') {
      byma[item.symbol] = {
        offer: parseFloat(item.offerPrice) || 0,
        bid: parseFloat(item.bidPrice) || 0,
        close: parseFloat(item.closingPrice) || 0,
        trade: parseFloat(item.trade) || 0,
        maturity: item.maturityDate,
      };
    }
  }

  // Read config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!config.lecaps || !config.lecaps.letras) {
    console.log('No lecaps section in config.json');
    return;
  }

  let updated = 0;
  let notFound = [];
  const today = new Date();
  const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

  for (const lecap of config.lecaps.letras) {
    const ticker = lecap.ticker;
    const bymaData = byma[ticker];

    if (!bymaData) {
      notFound.push(ticker);
      continue;
    }

    // Use offer price if available, otherwise close price
    const price = bymaData.offer > 0 ? bymaData.offer : bymaData.close;
    if (price <= 0) {
      notFound.push(ticker);
      continue;
    }

    const oldPrice = lecap.precio;
    lecap.precio = price;
    updated++;
    console.log(`  ${ticker}: ${oldPrice} → ${price} (offer=${bymaData.offer}, close=${bymaData.close})`);
  }

  config.lecaps.actualizado = dateStr;

  if (notFound.length > 0) {
    console.log(`\nNot found in BYMA (keeping existing prices): ${notFound.join(', ')}`);
  }
  console.log(`\nUpdated ${updated}/${config.lecaps.letras.length} LECAPs`);

  if (dryRun) {
    console.log('\n[DRY RUN] No files written.');
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log(`Written to ${CONFIG_PATH}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
