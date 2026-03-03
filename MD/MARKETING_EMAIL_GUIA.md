# 📧 Guia Completo: Email Marketing CRM

## 🎯 O Que Você Pode Fazer

A aba **Marketing** permite você:
- ✅ Enviar emails de marketing automaticamente para seus clientes
- ✅ Selecionar clientes específicos ou todos da carteira
- ✅ Usar templates pré-definidos ou criar mensagens personalizadas
- ✅ Personalizar emails com o nome de cada cliente
- ✅ Visualizar histórico completo de campanhas
- ✅ Rastrear status de entrega

---

## 🔧 Configuração Inicial

### Opção 1: Usar Gmail (Recomendado para Desenvolvimento)

#### Passo 1: Habilitar "Senhas de App" no Gmail

1. Acesse: https://myaccount.google.com
2. Clique em "Segurança" (lado esquerdo)
3. Procure por "Senhas de app" (no final da página)
4. Selecione **Mail** e **Windows**
5. Google gera uma senha de 16 caracteres
6. Copie e guarde essa senha

#### Passo 2: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na pasta raiz do projeto:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app-16-caracteres
```

**Exemplo completo:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=meu-crm@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

#### Passo 3: Usar no Código

O servidor lerá automaticamente essas variáveis quando iniciar.

---

### Opção 2: Usar Outlook/Hotmail

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=seu-email@hotmail.com
SMTP_PASS=sua-senha-outlook
```

---

### Opção 3: Usar SMTP Customizado (SendGrid, Mailgun, Brevo, etc.)

Para SendGrid:
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=seu-api-key-sendgrid
```

---

## 🚀 Como Usar a Aba Marketing

### 1️⃣ Acessar a Aba Marketing

Após fazer login no CRM, clique na aba **🚀 Marketing** na navegação superior.

### 2️⃣ Selecionar Clientes

**Coluna Esquerda:**
- Busque clientes pelo nome ou email
- Marque a checkbox de cada cliente desejado
- Use "Selecionar Todos" para marcar todos
- Veja o contador de clientes selecionados

### 3️⃣ Compor o Email

**Coluna Direita:**
- **Assunto**: Escreva um assunto atrativo
- **Usar Template**: Escolha um template pré-definido (opcional)
- **Corpo**: Escreva sua mensagem

#### Personalizando com {{nome}}

Use `{{nome}}` para adicionar o nome de cada cliente automaticamente:

```
Olá {{nome}},

Temos uma oferta especial esperando por você!

Atenciosamente,
Sua Equipe
```

**Resultado para cada cliente:**
```
Olá João Silva,

Temos uma oferta especial esperando por você!

