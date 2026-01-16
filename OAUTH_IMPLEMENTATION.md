# Implementação OAuth 2.0 com PKCE - ProPhase

## ✅ O que foi implementado

### Frontend (Tauri + React)

1. **`src/utils/oauth.js`**
   - Geração de PKCE (code_verifier e code_challenge)
   - Construção da URL de autorização
   - Troca de authorization code por token
   - Funções auxiliares para gerenciar PKCE

2. **`src/hooks/useOAuth.js`**
   - Hook React para gerenciar fluxo OAuth
   - Estado de loading e error
   - Integração com Tauri para abrir navegador
   - Listener para deep link callback

3. **`src/App.jsx`**
   - Listener para eventos de deep link do Tauri
   - Modal de login atualizado para usar OAuth
   - Integração completa do fluxo

### Backend (Rust)

1. **`src-tauri/src/main.rs`**
   - Comando `open_browser`: Abre navegador com URL de autorização
   - Comando `handle_oauth_callback`: Handler para deep link
   - Listener para protocolo `prophase://`

2. **`src-tauri/tauri.conf.json`**
   - Configuração de protocol handler: `prophase://`

3. **`src-tauri/Cargo.toml`**
   - Dependência `open` para abrir navegador

---

## 📋 Configuração necessária

### 1. Atualizar endpoints OAuth

Edite `src/hooks/useOAuth.js`:

```javascript
const OAUTH_CONFIG = {
  clientId: 'seu_client_id', // Seu client ID do backend
  redirectUri: 'prophase://callback', // Deep link (não mude isso)
  authEndpoint: 'https://seu-backend.com/authorize', // Seu endpoint de autorização
  tokenEndpoint: 'https://seu-backend.com/token', // Seu endpoint de token
}
```

### 2. Registrar protocol handler no Windows

O Tauri automaticamente registra o protocolo `prophase://` quando o app é instalado.

**Para testar durante desenvolvimento:**
- Windows: Execute como administrador na primeira vez para registrar o protocolo

### 3. Configurar backend

Veja `BACKEND_ENDPOINTS.md` para detalhes completos dos endpoints necessários.

---

## 🔄 Fluxo completo

```
1. Usuário clica "Entrar com OAuth"
   ↓
2. App gera PKCE:
   - code_verifier (aleatório, fica na memória)
   - code_challenge (SHA256 base64url do verifier)
   ↓
3. App abre navegador com URL:
   https://api.meusite.com/authorize?
     client_id=desktop_app&
     response_type=code&
     redirect_uri=prophase://callback&
     code_challenge=HASH&
     code_challenge_method=S256
   ↓
4. Usuário faz login no site (navegador)
   ↓
5. Backend gera authorization_code e redireciona:
   prophase://callback?code=ABC123
   ↓
6. Sistema operacional abre o app via protocol handler
   ↓
7. App recebe callback, extrai código
   ↓
8. App troca código por token:
   POST /token
   Body: code=ABC123&code_verifier=ORIGINAL&client_id=...
   ↓
9. Backend valida PKCE e retorna tokens
   ↓
10. App armazena token e finaliza login
```

---

## 🧪 Como testar

1. **Configure os endpoints** no `useOAuth.js`

2. **Inicie o app:**
   ```bash
   npm run tauri:dev
   ```

3. **Clique em "BORA!" na tela inicial**

4. **Clique em "Entrar com OAuth"**

5. **O navegador deve abrir** com a URL de autorização

6. **Faça login** no site

7. **O app deve receber o callback** e finalizar o login

---

## 🔒 Segurança

✅ PKCE implementado corretamente
✅ Code verifier nunca sai do app
✅ HTTPS obrigatório no backend
✅ Authorization codes são single-use
✅ Tokens armazenados em localStorage (considere usar secure storage)

---

## 📝 Próximos passos

1. Implementar refresh token
2. Adicionar logout
3. Usar secure storage para tokens (Tauri Store ou similar)
4. Adicionar tratamento de erros mais robusto
5. Implementar refresh automático de tokens

---

## 🐛 Troubleshooting

### Deep link não funciona
- Certifique-se que o protocolo foi registrado
- No Windows, pode precisar executar como admin na primeira vez
- Verifique se `prophase://callback` está configurado corretamente

### Callback não recebido
- Verifique os logs do console
- Certifique-se que o backend está redirecionando para `prophase://callback?code=...`
- Verifique se o listener está configurado no App.jsx

### Erro de PKCE
- Verifique se o code_verifier está sendo salvo corretamente
- Certifique-se que o backend está validando o PKCE corretamente

