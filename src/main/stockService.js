import { fetchKoreanStock, fetchNaverMarketIndex } from './api/naver.js'
import { fetchUSStock } from './api/yahoo.js'
import { getItems } from './watchlist.js'

const REFRESH_FAST = 3_000 // 어느 한 시장이라도 열려있을 때
const REFRESH_SLOW = 60_000 // 한/미 모두 닫혔을 때
const JITTER = 250 // ms, 다중 사용자 호출 분산용
const CHART_TTL = 600_000 // 3개월 일봉은 10분 캐시 — 모든 자산의 차트 호출을 억제

let polling = false
let timer = null
let cache = []
const listeners = new Set()

// 일봉 prices 캐시. key: "KR-005930", "NV-index:KOSPI" 등.
const chartCache = new Map()

// --- 시장 시간 판단 (KST 기준) ----------------------------------

function kstNow() {
  // UTC time + 9h 보정 → kst.getUTC*() 호출하면 KST 시각.
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function isKoreanMarketOpen() {
  const k = kstNow()
  const day = k.getUTCDay() // 0=일, 6=토
  if (day === 0 || day === 6) return false
  const min = k.getUTCHours() * 60 + k.getUTCMinutes()
  return min >= 9 * 60 && min < 15 * 60 + 30
}

// 미국 동부시간(ET) 기준 서머타임(DST) 여부 판단.
// DST: 3월 둘째 일요일 ~ 11월 첫째 일요일 (현지 02:00 전환은 근사 무시).
function isUSDaylightSaving(d) {
  const year = d.getUTCFullYear()
  // 3월 둘째 일요일 (UTC 기준 근사)
  const march = new Date(Date.UTC(year, 2, 1))
  const secondSunMar = 1 + ((7 - march.getUTCDay()) % 7) + 7
  // 11월 첫째 일요일
  const nov = new Date(Date.UTC(year, 10, 1))
  const firstSunNov = 1 + ((7 - nov.getUTCDay()) % 7)

  const dstStart = Date.UTC(year, 2, secondSunMar)
  const dstEnd = Date.UTC(year, 10, firstSunNov)
  const t = d.getTime()
  return t >= dstStart && t < dstEnd
}

function isUSMarketOpen() {
  // 미 정규장: 현지 09:30~16:00 (월~금).
  // DST면 ET=UTC-4, 아니면 ET=UTC-5.
  const now = new Date()
  const offset = isUSDaylightSaving(now) ? 4 : 5
  // ET 시각 = UTC - offset
  const et = new Date(now.getTime() - offset * 60 * 60 * 1000)
  const day = et.getUTCDay() // 0=일, 6=토
  if (day === 0 || day === 6) return false
  const min = et.getUTCHours() * 60 + et.getUTCMinutes()
  return min >= 9 * 60 + 30 && min < 16 * 60
}

function anyMarketOpen() {
  return isKoreanMarketOpen() || isUSMarketOpen()
}

// --- Fetch logic --------------------------------------------------

// 마지막으로 성공한 시세. key: "US-AAPL", value: 성공 결과 객체
const lastGood = new Map()

function cachedChart(key) {
  const cached = chartCache.get(key)
  if (!cached || Date.now() - cached.ts >= CHART_TTL) return null
  return cached.prices
}

function rememberChart(key, prices) {
  if (Array.isArray(prices) && prices.length) {
    chartCache.set(key, { prices, ts: Date.now() })
  }
}

async function fetchOne(item) {
  const key = `${item.market}-${item.symbol}`
  // 보유 정보를 먼저 추출 — fetch 결과와 무관하게 항상 보존.
  const holding = {}
  if (item.quantity != null) holding.quantity = item.quantity
  if (item.avgPrice != null) holding.avgPrice = item.avgPrice

  try {
    let result
    if (item.market === 'KR') {
      const prices = cachedChart(key)
      result = await fetchKoreanStock(item.symbol, {
        skipChart: Boolean(prices)
      })
      if (prices) result.prices = prices
      else rememberChart(key, result.prices)
    } else if (item.market === 'US') {
      result = await fetchUSStock(item.symbol)
    } else if (item.market === 'NV') {
      const prices = cachedChart(key)
      result = await fetchNaverMarketIndex(item.symbol, {
        skipChart: Boolean(prices)
      })
      if (prices) result.prices = prices
      else rememberChart(key, result.prices)
    } else {
      return { ...item, ...holding, error: 'unknown market' }
    }
    // 성공 → 마지막 정상값으로 저장.
    const merged = { ...result, ...holding }
    lastGood.set(key, merged)
    return merged
  } catch (e) {
    // 네트워크 끊김 등 실패 → 마지막 정상 가격을 유지하고 stale 플래그만 표시.
    const prev = lastGood.get(key)
    if (prev) {
      return { ...prev, ...holding, stale: true }
    }
    // 한 번도 성공 못 한 경우에만 에러 표시.
    return { ...item, ...holding, error: e.message || String(e) }
  }
}

export async function refreshAll() {
  const list = getItems()
  const results = await Promise.all(list.map(fetchOne))
  cache = results
  for (const fn of listeners) {
    try {
      fn(results)
    } catch (e) {
      console.error('stockService listener error:', e)
    }
  }
  return results
}

// --- Adaptive scheduling -----------------------------------------

function scheduleNext() {
  if (!polling) return
  const base = anyMarketOpen() ? REFRESH_FAST : REFRESH_SLOW
  const jitter = Math.floor(Math.random() * (JITTER * 2)) - JITTER
  timer = setTimeout(tick, base + jitter)
}

function tick() {
  refreshAll().finally(() => {
    scheduleNext()
  })
}

export function startPolling() {
  if (polling) return
  polling = true
  tick() // 즉시 첫 fetch + 이후 자동 스케줄
}

export function stopPolling() {
  polling = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function getCache() {
  return cache
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reorderCache(order) {
  const map = new Map(cache.map((c) => [`${c.market}-${c.symbol}`, c]))
  cache = order
    .map((o) => map.get(`${o.market}-${o.symbol}`))
    .filter(Boolean)
  for (const fn of listeners) {
    try {
      fn(cache)
    } catch (e) {
      console.error('stockService listener error:', e)
    }
  }
}
