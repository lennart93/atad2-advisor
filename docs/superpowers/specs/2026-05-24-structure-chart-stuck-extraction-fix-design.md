# Structure chart "zit vast" — fix met heartbeat + stale-detectie

**Datum:** 2026-05-24
**Probleem:** Structure chart laadt soms niet. In de console: 409 van `extract-structure`. Komt steeds terug.

## Wat er nu gebeurt

1. Frontend roept `extract-structure` aan om de chart te genereren.
2. De edge function zet `atad2_structure_charts.status = 'extracting:stage1'` en start de pipeline op de achtergrond (via `EdgeRuntime.waitUntil`).
3. De pipeline doet zijn werk en zet de status uiteindelijk op `draft_ready`, `phase_a_ready` of `extraction_failed`.
4. Als er ondertussen een tweede aanroep komt, geeft de function netjes 409 ("al bezig").

**Wat er fout gaat:** soms gaat de achtergrond-pipeline halverwege dood — server-hik, isolate gerecycled, OOM, etc. De status blijft dan voor altijd hangen op `extracting:*`. Vanaf dat moment:
- Frontend poll forever, ziet nooit een eindstatus.
- Elke nieuwe trigger krijgt 409 — want voor de function "is hij nog bezig".
- Enige uitweg voor de user: handmatig "Skip remaining" klikken (als dat al zichtbaar is).

## De fix in twee delen

### 1. Pipeline laat een teken van leven achter

Voeg kolom `heartbeat_at TIMESTAMPTZ` toe aan `atad2_structure_charts`. De pipeline werkt deze kolom bij:
- bij start (in `setStatus`),
- en elke ~15 seconden zolang er een lang lopende Claude-call bezig is.

Concreet: `setStatus` zet voortaan ook `heartbeat_at = now()`. Daarnaast loopt er tijdens elke `callClaude` een interval-timer die elke 15s `heartbeat_at` bijwerkt. Timer stopt na de call.

### 2. Ingang van de function ziet dode pipelines

In `extract-structure/index.ts` waar nu de 409 wordt teruggegeven (regel 66):

```
huidig: als status begint met 'extracting:' → 409
nieuw:  als status begint met 'extracting:' EN heartbeat_at > 90s geleden → behandel als dood:
          - log dat we een dode pipeline overnemen (event: pipeline_takeover_stale)
          - reset status naar 'extracting:stage1' + verse heartbeat
          - start de pipeline opnieuw met de phase die de huidige caller heeft meegegeven
            (dus niet de phase van de dode run — die weten we niet meer)
        anders (heartbeat vers): nog steeds 409
```

Drempel: 90 seconden. Ruim boven de 15s interval, dus geen valse positieven onder normale belasting.

## Bestanden die veranderen

| Bestand | Wijziging |
|---|---|
| `supabase/migrations/<timestamp>_chart_heartbeat.sql` | Nieuwe migratie: kolom `heartbeat_at TIMESTAMPTZ` toevoegen, default `now()` |
| `src/integrations/supabase/types.ts` | Auto-gegenereerd: `heartbeat_at` opnemen in `atad2_structure_charts` row type |
| `supabase/functions/extract-structure/index.ts` | `setStatus` schrijft ook `heartbeat_at`; 409-check verrijken met stale-detectie; helper voor heartbeat-interval |
| `supabase/functions/extract-structure/claude.ts` | `callClaude` accepteert optionele heartbeat callback OF helper wrapt de call met interval-timer |

Frontend hoeft niets te veranderen — de bestaande poll + 409-afhandeling werken gewoon door.

## Edge cases

| Geval | Wat er gebeurt |
|---|---|
| Twee snelle aanroepen achter elkaar, pipeline draait normaal | Tweede krijgt 409 (heartbeat is vers), goed. |
| Pipeline crasht na 5s, user trigger 10s later | Heartbeat is 10s oud → onder 90s drempel → krijgt nog steeds 409. User moet wachten tot 90s voorbij. Acceptabel: zeldzaam, vergeleken met "voor altijd vast" een enorme verbetering. |
| Pipeline crasht na 5s, user trigger 2 min later | Heartbeat 2 min oud → boven drempel → herstart, klaar. |
| Twee gebruikers tegelijk (race) | Niet relevant — chart is per `session_id`, en `session_id` is per user. |
| Claude call duurt 80s zonder tussentijdse update | Heartbeat-timer schrijft elke 15s → status blijft "vers" → geen valse herstart. |
| `setStatus` zelf faalt | Pipeline gaat door, maar `heartbeat_at` wordt niet ge-update. Acceptabel: dezelfde failure mode als nu, behalve dat na 90s recovery mogelijk is. |

## Hoe we het testen

1. **Unit test** voor de stale-detectie helper: gegeven een chart-rij met status + heartbeat_at, geef terug of hij stale is.
2. **Handmatige test op staging/lokaal:**
   - Trigger een extraction.
   - Kill de Supabase function container (`docker restart`) terwijl hij draait.
   - Wacht 95 seconden.
   - Trigger opnieuw → moet doorgaan, niet 409 geven.
3. **Geen regressie test nodig** voor de happy path — de bestaande tests van `extract-structure` blijven groen.

## Wat we NIET doen (bewuste keuze)

- **Geen job-table refactor.** Optie C uit de brainstorm zou cleaner zijn maar vraagt 10x meer code-verandering en raakt veel call sites.
- **Geen client-side "Restart" knop.** Niet nodig: de fix is automatisch. Skip-knop blijft als laatste escape.
- **Geen aanpassingen aan polling timeouts.** De 6 min polling timeout in `extraction.ts` is nog steeds een vangnet voor het zeldzame geval dat zelfs deze recovery faalt.

## Doel

Na deze fix:
- User ziet nooit meer een chart die voor altijd "aan het laden" is.
- Als er iets fout gaat: max 90s wachten, dan herstart automatisch.
- Geen handmatige actie nodig in 95%+ van de gevallen.
