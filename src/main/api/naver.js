import { useProxy, proxyStock, eFetch } from './proxy.js'

const QUOTE_URL = (code) =>
  `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`

const CHART_URL = (code) =>
  `https://m.stock.naver.com/api/stock/${code}/price?pageSize=30&page=1`

const QUOTE_HEADERS = {
  Referer: 'https://finance.naver.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
}

const CHART_HEADERS = {
  Referer: 'https://m.stock.naver.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
}

const CHART_POINTS = 70
const CRYPTO_CHART_POINTS = 90

function parseNumber(raw, formatted) {
  const r = Number(raw)
  if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(r)) return r
  const text = String(formatted ?? '')
    .replace(/,/g, '')
    .replace(/%/g, '')
    .trim()
  if (!text) return NaN
  return Number(text)
}

function quoteFromMain(data) {
  return {
    price: parseNumber(data.closePriceRaw, data.closePrice),
    change: parseNumber(
      data.compareToPreviousClosePriceRaw,
      data.compareToPreviousClosePrice
    ),
    changeRatio: parseNumber(
      data.fluctuationsRatioRaw,
      data.fluctuationsRatio
    ),
    direction: data.compareToPreviousPrice?.code,
    time: data.localTradedAt
  }
}

function quoteFromOver(over) {
  return {
    price: parseNumber(over.overPriceRaw, over.overPrice),
    change: parseNumber(
      over.compareToPreviousClosePriceRaw,
      over.compareToPreviousClosePrice
    ),
    changeRatio: parseNumber(
      over.fluctuationsRatioRaw,
      over.fluctuationsRatio
    ),
    direction: over.compareToPreviousPrice?.code,
    time: over.localTradedAt
  }
}

function extractQuote(json) {
  const data = json?.datas?.[0] || json?.result?.areas?.[0]?.datas?.[0]
  if (!data) return null

  const mainQ = quoteFromMain(data)
  const overQ = data.overMarketPriceInfo
    ? quoteFromOver(data.overMarketPriceInfo)
    : null

  let chosen = mainQ
  if (overQ && Number.isFinite(overQ.price) && overQ.time && mainQ.time) {
    if (new Date(overQ.time).getTime() > new Date(mainQ.time).getTime()) {
      chosen = overQ
    }
  }

  const isUp =
    chosen.direction === '1' ||
    chosen.direction === '2' ||
    (!chosen.direction && chosen.change > 0)

  return {
    name: data.stockName,
    price: chosen.price,
    change: chosen.change,
    changeRatio: chosen.changeRatio,
    isUp
  }
}

