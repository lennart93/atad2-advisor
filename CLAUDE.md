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

**`az`-toegang (LEES DIT EERST, voorkomt veel gedoe)** — alles hieronder hangt op de Azure CLI:
1. **PIM**: Lennart activeert zijn PIM-rol (VM-rechten) vóór elke VM-actie. Een venster verloopt na ~10-15 min. Bij `AuthorizationFailed` op `virtualMachines/read`, `runCommand/action` of `operations/read` (ook midden in een call): PIM opnieuw laten activeren en het commando nog eens draaien — alle deploy-scripts hier zijn idempotent.
2. **`az` valt soms uit het PATH van de Claude-omgeving** (geen normale install op de machine). Er staat een werkende, uitgepakte kopie klaar — roep die met het VOLLEDIGE pad aan:
   - `C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd`
   - PowerShell: `& "C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd" vm run-command invoke ...`
   - Lennart is al ingelogd (tokens in `%USERPROFILE%\.azure`), dus géén `az login` nodig.
3. **Is die map weg?** Pak de CLI opnieuw uit ZONDER admin (een gewone winget/MSI-install vereist UAC en lukt niet vanuit de tool; de `/a` administratieve uitpak wél):
   ```powershell
   Invoke-WebRequest 'https://azcliprod.blob.core.windows.net/msi/azure-cli-2.87.0-x64.msi' -OutFile $env:TEMP\azcli.msi -UseBasicParsing
   Start-Process msiexec.exe -ArgumentList '/a',"$env:TEMP\azcli.msi",'/qn','TARGETDIR=C:\Users\adn356\az-extracted' -Wait
   # az.cmd staat daarna op C:\Users\adn356\az-extracted\Microsoft SDKs\Azure\CLI2\wbin\az.cmd
   ```
4. Run-command vanaf Windows met spaties in paden: gebruik `--scripts "@<absoluut pad>"` en `--query "value[0].message" -o tsv`. SSH naar de VM is dicht (poort 22), dus run-command is de enige remote-route.

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

## Technische bijlage (feature)
Artikelsgewijze ATAD2-checklist (art. 2 + 12aa t/m 12ag Wet Vpb) als aparte stap **ná Confirmation, vóór Structure**. Vast rechtskader (hard-coded skelet); de AI vult per rij beslissing + reden + referentie. De referentie is intern en valt weg in de export. Ontwerp: [docs/superpowers/specs/2026-06-07-atad2-technical-appendix-design.md](docs/superpowers/specs/2026-06-07-atad2-technical-appendix-design.md); skelet + prompt: [docs/technische-bijlage-v1-skelet.md](docs/technische-bijlage-v1-skelet.md).

- **Tabellen**: `atad2_appendix` (1 rij per sessie, `rows` als JSONB, losse `review_status` + `generation_status`) en `atad2_appendix_edits` (append-only wijzigingslog). RLS = sessie-eigenaar, net als `atad2_answers`. Migraties: `supabase/migrations/20260607174300_appendix_tables.sql` + `..._appendix_prompt_v1.sql` + `..._appendix_prompt_wording.sql` (alle toegepast op de VM).
- **Prompt**: key `appendix_system` in `atad2_prompts` (JSON-output, gevuld per sectie).
- **Edge function**: `supabase/functions/generate-appendix/` — async met `generation_status`, **swarm** (parallelle Claude-call per sectie voor snelheid), schrijft via service role, bewaart handmatige edits bij hergenereren.
- **Skelet staat DUBBEL**: `src/lib/appendix/skeleton.ts` (frontend) en `supabase/functions/generate-appendix/skeletonRows.ts` (Deno). Bij elke wijziging BEIDE bijwerken.
- **Prewarm**: de upload- en vragenpagina's starten de generatie via `useAppendixPrewarm` zodra de structure chart fase A klaar is, zodat de bijlage meestal al klaar is bij aankomst. De Structure-stap hersynct alleen het entity register.
- **OPENSTAAND**: migratie `..._memo_prompt_v4_appendix_block.sql` (memo v4 met placeholder `{{CONFIRMED_APPENDIX_BLOCK}}`) is bewust NIET toegepast. Pas die pas toe samen met het aanpassen van de n8n-node "Build prompt + metrics", die `confirmed_appendix` uit de payload in die placeholder moet zetten — anders krijgen alle memo's een lege placeholder.
- **Juridische review-punten** (de bijlage draagt een banner "Draft, pending tax review" tot afgetekend): zie §8.1 van [docs/technische-bijlage-plan.md](docs/technische-bijlage-plan.md), o.a. gelieerdheid >25% vs 50% voor hybride-lichaam-gevallen, art. 12ab alleen onderdeel a/b/c/e/f, post-FKR lidnummers art. 2, oorsprongseis bij onderdeel g, art. 12af lid 2/3.
