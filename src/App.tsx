import { memo, useEffect, useRef, useState } from 'react'
import './App.css'
import { useOAuth } from './hooks/useOAuth'
import { GAMES, GameDefinition, TIMINGS } from './constants'
import { switchToMain, switchToOverlay, tauriEvent, tauriWindow } from './utils/window'

type Page = 'home' | 'tracking'

type TitleBarProps = {
  minimal: boolean
  gameActive: boolean
  onBackToOverlay?: () => void
}

const TitleBar = ({ minimal, gameActive, onBackToOverlay }: TitleBarProps) => {
  const minimize = () => {
    if (gameActive && onBackToOverlay) {
      onBackToOverlay()
      return
    }
    void tauriWindow().then((w) => w.minimize()).catch(() => {})
  }

  const close = () => {
    if (gameActive && onBackToOverlay) {
      onBackToOverlay()
      return
    }
    void tauriWindow().then((w) => w.destroy()).catch(() => {})
  }

  if (minimal) return null

  return (
    <div className="title-bar" data-tauri-drag-region>
      <div className="title-bar-controls">
        <button
          className="title-btn minimize"
          onClick={minimize}
          title={gameActive ? 'Voltar para overlay' : 'Minimizar'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <button
          className="title-btn close"
          onClick={close}
          title={gameActive ? 'Voltar para overlay' : 'Fechar'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const GameCard = memo(({ game }: { game: GameDefinition }) => (
  <div className="game-card" data-game={game.id}>
    <span className="game-name" style={{ fontFamily: game.font }}>
      {game.name}
    </span>
  </div>
))

const GamesCarousel = () => {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let pos = 0
    let animationId: number

    const animate = () => {
      pos = (pos + 0.5) % (182 * GAMES.length)
      el.style.transform = `translateX(-${pos}px)`
      animationId = window.requestAnimationFrame(animate)
    }

    animationId = window.requestAnimationFrame(animate)
    return () => {
      window.cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <div className="carousel-container">
      <div className="carousel" ref={ref}>
        {[...GAMES, ...GAMES].map((game, index) => (
          <GameCard key={`${game.id}-${index}`} game={game} />
        ))}
      </div>
    </div>
  )
}

type LoginModalProps = {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
}

const LoginModal = ({ isOpen, onClose, onLogin }: LoginModalProps) => {
  const { startOAuth, loading, error } = useOAuth()

  if (!isOpen) return null

  const handleOAuthLogin = async () => {
    try {
      const tokenData = await startOAuth()
      localStorage.setItem('oauth_token', JSON.stringify(tokenData))
      onLogin()
    } catch (err) {
      console.error('OAuth error:', err)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="modal-header">
          <h2>Entrar</h2>
          <p>Faça login na sua conta</p>
        </div>
        <div className="login-form">
          {error && (
            <div className="error-message" style={{ color: 'var(--accent-primary)', padding: 10, marginBottom: 20 }}>
              {error}
            </div>
          )}
          <div className="form-actions" style={{ flexDirection: 'column', gap: 12 }}>
            <button type="button" className="btn-primary" onClick={handleOAuthLogin} disabled={loading}>
              {loading ? 'Abrindo navegador...' : 'Entrar com OAuth'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

type TrackingCardProps = {
  game: GameDefinition
  isActive: boolean
}

const TrackingCard = memo(({ game, isActive }: TrackingCardProps) => (
  <div className={`tracking-card ${isActive ? 'active' : ''}`} data-game={game.id}>
    <div className="tracking-card-icon">
      {isActive && <div className="pulse-ring" />}
      <div className={`status-dot ${isActive ? 'active' : ''}`} />
    </div>
    <span className="tracking-card-name" style={{ fontFamily: game.font }}>
      {game.name}
    </span>
    {isActive && <span className="tracking-card-status">DETECTADO</span>}
  </div>
))

type OverlayButtonProps = {
  game?: GameDefinition
  onClick: () => void
}

const OverlayButton = ({ game, onClick }: OverlayButtonProps) => {
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleMouseLeave = async () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('set_window_interactive', { interactive: false })
      } catch (error) {
        console.warn('set_window_interactive (false):', error)
      }
    }, 2000)
  }

  const handleMouseEnter = async () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_window_interactive', { interactive: true })
    } catch (error) {
      console.warn('set_window_interactive (true):', error)
    }
  }

  return (
    <div className="overlay-container" data-tauri-drag-region onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button className="overlay-button" onClick={onClick} title="Abrir ProPhase">
        <div className="overlay-pulse" />
        <div className="overlay-icon">
          <span className="overlay-logo">P</span>
        </div>
        <div className="overlay-game-indicator">{game?.name?.slice(0, 3) || '...'}</div>
      </button>
    </div>
  )
}

type TrackingPageProps = {
  onBack: () => void
  detected: GameDefinition['id'] | null
  isOverlay: boolean
  onToggleOverlay: () => void
}

const TrackingPage = ({ onBack, detected, isOverlay, onToggleOverlay }: TrackingPageProps) => {
  if (isOverlay) {
    const game = detected ? GAMES.find((item) => item.id === detected) : undefined
    return <OverlayButton game={game} onClick={onToggleOverlay} />
  }

  return (
    <main className="main-content tracking-page">
      <header className="header">
        <button className="back-button" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="logo">
          <span className="logo-text">Pro</span>
          <span className="logo-accent">Phase</span>
        </div>
      </header>
      <section className="tracking-status-section">
        <div className="tracking-spinner-container">
          <div className="tracking-spinner" />
          <div className="tracking-spinner-inner" />
        </div>
        <h2 className="tracking-title">TRACKING</h2>
        <p className="tracking-subtitle">
          {detected ? `${GAMES.find((item) => item.id === detected)?.name} detectado!` : 'Aguardando jogo...'}
        </p>
      </section>
      <section className="tracking-cards-section">
        <div className="tracking-cards-grid">
          {GAMES.map((game) => (
            <TrackingCard key={game.id} game={game} isActive={detected === game.id} />
          ))}
        </div>
      </section>
    </main>
  )
}

type HomePageProps = {
  onShowLogin: () => void
}

const HomePage = ({ onShowLogin }: HomePageProps) => (
  <main className="main-content">
    <header className="header">
      <div className="logo">
        <span className="logo-text">Pro</span>
        <span className="logo-accent">Phase</span>
      </div>
    </header>
    <section className="games-section">
      <GamesCarousel />
    </section>
    <section className="cta-section">
      <div className="cta-content">
        <h1 className="cta-title">
          SUAS PARTIDAS
          <br />
          <span className="highlight">COM MAIS EMOÇÃO</span>
        </h1>
        <p className="cta-subtitle">Bora fazer tips e jogar valendo?</p>
      </div>
      <button className="cta-button" onClick={onShowLogin}>
        <span>BORA!</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  </main>
)

export default function App() {
  const [page, setPage] = useState<Page>('home')
  const [showLogin, setShowLogin] = useState(false)
  const [detected, setDetected] = useState<GameDefinition['id'] | null>(null)
  const [isOverlay, setIsOverlay] = useState(false)
  const prevDetected = useRef<GameDefinition['id'] | null>(null)
  const userOpenedMenu = useRef(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupOAuthListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('oauth-callback-url', (event) => {
          const callbackUrl = event.payload
          window.dispatchEvent(
            new CustomEvent('oauth-callback', {
              detail: { payload: callbackUrl },
            })
          )
        })
      } catch (error) {
        console.warn('OAuth listener setup error:', error)
      }
    }

    setupOAuthListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  useEffect(() => {
    const checkInitial = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const initialGame = await invoke('check_initial_game_state')
        if (typeof initialGame === 'string' && initialGame) {
          setDetected(initialGame)
          setPage('tracking')
          window.setTimeout(() => {
            setIsOverlay(true)
            void switchToOverlay()
          }, 1000)
        }
      } catch (error) {
        console.warn('check_initial_game_state:', error)
      }
    }

    checkInitial()
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    tauriEvent()
      .then(({ listen }) =>
        listen('tracker:update', (event) => {
          const payload = (event as { payload?: { game?: string } }).payload
          const game = payload && typeof payload.game === 'string' ? payload.game : null
          setDetected(game)
          if (game && page === 'home') {
            setPage('tracking')
          }
        }).then((fn) => {
          unlisten = fn
        })
      )
      .catch(() => {})

    return () => {
      unlisten?.()
    }
  }, [page])

  useEffect(() => {
    let timeoutId: number | undefined
    const isNewGame = detected && !prevDetected.current

    if (detected) {
      if (page !== 'tracking') {
        setPage('tracking')
      }

      if (isNewGame && !isOverlay) {
        userOpenedMenu.current = false
        timeoutId = window.setTimeout(() => {
          setIsOverlay(true)
          void switchToOverlay()
        }, TIMINGS.OVERLAY_AUTO_SWITCH)
      }
    } else if (!detected && prevDetected.current) {
      userOpenedMenu.current = false

      if (isOverlay) {
        timeoutId = window.setTimeout(() => {
          setIsOverlay(false)
          void switchToMain()
        }, TIMINGS.GAME_CLOSED_DELAY)
      }
    }

    prevDetected.current = detected

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
      if (window._topmostInterval) {
        window.clearInterval(window._topmostInterval)
        window._topmostInterval = null
      }
    }
  }, [detected, page, isOverlay])

  useEffect(() => {
    let timeoutId: number | undefined

    if (page === 'tracking' && detected && !isOverlay && !userOpenedMenu.current) {
      timeoutId = window.setTimeout(() => {
        setIsOverlay(true)
        void switchToOverlay()
      }, TIMINGS.OVERLAY_AUTO_SWITCH)
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [page, detected, isOverlay])

  useEffect(() => {
    return () => {
      if (window._topmostInterval) {
        window.clearInterval(window._topmostInterval)
        window._topmostInterval = null
      }
    }
  }, [])

  const toggleOverlay = async () => {
    if (isOverlay) {
      userOpenedMenu.current = true
      setIsOverlay(false)
      await switchToMain()
      return
    }
    setIsOverlay(true)
    await switchToOverlay()
  }

  const backToOverlay = async () => {
    setIsOverlay(true)
    await switchToOverlay()
  }

  return (
    <div className={`app ${isOverlay ? 'overlay-mode' : ''}`}>
      <TitleBar minimal={isOverlay} gameActive={!!detected && page === 'tracking'} onBackToOverlay={backToOverlay} />
      {page === 'home' ? (
        <HomePage onShowLogin={() => setShowLogin(true)} />
      ) : (
        <TrackingPage
          onBack={() => {
            setPage('home')
            if (isOverlay) {
              setIsOverlay(false)
              void switchToMain()
            }
          }}
          detected={detected}
          isOverlay={isOverlay}
          onToggleOverlay={toggleOverlay}
        />
      )}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={() => {
          setShowLogin(false)
          setPage('tracking')
        }}
      />
    </div>
  )
}
