import Store from 'electron-store'

const DEFAULTS = [
  { market: 'KR', symbol: '005930' },
  { market: 'KR', symbol: '000660' },
  { market: 'US', symbol: 'AAPL' },
  { market: 'US', symbol: 'NVDA' }
]

const store = new Store({
  name: 'watchlist',
  defaults: { items: DEFAULTS }
})

function normalize(market, symbol) {
  const m = String(market || '').toUpperCase()
  let s = String(symbol || '').trim()
  // 영문+숫자만 남김 (ETF 코드에 알파벳 포함 가능: 0023A0 등)
  if (m === 'KR') s = s.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  else if (m === 'NV') s = s.trim()
  else s = s.toUpperCase()
  return { market: m, symbol: s }
}

function validate({ market, symbol }) {
  if (market === 'KR') {
    if (!/^[0-9A-Za-z]{6}$/.test(symbol)) throw new Error('한국 종목코드는 6자리 영문/숫자')
  } else if (market === 'US') {
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error('미국 티커는 1~10자 영문/숫자')
  } else if (market === 'NV') {
    if (!/^[A-Za-z][A-Za-z0-9]*:[A-Za-z0-9._=+\-]{1,64}$/.test(symbol)) {
      throw new Error('잘못된 네이버 시장지표 코드')
    }
  } else {
    throw new Error(`unknown market: ${market}`)
  }
}

function applyHolding(item, raw) {
  const q = Number(raw?.quantity)
  const p = Number(raw?.avgPrice)
  if (Number.isFinite(q) && q > 0) item.quantity = q
  if (Number.isFinite(p) && p > 0) item.avgPrice = p
  return item
}

export function getItems() {
  return store.get('items')
}

export function addItem(market, symbol, holding) {
  const item = normalize(market, symbol)
  validate(item)
  applyHolding(item, holding)
  const list = getItems()
  if (list.some((i) => i.market === item.market && i.symbol === item.symbol)) {
    throw new Error('이미 추가된 종목')
  }
  const next = [...list, item]
  store.set('items', next)
  return next
}

export function setItems(items) {
  const seen = new Set()
  const next = []
  for (const raw of Array.isArray(items) ? items : []) {
    try {
      const item = normalize(raw.market, raw.symbol)
      validate(item)
      const key = `${item.market}-${item.symbol}`
      if (seen.has(key)) continue
      seen.add(key)
      applyHolding(item, raw)
      next.push(item)
    } catch {
      // skip invalid entries
    }
  }
  store.set('items', next)
  return next
}

export function updateHolding(market, symbol, holding) {
  const target = normalize(market, symbol)
  const list = getItems()
  const idx = list.findIndex(
    (i) => i.market === target.market && i.symbol === target.symbol
  )
  if (idx < 0) throw new Error('종목 없음')
  const next = list.map((it) => ({ ...it }))
  const item = next[idx]
  const q = Number(holding?.quantity)
  const p = Number(holding?.avgPrice)
  if (Number.isFinite(q) && q > 0) item.quantity = q
  else delete item.quantity
  if (Number.isFinite(p) && p > 0) item.avgPrice = p
  else delete item.avgPrice
  store.set('items', next)
  return next
}

export function removeItem(market, symbol) {
  const item = normalize(market, symbol)
  const next = getItems().filter(
    (i) => !(i.market === item.market && i.symbol === item.symbol)
  )
  store.set('items', next)
  return next
}