function extractCloses(rows, field = 'closePrice') {
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => Number(String(r?.[field] ?? '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .reverse()
}

function findPriceRows(value) {
  if (Array.isArray(value)) {
    if (value.some((v) => v && typeof v === 'object' && v.closePrice != null)) {
      return value
    }
    for (const child of value) {
      const found = findPriceRows(child)
      if (found.length) return found
    }
    return []
  }
  if (!value || typeof value !== 'object') return []
  for (const child of Object.values(value)) {
    const found = findPriceRows(child)
    if (found.length) return found
  }
  return []
}

const SEARCH_URL = (kw) =>
  `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(
    kw
  )}&target=stock,index,marketindicator,coin,ipo`

const DOMESTIC_INDEXES = [
  {
    code: 'KOSPI',
    name: '코스피',
    type: '국내지수',
    aliases: '코스피 kospi 종합주가지수'
  },
  {
    code: 'KOSDAQ',
    name: '코스닥',
    type: '국내지수',
    aliases: '코스닥 kosdaq'
  },
  {
    code: 'KPI200',
    name: '코스피200',
    type: '국내지수',
    aliases: '코스피200 kospi200 kpi200'
  }
]

const DOMESTIC_INDEX_BY_CODE = new Map(DOMESTIC_INDEXES.map((x) => [x.code, x]))

const MARKET_INDEX_SOURCES = [
  {
    category: 'exchange',
    type: '환율',
    url: 'https://m.stock.naver.com/front-api/marketIndex/exchange/new'
  },
  {
    category: 'exchangeWorld',
    type: '국제환율',
    url: 'https://m.stock.naver.com/front-api/marketIndex/exchange/world'
  },
  {
    category: 'energy',
    type: '에너지',
    url: 'https://m.stock.naver.com/front-api/marketIndex/energy'
  },
  {
    category: 'metals',
    type: '금속',
    url: 'https://m.stock.naver.com/front-api/marketIndex/metals'
  },
  {
    category: 'bond',
    type: '채권',
    url: 'https://m.stock.naver.com/front-api/marketIndex/bondMain'
  },
  {
    category: 'domesticInterest',
    type: '국내금리',
    url: 'https://m.stock.naver.com/front-api/marketIndex/domesticInterestList'
  },
  {
    category: 'standardInterest',
    type: '기준금리',
    url: 'https://m.stock.naver.com/front-api/marketIndex/standardInterestList'
  },
  {
    category: 'cryptoUpbit',
    type: '가상자산·업비트',
    url: 'https://m.stock.naver.com/front-api/crypto/top?exchangeType=UPBIT&sortType=marketCap&page=1&pageSize=200'
  },
  {
    category: 'cryptoBithumb',
    type: '가상자산·빗썸',
    url: 'https://m.stock.naver.com/front-api/crypto/top?exchangeType=BITHUMB&sortType=marketCap&page=1&pageSize=200'
  }
]

const SEARCH_ALIASES = [
  ['USD', '달러 미국달러 dollar usd'],
  ['JPY', '엔 일본엔 yen jpy'],
  ['EUR', '유로 euro eur'],
  ['CNY', '위안 위안화 yuan cny'],
  ['GBP', '파운드 영국파운드 pound gbp'],
  ['GC', '금 골드 gold'],
  ['SI', '은 실버 silver'],
  ['CL', '원유 wti 유가 oil'],
  ['LCO', '브렌트 브렌트유 brent oil'],
  ['BTC', '비트코인 bitcoin btc'],
  ['ETH', '이더리움 ethereum eth']
]

const MARKET_CACHE_TTL = 2_000
const marketListCache = new Map()

function normalizeMarketObject(value) {
  if (!value || typeof value !== 'object') return null

  const code = value.nfTicker || value.reutersCode || value.symbolCode || value.code
  const name = value.name || value.krName
  const closePrice = value.closePrice ?? value.tradePrice
  if (!name || !code || closePrice == null) return null

  return {
    ...value,
    name,
    reutersCode: String(code),
    closePrice,
    fluctuations: value.fluctuations ?? value.changeValue,
    fluctuationsRatio: value.fluctuationsRatio ?? value.changeRate,
    unit: value.unit || (value.nfTicker ? 'KRW' : '')
  }
}

function collectMarketObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMarketObjects(item, out)
    return out
  }
  if (!value || typeof value !== 'object') return out

  const normalized = normalizeMarketObject(value)
  if (normalized) out.push(normalized)

  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') collectMarketObjects(child, out)
  }
  return out
}

