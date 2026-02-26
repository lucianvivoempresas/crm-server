# 📤 Guia: Upload do Projeto para GitHub

Este guia fornece instruções passo a passo para fazer upload do seu projeto CRM Vendas Pro para o GitHub.

## 📋 Pré-requisitos

1. **Git instalado** - [Baixar aqui](https://git-scm.com/download/win)
2. **Conta GitHub** - [Criar em github.com](https://github.com/signup)
3. **Git configurado** - Execute no terminal:
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu.email@example.com"
```

## 🔑 Passo 1: Criar um Novo Repositório no GitHub

1. Acesse [github.com/new](https://github.com/new)
2. **Repository name:** `crm-vendas-pro` (ou seu nome preferido)
3. **Description:** "Sistema de CRM com Gestão de Vendas, Comissões e Integração CNPJ Brasil"
4. **Visibility:** 
   - `Public` - Se quer compartilhar publicamente
   - `Private` - Se quer manter privado
5. **Não marque** "Initialize with README" (já criamos)
6. Clique em **"Create repository"**

## 💻 Passo 2: Inicializar Git Localmente

Abra o PowerShell ou CMD na pasta do projeto (`c:\crm-server`) e execute:

```bash
# Inicie um repositório Git local
git init

# Adicione todos os arquivos
git add .

# Crie o primeiro commit
git commit -m "Initial commit: CRM Vendas Pro com integração CNPJ Brasil"
```

## 🔗 Passo 3: Conectar ao Repositório GitHub

No GitHub, após criar o repositório, você verá instruções. Execute:

```bash
# Renomeie a branch para 'main' (se necessário)
git branch -M main

# Adicione o repositório remoto (copie a URL do seu repositório)
git remote add origin https://github.com/SEU_USUARIO/crm-vendas-pro.git

# Faça push da primeira vez
git push -u origin main
```

**Importante:** Substitua `SEU_USUARIO` pelo seu usuário do GitHub.

## 🔐 Passo 4: Autenticação (Token de Acesso Pessoal)

Se o Git pedir autenticação:

### Opção A: Token de Acesso Pessoal (Recomendado)

1. Vá em [github.com/settings/tokens](https://github.com/settings/tokens)
2. Clique em **"Generate new token"** → **"Generate new token (classic)"**
3. Configure:
   - **Note:** "CRM Vendas Pro"
   - **Expiration:** 90 days
   - **Scopes:** Marque `repo` (completo)
4. Clique em **"Generate token"**
5. **Copie o token ao ser exibido** (não será mostrado novamente)
6. Quando Git pedir senha, **use este token como senha**

### Opção B: SSH (Alternativa)

Siga [este guia do GitHub](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

## 📤 Passo 5: Validar Upload

1. Acesse seu repositório em `https://github.com/SEU_USUARIO/crm-vendas-pro`
2. Verifique que todos os arquivos aparecem:
   - `public/` com todos os arquivos JS
   - `package.json`
   - `README.md`
   - `.gitignore`
   - `LICENSE`
   - Etc.

## 🔄 Próximas Atualizações

Após o primeiro upload, use estes comandos para atualizações:

```bash
# Ver o status dos arquivos
git status

# Adicione mudanças
git add .

# Commit com mensagem descritiva
git commit -m "Fix: Melhorias na API CNPJ"

# Push para GitHub
git push origin main
```

## 📝 Boas Práticas de Commits

```bash
# Formato recomendado:
git commit -m "feat: Adiciona nova feature"
git commit -m "fix: Corrige bug no CNPJ"
git commit -m "docs: Atualiza documentação"
git commit -m "refactor: Limpa código"
```

## ⚙️ Configurações Úteis

### Adicionar Descrição ao Repositório

1. Na página do repositório, clique em ⚙️ **Settings**
2. Em "About", adicione:
   - **Description:** "CRM com gestão de vendas, comissões e integração CNPJ"
   - **Website:** (opcional)
   - **Topics:** `crm`, `express`, `sqlite`, `cnpj`, `javascript`

### Adicionar Badge ao README

Opcionalmente, adicione badges ao início do README:

```markdown
![GitHub](https://img.shields.io/badge/GitHub-CRM%20Vendas%20Pro-blue?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-14+-green?style=flat-square)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
```

## 🤖 Workflows Úteis (Opcional)

Para adicionar verificações automáticas, crie `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm test
```

## 🎯 Checklist Final

Antes de fazer o push final, verifique:

- [x] `.gitignore` está configurado (node_modules, *.sqlite, .env)
- [x] `README.md` está completo
- [x] `LICENSE` foi adicionado
- [x] `package.json` tem todas as dependências
- [x] Não há senhas/tokens no código
- [x] Não há arquivo `crm_database.sqlite` (será ignorado)
- [x] Todos os arquivos necessários estão inclusos

## 🆘 Troubleshooting

### "fatal: remote repository not found"
```bash
# Verifique a URL
git remote -v

# Se incorreta, atualize:
git remote set-url origin https://github.com/SEU_USUARIO/crm-vendas-pro.git
```

### "Permission denied (publickey)"
- Se usar SSH, gere uma chave SSH seguindo o [guia GitHub](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
- Se usar HTTPS, use um token de acesso pessoal

### "Changes not staged for commit"
```bash
# Adicione as mudanças
git add .

# Depois faça commit
git commit -m "sua mensagem"
```

### "Your branch is ahead of 'origin/main' by 1 commit"
```bash
# Faça push das mudanças
git push origin main
```

## 📚 Recursos Adicionais

- [GitHub Docs](https://docs.github.com)
- [Git Cheat Sheet](https://github.github.com/training-kit/downloads/github-git-cheat-sheet.pdf)
- [How to Write Good Commits](https://cbea.ms/git-commit/)

## ✅ Pronto!

Seu projeto está agora no GitHub e pronto para:
- Compartilhar com outras pessoas
- Colaboração em equipe
- Controle de versão
- Backup na nuvem

**Parabéns! 🎉**

---

**Dúvidas?** Verifique a [documentação oficial do GitHub](https://docs.github.com/en/get-started)
