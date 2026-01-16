import { useState, useCallback } from 'react'
import * as oauth from '../utils/oauth'
import type { OAuthTokenResponse } from '../utils/oauth'

// Configuração OAuth
const OAUTH_CONFIG = {
  clientId: 'desktop_app',
  redirectUri: 'myapp://callback', // Deep link
  authEndpoint: 'http://localhost:3000/api/auth/authorization',
  tokenEndpoint: 'http://localhost:3000/api/auth/exe-token',
}

type OAuthHookState = {
  startOAuth: () => Promise<OAuthTokenResponse>
  loading: boolean
  error: string | null
}

type OAuthCallbackDetail = {
  payload?: string
}

type OAuthCallbackEvent = CustomEvent<OAuthCallbackDetail> | Event

function getCallbackUrl(event: OAuthCallbackEvent): string {
  if ('detail' in event) {
    const detail = (event as CustomEvent<OAuthCallbackDetail>).detail
    if (detail?.payload) {
      return detail.payload
    }
    if (typeof detail === 'string') {
      return detail
    }
  }

  const payload = (event as unknown as { payload?: string }).payload
  if (typeof payload === 'string') {
    return payload
  }

  throw new Error('OAuth callback URL missing')
}

export function useOAuth(): OAuthHookState {
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const startOAuth = useCallback(async (): Promise<OAuthTokenResponse> => {
    try {
      setLoading(true)
      setError(null)

      // STEP 1: Gerar PKCE
      const { codeVerifierChallenge, codeVerifier } = await oauth.generatePKCE()

      // STEP 2: Construir URL de autorização
      const authUrl = oauth.buildAuthorizationUrl(
        codeVerifierChallenge,
        OAUTH_CONFIG.clientId,
        OAUTH_CONFIG.redirectUri,
        OAUTH_CONFIG.authEndpoint
      )

      // STEP 3: Abrir navegador
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_browser', { url: authUrl })

      // Retorna promise que será resolvida quando receber callback
      return new Promise<OAuthTokenResponse>((resolve, reject) => {
        const handleCallback = async (event: OAuthCallbackEvent) => {
          try {
            const callbackUrl = getCallbackUrl(event)

            // STEP 4: Extrair código da URL
            const code = oauth.extractCodeFromUrl(callbackUrl)

            // STEP 5: Trocar código por token
            const codeVerifier = oauth.getCodeVerifier()
            if (!codeVerifier) {
              throw new Error('Code verifier not found')
            }

            const tokenData = await oauth.exchangeCodeForToken(
              code,
              codeVerifier,
              OAUTH_CONFIG.clientId,
              OAUTH_CONFIG.redirectUri,
              OAUTH_CONFIG.tokenEndpoint
            )

            oauth.clearPKCE()
            window.removeEventListener('oauth-callback', handleCallback)
            setLoading(false)
            resolve(tokenData)
          } catch (callbackError) {
            window.removeEventListener('oauth-callback', handleCallback)
            const message =
              callbackError instanceof Error ? callbackError.message : String(callbackError)
            setError(message)
            setLoading(false)
            reject(callbackError)
          }
        }

        window.addEventListener('oauth-callback', handleCallback)

        window.setTimeout(() => {
          window.removeEventListener('oauth-callback', handleCallback)
          oauth.clearPKCE()
          setError('OAuth timeout')
          setLoading(false)
          reject(new Error('OAuth timeout'))
        }, 5 * 60 * 1000)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setLoading(false)
      oauth.clearPKCE()
      throw err
    }
  }, [])

  return {
    startOAuth,
    loading,
    error,
  }
}

