import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export const translations = {
  ko: {
    // App
    'app.refresh': '새로고침',
    'app.add': '추가',
    'app.settings': '설정',
    'app.help': '도움말',
    'app.quit': '종료',
    'app.pin': '고정',
    'app.unpin': '고정 해제',
    'app.empty': '종목이 비어있어요',
    'app.emptyAdd': '+ 종목 추가',
    'help.chart': '차트는 지원되는 모든 자산의 최근 3개월 일봉을 보여줍니다.',
    'help.stats': '추세·변동성은 최근 3개월 일봉을 기준으로 분석합니다.',
    'review.button': '📊 오늘의 포트폴리오 한 줄 평',
    'review.loading': '분석 중…',
    'review.used_today': '오늘은 이미 확인했어요. 내일 다시 볼 수 있어요.',
    'review.empty': '보유 종목을 추가하면 분석할 수 있어요.',
    'review.unavailable': '잠시 후 다시 시도해 주세요.',
    'review.error': '평가를 가져오지 못했어요.',
    // StockCard
    'card.remove': '삭제',
    'card.editHolding': '보유 정보 편집',
    // HoldingEditModal
    'holding.title': '보유 정보 편집',
    'holding.quantity': '수량',
    'holding.avgPrice': '평단가',
    'holding.qtyPlaceholder': '예: 10',
    'holding.pricePlaceholder': '예: 72400',
    'holding.save': '저장',
    'holding.cancel': '취소',
    'holding.hint': '평단가는 나중에 편집 가능 · 입력 안 해도 OK',
    'holding.clear': '지우기',
    // AddStockModal
    'add.title': '종목 추가',
    'add.korea': '한국',
    'add.us': '미국',
    'add.searching': '검색 중…',
    'add.noResult': '결과 없음',
    'add.holdingInfo': '매수 정보 (선택)',
    'add.quantity': '수량',
    'add.avgPrice': '평단가 (원)',
    'add.back': '← 뒤로',
    'add.skip': '건너뛰기',
    'add.add': '추가',
    'add.close': '닫기',
    'add.searchPlaceholderKR': '예: 삼성전자, 005930',
    'add.searchPlaceholderUS': '예: Apple, AAPL',
    'add.alreadyAdded': '이미 추가됨',
    'add.alreadyAddedTitle': '이미 추가된 종목',
    'add.searchFail': '검색 실패',
    // SettingsModal
    'settings.title': '설정',
    'settings.autostart': '윈도우 시작 시 자동 실행',
    'settings.donate': '☕ 커피값 후원',
    'settings.version': '버전',
    'settings.contact': '문의',
    'settings.contactTitle': '이메일로 문의 보내기',
    'settings.language': '언어',
    'settings.updateReady': '다운로드 완료 — 클릭해서 재시작',
    'settings.updateDownloading': '다운로드 중…',
    'settings.donateDesc': '몰래주식이 도움이 되셨다면 커피 한 잔 어떠세요?',
    'settings.donateBtn': 'Buy Me a Coffee',
    'settings.donateKakao': '카카오페이로 스캔',
    'settings.close': '닫기',
    'settings.langKo': '한국어',
    'settings.langEn': 'English',
    // WelcomeModal
    'welcome.title': '몰래주식에 오신 걸 환영해요',
    'welcome.step1': '마우스를 화면 우측 끝으로',
    'welcome.step1desc': '패널이 슬라이드로 나타납니다.',
    'welcome.step2': '＋ 버튼으로 종목 추가',
    'welcome.step3': '트레이 아이콘 ⚙ 에서 설정',
    'welcome.start': '시작하기',
    'welcome.step2desc': '종목명이나 티커로 검색해서 추가하세요.',
    'welcome.step3desc': '자동 시작 토글 · 앱 종료는 트레이에서.'
  },
  en: {
    // App
    'app.refresh': 'Refresh',
    'app.add': 'Add',
    'app.settings': 'Settings',
    'app.help': 'Help',
    'app.quit': 'Quit',
    'app.pin': 'Pin',
    'app.unpin': 'Unpin',
    'app.empty': 'No stocks yet',
    'app.emptyAdd': '+ Add stock',
    'help.chart': 'Charts show the last 3 months of daily data for all supported assets.',
    'help.stats': 'Trend & volatility are analyzed from the last 3 months of daily candles.',
    'review.button': '📊 Today\'s portfolio note',
    'review.loading': 'Analyzing…',
    'review.used_today': 'Already viewed today. Come back tomorrow.',
    'review.empty': 'Add holdings to get a review.',
    'review.unavailable': 'Please try again later.',
    'review.error': 'Could not generate the review.',
    // StockCard
    'card.remove': 'Remove',
    'card.editHolding': 'Edit holding',
    // HoldingEditModal
    'holding.title': 'Edit Holding',
    'holding.quantity': 'Quantity',
    'holding.avgPrice': 'Avg. Price',
    'holding.qtyPlaceholder': 'e.g. 10',
    'holding.pricePlaceholder': 'e.g. 72400',
    'holding.save': 'Save',
    'holding.cancel': 'Cancel',
    'holding.hint': 'You can edit this later · Optional',
    'holding.clear': 'Clear',
    // AddStockModal
    'add.title': 'Add Stock',
    'add.korea': 'Korea',
    'add.us': 'US',
    'add.searching': 'Searching…',
    'add.noResult': 'No results',
    'add.holdingInfo': 'Holding info (optional)',
    'add.quantity': 'Quantity',
    'add.avgPrice': 'Avg. Price',
    'add.back': '← Back',
    'add.skip': 'Skip',
    'add.add': 'Add',
    'add.close': 'Close',
    'add.searchPlaceholderKR': 'e.g. Samsung, 005930',
    'add.searchPlaceholderUS': 'e.g. Apple, AAPL',
    'add.alreadyAdded': 'Already added',
    'add.alreadyAddedTitle': 'Already in watchlist',
    'add.searchFail': 'Search failed',
    // SettingsModal
    'settings.title': 'Settings',
    'settings.autostart': 'Launch on Windows startup',
    'settings.donate': '☕ Buy me a coffee',
    'settings.version': 'Version',
    'settings.contact': 'Contact',
    'settings.contactTitle': 'Send an email',
    'settings.language': 'Language',
    'settings.updateReady': 'Downloaded — click to restart',
    'settings.updateDownloading': 'Downloading…',
    'settings.donateDesc': 'If Stock Peek helps you, how about a coffee?',
    'settings.donateBtn': 'Buy Me a Coffee',
    'settings.donateKakao': 'Scan with KakaoPay',
    'settings.close': 'Close',
    'settings.langKo': '한국어',
    'settings.langEn': 'English',
    // WelcomeModal
    'welcome.title': 'Welcome to Stock Peek',
    'welcome.step1': 'Move your mouse to the right edge',
    'welcome.step1desc': 'The panel slides into view.',
    'welcome.step2': 'Add stocks with the ＋ button',
    'welcome.step3': 'Configure from the tray icon ⚙',
    'welcome.start': 'Get started',
    'welcome.step2desc': 'Search by name or ticker to add.',
    'welcome.step3desc': 'Toggle auto-start · quit from the tray.'
  }
}

const I18nContext = createContext({ lang: 'ko', t: (k) => k, setLang: () => {} })

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('ko')

  useEffect(() => {
    // 저장된 언어 우선, 없으면 OS 언어 감지
    window.api.getLanguage().then((saved) => {
      if (saved) {
        setLangState(saved)
      } else {
        const sys = (navigator.language || 'ko').toLowerCase()
        setLangState(sys.startsWith('ko') ? 'ko' : 'en')
      }
    }).catch(() => {})
  }, [])

  const setLang = useCallback((l) => {
    setLangState(l)
    window.api.setLanguage(l).catch(() => {})
  }, [])

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.ko[key] ?? key,
    [lang]
  )

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
