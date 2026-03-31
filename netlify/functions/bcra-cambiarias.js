// Fetches exchange rate data from BCRA Estadísticas Cambiarias API v1.0
const https = require('https');

// Curated list of currencies to show (most relevant for Argentina)
const MONEDAS_DESTACADAS = ['USD', 'EUR', 'BRL', 'GBP', 'CHF', 'JPY', 'CNY', 'CLP', 'UYU', 'PYG', 'BOB', 'MXN', 'COP', 'CAD', 'AUD', 'XAU', 'XAG'];

function fetchBCRA(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://api.bcra.gob.ar${path}`, { rejectUnauthorized: false }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300'
  };

  const params = event.queryStringParameters || {};

  // Historical for a single currency
  if (params.moneda) {
    const desde = params.desde || '';
    const hasta = params.hasta || '';
    let path = `/estadisticascambiarias/v1.0/Cotizaciones/${params.moneda}?limit=365`;
    if (desde) path += `&fechaDesde=${desde}`;
    if (hasta) path += `&fechaHasta=${hasta}`;
    try {
      const result = await fetchBCRA(path);
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (err) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // Default: today's cotizaciones for all currencies
  try {
    const result = await fetchBCRA('/estadisticascambiarias/v1.0/Cotizaciones');
    const detalle = result.results?.detalle || [];
    const fecha = result.results?.fecha || null;

    // Separate highlighted from the rest
    const destacadas = [];
    const otras = [];

    for (const m of detalle) {
      if (!m.tipoCotizacion || m.tipoCotizacion <= 0) continue;
      const item = {
        codigo: m.codigoMoneda,
        nombre: m.descripcion,
        cotizacion: m.tipoCotizacion,
        tipoPase: m.tipoPase,
        destacada: MONEDAS_DESTACADAS.includes(m.codigoMoneda),
      };
      if (item.destacada) destacadas.push(item);
      else otras.push(item);
    }

    // Sort destacadas by our preferred order
    destacadas.sort((a, b) => MONEDAS_DESTACADAS.indexOf(a.codigo) - MONEDAS_DESTACADAS.indexOf(b.codigo));
    otras.sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ fecha, destacadas, otras, timestamp: new Date().toISOString() })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch cambiarias data', message: error.message })
    };
  }
};
