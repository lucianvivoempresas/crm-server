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

## Simulação de energia

Quando o payload contém `lead.energySimulation`, o CRM salva na oportunidade:

- detalhamento por estado e unidade;
- consumos usados e média em kWh;
- desconto-base, PIS/COFINS e desconto final;
- valor compensável e conta estimada;
- economia mensal e anual;
- validade e necessidade de avaliação humana.

Esses campos complementam a oportunidade sem alterar manualmente etapa,
vendedor, valor ou observações.

## Resposta

Uma criação retorna HTTP `201`; uma atualização idempotente retorna HTTP `200`.
Falhas do CRM não bloqueiam o atendimento no Chatwoot, pois o gateway mantém
uma fila persistente e tenta novamente.

Cada nova oportunidade também cria um follow-up interno de alta prioridade.
Esse follow-up exige aprovação humana e nunca envia mensagem automaticamente
ao cliente.
