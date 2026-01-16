# 🔧 Correção Necessária no Backend OAuth

## ❌ Problema Encontrado

O arquivo `src/app/api/auth/authorization/route.ts` está recebendo `code_verifier` (código original), mas deveria receber `code_challenge` (código hashado).

## 🔒 Por que isso é um problema de segurança?

1. **O `code_verifier` é SECRETO** - nunca deve ser enviado na rede na primeira requisição
2. **Apenas o `code_challenge` (hashado) deve ser enviado** para o endpoint de authorization
3. **O `code_verifier` (original) só deve ser enviado no endpoint de token** após autenticação

## ✅ Fluxo Correto OAuth PKCE

```
1. Aplicativo gera:
   - code_verifier (original) → fica só no app
   - code_challenge (SHA256 do code_verifier) → é enviado

2. GET /api/auth/authorization
   Recebe: code_challenge (hashado) ✅
   Salva: code_challenge no banco ✅

3. Após login, gera authorization_code
   Redireciona: myapp://callback?code=XXX

4. POST /api/auth/exe-token
   Recebe: 
   - code (authorization code)
   - code_verifier (original, não hashado) ✅
   
   Valida:
   - SHA256(code_verifier) === code_challenge (do banco)
   - Se válido → retorna token
```

## 📝 Correções Necessárias

### 1. Atualizar Schema Prisma

O schema precisa ter um campo para `code_challenge` ao invés de `codeVerifier` no momento da authorization:

```prisma
model OAuthExe {
  id                   Int @id @default(autincrement())
  userId               Int?
  code                 String?  @unique  // authorization code (gerado após login)
  clientId             String
  redirectUri          String
  codeChallenge        String   // ✅ HASHADO (SHA256 do code_verifier)
  codeChallengeMethod  String   @default("S256")
  
  status               OAuthExeStatus @default("cookie")
  
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  expiresAt            DateTime
  
  OAuthExeAccessToken  OAuthExeAccessToken[]
  user                 Users?           @relation(fields: [userId], references: [id])
}
```

### 2. Corrigir authorization/route.ts

```typescript
import { PrismaClient } from '@/generated/prisma/client';
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
    const url = req.nextUrl;
    const client_id = url.searchParams.get("client_id");
    const response_type = url.searchParams.get("response_type");
    const redirect_uri = url.searchParams.get("redirect_uri");
    const code_challenge = url.searchParams.get("code_challenge"); // ✅ HASHADO
    const code_challenge_method = url.searchParams.get("code_challenge_method");
    
    // 1️⃣ Validações mínimas
    if (
        !client_id ||
        response_type !== "code" ||
        !redirect_uri ||
        !code_challenge || // ✅ Recebe code_challenge (hashado)
        code_challenge_method !== "S256"
    ) {
        return NextResponse.json(
            { error: "invalid_request" },
            { status: 400 }
        );
    }

    // 2️⃣ Valida o client
    if (client_id !== "desktop_app") {
        return NextResponse.json(
            { error: "unauthorized_client" },
            { status: 401 }
        );
    }

    // 3️⃣ Valida redirect_uri
    if (redirect_uri !== "myapp://callback") {
        return NextResponse.json(
            { error: "invalid_redirect_uri" },
            { status: 400 }
        );
    }

    // ✅ Salva code_challenge (hashado) no banco
    await prisma.oAuthExe.create({
        data: {
            clientId: client_id,
            redirectUri: redirect_uri,
            codeChallenge: code_challenge, // ✅ HASHADO
            codeChallengeMethod: code_challenge_method,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
        }
    });
        
    // 4️⃣ Redireciona para login
    const res = NextResponse.redirect(`${req.nextUrl.origin}/signIn`);
    
    // Armazena referência na sessão (cookie)
    res.cookies.set("oauth_session", JSON.stringify({
        client_id,
        redirect_uri,
        code_challenge, // ✅ HASHADO (não o original!)
    }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 300, // 5 min
    });
    
    return res;
}
```

### 3. Após Login - Gerar Authorization Code

No código de login, após autenticação bem-sucedida:

```typescript
// 1. Buscar o OAuthExe pendente (por cookie ou session)
const oAuthExe = await prisma.oAuthExe.findFirst({
    where: {
        status: "cookie",
        expiresAt: { gt: new Date() }
    }
});

// 2. Gerar authorization code
const authorizationCode = crypto.randomBytes(32).toString('hex');

// 3. Atualizar registro com code e user
await prisma.oAuthExe.update({
    where: { id: oAuthExe.id },
    data: {
        code: authorizationCode,
        userId: user.id,
        status: "pending"
    }
});

// 4. Redirecionar com code
redirect(`${oAuthExe.redirectUri}?code=${authorizationCode}`);
```

### 4. Corrigir exe-token/route.ts

```typescript
import { PrismaClient } from '@/generated/prisma/client';
import { NextRequest, NextResponse } from "next/server";
import crypto from 'crypto';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        const params = await req.json();
        const { code, code_verifier } = params; // ✅ code_verifier ORIGINAL

        if (!code || !code_verifier) {
            return NextResponse.json({ message: 'Missing code or code_verifier' }, { status: 400 });
        }

        // 1. Buscar o OAuthExe pelo code
        const oAuthExe = await prisma.oAuthExe.findFirst({
            where: {
                code: code,
                status: "pending",
                expiresAt: {
                    gt: new Date()
                }
            }
        });

        if (!oAuthExe) {
            return NextResponse.json({ message: 'Invalid or expired code' }, { status: 400 });
        }

        // 2. ✅ VALIDAR PKCE: SHA256(code_verifier) === code_challenge
        const hash = crypto.createHash('sha256').update(code_verifier).digest('base64url');
        
        if (hash !== oAuthExe.codeChallenge) {
            return NextResponse.json({ message: 'Invalid code_verifier' }, { status: 400 });
        }

        // 3. Gerar access token
        const accessToken = await prisma.$transaction(async (tx) => {
            try {
                // Gerar access token
                const token = crypto.randomBytes(32).toString('hex');

                // Salvar access token
                await tx.oAuthExeAccessToken.create({
                    data: {
                        token: token,
                        clientId: oAuthExe.clientId,
                        oAuthExeId: oAuthExe.id,
                        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hora
                    }
                });

                // Marcar o código como usado
                await tx.oAuthExe.update({
                    where: { id: oAuthExe.id },
                    data: { status: "used" }
                });

                return token;
            } catch (error) {
                await tx.oAuthExe.update({
                    where: { id: oAuthExe.id },
                    data: { status: "error" }
                });
                throw error;
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: 'Access token generated successfully', 
            access_token: accessToken 
        }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ 
            success: false, 
            message: 'Erro ao processar requisição', 
            error: error.message 
        }, { status: 500 });
    }
}
```

## 📋 Resumo das Mudanças

1. ✅ **Schema Prisma**: Mudar `codeVerifier` para `codeChallenge`
2. ✅ **authorization/route.ts**: Receber `code_challenge` (hashado) ao invés de `code_verifier`
3. ✅ **exe-token/route.ts**: Validar PKCE: `SHA256(code_verifier) === code_challenge`
4. ✅ **Login**: Após login, gerar `authorization_code` e atualizar o registro

## 🔒 Segurança

- ✅ `code_verifier` (original) nunca vai na rede na primeira requisição
- ✅ Apenas `code_challenge` (hashado) é enviado para authorization
- ✅ `code_verifier` (original) só é enviado no token endpoint
- ✅ Validação PKCE garante que não foi interceptado
