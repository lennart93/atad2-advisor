# CLAUDE.md — ATAD2 Advisor Project

## Over dit project
Dit is de ATAD2 Advisor applicatie van Lennart Wilming (Manager, Svalner Atlas Advisors, Amsterdam). Het is een tool voor het uitvoeren van ATAD2 compliance assessments voor belastingadvisering.

De repo is: https://github.com/lennart93/atad2-advisor

## Azure infrastructuur
- **Subscription**: `adn-atad2-prod` (ID: 791c975c-25ca-4727-9ceb-cc0acecc2626)
- **Resource group**: `rg-atad2-prod`
- **App Service**: `app-atad2-prod` (https://app-atad2-prod.azurewebsites.net)
  - Runtime: Node 22 LTS, Linux
  - Plan: Premium V3 (P0v3)
  - Startup Command: `pm2 serve /home/site/wwwroot --no-daemon --spa`
  - Deployment: GitHub Actions via `lennart93/atad2-advisor`
- **Virtual Machine**: ATAD2 (Ubuntu 24.04, 135.225.104.142)
  - Self-hosted Supabase (14 Docker containers)
  - n8n workflow engine
- **DNS**: api.atad2.tax, n8n.atad2.tax → VM IP (IONOS)
- **SSL**: Let's Encrypt certs via nginx op de VM

## Self-hosted Supabase (op VM)
- **API URL**: https://api.atad2.tax (nginx reverse proxy → localhost:8000)
- **Studio**: http://135.225.104.142:3000
- **Anon Key**: eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE2NDE3NjkyMDAsICJleHAiOiAxNzk5NTM1NjAwfQ.rnsxsFRAvsoKzOta2QUNb7D_nzd4erNRN4WyqBw99UY
- **Database**: Alle data gemigreerd vanuit cloud Supabase, inclusief 3497 vector embeddings

## n8n (op VM)
- **URL**: https://n8n.atad2.tax
- **Webhook**: https://n8n.atad2.tax/webhook/atad2/generate-report
- **Credentials**: Supabase API, Azure OpenAI, Anthropic Chat Model

## Deployment
- GitHub Actions workflow (`.github/workflows/deploy.yml`)
- Bij push naar main: checkout → override URLs → npm build → clean wwwroot → deploy via azure/webapps-deploy
- De workflow overschrijft `client.ts` en n8n URLs voor self-hosted configuratie
- **BELANGRIJK**: De startup command in Azure moet `pm2 serve /home/site/wwwroot --no-daemon --spa` zijn (NIET wwwroot/dist)

## Tech stack
- Frontend: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase (self-hosted op Azure VM)
- AI: n8n workflows met Azure OpenAI + Anthropic
- Database: PostgreSQL met pgvector (v0.8.0)
- Auth: Supabase Auth met Resend SMTP (OTP-only)

## Lokaal draaien
```bash
npm install
npm run dev
```

## Belangrijke paden op de VM
```
~/supabase/docker/              # Supabase Docker setup
~/atad2-advisor/                # App source (backup)
/etc/nginx/sites-available/     # Nginx configs voor api + n8n
```
