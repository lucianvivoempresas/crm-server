# Auditoria de Segurança e Integridade

Data: 2026-07-27

## Correções aplicadas

- Sessões do CRM e Energia em cookies `HttpOnly`, `Secure` em produção e
  `SameSite=Strict`.
- Segredo de sessão obrigatório e forte em produção. O servidor não inicia com
  segredo ausente, curto ou conhecido.
- Senhas novas com PBKDF2-SHA256 e 310 mil iterações. Hashes legados são
  atualizados após um login válido.
- Usuário mestre e senha padrão removidos.
- Token do Telegram removido do HTML e das respostas enviadas a vendedores.
  Chamadas ao Telegram agora partem do servidor.
- Rotas de usuários, configuração, backup e exclusão protegidas por perfil.
- Vendedores recebem e alteram apenas clientes, vendas e oportunidades do
  próprio vendedor.
- Coleções da API genérica limitadas por allowlist e propriedade do registro.
- CORS restrito, validação de origem em escritas, limites de requisição e limite
  de corpo de 10 MB.
- Cabeçalhos CSP, HSTS, anti-frame, `nosniff`, política de permissões e
  isolamento de origem.
- Arquivos de diagnóstico bloqueados em produção.
- Dependências atualizadas e `npm audit` sem vulnerabilidades conhecidas.
- `package-lock.json` incluído para instalações reproduzíveis.

## Proteção de dados

- SQLite em WAL, `synchronous=FULL`, chaves estrangeiras, espera de bloqueio e
  checkpoint automático.
- Escritas do Energia serializadas e realizadas em transação atômica.
- Controle de revisão impede que uma aba antiga sobrescreva alterações novas.
- Queda brusca de quantidade bloqueia salvamentos potencialmente destrutivos.
- Ação de apagar toda a base removida da interface e da API.
- Falha de integridade interrompe a inicialização. O servidor não recria uma
  base vazia sobre uma base corrompida.
- Backup JSON antes de escritas e periodicamente.
- Snapshots SQLite consistentes no início e periodicamente, com retenção.
- Encerramento gracioso faz checkpoint e fecha os dois bancos.
- Caminhos de banco e backup podem apontar para volumes persistentes separados.

## Ações operacionais obrigatórias

1. Revogar e gerar novamente o token do bot no BotFather. O token antigo esteve
   presente no código-fonte e deve ser considerado comprometido.
2. Criar uma única vez um `AUTH_TOKEN_SECRET` aleatório no `.env` da VPS e
   preservá-lo entre atualizações.
3. Confirmar Node.js 20.17 ou superior antes de instalar as dependências.
4. Configurar backup externo criptografado do diretório `DB_BACKUP_DIR`. Cópias
   no mesmo VPS não protegem contra perda do servidor ou ransomware.
5. Testar a restauração mensalmente e limitar acesso ao VPS, banco, `.env` e
   backups ao usuário do serviço.
6. Configurar no Nginx `client_max_body_size 10m`, TLS moderno e limitação de
   requisições. Não publicar a porta 3000 na internet.
7. Monitorar `/healthz`, falhas de integridade, reinícios do PM2, espaço em disco
   e execução dos backups.

## Riscos residuais

- O frontend legado usa JavaScript inline e dependências CDN. A CSP reduz a
  superfície, mas a migração futura para arquivos estáticos versionados e sem
  `unsafe-inline` dará proteção adicional contra XSS e indisponibilidade de CDN.
- Os bancos existentes contêm dados pessoais. Retenção, descarte, base legal,
  atendimento a titulares e registro de acessos precisam de processo
  organizacional além das proteções técnicas.
- Remover um segredo do commit atual não o remove do histórico Git. Depois da
  rotação do Telegram, avalie reescrever o histórico privado e invalidar clones
  antigos.