async function fetchMarketSource(source) {
  const cached = marketListCache.get(source.category)
  if (cached && Date.now() - cached.ts < MARKET_CACHE_TTL) return cached.items

  const res = await eFetch(source.url, { headers: CHART_HEADERS })
  if (!res.ok) throw new Error(`Naver market ${source.category}: ${res.status}`)
  const json = await res.json()
  const raw = collectMarketObjects(json)
  const seen = new Set()
  const items = []

  for (const item of raw) {
    const code = String(item.reutersCode || item.symbolCode || item.code || '').trim()
    if (!code) continue
    const key = `${source.category}:${code}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }

  marketListCache.set(source.category, { ts: Date.now(), items })
  return items
}

function toMarketSearchItem(source, item) {
  const code = String(item.reutersCode || item.symbolCode || item.code || '').trim()
  return {
    market: 'NV',
    symbol: `${source.category}:${code}`,
    name: item.name || code,
    type: source.type,
    unit: item.unit || '',
    currency: item.currency || ''
  }
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s/_.:=+\-]+/g, '')
}

function marketAliases(item) {
  const codeText = [item.reutersCode, item.symbolCode, item.code, item.nfTicker]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  return SEARCH_ALIASES
    .filter(([code]) => codeText.includes(code))
    .map(([, aliases]) => aliases)
    .join(' ')
}

function marketSearchText(source, item) {
  return normalizeSearchText([
    item.name,
    item.krName,
    item.nameEng,
    item.reutersCode,
    item.symbolCode,
    item.code,
    item.nfTicker,
    item.unit,
    source.type,
    marketAliases(item)
  ]
    .filter(Boolean)
    .join(' '))
}

function searchDomesticIndexes(keyword) {
  const q = normalizeSearchText(keyword)
  if (!q) return []
  return DOMESTIC_INDEXES.filter((item) =>
    normalizeSearchText(`${item.name} ${item.code} ${item.aliases}`).includes(q)
  ).map((item) => ({
    market: 'NV',
    symbol: `index:${item.code}`,
    name: item.name,
    type: item.type,
    unit: '',
    currency: ''
  }))
}

async function searchNaverMarketIndexes(keyword) {
  const q = normalizeSearchText(keyword)
  if (!q) return []

  const settled = await Promise.allSettled(MARKET_INDEX_SOURCES.map(fetchMarketSource))
  const results = []

  for (let i = 0; i < settled.length; i += 1) {
    const state = settled[i]
    if (state.status !== 'fulfilled') continue
    const source = MARKET_INDEX_SOURCES[i]
    for (const item of state.value) {
      if (!marketSearchText(source, item).includes(q)) continue
      results.push(toMarketSearchItem(source, item))
    }
  }

  return results.slice(0, 40)
}

function parseMarketSymbol(symbol) {
  const text = String(symbol || '')
  const idx = text.indexOf(':')
  if (idx <= 0 || idx >= text.length - 1) return null
  return {
    category: text.slice(0, idx),
    code: text.slice(idx + 1)
  }
}

function directionSign(item) {
  const direction = String(
    item.change ||
      item.fluctuationsType?.name ||
      item.compareToPreviousPrice?.name ||
      ''
  ).toUpperCase()
  const code = String(
    item.fluctuationsType?.code || item.compareToPreviousPrice?.code || ''
  )
  if (direction.includes('FALL') || direction.includes('하락') || code === '4' || code === '5') {
    return -1
  }
  if (direction.includes('RIS') || direction.includes('상승') || code === '1' || code === '2') {
    return 1
  }
  return 0
}

function signedValue(value, sign) {
  if (!Number.isFinite(value) || !sign) return value
  return sign < 0 ? -Math.abs(value) : Math.abs(value)
}

function marketItemToQuote(symbol, source, item, prices = []) {
  const price = parseNumber(item.closePriceRaw, item.closePrice)
  let change = parseNumber(
    item.fluctuationsRaw ?? item.compareToPreviousClosePriceRaw,
    item.fluctuations ?? item.compareToPreviousClosePrice
  )
  let changeRatio = parseNumber(item.fluctuationsRatioRaw, item.fluctuationsRatio)
  const sign = directionSign(item)
  change = signedValue(change, sign)
  changeRatio = signedValue(changeRatio, sign)

  if (!Number.isFinite(price)) throw new Error(`Naver market ${symbol}: no price`)

  return {
    market: 'NV',
    symbol,
    currency: item.currency || '',
    unit: item.unit || '',
    name: item.name || item.reutersCode || item.symbolCode || symbol,
    price,
    change: Number.isFinite(change) ? change : 0,
    changeRatio: Number.isFinite(changeRatio) ? changeRatio : 0,
    isUp: Number.isFinite(change) ? change >= 0 : true,
    prices,
    assetType: source.type
  }
}

async function fetchDomesticIndex(code, { skipChart = false } = {}) {
  const quoteUrl = `https://m.stock.naver.com/api/index/${encodeURIComponent(code)}/basic`
  const chartUrl = `https://m.stock.naver.com/api/index/${encodeURIComponent(
    code
  )}/price?pageSize=${CHART_POINTS}&page=1`
  const quotePromise = eFetch(quoteUrl, { headers: CHART_HEADERS })
  const chartPromise = skipChart ? null : eFetch(chartUrl, { headers: CHART_HEADERS })

  const quoteRes = await quotePromise
  if (!quoteRes.ok) throw new Error(`Naver index ${code}: ${quoteRes.status}`)
  const data = await quoteRes.json()
  const price = parseNumber(data.closePriceRaw, data.closePrice)
  let change = parseNumber(
    data.compareToPreviousClosePriceRaw,
    data.compareToPreviousClosePrice
  )
  let changeRatio = parseNumber(data.fluctuationsRatioRaw, data.fluctuationsRatio)
  const sign = directionSign(data)
  change = signedValue(change, sign)
  changeRatio = signedValue(changeRatio, sign)

  if (!Number.isFinite(price)) throw new Error(`Naver index ${code}: no price`)

  let prices = []
  if (chartPromise) {
    const chartRes = await chartPromise
    if (chartRes.ok) {
      try {
        prices = extractCloses(await chartRes.json())
      } catch {
        prices = []
      }
    }
  }

  const info = DOMESTIC_INDEX_BY_CODE.get(code)
  return {
    market: 'NV',
    symbol: `index:${code}`,
    currency: '',
    unit: '',
    name: data.indexName || data.stockName || data.name || info?.name || code,
    price,
    change: Number.isFinite(change) ? change : 0,
    changeRatio: Number.isFinite(changeRatio) ? changeRatio : 0,
    isUp: Number.isFinite(change) ? change >= 0 : true,
    prices,
    assetType: info?.type || '국내지수'
  }
}

function cryptoPair(code) {
  const text = String(code || '').trim().toUpperCase()
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(text)) return text
  const ticker = text.replace(/^KRW[-_.]?/, '').replace(/[^A-Z0-9]/g, '')
  return ticker ? `KRW-${ticker}` : ''
}

