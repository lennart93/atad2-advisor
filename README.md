# ATAD2 Advisor

ATAD2 compliance assessment tool van Svalner Atlas Advisors.

## Tech stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (self-hosted op Azure VM) — PostgreSQL met pgvector
- n8n workflows voor AI-pipelines (Azure OpenAI + Anthropic)

## Lokaal draaien

```sh
npm install
npm run dev
```

Dev server draait op `http://localhost:8080`.

## Build

```sh
npm run build
```

## Tests

```sh
npm test
```

## Deployment

Push naar `main` triggert GitHub Actions (`.github/workflows/deploy.yml`) en deployt naar Azure App Service `app-atad2-prod`. Zie [CLAUDE.md](./CLAUDE.md) voor de volledige infrastructuur-context.
