// Aggregates dollar exchange rates from DolarAPI + CriptoYa
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'rendimientos.co/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(JSON.parse(data));
        });
      }).on('error', reject);
    };
    get(url);
  });
}

const EXCHANGE_WHITELIST = new Set([
  'buenbit', 'ripio', 'ripioexchange', 'satoshitango', 'fiwind', 'lemoncash',
  'belo', 'tiendacrypto', 'binance', 'cocoscrypto', 'bitsoalpha', 'dolarapp',
  'wallbit', 'bybit', 'letsbit', 'cryptomkt', 'pluscrypto', 'vibrant', 'peanut',
  'decrypto', 'saldo', 'p2pme',
]);

const EXCHANGE_NAMES = {
  buenbit: 'Buenbit', ripio: 'Ripio', ripioexchange: 'Ripio Exchange',
  satoshitango: 'SatoshiTango', fiwind: 'Fiwind', lemoncash: 'Lemon',
  belo: 'Belo', tiendacrypto: 'Tienda Crypto', binance: 'Binance',
  cocoscrypto: 'Cocos Crypto', bitsoalpha: 'Bitso', dolarapp: 'Dolar App',
  wallbit: 'Wallbit', bybit: 'Bybit', letsbit: 'Let\'s Bit',
  cryptomkt: 'CryptoMarket', pluscrypto: 'Plus Crypto', vibrant: 'Vibrant',
  peanut: 'Peanut', decrypto: 'Decrypto', saldo: 'Saldo', p2pme: 'P2P.me',
};

function processExchanges(data, coin) {
  const exchanges = [];
  for (const [key, val] of Object.entries(data)) {
    if (!EXCHANGE_WHITELIST.has(key)) continue;
    if (!val.ask || !val.bid || val.ask <= 0 || val.bid <= 0) continue;
    const spread = ((val.ask - val.bid) / val.bid) * 100;
    if (spread > 10) continue; // filter outliers
    exchanges.push({
      id: key,
      name: EXCHANGE_NAMES[key] || key,
      coin,
      ask: val.ask,
      bid: val.bid,
      spread: Math.round(spread * 100) / 100,
    });
  }
  return exchanges;
}

// USD billete providers from criptos.com.ar
const USD_PROVIDERS = ['belo', 'cocoscapital', 'decrypto', 'fiwind', 'lbfinanzas', 'pluscrypto', 'satoshitango', 'tiendacrypto'];

async function fetchUsdProviders() {
  const results = await Promise.allSettled(
    USD_PROVIDERS.map(ex => fetchJSON(`https://criptos.com.ar/api/${ex}`))
  );
  const providers = [];
  for (let i = 0; i < USD_PROVIDERS.length; i++) {
    if (results[i].status !== 'fulfilled') continue;
    const data = results[i].value;
    const usd = data.usd_ars;
    if (!usd || !usd.ask || parseFloat(usd.ask) <= 0) continue;
    const ask = parseFloat(usd.ask);
    const bid = parseFloat(usd.bid);
    const spread = parseFloat(usd.spread);
    if (spread > 12) continue; // filter outliers
    providers.push({
      id: USD_PROVIDERS[i],
      name: data.nombre || USD_PROVIDERS[i],
      ask,
      bid: bid > 0 ? bid : null,
      spread: Math.round(spread * 100) / 100,
    });
  }
  return providers;
}

exports.handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60, s-maxage=60',
  };

  try {
    const results = await Promise.allSettled([
      fetchJSON('https://dolarapi.com/v1/dolares'),
      fetchJSON('https://criptoya.com/api/usdt/ars'),
      fetchJSON('https://criptoya.com/api/usdc/ars'),
      fetchUsdProviders(),
    ]);

    const tipos = results[0].status === 'fulfilled' ? results[0].value : [];
    const usdt = results[1].status === 'fulfilled' ? processExchanges(results[1].value, 'USDT') : [];
    const usdc = results[2].status === 'fulfilled' ? processExchanges(results[2].value, 'USDC') : [];
    const usd = results[3].status === 'fulfilled' ? results[3].value : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        tipos,
        exchanges: { usd, usdt, usdc },
        updated: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Dolar API error:', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch dollar data' }),
    };
  }
};