async function fetchCryptoDailyCloses(category, code) {
  const pair = cryptoPair(code)
  if (!pair) return []
  const base =
    category === 'cryptoBithumb' ? 'https://api.bithumb.com' : 'https://api.upbit.com'
  const url = `${base}/v1/candles/days?market=${encodeURIComponent(
    pair
  )}&count=${CRYPTO_CHART_POINTS}`
  try {
    const res = await eFetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const rows = await res.json()
    if (!Array.isArray(rows)) return []
    return rows
      .map((r) => Number(r?.trade_price))
      .filter((n) => Number.isFinite(n))
      .reverse()
  } catch {
    return []
  }
}

async function fetchMarketIndexDailyCloses(category, code) {
  const urls = [
    `https://m.stock.naver.com/front-api/v1/marketIndex/prices?category=${encodeURIComponent(
      category
    )}&reutersCode=${encodeURIComponent(code)}&page=1&pageSize=${CHART_POINTS}`,
    `https://m.stock.naver.com/front-api/marketIndex/prices?category=${encodeURIComponent(
      category
    )}&reutersCode=${encodeURIComponent(code)}&page=1&pageSize=${CHART_POINTS}`,
    `https://api.stock.naver.com/marketindex/${encodeURIComponent(
      category
    )}/${encodeURIComponent(code)}/prices?page=1&pageSize=${CHART_POINTS}`
  ]

  for (const url of urls) {
    try {
      const res = await eFetch(url, { headers: CHART_HEADERS })
      if (!res.ok) continue
      const rows = findPriceRows(await res.json())
      const prices = extractCloses(rows)
      if (prices.length) return prices
    } catch {
      // 다음 공개 엔드포인트로 폴백
    }
  }
  return []
}

export async function fetchNaverMarketIndexDailyCloses(symbol) {
  const parsed = parseMarketSymbol(symbol)
  if (!parsed) return []
  if (parsed.category === 'index') {
    try {
      const res = await eFetch(
        `https://m.stock.naver.com/api/index/${encodeURIComponent(
          parsed.code
        )}/price?pageSize=${CHART_POINTS}&page=1`,
        { headers: CHART_HEADERS }
      )
      if (!res.ok) return []
      return extractCloses(await res.json())
    } catch {
      return []
    }
  }
  if (parsed.category === 'cryptoUpbit' || parsed.category === 'cryptoBithumb') {
    return fetchCryptoDailyCloses(parsed.category, parsed.code)
  }
  return fetchMarketIndexDailyCloses(parsed.category, parsed.code)
}

export async function fetchNaverMarketIndex(symbol, { skipChart = false } = {}) {
  const parsed = parseMarketSymbol(symbol)
  if (!parsed) throw new Error(`잘못된 네이버 시장지표 코드: ${symbol}`)

  if (parsed.category === 'index') {
    return fetchDomesticIndex(parsed.code, { skipChart })
  }

  const source = MARKET_INDEX_SOURCES.find((s) => s.category === parsed.category)
  if (!source) throw new Error(`지원하지 않는 네이버 시장지표: ${parsed.category}`)

  const [items, prices] = await Promise.all([
    fetchMarketSource(source),
    skipChart ? Promise.resolve([]) : fetchNaverMarketIndexDailyCloses(symbol)
  ])
  const item = items.find((x) => {
    const code = String(x.reutersCode || x.symbolCode || x.code || '').trim()
    return code === parsed.code
  })
  if (!item) throw new Error(`네이버 시장지표를 찾을 수 없음: ${parsed.code}`)

  return marketItemToQuote(symbol, source, item, prices)
}

const DAILY_URL = (code) =>
  `https://m.stock.naver.com/api/stock/${code}/price?pageSize=70&page=1`

export async function fetchKoreanDailyCloses(code) {
  try {
    const res = await eFetch(DAILY_URL(code), { headers: CHART_HEADERS })
    if (!res.ok) return []
    const rows = await res.json()
    return extractCloses(rows)
  } catch {
    return []
  }
}

