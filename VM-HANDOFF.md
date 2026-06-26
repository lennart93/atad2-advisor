# Handoff — Dashboard-omgeving (`adn-dashboard-dev`)

Doel: een andere Claude Code-sessie alles geven om aan de **dashboard-app** te werken.
Dit gaat **niet** over de ATAD2-tool. Alle info hieronder is op 2026-06-07 live
geverifieerd via `az` tegen Azure (niet uit documentatie overgenomen).

---

## TL;DR — actuele staat

De dashboard-app heeft een **eigen Azure-omgeving** (eigen subscription, niet de
ATAD2-VM). De infrastructuur is **wél geprovisioneerd, maar de app is nog NIET
uitgerold**:

- **App Service `app-svalner-dashboard-dev`** (Node 22, Linux, Premium P0v3) — draait,
  maar heeft **geen deployment-bron, geen app-settings, geen startup-command**. Leeg/default.
- **VM `adn-x-s-9`** — draait, maar is **leeg**: geen Docker, geen nginx, geen node/deno/pm2,
  geen app-code. Alleen Intility-beheeragents. (Subnet heet `...-supabase-dev`, dus
  waarschijnlijk bedoeld voor self-hosted Supabase zoals bij ATAD2, maar nog niets geïnstalleerd.)
- **Netwerk** (VNet, subnets, NAT gateway, private endpoint) is volledig opgezet.

Conclusie: dit is een "infra staat klaar, bouwen kan beginnen"-situatie, geen bestaande
draaiende app die je moet leren kennen.

---

## 0. Toegang — LEES DIT EERST

Het `az`-account `Lennart.Wilming@svalneratlas.com` (object id `326623ec-644b-4c78-9d61-cecb8a5a059d`)
heeft toegang tot **meerdere** subscriptions. Belangrijk:

- ✅ **`adn-dashboard-dev`** (`7a2cc9c5-b82c-4665-95c7-fb10d2ab6416`) — hier werkt alles
  (resource-reads én `az vm run-command`). Dit is de omgeving die je nodig hebt.
- ❌ **`adn-atad2-prod`** (`791c975c-...`, de default) — geeft op dit moment
  `AuthorizationFailed` op álles, ook subscription-brede reads. Het token is geldig
  (silent refresh werkt), dus dit is een **rechten/rol-kwestie** op die prod-subscription,
  geen verlopen login. Niet relevant voor dashboard-werk, maar verklaart waarom je
  default-subscription "stuk" lijkt.

**Stap 1 altijd:** zet de juiste subscription actief:
```bash
az account set --subscription 7a2cc9c5-b82c-4665-95c7-fb10d2ab6416
# verifieer:
az account show -o json     # name moet "adn-dashboard-dev" zijn
az group show -n rg-dashboard-dev -o table   # moet werken, geen AuthorizationFailed
```

Andere subscriptions in dit account (voor context): `adn-clientmanager-dev`,
`adn-atad2-dev`, `Azure subscription 1`.

---

## 1. Identiteit & resources

| Veld | Waarde |
|---|---|
| Subscription | `adn-dashboard-dev` — `7a2cc9c5-b82c-4665-95c7-fb10d2ab6416` |
| Resource group | `rg-dashboard-dev` |
| Tenant | Svalner Atlas — `4c118eed-2cd4-49f0-a5b4-c92ff73b6aea` |
| Region | Sweden Central |

Resources in `rg-dashboard-dev`:
- `app-svalner-dashboard-dev` — Microsoft.Web/sites (App Service, de frontend)
- `asp-dashboard-dev` — App Service Plan (P0v3 Premium)
- `adn-x-s-9` — Microsoft.Compute/virtualMachines (de backend-VM)
- `vnet-dashboard-dev` + 3 subnets, 3 NSG's, 3 route tables
- `natgw-dashboard-dev` + `pip-natgw` (outbound egress)
- `pep-app-svalner-dashboard-dev-sites-0` (private endpoint App Service)

---

## 2. App Service — `app-svalner-dashboard-dev` (de frontend)

| Veld | Waarde |
|---|---|
| URL | https://app-svalner-dashboard-dev.azurewebsites.net |
| SCM/Kudu | https://app-svalner-dashboard-dev.scm.azurewebsites.net |
| Runtime | `NODE\|22-lts`, Linux |
| Plan | `asp-dashboard-dev` (P0v3 Premium) |
| State | Running |
| Deployment-bron | **geen** (geen GitHub Actions, `scmType: None`) — nog niet geconfigureerd |
| App settings | **geen** (leeg) |
| Startup command | **geen** (default) |
| alwaysOn | False |
| Inbound | via private endpoint (`pep-...`) — niet zomaar publiek bereikbaar |