Atenciosamente,
Sua Equipe
```

### 4️⃣ Templates Disponíveis

Clique na aba **Templates** para ver opções prontas:

| Template | Descrição | Ideal Para |
|----------|-----------|-----------|
| 🎁 Promoção Especial | Ofertas exclusivas | Campanhas de desconto |
| 🆕 Novo Produto | Apresentar nova solução | Lançamentos |
| 👋 Acompanhamento | Manter contato | Pós-venda, relacionamento |
| 💰 Oferta Limitada | Criar urgência | Ofertas com prazo |

### 5️⃣ Preview antes de Enviar

- **Preview Automático**: Veja como o email será no primeiro cliente
- **Preview Detalhado**: Clique em "Preview Detalhado" para ver todos os clientes

### 6️⃣ Enviar!

1. Selecione clientes ✅
2. Preencha assunto e corpo ✅
3. Revise o preview ✅
4. Clique em **"Enviar Emails"** 🚀

---

## 📊 Histórico de Campanhas

Na aba **Histórico**, você pode:

- Ver todas as campanhas enviadas
- Data de envio
- Número de destinatários
- Total de emails entregues
- Status da campanha
- Detalhes individuais de cada envio

---

## 💡 Dicas Importantes

### ✅ Melhores Práticas

1. **Subject Lines Boas:**
   - "🎁 Promoção Especial para Você!" ✅
   - "CLIQUE AQUI AGORA!!!" ❌

2. **Corpo do Email:**
   - Direto ao ponto ✅
   - Muito longo ❌
   - Com CTA (Call to Action) claro ✅

3. **Personalization:**
   - Sempre use {{nome}} ✅
   - Faz grande diferença na taxa de abertura

4. **Frequência:**
   - 1-2 emails por semana ✅
   - 5+ emails por semana = muitos bounces ❌

### ⚠️ Limitações de Email

- **Gmail**: Máx 300 emails/dia de uma conta gratuita
- **Outlook**: Máx 300 emails/dia
- **SendGrid**: Depende do plano

### 🚫 O Que Evitar

- ❌ Spam ou emails com muitos "!"
- ❌ Links maliciosos
- ❌ Sem opção de unsubscribe (legalmente obrigatório em alguns países)
- ❌ Muitos clientes em cópia (sempre personalizar)

---

## 🔐 Segurança

### Sua Senha é Segura?

✅ **Sim, porque:**
- Não é armazenada em texto plano
- Só usa variáveis de ambiente
- Nunca é enviada ao frontend
- Só existe no servidor

### Dados dos Clientes

✅ **Protegidos:**
- Armazenados localmente no SQLite
- Nunca compartilhados com terceiros
- Você tem controle total

---

## 🐛 Solução de Problemas

### "Email não configurado"

**Causa:** Variáveis de ambiente não definidas

**Solução:**
1. Crie arquivo `.env` na raiz do projeto
2. Adicione credenciais SMTP
3. Reinicie o servidor

### "Erro ao enviar emails"

**Causas possíveis:**
- Credenciais incorretas
- Firewall bloqueando smtp
- Email inválido do cliente

**Solução:**
1. Verifique credenciais no `.env`
2. Teste com um email válido seu
3. Valide emails dos clientes

### "Emails não chegando"

**Causas:**
- Spam folder (muito comum!)
- Email inválido
- Domínio bloqueado

**Solução:**
1. Peça ao cliente verificar spam
2. Teste enviando para você mesmo
3. Use template profissional

---

## 📈 Como Começar

### Primeiro Email (Teste)

```
Assunto: Teste - Olá {{nome}}!

Corpo:
Oi {{nome}},

Este é um teste do nosso novo sistema de marketing.

Se recebeu, ótimo! Isso significa tudo está funcionando.

Abraços,
Sua Empresa
```

1. Selecione apenas você como cliente
2. Clique em "Enviar Emails"
3. Verifique seu inbox e spam

### Segunda Campanha (Realmente)

Depois que o primeiro teste funcionar:
1. Crie uma mensagem atrativa
2. Use um template como base
3. Selecione seu público-alvo
4. Envie!

---

## 🔗 Recursos Úteis

### Gerar Senhas de App Google
https://myaccount.google.com/apppasswords

### Tutoriais de Email Marketing
- Como escrever subject lines boas
- Taxa típica de abertura: 15-25%
- Taxa de clique: 2-5%

### Serviços de Email SMTP
- **SendGrid**: sendgrid.com (gratuito até 100 emails/dia)
- **Mailgun**: mailgun.com
- **Brevo**: brevo.com (antigo Sendinblue)

---

## ❓ Perguntas Frequentes

**P: Posso enviar para muitos clientes de uma vez?**
R: Sim! Selecione todos e envie. Mas respeite os limites do seu provedor.

**P: Como editar um email depois de enviar?**
R: Não é possível editar, mas você pode enviar um email de correção.

**P: Posso agendar emails para depois?**
R: Agora envia imediatamente. Futuras versões terão agendamento.

**P: Quanto custa?**
R: Gratuito! Você só paga pelo serviço SMTP (Gmail é grátis até 300/dia).

**P: E-mail é seguro contra hackers?**
R: Seus emails são cifrados em trânsito. A senha nunca fica em texto plano.

---

## 🎓 Próximos Passos

1. ✅ Configure suas credenciais de email
2. ✅ Envie um teste para você
3. ✅ Crie sua primeira campanha real
4. ✅ Acompanhe no histórico

---

**Precisando de ajuda?** Verifique os logs do servidor ou entre em contato! 📞

