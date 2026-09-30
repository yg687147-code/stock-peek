import { useProxy, proxyStock, proxySearch, eFetch } from './proxy.js'

const QUOTE_URL = (code) =>
  `https://polling.finance.naver.com/api/realtime/domestic/stock/${code}`

// 모바일 네이버 일봉 엔드포인트. 휴장일/거래시간 외에도 직전 거래일들 데이터를 반환.
// (siseJson의 timeframe=minute는 평일 거래시간 외엔 빈 응답이라 sparkline이 안 그려짐)
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

function parseNumber(raw, formatted) {
  const r = Number(raw)
  if (Number.isFinite(r)) return r
  return Number(String(formatted ?? '').replace(/,/g, '').replace(/%/g, ''))
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

  // 정규장 + 시간외 단일가 둘 다 받아서 더 최신 거래 기준으로 표시.
  // (장 마감 후엔 시간외 가격이 토스 등 다른 앱에서 보이는 "현재 가격"과 일치)
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

  // 1: 상한, 2: 상승, 3: 보합, 4: 하한, 5: 하락
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

function extractCloses(rows) {
  if (!Array.isArray(rows)) return []
  // 응답은 최신 → 과거 순. sparkline은 좌→우 시간순으로 그려야 하므로 reverse.
  return rows
    .map((r) => Number(String(r.closePrice ?? '').replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .reverse()
}

const SEARCH_URL = (kw) =>
  `https://ac.stock.naver.com/ac?q=${encodeURIComponent(kw)}&target=stock`

// 네이버 금융의 시장지표 목록. 주식 검색과 함께 조회해서 환율/금/원유/금리 등을
// 별도 하드코딩 없이 검색 결과에 포함한다.
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
  }
]

const MARKET_CACHE_TTL = 2_000
const marketListCache = new Map()

function collectMarketObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectMarketObjects(item, out)
    return out
  }
  if (!value || typeof value !== 'object') return out

  const code = value.reutersCode || value.symbolCode || value.code
  if (value.name && code && value.closePrice != null) out.push(value)

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

function marketSearchText(source, item) {
  return [
    item.name,
    item.nameEng,
    item.reutersCode,
    item.symbolCode,
    item.code,
    item.unit,
    source.type
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

async function searchNaverMarketIndexes(keyword) {
  const q = keyword.trim().toLowerCase()
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

  return results.slice(0, 30)
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

function marketItemToQuote(symbol, source, item) {
  const price = parseNumber(item.closePriceRaw, item.closePrice)
  const change = parseNumber(
    item.fluctuationsRaw ?? item.compareToPreviousClosePriceRaw,
    item.fluctuations ?? item.compareToPreviousClosePrice
  )
  const changeRatio = parseNumber(item.fluctuationsRatioRaw, item.fluctuationsRatio)

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
    prices: [],
    assetType: source.type
  }
}

export async function fetchNaverMarketIndex(symbol) {
  const parsed = parseMarketSymbol(symbol)
  if (!parsed) throw new Error(`잘못된 네이버 시장지표 코드: ${symbol}`)

  const source = MARKET_INDEX_SOURCES.find((s) => s.category === parsed.category)
  if (!source) throw new Error(`지원하지 않는 네이버 시장지표: ${parsed.category}`)

  const items = await fetchMarketSource(source)
  const item = items.find((x) => {
    const code = String(x.reutersCode || x.symbolCode || x.code || '').trim()
    return code === parsed.code
  })
  if (!item) throw new Error(`네이버 시장지표를 찾을 수 없음: ${parsed.code}`)

  return marketItemToQuote(symbol, source, item)
}

export async function fetchNaverMarketIndexDailyCloses() {
  // 시장지표마다 과거 데이터 API 구조가 달라 포트폴리오 통계에는 현재가만 사용.
  // 카드 표시에는 영향이 없고, 통계 계산에서는 해당 항목만 추세/변동성 계산에서 제외됨.
  return []
}

// 통계(추세·변동성)용 일봉 종가 — 최근 ~3개월(70거래일 여유). 실패 시 빈 배열.
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

async function searchKoreanEquities(keyword) {
  if (useProxy()) {
    try {
      return await proxySearch('KR', keyword)
    } catch {
      // 프록시 실패 시 직접 호출로 폴백
    }
  }
  const res = await eFetch(SEARCH_URL(keyword), { headers: CHART_HEADERS })
  if (!res.ok) throw new Error(`Naver search: ${res.status}`)
  const json = await res.json()
  return (json?.items || [])
    .filter((i) => i.nationCode === 'KOR' && i.category === 'stock')
    .map((i) => ({
      market: 'KR',
      symbol: i.code,
      name: i.name,
      type: i.typeName || ''
    }))
}

export async function searchKoreanStocks(keyword) {
  const [stocks, marketIndexes] = await Promise.all([
    searchKoreanEquities(keyword).catch(() => []),
    searchNaverMarketIndexes(keyword).catch(() => [])
  ])
  return [...stocks, ...marketIndexes]
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
