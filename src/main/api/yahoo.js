import { useProxy, proxyStock, proxySearch, eFetch } from './proxy.js'

const CHART_URL = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1d&range=3mo`

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'application/json'
}

const SEARCH_URL = (kw) =>
  `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    kw
  )}&quotesCount=10&newsCount=0`

// 미국 주요 거래소만 (외국/암호화폐 제외)
const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'PCX', 'ASE', 'BTS'])

// watchlist에는 기존 US 시장 규칙을 그대로 사용하면서, 아래 별칭만 원화 자산으로 처리한다.
// 실제 Yahoo 심볼과 분리해 두면 기존 검증/정렬/저장 로직을 건드리지 않아도 된다.
const KRW_ASSETS = {
  'USD-KRW': {
    name: '달러/원',
    type: 'FX',
    yahoo: 'KRW=X',
    factor: 1,
    priceDecimals: 2
  },
  'JPY-KRW': {
    name: '엔/원 (100엔)',
    type: 'FX',
    yahoo: 'JPYKRW=X',
    factor: 100,
    priceDecimals: 2
  },
  'ETH-KRW': {
    name: '이더리움/원',
    type: 'CRYPTO',
    yahoo: 'ETH-KRW',
    factor: 1,
    priceDecimals: 0
  },
  'GOLD-KRW': {
    name: '금/원 (1g)',
    type: 'GOLD',
    priceDecimals: 0
  }
}

const TROY_OUNCE_GRAMS = 31.1034768
const RAW_CACHE_TTL = 1_500
const rawQuoteCache = new Map()

async function fetchYahooInstrument(ticker) {
  const now = Date.now()
  const cached = rawQuoteCache.get(ticker)
  if (cached && now - cached.ts < RAW_CACHE_TTL) return cached.promise

  const promise = (async () => {
    const res = await eFetch(CHART_URL(ticker), { headers: HEADERS })
    if (!res.ok) throw new Error(`Yahoo ${ticker}: ${res.status}`)

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) {
      const err = json?.chart?.error?.description || 'no data'
      throw new Error(`Yahoo ${ticker}: ${err}`)
    }

    const meta = result.meta || {}
    const closes = result.indicators?.quote?.[0]?.close || []
    const validCloses = closes.filter((p) => p !== null && Number.isFinite(p))

    let price = Number(meta.regularMarketPrice)
    if (!Number.isFinite(price) && validCloses.length) {
      price = validCloses[validCloses.length - 1]
    }
    if (!Number.isFinite(price)) throw new Error(`Yahoo ${ticker}: no price`)

    const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose)

    return {
      ticker,
      name: meta.shortName || meta.longName || meta.symbol || ticker,
      currency: meta.currency,
      price,
      previousClose,
      prices: validCloses
    }
  })()

  rawQuoteCache.set(ticker, { ts: now, promise })
  try {
    return await promise
  } catch (e) {
    const latest = rawQuoteCache.get(ticker)
    if (latest?.promise === promise) rawQuoteCache.delete(ticker)
    throw e
  }
}

function scaledSeries(prices, factor) {
  return prices.map((p) => p * factor).filter(Number.isFinite)
}

function combineSeries(a, b, fn) {
  const n = Math.min(a.length, b.length)
  if (!n) return []
  const aStart = a.length - n
  const bStart = b.length - n
  const out = []
  for (let i = 0; i < n; i += 1) {
    const value = fn(a[aStart + i], b[bStart + i])
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

function toAssetResult(symbol, def, price, previousClose, prices) {
  const change = Number.isFinite(previousClose) ? price - previousClose : 0
  const changeRatio =
    Number.isFinite(previousClose) && previousClose !== 0
      ? (change / previousClose) * 100
      : 0

  return {
    market: 'US',
    symbol,
    currency: 'KRW',
    name: def.name,
    price,
    change,
    changeRatio,
    isUp: change >= 0,
    prices,
    assetType: def.type,
    priceDecimals: def.priceDecimals
  }
}

async function fetchKRWAsset(symbol) {
  const def = KRW_ASSETS[symbol]
  if (!def) return null

  if (symbol === 'GOLD-KRW') {
    const [gold, usdKrw] = await Promise.all([
      fetchYahooInstrument('GC=F'),
      fetchYahooInstrument('KRW=X')
    ])
    const convert = (goldUsd, krwPerUsd) =>
      (goldUsd * krwPerUsd) / TROY_OUNCE_GRAMS
    const price = convert(gold.price, usdKrw.price)
    const previousClose =
      Number.isFinite(gold.previousClose) && Number.isFinite(usdKrw.previousClose)
        ? convert(gold.previousClose, usdKrw.previousClose)
        : NaN
    const prices = combineSeries(gold.prices, usdKrw.prices, convert)
    return toAssetResult(symbol, def, price, previousClose, prices)
  }

  const raw = await fetchYahooInstrument(def.yahoo)
  const factor = def.factor || 1
  const price = raw.price * factor
  const previousClose = Number.isFinite(raw.previousClose)
    ? raw.previousClose * factor
    : NaN
  const prices = scaledSeries(raw.prices, factor)
  return toAssetResult(symbol, def, price, previousClose, prices)
}

export async function searchUSStocks(keyword) {
  if (useProxy()) {
    try {
      return await proxySearch('US', keyword)
    } catch {
      // 프록시 실패 시 직접 호출로 폴백
    }
  }
  const res = await eFetch(SEARCH_URL(keyword), { headers: HEADERS })
  if (!res.ok) throw new Error(`Yahoo search: ${res.status}`)
  const json = await res.json()
  return (json?.quotes || [])
    .filter(
      (q) =>
        US_EXCHANGES.has(q.exchange) &&
        (q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
    )
    .slice(0, 10)
    .map((q) => ({
      market: 'US',
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      type:
        q.quoteType === 'ETF'
          ? 'ETF'
          : ['NMS', 'NGM', 'NCM'].includes(q.exchange)
            ? 'NASDAQ'
            : 'NYSE'
    }))
}

// 통계용 일봉 종가 배열만 반환 (최근 3개월). 실패 시 빈 배열.
export async function fetchUSDailyCloses(ticker) {
  try {
    const symbol = String(ticker || '').toUpperCase()
    if (KRW_ASSETS[symbol]) {
      const asset = await fetchKRWAsset(symbol)
      return asset?.prices || []
    }
    const raw = await fetchYahooInstrument(ticker)
    return raw.prices
  } catch {
    return []
  }
}

export async function fetchUSStock(ticker) {
  const symbol = String(ticker || '').toUpperCase()
  if (KRW_ASSETS[symbol]) {
    return await fetchKRWAsset(symbol)
  }

  if (useProxy()) {
    try {
      return await proxyStock('US', ticker)
    } catch {
      // 프록시 실패 시 직접 호출로 폴백
    }
  }

  const raw = await fetchYahooInstrument(ticker)
  const prev = raw.previousClose
  const change = Number.isFinite(prev) ? raw.price - prev : 0
  const changeRatio = Number.isFinite(prev) && prev !== 0 ? (change / prev) * 100 : 0

  return {
    market: 'US',
    symbol: ticker.toUpperCase(),
    currency: raw.currency || 'USD',
    name: raw.name,
    price: raw.price,
    change,
    changeRatio,
    isUp: change >= 0,
    prices: raw.prices
  }
}
