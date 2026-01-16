# Endpoints Backend OAuth 2.0 - ProPhase

## Endpoints necessários

### 1. `/authorize` (GET)
Endpoint de autorização OAuth 2.0 com PKCE.

**Query Parameters:**
- `client_id` (string): ID do cliente (ex: "desktop_app")
- `response_type` (string): Sempre "code"
- `redirect_uri` (string): URI de callback (ex: "prophase://callback")
- `code_challenge` (string): Code challenge (base64url do SHA256 do code_verifier)
- `code_challenge_method` (string): Sempre "S256"
- `scope` (string, opcional): Escopos solicitados (ex: "openid profile email")

**Fluxo:**
1. Valida `client_id` e `redirect_uri`
2. Verifica se `code_challenge` está presente
3. Se usuário não está autenticado, redireciona para login
4. Após login bem-sucedido:
   - Gera um `authorization_code` único
   - Salva no banco de dados:
     - `code` → authorization_code
     - `client_id`
     - `redirect_uri`
     - `code_challenge`
     - `expires_at` (ex: 60 segundos)
     - `used` (boolean, inicialmente false)
     - `user_id` (opcional)
   - Redireciona para: `redirect_uri?code=AUTHORIZATION_CODE`

**Exemplo de resposta (redirect):**
```
prophase://callback?code=ABC123XYZ456
```

---

### 2. `/token` (POST)
Endpoint para trocar authorization code por access token.

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (form-urlencoded):**
- `grant_type` (string): Sempre "authorization_code"
- `code` (string): Authorization code recebido
- `redirect_uri` (string): Mesmo redirect_uri usado na autorização
- `client_id` (string): ID do cliente
- `code_verifier` (string): Code verifier original (não o challenge!)

**Validações:**
1. Verifica se `code` existe no banco
2. Verifica se `code` não foi usado (`used = false`)
3. Verifica se `code` não expirou (`expires_at > now`)
4. Verifica se `redirect_uri` e `client_id` correspondem ao código
5. **Valida PKCE:**
   - Calcula: `SHA256(code_verifier)` → base64url
   - Compara com `code_challenge` salvo
   - Se não corresponder, retorna erro
6. Marca `code` como usado (`used = true`)
7. Gera access token e refresh token
8. Retorna tokens

**Resposta de sucesso (JSON):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def50200...",
  "scope": "openid profile email"
}
```

**Resposta de erro (JSON):**
```json
{
  "error": "invalid_grant",
  "error_description": "Invalid authorization code or code verifier"
}
```

---

## Banco de Dados

### Tabela: `oauth_codes`

```sql
CREATE TABLE oauth_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  client_id VARCHAR(255) NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  user_id INTEGER, -- Opcional, se você quer associar ao usuário
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_oauth_codes_code ON oauth_codes(code);
CREATE INDEX idx_oauth_codes_expires ON oauth_codes(expires_at);
```

---

## Exemplo de implementação (Node.js/Express)

```javascript
const express = require('express');
const crypto = require('crypto');

const app = express();

// GET /authorize
app.get('/authorize', async (req, res) => {
  const { client_id, redirect_uri, code_challenge, code_challenge_method } = req.query;
  
  // Validações básicas
  if (!client_id || !redirect_uri || !code_challenge) {
    return res.status(400).send('Invalid request');
  }
  
  if (code_challenge_method !== 'S256') {
    return res.status(400).send('Only S256 supported');
  }
  
  // Se não autenticado, redireciona para login
  if (!req.session.user) {
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }
  
  // Gera authorization code
  const code = crypto.randomBytes(32).toString('hex');
  
  // Salva no banco
  await db.query(
    'INSERT INTO oauth_codes (code, client_id, redirect_uri, code_challenge, expires_at, user_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [code, client_id, redirect_uri, code_challenge, new Date(Date.now() + 60000), req.session.user.id]
  );
  
  // Redireciona com code
  res.redirect(`${redirect_uri}?code=${code}`);
});

// POST /token
app.post('/token', express.urlencoded({ extended: true }), async (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;
  
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  
  // Busca o código
  const codeData = await db.query(
    'SELECT * FROM oauth_codes WHERE code = $1',
    [code]
  );
  
  if (!codeData.rows[0]) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid code' });
  }
  
  const codeRow = codeData.rows[0];
  
  // Validações
  if (codeRow.used) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Code already used' });
  }
  
  if (new Date(codeRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired' });
  }
  
  if (codeRow.client_id !== client_id || codeRow.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Mismatch' });
  }
  
  // Valida PKCE
  const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
  if (hash !== codeRow.code_challenge) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid code verifier' });
  }
  
  // Marca como usado
  await db.query('UPDATE oauth_codes SET used = TRUE WHERE code = $1', [code]);
  
  // Gera tokens (implementar sua lógica de JWT aqui)
  const accessToken = generateAccessToken(codeRow.user_id);
  const refreshToken = generateRefreshToken(codeRow.user_id);
  
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: refreshToken,
  });
});
```

---

## Segurança

- ✅ Use HTTPS obrigatório
- ✅ Authorization codes expiram rapidamente (60s)
- ✅ Authorization codes são single-use
- ✅ Validação PKCE obrigatória
- ✅ Validação de redirect_uri
- ✅ Limpe códigos expirados periodicamente

