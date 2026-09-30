// 포트폴리오 통계 레이어 — 캐시된 시세/보유 정보로 4개 지표 계산.
// 순수 함수: 외부 호출 없이 입력(cache)만으로 동작.
// LLM 한 줄 평의 입력 재료로 사용됨.

// 종목별 평가금액 = 현재가 × 수량. 보유수량 없으면 0.
function positionValue(s) {
  const qty = Number(s.quantity)
  const price = Number(s.price)
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0
  return qty * price
}

// 1) 평가손익 — 보유정보(수량·평단가) 있는 종목만 합산.
function computePnL(cache) {
  let cost = 0
  let value = 0
  let counted = 0
  for (const s of cache) {
    const qty = Number(s.quantity)
    const avg = Number(s.avgPrice)
    const price = Number(s.price)
    if (
      !Number.isFinite(qty) ||
      !Number.isFinite(avg) ||
      !Number.isFinite(price) ||
      qty <= 0
    ) {
      continue
    }
    cost += qty * avg
    value += qty * price
    counted += 1
  }
  if (counted === 0 || cost <= 0) {
    return { hasHolding: false }
  }
  const pnl = value - cost
  const pnlRatio = (pnl / cost) * 100
  return {
    hasHolding: true,
    cost,
    value,
    pnl,
    pnlRatio,
    counted
  }
}

// 2) 집중도 — 평가금액 기준 최대 비중 종목. 보유정보 없으면 종목 균등 가정.
function computeConcentration(cache) {
  // 보유금액 기반 우선, 없으면 동일가중으로 fallback
  const withValue = cache.map((s) => ({
    name: s.name || s.symbol,
    market: s.market,
    value: positionValue(s)
  }))
  const totalValue = withValue.reduce((a, b) => a + b.value, 0)

  let weights
  if (totalValue > 0) {
    weights = withValue.map((s) => ({ ...s, weight: s.value / totalValue }))
  } else {
    // 보유정보 전혀 없음 → 종목 수 균등
    const n = cache.length || 1
    weights = cache.map((s) => ({
      name: s.name || s.symbol,
      market: s.market,
      weight: 1 / n
    }))
  }

  weights.sort((a, b) => b.weight - a.weight)
  const top = weights[0]
  // 상위 1개 비중 + HHI(허핀달 지수)로 쏠림 정도 정량화
  const hhi = weights.reduce((a, b) => a + b.weight * b.weight, 0)
  return {
    topName: top?.name,
    topWeight: top ? top.weight * 100 : 0,
    hhi, // 0~1, 1에 가까울수록 집중
    holdingBased: totalValue > 0,
    count: cache.length
  }
}

// 일봉 배열에서 추세/변동성 계산용 일간수익률 추출.
function dailyReturns(prices) {
  if (!Array.isArray(prices) || prices.length < 2) return []
  const rets = []
  for (let i = 1; i < prices.length; i++) {
    const a = Number(prices[i - 1])
    const b = Number(prices[i])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0) {
      rets.push((b - a) / a)
    }
  }
  return rets
}

// 3) 추세 방향 — 종목별 일봉 기준 최근 추세를 합산해 포트폴리오 전반 방향 판정.
// 각 종목: 최근 종가가 N일 단순이동평균 위/아래인지로 up/down/flat.
function computeTrend(cache) {
  let up = 0
  let down = 0
  let flat = 0
  let evaluated = 0
  for (const s of cache) {
    const prices = s.prices
    if (!Array.isArray(prices) || prices.length < 5) continue
    const recent = prices.slice(-20) // 최근 ~20봉
    const last = Number(recent[recent.length - 1])
    const ma = recent.reduce((a, b) => a + Number(b), 0) / recent.length
    if (!Number.isFinite(last) || !Number.isFinite(ma) || ma <= 0) continue
    const dev = (last - ma) / ma
    if (dev > 0.01) up += 1
    else if (dev < -0.01) down += 1
    else flat += 1
    evaluated += 1
  }
  if (evaluated === 0) return { available: false }
  let direction
  if (up > down && up >= flat) direction = 'up'
  else if (down > up && down >= flat) direction = 'down'
  else direction = 'mixed'
  return { available: true, direction, up, down, flat, evaluated }
}

// 4) 변동성 수준 — 종목별 일간수익률 표준편차의 평균.
// 절대 수치보다 "높음/보통/낮음" 밴드로 환산 (연율화 기준 근사).
function computeVolatility(cache) {
  const vols = []
  for (const s of cache) {
    const rets = dailyReturns(s.prices)
    if (rets.length < 5) continue
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const variance =
      rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length
    const std = Math.sqrt(variance)
    vols.push(std)
  }
  if (vols.length === 0) return { available: false }
  const avgDaily = vols.reduce((a, b) => a + b, 0) / vols.length
  const annualized = avgDaily * Math.sqrt(252) // 연율화
  // 대략적 밴드: 일반적 주식 연변동성 20~30% 기준
  let level
  if (annualized < 0.2) level = 'low'
  else if (annualized < 0.4) level = 'normal'
  else level = 'high'
  return {
    available: true,
    avgDailyStd: avgDaily,
    annualized,
    level
  }
}

// 전체 통계를 한 번에 계산. LLM 입력용 객체 반환.
export function computePortfolioStats(cache) {
  if (!Array.isArray(cache) || cache.length === 0) {
    return { empty: true }
  }
  return {
    empty: false,
    count: cache.length,
    pnl: computePnL(cache),
    concentration: computeConcentration(cache),
    trend: computeTrend(cache),
    volatility: computeVolatility(cache),
    computedAt: Date.now()
  }
}

// 버튼 클릭 시 호출: 가능한 시장은 일봉(3개월)을 다시 받아 prices를 채운 뒤 통계 계산.
// dailyFetchers: { KR, US, NV ... } 형태. fetcher가 없으면 캐시에 든 prices를 그대로 사용.
// cache의 현재가/보유정보는 그대로 쓰고, 추세·변동성용 prices만 일봉으로 교체.
export async function computeStatsWithDailyData(cache, dailyFetchers) {
  if (!Array.isArray(cache) || cache.length === 0) {
    return { empty: true }
  }
  const enriched = await Promise.all(
    cache.map(async (s) => {
      try {
        const fetcher = dailyFetchers?.[s.market]
        if (!fetcher) return s
        const daily = await fetcher(s.symbol)
        if (Array.isArray(daily) && daily.length >= 5) {
          return { ...s, prices: daily }
        }
        return s
      } catch {
        return s
      }
    })
  )
  return computePortfolioStats(enriched)
}
