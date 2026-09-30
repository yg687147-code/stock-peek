import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

function AddStockModal({ onClose, onAdd, existingKeys = new Set() }) {
  const { t } = useI18n()
  const [market, setMarket] = useState('KR')
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
        const items = await window.api.searchStocks(market, kw)
        setResults(items || [])
      } catch (e) {
        setError(e?.message || t('add.searchFail'))
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [keyword, market, selected])

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

            <div className="seg">
              <button
                type="button"
                className={market === 'KR' ? 'active' : ''}
                onClick={() => setMarket('KR')}
              >
                {t('add.korea')}
              </button>
              <button
                type="button"
                className={market === 'US' ? 'active' : ''}
                onClick={() => setMarket('US')}
              >
                {t('add.us')}
              </button>
            </div>

            <input
              autoFocus
              className="modal-input"
              placeholder={
                market === 'KR' ? t('add.searchPlaceholderKR') : t('add.searchPlaceholderUS')
              }
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
