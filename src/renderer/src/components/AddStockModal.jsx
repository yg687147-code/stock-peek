import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

const KRW_ASSETS = [
  { market: 'US', symbol: 'USD-KRW', name: '달러/원', type: 'FX' },
  { market: 'US', symbol: 'JPY-KRW', name: '엔/원 (100엔)', type: 'FX' },
  { market: 'US', symbol: 'GOLD-KRW', name: '금/원 (1g)', type: 'GOLD' },
  { market: 'US', symbol: 'ETH-KRW', name: '이더리움/원', type: 'CRYPTO' }
]

function AddStockModal({ onClose, onAdd, existingKeys = new Set() }) {
  const { t } = useI18n()
  const [market, setMarket] = useState('KR')
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isEnglish = t('add.us') === 'US'
  const assetLabel = isEnglish ? 'Assets' : '자산'
  const assetPlaceholder = isEnglish ? 'USD/KRW, JPY/KRW, Gold, Ethereum' : '달러/원, 엔/원, 금/원, 이더리움/원'

  // step 2: 선택한 종목 + 매수가/수량 입력
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')

  useEffect(() => {
    if (selected) return // 검색 step 멈춤
    setError(null)
    const kw = keyword.trim()

    if (market === 'ASSET') {
      const q = kw.toLowerCase()
      setResults(
        !q
          ? KRW_ASSETS
          : KRW_ASSETS.filter((item) =>
              `${item.name} ${item.symbol} ${item.type}`.toLowerCase().includes(q)
            )
      )
      setSearching(false)
      return
    }

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

  const handleMarket = (nextMarket) => {
    setMarket(nextMarket)
    setKeyword('')
    setResults(nextMarket === 'ASSET' ? KRW_ASSETS : [])
    setError(null)
  }

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
  const isKRWAsset = selected?.symbol?.endsWith('-KRW')

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
                onClick={() => handleMarket('KR')}
              >
                {t('add.korea')}
              </button>
              <button
                type="button"
                className={market === 'US' ? 'active' : ''}
                onClick={() => handleMarket('US')}
              >
                {t('add.us')}
              </button>
              <button
                type="button"
                className={market === 'ASSET' ? 'active' : ''}
                onClick={() => handleMarket('ASSET')}
              >
                {assetLabel}
              </button>
            </div>

            <input
              autoFocus
              className="modal-input"
              placeholder={
                market === 'KR'
                  ? t('add.searchPlaceholderKR')
                  : market === 'US'
                    ? t('add.searchPlaceholderUS')
                    : assetPlaceholder
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
                {selected.symbol} · {isKRWAsset ? assetLabel : selected.market === 'KR' ? t('add.korea') : t('add.us')}
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
                  {t('add.avgPrice')} ({selected.market === 'KR' || isKRWAsset ? '₩' : '$'})
                </span>
                <input
                  className="modal-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder={selected.market === 'KR' || isKRWAsset ? t('holding.pricePlaceholder') : 'e.g. 189.20'}
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
