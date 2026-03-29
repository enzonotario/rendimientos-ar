// Fetches LECAP and BONCAP live prices from data912.com
// LECAPs from /live/arg_notes, BONCAPs from /live/arg_bonds
const https = require('https');

const NOTES_URL = 'https://data912.com/live/arg_notes';
const BONDS_URL = 'https://data912.com/live/arg_bonds';

const LECAP_TICKERS = ['S17A6', 'S30A6', 'S15Y6', 'S29Y6', 'S31L6', 'S31G6', 'S30S6', 'S30O6', 'S30N6'];
const BONCAP_TICKERS = ['T30J6', 'T15E7', 'T30A7', 'T31Y7', 'T30J7'];

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' };

  try {
    const [notes, bonds] = await Promise.all([fetchJSON(NOTES_URL), fetchJSON(BONDS_URL)]);

    const result = [];

    for (const item of notes) {
      if (!LECAP_TICKERS.includes(item.symbol)) continue;
      const price = parseFloat(item.c) || 0;
      if (price <= 0) continue;
      result.push({
        symbol: item.symbol,
        price,
        bid: parseFloat(item.px_bid) || 0,
        ask: parseFloat(item.px_ask) || 0,
        type: 'LECAP',
      });
    }

    for (const item of bonds) {
      if (!BONCAP_TICKERS.includes(item.symbol)) continue;
      const price = parseFloat(item.c) || 0;
      if (price <= 0) continue;
      result.push({
        symbol: item.symbol,
        price,
        bid: parseFloat(item.px_bid) || 0,
        ask: parseFloat(item.px_ask) || 0,
        type: 'BONCAP',
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ data: result, source: 'data912' }) };
  } catch (e) {
    console.error('data912 fetch error:', e);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to fetch data912 data' }) };
  }
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON from ' + url)); }
      });
    }).on('error', reject);
  });
}
