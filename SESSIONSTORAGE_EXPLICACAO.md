# Uso do sessionStorage no OAuth

## 📋 Como está sendo usado

O `sessionStorage` está sendo usado para armazenar o `code_verifier` temporariamente durante o fluxo OAuth:

```javascript
// Armazena o code_verifier
sessionStorage.setItem('oauth_code_verifier', codeVerifier)

// Recupera o code_verifier
sessionStorage.getItem('oauth_code_verifier')

// Limpa após uso
sessionStorage.removeItem('oauth_code_verifier')
```

## ✅ Por que sessionStorage é adequado

1. **Temporário**: Dados são limpos quando a janela fecha
2. **Durante a sessão**: Perfeito para dados temporários do fluxo OAuth
3. **Isolado**: Não é compartilhado entre abas/janelas
4. **Simples**: Não requer configuração adicional

## ⚠️ Características

### Vantagens:
- ✅ Limpo automaticamente ao fechar a janela
- ✅ Não persiste no disco
- ✅ Isolado por origem
- ✅ Simples de usar

### Limitações:
- ⚠️ Não é criptografado
- ⚠️ Visível no DevTools (F12)
- ⚠️ Acessível via JavaScript na mesma origem

## 🔒 Segurança

**Para um fluxo OAuth PKCE, o sessionStorage é seguro porque:**

1. O `code_verifier` é temporário (apenas durante o fluxo)
2. É limpo após o uso
3. Não é enviado na rede na primeira requisição
4. O fluxo OAuth completo leva apenas alguns segundos

## 🔄 Alternativas (se necessário)

Se você quiser uma alternativa mais segura para app desktop:

### Opção 1: Variável em memória (mais seguro para desktop)
```javascript
// Armazenar em variável JavaScript (não persiste)
let codeVerifierStore = null

export async function generatePKCE() {
  const codeVerifier = generateRandomString(128)
  codeVerifierStore = codeVerifier  // Armazena em memória
  // ...
}
```

### Opção 2: Tauri Store (mais seguro, mas mais complexo)
```javascript
// Requer instalação: npm install @tauri-apps/plugin-store
import { Store } from '@tauri-apps/plugin-store'
const store = new Store('.oauth-store.json')
await store.set('code_verifier', codeVerifier)
```

## 💡 Recomendação

**Para o fluxo OAuth atual, sessionStorage é adequado porque:**

- ✅ O código é temporário (apenas durante o fluxo OAuth)
- ✅ É limpo automaticamente após uso
- ✅ O fluxo completo leva poucos segundos
- ✅ Segue as melhores práticas OAuth PKCE

**Se você quiser mudar**, a opção mais simples seria usar uma variável em memória JavaScript.