> Vergelijk met ATAD2 (`app-atad2-prod`): daar is de startup command
> `pm2 serve /home/site/wwwroot --no-daemon --spa` en deploy via GitHub Actions.
> Voor deze dashboard-app moet dat nog opgezet worden.

---

## 3. VM — `adn-x-s-9` (de backend, momenteel leeg)

| Veld | Waarde |
|---|---|
| Naam | `adn-x-s-9` |
| OS | Ubuntu 22.04 LTS (gen2), Canonical |
| Grootte | Standard_D2s_v4 |
| Power state | running |
| Public IP | **geen** |
| Private IP | `10.244.3.100` (in subnet `snet-dashboard-supabase-dev`) |
| Admin user | `intilityAdmin` |
| Beheer | **Intility-managed**: Chef, Dynatrace OneAgent, Splunk forwarder, Teleport, AssetWatcher |

**Wat er NIET op staat (geverifieerd):** geen Docker, geen nginx, geen node/deno/pm2,
geen `/var/www`, geen app-/supabase-code. Bash-history bevat alleen Intility/Chef-provisioning.

### Toegang tot de VM
Geen publieke IP → SSH van buiten kan niet. Twee opties:
1. **`az vm run-command`** (werkt nu, draait als `root`) — de praktische weg voor scripts:
   ```bash
   az vm run-command invoke \
     --resource-group rg-dashboard-dev --name adn-x-s-9 \
     --command-id RunShellScript --scripts @script.sh \
     --query "value[0].message" -o tsv
   ```
2. **Teleport** (poort 3022 draait op de VM) — de Intility-manier voor interactieve SSH;
   vereist Teleport-client + login. Voor losse commando's is run-command sneller.

---

## 4. Netwerk

- VNet `vnet-dashboard-dev`: `10.244.3.64/26`
  - `snet-dashboard-appin-dev` `10.244.3.64/28` — App Service inbound (private endpoint)
  - `snet-dashboard-appout-dev` `10.244.3.80/28` — App Service VNet-integratie (outbound)
  - `snet-dashboard-supabase-dev` `10.244.3.96/28` — de VM (`adn-x-s-9` = `.100`)
- NAT gateway egress (uitgaande publieke IP van de VM/app): **`135.116.104.36`**
  (gebruik dit IP voor allowlists/firewalls van externe diensten)

Architectuur spiegelt ATAD2: App Service (frontend, private endpoint) + VNet-integratie
naar een VM-subnet waar de backend (vermoedelijk self-hosted Supabase) moet komen.

---

## 5. Werkwijze-tips & valkuilen (door mij ervaren)

- **`--query "value[0].message"` slikt fouten.** Bij een mislukte run-command krijg je
  lege output met exit 0. Twijfel je? Draai zonder `--query ... -o tsv` en lees de echte fout.
- **Redirect az-output NIET naar een bestand op dit Windows-werkstation** (`> out.txt`):
  dat gaf hier 0 bytes. Pipe direct (`... -o tsv | head -60`) — dat werkt wel.
- **Spaties in JMESPath breken in PowerShell.** `--query "{a:a, b:b}"` faalt (de spatie
  splitst het argument). Houd queries spatie-loos, of parse de JSON los met python.
- **run-command serialiseert per VM**: start er niet meerdere tegelijk tegen dezelfde VM.
- De VM is zwaar Intility-managed (Chef herstelt config). Permanente wijzigingen overleven
  een Chef-run mogelijk niet tenzij ze in de Intility/Chef-config landen — hou daar rekening
  mee bij het installeren van diensten.

---

## 6. Logische eerste stappen voor de dashboard-app (suggestie, niet uitgevoerd)

1. Bevestig met de eigenaar wat de dashboard-app is (repo? welk framework? welke backend?).
2. Frontend: deployment voor `app-svalner-dashboard-dev` opzetten (GitHub Actions of zip),
   startup-command + app-settings configureren.
3. Backend op `adn-x-s-9`: bepalen of Supabase (zoals ATAD2) of iets anders; via run-command
   installeren. Let op de Intility/Chef-laag.
