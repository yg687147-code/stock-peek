import Sparkline from './Sparkline'
import { useI18n } from '../i18n'

function formatPrice(stock) {
  if (!Number.isFinite(stock.price)) return '—'
  if (stock.market === 'KR' || stock.currency === 'KRW') {
    const decimals = Number.isInteger(stock.priceDecimals) ? stock.priceDecimals : 0
    return `${stock.price.toLocaleString('ko-KR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    })}원`
  }
  return `$${stock.price.toFixed(2)}`
}

function formatRatio(r) {
  if (!Number.isFinite(r)) return ''
  const sign = r > 0 ? '+' : ''
  return `${sign}${r.toFixed(2)}%`
}

function formatProfit(stock) {
  if (!Number.isFinite(stock.price) || !stock.quantity || !stock.avgPrice) return null
  const profit = (stock.price - stock.avgPrice) * stock.quantity
  const ratio = ((stock.price - stock.avgPrice) / stock.avgPrice) * 100
  const sign = profit > 0 ? '+' : ''
  const profitText =
    stock.market === 'KR' || stock.currency === 'KRW'
      ? `${sign}${Math.round(profit).toLocaleString('ko-KR')}원`
      : `${sign}$${profit.toFixed(2)}`
  const ratioText = `${sign}${ratio.toFixed(2)}%`
  return { profitText, ratioText, isUp: profit >= 0 }
}

function CardBtn({ onClick, title, label, className }) {
  return (
    <button
      className={`card-btn ${className || ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  )
}

function StockCard({ stock, onRemove, onEditHolding }) {
  const { t } = useI18n()
  if (stock.error) {
    return (
      <div className="card card-err">
        {onRemove && <CardBtn onClick={() => onRemove(stock)} title={t('card.remove')} label="×" className="card-remove" />}
        <div className="row">
          <span className="name">{stock.symbol}</span>
          <span className="change down">err</span>
        </div>
        <div className="row">
          <span className="err-msg" title={stock.error}>
            {stock.error}
          </span>
        </div>
      </div>
    )
  }

  const cls = stock.isUp ? 'up' : 'down'
  const profit = formatProfit(stock)

  return (
    <div className="card">
      <div className="card-actions">
        {onEditHolding && (
          <CardBtn
            onClick={() => onEditHolding(stock)}
            title={t('card.editHolding')}
            label="✎"
            className="card-edit"
          />
        )}
        {onRemove && (
          <CardBtn
            onClick={() => onRemove(stock)}
            title={t('card.remove')}
            label="×"
            className="card-remove"
          />
        )}
      </div>
      <div className="row">
        <span className="name" title={stock.symbol}>
          {stock.name || stock.symbol}
        </span>
        <span className={`change ${cls}`}>{formatRatio(stock.changeRatio)}</span>
      </div>
      <div className="row">
        <span className="price">
          {stock.stale && <span className="stale-dot" title="연결 끊김 — 마지막 가격" />}
          {formatPrice(stock)}
        </span>
        <Sparkline prices={stock.prices} isUp={stock.isUp} />
      </div>
      {profit && (
        <div className="row holding">
          <span className="holding-qty">
            {Number(stock.quantity).toLocaleString('ko-KR')}{stock.assetType ? '' : '주'}
          </span>
          <span className={`holding-profit ${profit.isUp ? 'up' : 'down'}`}>
            {profit.profitText} ({profit.ratioText})
          </span>
        </div>
      )}
    </div>
  )
}

export default StockCard
