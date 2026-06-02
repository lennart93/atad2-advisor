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
- **Virtual Machine**: `adn-x-s-5` (Ubuntu 24.04, 135.225.104.142, Sweden Central)
  - Friendly naam in documentatie: ATAD2; Azure-resource-naam = `adn-x-s-5`
  - Self-hosted Supabase (14 Docker containers, draaien onder root)
  - n8n workflow engine
  - SSH vanaf buiten geblokkeerd; gebruik `az vm run-command invoke --command-id RunShellScript` voor remote uitvoering (zie sectie Deployment naar self-hosted Supabase)
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
Run-command voert uit als `root`, dus paden zijn absoluut vanaf `/root/`.
```
/root/supabase-docker/                              # ACTIEVE compose root (let op: DASH, geen slash)
/root/supabase-docker/volumes/functions/<name>/     # ACTIEVE edge function code (BIND-mount in supabase-edge-functions)
/root/supabase/docker/volumes/functions/            # SHADOW-folder — bestaat maar wordt nergens gemount. NIET hier deployen.
/home/azureuser/supabase/docker/volumes/functions/  # Andere oude variant — ook NIET gebruiken
/root/atad2-advisor/                                # App source (gebruikt voor migraties + edge function rsync)
/etc/nginx/sites-available/                         # Nginx configs voor api + n8n
```
**LET OP**: de mount-source van `supabase-edge-functions` is `/root/supabase-docker/volumes/functions` (dash, geen slash). Verifieer altijd met `docker inspect supabase-edge-functions --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'` voor je rsync. Een eerdere fout-deploy in deze repo synct naar `/root/supabase/docker/...` (slash) — dat is een SHADOW-folder die door niets wordt gelezen.

## Deployment naar self-hosted Supabase
Geen Supabase CLI tegen de VM — alles gaat via `az vm run-command` (run-command voert uit als root).

**DB-migraties** — tabellen zijn eigendom van `supabase_admin`, NIET `postgres`:
```bash
docker exec -i $(docker ps --filter name=supabase-db -q) \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/<file>.sql
```
ALTER TABLE / INSERT into atad2_prompts faalt met "must be owner of table ..." als je `-U postgres` gebruikt.

**Edge functions** — sync de map en herstart de container. Gebruik de DASH-path (`supabase-docker`), niet de slash-path:
```bash
rsync -av --delete /root/atad2-advisor/supabase/functions/<name>/ \
  /root/supabase-docker/volumes/functions/<name>/
docker restart $(docker ps --filter name=supabase-edge-functions -q)
```
Controleer altijd na deploy dat het écht binnen de container is geland:
```bash
md5sum /root/atad2-advisor/supabase/functions/<name>/analyze.ts
docker exec supabase-edge-functions md5sum /home/deno/functions/<name>/analyze.ts
# beide moeten gelijk zijn
```

**Hele flow vanaf je workstation (Windows, Powershell of bash):**
```bash
# 1. Schrijf je shell-commands naar een file (quoting via --scripts inline breekt op Windows)
# 2. Voer uit op de VM:
az vm run-command invoke \
  --resource-group rg-atad2-prod --name adn-x-s-5 \
  --command-id RunShellScript --scripts @deploy.sh \
  --query "value[0].message" -o tsv
```

**Generated types-bestand** ([src/integrations/supabase/types.ts](src/integrations/supabase/types.ts)) wordt handmatig bijgehouden omdat er geen Supabase CLI gelinkt is aan de self-hosted instance. Bij DB-schema-wijzigingen: voeg de nieuwe kolom handmatig toe in Row/Insert/Update interfaces voor de betreffende tabel.
