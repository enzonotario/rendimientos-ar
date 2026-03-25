// Returns top 5 US stocks with biggest absolute % change (day movers)
// Uses v8/finance/chart (same as mundo.js) since v7/quote is blocked
const https = require('https');

const POOL = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','AMD','NFLX','COIN',
  'PLTR','SMCI','MSTR','AVGO','CRM','UBER','SNOW','SQ','SHOP','RIVN',
  'SOFI','HOOD','INTC','BA','DIS','NKE','PYPL','BABA','JPM','V',
];

function fetchQuote(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result[0];
          const meta = result.meta;
          const price = meta.regularMarketPrice;
          const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
          const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
          resolve({
            symbol: meta.symbol || symbol,
            name: meta.shortName || meta.longName || symbol,
            price,
            change: Math.round(change * 100) / 100,
          });
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

exports.handler = async () => {
  try {
    const results = await Promise.allSettled(POOL.map(s => fetchQuote(s)));
    const data = results
      .map(r => r.status === 'fulfilled' ? r.value : null)
      .filter(q => q && q.price != null && q.change != null)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
      body: JSON.stringify({ data, updated: new Date().toISOString() }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
