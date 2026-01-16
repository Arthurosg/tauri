// OAuth 2.0 com PKCE para ProPhase

type OAuthPKCE = {
  codeVerifier: string
  codeVerifierChallenge: string
}

export type OAuthTokenResponse = Record<string, unknown>

// Gerar string aleatória segura
function generateRandomString(length = 43): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length]
  }
  return result
}

// SHA256 e Base64URL encode
async function sha256Base64Url(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const base64 = btoa(String.fromCharCode(...hashArray))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// STEP 1: Gerar PKCE (code_verifier e code_challenge)
export async function generatePKCE(): Promise<OAuthPKCE> {
  const codeVerifier = generateRandomString(128)
  const codeVerifierChallenge = await sha256Base64Url(codeVerifier)
  
  // Armazena temporariamente na memória
  sessionStorage.setItem('oauth_code_verifier', codeVerifier)
  
  return {
    codeVerifier,
    codeVerifierChallenge
  }
}

// STEP 2: Construir URL de autorização
export function buildAuthorizationUrl(
  codeVerifierChallenge: string,
  clientId: string,
  redirectUri: string,
  authEndpoint: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_verifier_challenge: codeVerifierChallenge,
    code_verifier_method: 'S256',
  })
  
  return `${authEndpoint}?${params.toString()}`
}

// STEP 5: Trocar authorization code por token
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
  tokenEndpoint: string,
): Promise<OAuthTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }
  
  const data = await response.json()
  return data
}

// Extrair código da URL de callback
export function extractCodeFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const code = urlObj.searchParams.get('code')
    const error = urlObj.searchParams.get('error')
    
    if (error) {
      throw new Error(`OAuth error: ${error}`)
    }
    
    if (!code) {
      throw new Error('Authorization code missing')
    }

    return code
  } catch (e) {
    throw new Error(`Invalid callback URL: ${(e as Error).message}`)
  }
}

// Limpar dados temporários
export function clearPKCE(): void {
  sessionStorage.removeItem('oauth_code_verifier')
}

// Obter code_verifier da sessão
export function getCodeVerifier(): string | null {
  return sessionStorage.getItem('oauth_code_verifier')
}

