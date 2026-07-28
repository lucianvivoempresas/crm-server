# Integração Chatwoot → EnergiaVolt

O endpoint `POST /api/integrations/chatwoot/leads` recebe leads de Energia
qualificados pelo Assistente Uptel Conecta.

## Segurança

- autenticação Bearer com segredo exclusivo;
- comparação do token em tempo constante;
- limite global de escritas da API;
- validação de todos os campos;
- endpoint aceita apenas oportunidades de Energia;
- a escrita usa a fila e o backup já existentes no EnergiaVolt.

Configure no `.env`:

```env
CHATWOOT_INTEGRATION_TOKEN=segredo-gerado-com-openssl
CHATWOOT_PUBLIC_URL=https://chat.voltconect.com.br
```

## Idempotência

O contato é identificado pelo ID do Chatwoot, CNPJ ou telefone. A oportunidade
é identificada pelo ID da conversa. Repetir a mesma sincronização atualiza os
campos da integração sem criar registros duplicados.

Uma oportunidade existente mantém etapa, vendedor, valor, previsão, produto e
observações editados manualmente.

## Resposta

Uma criação retorna HTTP `201`; uma atualização idempotente retorna HTTP `200`.
Falhas do CRM não bloqueiam o atendimento no Chatwoot, pois o gateway mantém
uma fila persistente e tenta novamente.
