# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina:

- Billeteras y cuentas remuneradas
- Fondos comunes de inversión de liquidez
- Plazos fijos
- LECAPs y BONCAPs
- Arbitraje de CEDEARs

Live en [rendimientos.co](https://rendimientos.co)

## Fuentes de datos

| Sección | Fuente | Actualización |
|---------|--------|---------------|
| Billeteras | Manual en `config.json` | Manual |
| FCIs | [ArgentinaDatos](https://api.argentinadatos.com) via CAFCI | En vivo |
| Plazo Fijo | [ArgentinaDatos](https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo) | En vivo |
| LECAPs/BONCAPs | [data912](https://data912.com) (`/live/arg_notes` + `/live/arg_bonds`) | En vivo |
| CEDEARs (ARS) | [data912](https://data912.com/live/arg_cedears) | En vivo |
| CEDEARs (USD) | [Yahoo Finance](https://query1.finance.yahoo.com) v8/chart | En vivo (cache 5min) |
| CCL referencia | [data912](https://data912.com/live/ccl) (mediana top-10 por volumen) | En vivo |

## Estructura

```
public/
  index.html         Página principal (4 secciones: Billeteras, Plazo Fijo, LECAPs, CEDEARs)
  app.js             Lógica del frontend
  config.json        Billeteras, FCIs, LECAPs (pago final/vto), CEDEARs (nombres)
  styles.css         Estilos + dark mode
  comparar.html      Comparador de fondos
server.js            Servidor Express para desarrollo local
netlify/functions/
  cafci.js           Proxy ArgentinaDatos → FCIs con TNA calculada
  lecaps.js          Proxy data912 → precios de LECAPs y BONCAPs
  cedears.js         Proxy data912 + Yahoo Finance → CEDEARs con CCL calculado
netlify.toml         Deploy config y redirects API
```

## Cómo levantar localmente

```bash
npm install
npm start
# http://localhost:3000
```

## Endpoints

| Ruta | Descripción |
|------|-------------|
| `GET /api/config` | Config estática (billeteras, FCIs, LECAPs, nombres CEDEARs) |
| `GET /api/fci` | FCIs con TNA calculada (proxy ArgentinaDatos) |
| `GET /api/lecaps` | Precios LECAP/BONCAP en vivo (proxy data912) |
| `GET /api/cedears` | CEDEARs con CCL implícito calculado (data912 + Yahoo Finance) |
| `GET /api/cafci/ficha/:fondoId/:claseId` | Ficha técnica de fondo (proxy CAFCI) |

## LECAPs y BONCAPs

1. La Netlify function consulta data912 en vivo (`/live/arg_notes` + `/live/arg_bonds`)
2. Se usa el último operado (campo `c`) como precio
3. El pago final y fecha de vencimiento están en `config.json`
4. El frontend calcula TIR y TNA desde la fecha de liquidación (T+1 día hábil, saltando feriados AR)

## CEDEARs — Arbitraje

1. La Netlify function consulta 3 fuentes en paralelo:
   - **data912** `/live/arg_cedears` → precio del CEDEAR en ARS
   - **data912** `/live/ccl` → CCL de referencia (mediana top-10 por volumen)
   - **Yahoo Finance** v8/chart → precio del subyacente en USD (cache 5min)
2. El **ratio de conversión** se auto-deriva:
   ```
   ratio = round((ccl_referencia × precio_usd) / precio_cedear)
   ```
   Esto evita mantener ratios manuales que se desactualizan con stock splits.
3. El **CCL implícito** se calcula:
   ```
   CCL = (precio_cedear × ratio) / precio_usd
   ```
4. El **spread** es la diferencia vs el CCL de referencia:
   ```
   spread = (ccl_implícito / ccl_referencia - 1) × 100%
   ```
   Positivo (rojo) = CEDEAR caro. Negativo (verde) = barato.

## Deploy

```bash
npx netlify deploy --prod
```

## Seguridad (server local)

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