function normalizeUSTicker(item) {
  const candidates = [item.symbolCode, item.code, item.reutersCode]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase())

  for (let symbol of candidates) {
    symbol = symbol.replace(/\.(O|N|A)$/i, '')
    if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return symbol
  }
  return null
}

function normalizeDomesticIndexCode(item) {
  const candidates = [item.code, item.symbolCode, item.reutersCode]
    .filter(Boolean)
    .map((v) => String(v).trim().toUpperCase())
  return candidates.find((code) => DOMESTIC_INDEX_BY_CODE.has(code)) || null
}

function toNaverStockSearchItem(item) {
  const nation = String(item.nationCode || item.nation || '').toUpperCase()
  const typeName = String(item.typeName || item.typeCode || '')
  const url = String(item.url || '')
  const rawCode = String(item.code || '').trim()

  const indexCode = normalizeDomesticIndexCode(item)
  const isDomesticIndex =
    Boolean(indexCode) &&
    (url.includes('/domestic/index/') || /지수|코스피|코스닥/i.test(typeName + ' ' + (item.name || '')))

  if (isDomesticIndex) {
    const info = DOMESTIC_INDEX_BY_CODE.get(indexCode)
    return {
      market: 'NV',
      symbol: `index:${indexCode}`,
      name: item.name || info?.name || indexCode,
      type: info?.type || typeName || '국내지수',
      unit: '',
      currency: ''
    }
  }

  const isDomestic =
    nation === 'KOR' ||
    url.includes('/domestic/stock/') ||
    /코스피|코스닥|코넥스/i.test(typeName)

  if (isDomestic && /^[0-9A-Za-z]{6}$/.test(rawCode)) {
    return {
      market: 'KR',
      symbol: rawCode.toUpperCase(),
      name: item.name || rawCode,
      type: typeName
    }
  }

  const isUS =
    nation === 'USA' ||
    /NASDAQ|NYSE|AMEX|나스닥|뉴욕|아멕스/i.test(typeName) ||
    (/\/worldstock\//.test(url) && /\.(O|N|A)(?:\/|$)/i.test(url))

  if (isUS) {
    const symbol = normalizeUSTicker(item)
    if (!symbol) return null
    return {
      market: 'US',
      symbol,
      name: item.name || symbol,
      type: typeName || 'US'
    }
  }

  return null
}

async function searchNaverEquities(keyword) {
  const res = await eFetch(SEARCH_URL(keyword), { headers: CHART_HEADERS })
  if (!res.ok) throw new Error(`Naver search: ${res.status}`)
  const json = await res.json()
  const items = json?.result?.items || json?.items || []

  const seen = new Set()
  const results = []
  for (const item of items) {
    const mapped = toNaverStockSearchItem(item)
    if (!mapped) continue
    const key = `${mapped.market}-${mapped.symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(mapped)
  }
  return results.slice(0, 20)
}

export async function searchKoreanStocks(keyword) {
  const [stocks, marketIndexes] = await Promise.all([
    searchNaverEquities(keyword).catch(() => []),
    searchNaverMarketIndexes(keyword).catch(() => [])
  ])
  const all = [...stocks, ...searchDomesticIndexes(keyword), ...marketIndexes]
  const seen = new Set()
  return all.filter((item) => {
    const key = `${item.market}-${item.symbol}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function fetchKoreanStock(code, { skipChart = false } = {}) {
  if (useProxy()) {
    try {
      return await proxyStock('KR', code, { skipChart })
    } catch {
      // 프록시 실패 시 직접 호출로 폴백
    }
  }
  const quotePromise = eFetch(QUOTE_URL(code), { headers: QUOTE_HEADERS })
  const chartPromise = skipChart
    ? null
    : eFetch(CHART_URL(code), { headers: CHART_HEADERS })

  const quoteRes = await quotePromise
  if (!quoteRes.ok) throw new Error(`Naver quote ${code}: ${quoteRes.status}`)

  const quoteJson = await quoteRes.json()
  const quote = extractQuote(quoteJson)
  if (!quote) throw new Error(`Naver quote ${code}: empty payload`)

  let prices = []
  if (chartPromise) {
    const chartRes = await chartPromise
    if (chartRes.ok) {
      try {
        const rows = await chartRes.json()
        prices = extractCloses(rows)
      } catch {
        prices = []
      }
    }
  }

  return {
    market: 'KR',
    symbol: code,
    currency: 'KRW',
    ...quote,
    prices
  }
}
