import { WINDOW_SIZES } from '../constants'

const tauriWindow = () =>
  import('@tauri-apps/api/window').then((m) => m.getCurrentWindow())

const tauriEvent = () => import('@tauri-apps/api/event')

async function applyTopmost(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_window_topmost_for_fullscreen')
  } catch (error) {
    console.warn('set_window_topmost_for_fullscreen:', error)
  }
}

export async function switchToOverlay(): Promise<void> {
  try {
    const win = await tauriWindow()
    const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi')
    const { invoke } = await import('@tauri-apps/api/core')

    await win.setSkipTaskbar(true)
    await win.setAlwaysOnTop(true)
    await win.setSize(
      new LogicalSize(WINDOW_SIZES.OVERLAY.width, WINDOW_SIZES.OVERLAY.height)
    )

    const { availWidth, availHeight } = window.screen
    await win.setPosition(
      new LogicalPosition(
        availWidth - WINDOW_SIZES.OVERLAY.width - 20,
        availHeight - WINDOW_SIZES.OVERLAY.height - 100
      )
    )

    try {
      await invoke('set_window_interactive', { interactive: true })
    } catch (error) {
      console.warn('set_window_interactive (initial):', error)
    }

    const scheduleTopmost = (delay: number) => {
      window.setTimeout(() => {
        void applyTopmost()
      }, delay)
    }

    scheduleTopmost(10)
    scheduleTopmost(50)
    scheduleTopmost(100)
    scheduleTopmost(200)
    scheduleTopmost(500)
    scheduleTopmost(1000)

    const topmostInterval = window.setInterval(() => {
      void applyTopmost()
    }, 500)

    window._topmostInterval = topmostInterval
  } catch (error) {
    console.error('switchToOverlay:', error)
  }
}

export async function switchToMain(): Promise<void> {
  try {
    const win = await tauriWindow()
    const { LogicalSize } = await import('@tauri-apps/api/dpi')
    const { invoke } = await import('@tauri-apps/api/core')

    if (window._topmostInterval) {
      window.clearInterval(window._topmostInterval)
      window._topmostInterval = null
    }

    try {
      await invoke('set_window_interactive', { interactive: true })
    } catch (error) {
      console.warn('set_window_interactive (main):', error)
    }

    await win.setAlwaysOnTop(false)
    await win.setSkipTaskbar(false)
    await win.setSize(new LogicalSize(WINDOW_SIZES.MAIN.width, WINDOW_SIZES.MAIN.height))
    await win.center()
    await win.setFocus()
  } catch (error) {
    console.error('switchToMain:', error)
  }
}

export { tauriWindow, tauriEvent }

declare global {
  interface Window {
    _topmostInterval?: number | null
  }
}
