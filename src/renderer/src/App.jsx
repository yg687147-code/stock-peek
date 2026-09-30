import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import StockCard from './components/StockCard'
import AddStockModal from './components/AddStockModal'
import SettingsModal from './components/SettingsModal'
import WelcomeModal from './components/WelcomeModal'
import HoldingEditModal from './components/HoldingEditModal'
import { useI18n } from './i18n'

const idOf = (s) => `${s.market}-${s.symbol}`

function SortableCard({ stock, onRemove, onEditHolding }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: idOf(stock) })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto'
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StockCard
        stock={stock}
        onRemove={onRemove}
        onEditHolding={onEditHolding}
      />
    </div>
  )
}

function App() {
  const [stocks, setStocks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [dockEdge, setDockEdge] = useState('right')
  const [pinned, setPinned] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [review, setReview] = useState(null) // { text, date }
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewMsg, setReviewMsg] = useState(null) // 안내 메시지 키
  const { t, lang } = useI18n()
  const panelRef = useRef(null)
  const cardsRef = useRef(null)
  const cardsInnerRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    window.api.getStocks().then((data) => {
      if (Array.isArray(data) && data.length) setStocks(data)
    }).catch(() => {})
    const unsub = window.api.onStocksUpdate((data) => setStocks(data))
    window.api.checkWelcome().then((shouldShow) => {
      if (shouldShow) setShowWelcome(true)
    }).catch(() => {})
    window.api.getDockEdge().then((edge) => {
      if (edge) setDockEdge(edge)
    }).catch(() => {})
    const unsubDock = window.api.onDockEdgeChanged((edge) => setDockEdge(edge))
    window.api.getPanelPinned().then((p) => setPinned(!!p)).catch(() => {})
    const unsubPin = window.api.onPanelPinnedChanged((p) => setPinned(!!p))
    return () => { unsub(); unsubDock(); unsubPin() }
  }, [])

  useEffect(() => {
    if (showAdd || showSettings || editingHolding) window.api.panelLock()
    else window.api.panelUnlock()
  }, [showAdd, showSettings, editingHolding])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const inner = cardsInnerRef.current
    if (!panel || !inner) return

    const cardsPadding = 20
    const borderCompensation = 2
    const modalBackdropPadding = 32

    const measure = () => {
      const header = panel.querySelector('.panel-header')
      const headerH = header ? header.offsetHeight : 0
      const innerH = inner.offsetHeight
      let total = headerH + innerH + cardsPadding + borderCompensation

      const modal = panel.querySelector('.modal')
      if (modal) {
        const modalRequired = modal.offsetHeight + modalBackdropPadding
        if (modalRequired > total) total = modalRequired
      }

      window.api.setPanelHeight(total)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(inner)
    const modal = panel.querySelector('.modal')
    if (modal) ro.observe(modal)
    return () => ro.disconnect()
  }, [showAdd, showSettings, showWelcome, editingHolding])

  const handleAdd = async (market, symbol, holding) => {
    await window.api.addStock(market, symbol, holding)
  }

  const handleRemove = async (stock) => {
    await window.api.removeStock(stock.market, stock.symbol)
  }

  const handleEditHolding = (stock) => setEditingHolding(stock)

  const handleSaveHolding = async (holding) => {
    if (!editingHolding) return
    await window.api.updateHolding(
      editingHolding.market,
      editingHolding.symbol,
      holding
    )
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await window.api.refreshStocks()
    } finally {
      setTimeout(() => setRefreshing(false), 400)
    }
  }

  const handleReview = async () => {
    if (reviewLoading) return
    setReviewLoading(true)
    setReviewMsg(null)
    try {
      const r = await window.api.generateReview(lang)
      if (r.ok) {
        setReview({ text: r.review, date: r.date })
      } else {
        // reason: empty | used_today | unavailable | error
        setReviewMsg(`review.${r.reason}`)
      }
    } catch {
      setReviewMsg('review.error')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const [marketA] = String(active.id).split('-')
    const [marketB] = String(over.id).split('-')
    if (marketA !== marketB) return

    const same = stocks.filter((s) => s.market === marketA)
    const oldIndex = same.findIndex((s) => idOf(s) === active.id)
    const newIndex = same.findIndex((s) => idOf(s) === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(same, oldIndex, newIndex)

    let reorderedIndex = 0
    const next = stocks.map((s) => {
      if (s.market !== marketA) return s
      const replacement = reordered[reorderedIndex]
      reorderedIndex += 1
      return replacement
    })

    setStocks(next)
    window.api.reorderStocks(
      next.map((s) => ({ market: s.market, symbol: s.symbol }))
    )
  }

  const kr = stocks.filter((s) => s.market === 'KR')
  const us = stocks.filter((s) => s.market === 'US')
  const nv = stocks.filter((s) => s.market === 'NV')
  const krIds = kr.map(idOf)
  const usIds = us.map(idOf)
  const nvIds = nv.map(idOf)
  const existingKeys = new Set(stocks.map(idOf))

  return (
    <div className={`panel dock-${dockEdge}`} ref={panelRef}>
      <header className="panel-header">
        <span className="title">Watchlist</span>
        <div className="actions">
          <button
            className={`icon-btn ${refreshing ? 'spinning' : ''}`}
            onClick={handleRefresh}
            title={t('app.refresh')}
          >
            ↻
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowAdd(true)}
            title={t('app.add')}
          >
            +
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title={t('app.settings')}
          >
            ⚙
          </button>
          <button
            className={`icon-btn help-btn ${showHelp ? 'active' : ''}`}
            onClick={() => setShowHelp((v) => !v)}
            title={t('app.help')}
          >
            ?
          </button>
          <button
            className={`icon-btn pin-btn ${pinned ? 'pinned' : ''}`}
            onClick={() => {
              if (pinned) {
                setPinned(false)
                window.api.unpinPanel()
              } else {
                setPinned(true)
                window.api.pinPanel()
              }
            }}
            title={pinned ? t('app.unpin') : t('app.pin')}
          >
            📌
          </button>
          <button
            className="icon-btn quit-btn"
            onClick={() => window.api.quitApp()}
            title={t('app.quit')}
          >
            ✕
          </button>
        </div>
      </header>

      {showHelp && (
        <div className="help-popover">
          <div className="help-row">
            <span className="help-icon">📈</span>
            <span>{t('help.chart')}</span>
          </div>
          <div className="help-row">
            <span className="help-icon">📊</span>
            <span>{t('help.stats')}</span>
          </div>
        </div>
      )}

      {stocks.length > 0 && (
        <div className="review-section">
          {review ? (
            <div className="review-result">
              <span className="review-icon">💬</span>
              <span className="review-text">{review.text}</span>
            </div>
          ) : (
            <button
              type="button"
              className="review-btn"
              onClick={handleReview}
              disabled={reviewLoading}
            >
              {reviewLoading ? t('review.loading') : t('review.button')}
            </button>
          )}
          {reviewMsg && <div className="review-msg">{t(reviewMsg)}</div>}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="cards" ref={cardsRef}>
          <div className="cards-inner" ref={cardsInnerRef}>
          {stocks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-text">{t('app.empty')}</div>
              <button
                type="button"
                className="empty-btn"
                onClick={() => setShowAdd(true)}
              >
                {t('app.emptyAdd')}
              </button>
            </div>
          ) : (
            <>
              <SortableContext
                items={krIds}
                strategy={verticalListSortingStrategy}
              >
                {kr.map((s) => (
                  <SortableCard
                    key={idOf(s)}
                    stock={s}
                    onRemove={handleRemove}
                    onEditHolding={handleEditHolding}
                  />
                ))}
              </SortableContext>
              {kr.length > 0 && (us.length > 0 || nv.length > 0) && (
                <div className="divider" />
              )}
              <SortableContext
                items={usIds}
                strategy={verticalListSortingStrategy}
              >
                {us.map((s) => (
                  <SortableCard
                    key={idOf(s)}
                    stock={s}
                    onRemove={handleRemove}
                    onEditHolding={handleEditHolding}
                  />
                ))}
              </SortableContext>
              {us.length > 0 && nv.length > 0 && <div className="divider" />}
              <SortableContext
                items={nvIds}
                strategy={verticalListSortingStrategy}
              >
                {nv.map((s) => (
                  <SortableCard
                    key={idOf(s)}
                    stock={s}
                    onRemove={handleRemove}
                    onEditHolding={handleEditHolding}
                  />
                ))}
              </SortableContext>
            </>
          )}
          </div>
        </div>
      </DndContext>

      {showAdd && (
        <AddStockModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
          existingKeys={existingKeys}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      {editingHolding && (
        <HoldingEditModal
          stock={editingHolding}
          onClose={() => setEditingHolding(null)}
          onSave={handleSaveHolding}
        />
      )}
    </div>
  )
}

export default App
