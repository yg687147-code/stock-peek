import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

function AddStockModal({ onClose, onAdd, existingKeys = new Set() }) {
  const { t } = useI18n()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // step 2: 선택한 종목 + 매수가/수량 입력
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')

  useEffect(() => {
    if (selected) return // 검색 step 멈춤
    setError(null)
    const kw = keyword.trim()
    if (!kw) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        // 검색은 항상 네이버 금융 통합 검색으로 보낸다.
        // 결과 안의 market(KR/US/NV)에 따라 추가 후 시세 조회 경로가 결정된다.
        const items = await window.api.searchStocks('KR', kw)
        setResults(items || [])
      } catch (e) {
        setError(e?.message || t('add.searchFail'))
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [keyword, selected])

  const handlePick = (item) => {
    setSelected(item)
    setError(null)
  }

  const submitAdd = async (withHolding) => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      const holding = withHolding
        ? {
            quantity: Number(quantity) || undefined,
            avgPrice: Number(avgPrice) || undefined
          }
        : undefined
      await onAdd(selected.market, selected.symbol, holding)
      onClose()
    } catch (err) {
      setError(err?.message || String(err))
      setBusy(false)
    }
  }

  const kw = keyword.trim()
  const isEnglish = t('add.us') === 'US'
  const searchPlaceholder = isEnglish
    ? 'Stock, ticker, USD/KRW, gold, Bitcoin...'
    : '종목명, 티커, 달러, 금, 비트코인...'
  const selectedMarketLabel =
    selected?.market === 'KR'
      ? t('add.korea')
      : selected?.market === 'US'
        ? t('add.us')
        : isEnglish
          ? 'Naver Finance'
          : '네이버 금융'
  const selectedPriceUnit =
    selected?.market === 'KR'
      ? '₩'
      : selected?.market === 'US'
        ? '$'
        : selected?.unit || selected?.currency || ''

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {!selected ? (
          <>
            <div className="modal-title">{t('add.title')}</div>

            <input
              autoFocus
              className="modal-input"
              placeholder={searchPlaceholder}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />

            <div className="search-results">
              {searching && <div className="search-hint">{t('add.searching')}</div>}
              {!searching && kw && results.length === 0 && !error && (
                <div className="search-hint">{t('add.noResult')}</div>
              )}
              {results.map((r) => {
                const key = `${r.market}-${r.symbol}`
                const exists = existingKeys.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className="search-item"
                    onClick={() => !exists && handlePick(r)}
                    disabled={busy || exists}
                    title={exists ? t('add.alreadyAddedTitle') : undefined}
                  >
                    <span className="search-name">{r.name}</span>
                    <span className="search-meta">
                      {exists
                        ? t('add.alreadyAdded')
                        : `${r.symbol}${r.type ? ` · ${r.type}` : ''}`}
                    </span>
                  </button>
                )
              })}
            </div>

            {error && <div className="modal-err">{error}</div>}

            <div className="modal-actions">
              <button type="button" onClick={onClose}>
                {t('add.close')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-title">{t('add.holdingInfo')}</div>

            <div className="selected-stock">
              <span className="selected-name">{selected.name}</span>
              <span className="selected-meta">
                {selected.symbol} · {selectedMarketLabel}
              </span>
            </div>

            <div className="holding-form">
              <label>
                <span className="form-label">{t('add.quantity')}</span>
                <input
                  className="modal-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={t('holding.qtyPlaceholder')}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
              </label>
              <label>
                <span className="form-label">
                  {t('add.avgPrice')}{selectedPriceUnit ? ` (${selectedPriceUnit})` : ''}
                </span>
                <input
                  className="modal-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={selected.market === 'US' ? 'e.g. 189.20' : t('holding.pricePlaceholder')}
                  value={avgPrice}
                  onChange={(e) => setAvgPrice(e.target.value)}
                />
              </label>
            </div>

            <div className="form-hint">
              {t('holding.hint')}
            </div>

            {error && <div className="modal-err">{error}</div>}

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setSelected(null)}
                disabled={busy}
              >
                {t('add.back')}
              </button>
              <button
                type="button"
                onClick={() => submitAdd(false)}
                disabled={busy}
              >
                {t('add.skip')}
              </button>
              <button
                type="button"
                onClick={() => submitAdd(true)}
                disabled={busy || (!quantity && !avgPrice)}
                className="primary"
              >
                {busy ? '...' : t('add.add')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default AddStockModal
