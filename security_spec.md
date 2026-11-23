# Especificação de Segurança Firestore (Phase 0 — Controle de Acesso & RBAC)

## 1. Invariantes de Dados
1. **Acesso Restrito por Aprovação**: Somente usuários com `email_verified == true` e perfil `/users/{uid}` com `status == "aprovado"` (ou administradores verificados) podem criar, ler, atualizar ou excluir normas e atos alteradores.
2. **Prevenção de Auto-Aprovação e Escalonamento de Privilégio**: Um usuário comum jamais pode definir `status == "aprovado"` na própria criação (salvo se pré-autorizado em `/allowlist/{email}`) nem alterar `status` ou `role` em `update`. Apenas administradores podem aprovar, bloquear ou promover outros usuários.
3. **Administrador Inicial (Bootstrap)**: O administrador inicial (`joseluisblaskowskitavares@gmail.com` com `email_verified == true`) e administradores listados em `/admins/{uid}` detêm permissão de gestão sobre `/users`, `/allowlist` e `/admins`.
4. **Isolamento de PII e Listagens**: Apenas administradores podem listar `/users` e `/allowlist`; usuários comuns só podem ler o próprio perfil `/users/{request.auth.uid}` e verificar seu próprio e-mail em `/allowlist/{email}`.
5. **Integridade Temporal e de Chaves**: Todos os timestamps usam `request.time`, campos de identidade (`uid`, `ownerId`, `createdAt`) são imutáveis e `keys().hasOnly(...)` impede shadow fields.

## 2. "Dirty Dozen" Payloads Bloqueados
1. Usuário não autenticado tentando ler `/users`, `/allowlist` ou `/admins`. -> `PERMISSION_DENIED`.
2. Usuário comum recém-cadastrado tentando criar `/users/{uid}` com `status: "aprovado"` sem estar em `/allowlist`. -> `PERMISSION_DENIED`.
3. Usuário comum tentando criar `/users/{uid}` com `role: "admin"`. -> `PERMISSION_DENIED`.
4. Usuário com `status: "pendente"` tentando atualizar o próprio perfil enviando `status: "aprovado"`. -> `PERMISSION_DENIED`.
5. Usuário com `status: "pendente"` ou `"bloqueado"` tentando gravar documento em `/users/{uid}/normas/{id}` ou `/alteracoes/{id}`. -> `PERMISSION_DENIED`.
6. Usuário comum tentando ler ou listar `/users` para coletar e-mails de outros usuários. -> `PERMISSION_DENIED`.
7. Usuário comum tentando inserir seu e-mail em `/allowlist/{email}`. -> `PERMISSION_DENIED`.
8. Usuário comum tentando inserir seu UID em `/admins/{uid}`. -> `PERMISSION_DENIED`.
9. Ataque de falsificação de e-mail com `email == "joseluisblaskowskitavares@gmail.com"` e `email_verified == false`. -> `PERMISSION_DENIED`.
10. Shadow Update enviando campo extra em `/users/{uid}` ou `/allowlist/{emailKey}`. -> `PERMISSION_DENIED`.
11. Chave malformada em `/allowlist/{emailKey}` ou ID inválido em `/users/{userId}`. -> `PERMISSION_DENIED`.
12. Timestamp falsificado (`createdAt != request.time` ou alteração de `createdAt` em `update`). -> `PERMISSION_DENIED`.
