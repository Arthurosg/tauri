# Fluxo OAuth 2.0 com PKCE - Explicação Detalhada

## ✅ Como o código atual funciona

### PASSO 1: Aplicativo gera código hashado (PKCE)

```javascript
// src/utils/oauth.js - generatePKCE()

1. Gera code_verifier (código original aleatório - 128 caracteres)
   └─> Fica APENAS no aplicativo (sessionStorage)
   └─> NUNCA é enviado na rede

2. Cria code_challenge (hash SHA256 do code_verifier)
   └─> Este é o código HASHADO/ENCAPSULADO
   └─> É enviado para o endpoint de autorização
```

**O que acontece:**
- `code_verifier`: Código original secreto (fica só no app)
- `code_challenge`: Hash SHA256 do `code_verifier` (é enviado)

### PASSO 2: Aplicativo chama endpoint de autorização

```
GET /api/auth/authorization?
  client_id=desktop_app&
  response_type=code&
  redirect_uri=myapp://callback&
  code_challenge=HASH_AQUI&  ← Código HASHADO (não o original!)
  code_challenge_method=S256
```

**O que é enviado:**
- ✅ `code_challenge` (hashado) - código encapsulado
- ❌ `code_verifier` (original) - NÃO é enviado, fica só no app

### PASSO 3: Site valida e redireciona

O site (backend) recebe:
- `code_challenge` (hashado)
- Armazena no banco de dados
- Redireciona para login

Após login, o site:
- Detecta que é login de executável
- Gera um `authorization_code`
- Redireciona: `myapp://callback?code=AUTHORIZATION_CODE`

### PASSO 4: Aplicativo recebe callback

Quando o aplicativo recebe o callback:
```javascript
// src/utils/oauth.js - processCallbackAndExchangeToken()

1. Extrai o authorization_code da URL
2. Pega o code_verifier ORIGINAL do sessionStorage
3. Chama endpoint de token enviando:
   - authorization_code (recebido do site)
   - code_verifier ORIGINAL (para validação)
```

### PASSO 5: Aplicativo chama endpoint de token

```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTHORIZATION_CODE&              ← Recebido do site
code_verifier=CODIGO_ORIGINAL_AQUI&   ← Código ORIGINAL (não hashado!)
client_id=desktop_app&
redirect_uri=myapp://callback
```

**O que é enviado:**
- ✅ `authorization_code` (recebido do site)
- ✅ `code_verifier` (ORIGINAL, não hashado) - para validação no backend

### PASSO 6: Backend valida segurança

O backend recebe:
1. `authorization_code` - código gerado pelo site
2. `code_verifier` - código original do app
3. Busca no banco o `code_challenge` que foi armazenado

**Validação no backend:**
```
1. Pega o code_challenge do banco (que foi salvo no passo 2)
2. Faz SHA256 do code_verifier recebido
3. Compara: SHA256(code_verifier) === code_challenge?
4. Se sim → válido, retorna token
5. Se não → erro de segurança
```

## 🔒 Segurança

### Por que é seguro?

1. **Code verifier NUNCA vai na rede na primeira requisição**
   - Apenas o hash (code_challenge) é enviado
   - Se alguém interceptar, só vê o hash, não o código original

2. **Code verifier só é enviado após autenticação**
   - Só é enviado na troca por token
   - Já existe uma conexão segura estabelecida

3. **Backend valida o hash**
   - Backend compara: SHA256(code_verifier) === code_challenge salvo
   - Se não bater, significa que foi interceptado ou modificado

## 📝 Resumo do Fluxo

```
┌─────────────┐
│  APLICATIVO │
└──────┬──────┘
       │
       │ 1. Gera code_verifier (original)
       │    Gera code_challenge (hashado)
       │    └─> code_verifier fica no sessionStorage
       │
       │ 2. Envia code_challenge (hashado) para /api/auth/authorization
       ▼
┌─────────────┐
│    SITE     │
└──────┬──────┘
       │
       │ 3. Valida parâmetros
       │    Salva code_challenge no banco
       │    Redireciona para login
       │
       │ 4. Após login, gera authorization_code
       │    Redireciona: myapp://callback?code=XXX
       ▼
┌─────────────┐
│  APLICATIVO │
└──────┬──────┘
       │
       │ 5. Recebe authorization_code
       │    Pega code_verifier (original) do sessionStorage
       │
       │ 6. Envia para /api/oauth/token:
       │    - authorization_code
       │    - code_verifier (ORIGINAL, não hashado)
       ▼
┌─────────────┐
│   BACKEND   │
└──────┬──────┘
       │
       │ 7. Valida segurança:
       │    SHA256(code_verifier) === code_challenge (do banco)?
       │
       │ 8. Se válido → retorna access_token
       ▼
┌─────────────┐
│  APLICATIVO │
└─────────────┘
   Recebe token!
```

## ✅ Status do Código

O código atual **já está implementado corretamente**:

- ✅ Gera `code_verifier` (original) e `code_challenge` (hashado)
- ✅ Armazena `code_verifier` apenas no sessionStorage
- ✅ Envia apenas `code_challenge` (hashado) para autorização
- ✅ Quando recebe callback, pega `code_verifier` do sessionStorage
- ✅ Envia `code_verifier` ORIGINAL para endpoint de token

**Aguardando apenas os endpoints corretos do backend!**
