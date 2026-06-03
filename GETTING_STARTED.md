# Cómo levantar la app

Guía paso a paso para correr el MVP en local. Si algo del flujo cambia, este
documento es la fuente de verdad — actualizalo.

## 1. Requisitos

- **Node.js 22+** (`node -v`)
- **pnpm 10+** (`pnpm -v`)
- **Docker + docker-compose** _o_ Postgres 16 + Redis 7 instalados nativos
- Una **API key de Anthropic** con créditos (solo si vas a usar el agente)
- Opcional: **API key de LangSmith** para ver las trazas del agente

## 2. Clonar + instalar

```bash
git clone <repo-url>
cd agentworkspace
pnpm install
```

`pnpm install` no corre el postinstall de Prisma. Generá el cliente a mano:

```bash
pnpm --filter api prisma:generate
```

## 3. Variables de entorno

```bash
cp .env.example .env
cp .env.example apps/api/.env   # prisma CLI lee de cwd
```

Editá ambos `.env` y completá:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_agents
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
LANGCHAIN_TRACING_V2=false       # true + LANGCHAIN_API_KEY si querés trazas
LANGCHAIN_API_KEY=
PORT=3000
```

> **No commitees** los `.env` — ya están en `.gitignore`.

## 4. Levantar Postgres + Redis

### Opción A: Docker (recomendado)

```bash
docker compose up -d
```

Espera a que ambos containers estén `healthy`:

```bash
docker compose ps
```

### Opción B: nativo

```bash
# Postgres (si usás el paquete postgresql-16 de Debian/Ubuntu)
sudo pg_ctlcluster 16 main start
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -c "CREATE DATABASE discord_agents;"

# Redis
redis-server --daemonize yes
redis-cli ping   # -> PONG
```

## 5. Migrar el schema

```bash
pnpm --filter api prisma:migrate
```

Esto aplica la migración inicial y crea 5 tablas: `Workspace`, `Member`,
`Channel`, `ChannelSubscription`, `Message`.

Verificar:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d discord_agents -c "\dt"
```

## 6. Backend

```bash
pnpm --filter api start:dev   # con watch (recomendado en dev)
# o
pnpm --filter api build && pnpm --filter api start
```

Salida esperada (recortada):

```
[NestApplication] Nest application successfully started
[AgentEventBus] subscribed to dispatch, agent:message, agent:typing
api listening on :3000
```

Endpoints REST disponibles:

| Método | Path                          | Descripción                              |
|--------|-------------------------------|------------------------------------------|
| POST   | `/seed`                       | Crea/idempotente: workspace + 2 humanos + agente + channel |
| GET    | `/workspaces/:id`             | Workspace con `members` y `channels`     |
| GET    | `/channels/:id/messages?limit=N` | Últimos N mensajes (default 50, max 200) |

Y el namespace de Socket.IO `/chat` con los eventos:

| Evento           | Dir    | Payload                                  |
|------------------|--------|------------------------------------------|
| `channel:join`   | C → S  | `{ channelId }`                          |
| `message:send`   | C → S  | `{ channelId, content, parentId? }`      |
| `message`        | S → C  | el `Message` completo                    |
| `agent:typing`   | S → C  | `{ agentId }`                            |

El cliente se autentica con `auth.memberId` en el handshake.

## 7. Frontend

```bash
pnpm --filter web dev
```

Abrí http://127.0.0.1:5173 — la UI:

1. Llama `POST /seed` automáticamente.
2. Selecciona el primer humano como identidad (cambiable en el dropdown del
   sidebar, persiste en `localStorage`).
3. Permite mandar mensajes y mencionar al agente con `@agente-facturacion`.

## 8. Smoke tests

Verifican cada fase end-to-end. Requieren la API levantada en `:3000`.

```bash
pnpm --filter api smoke:fase2   # chat humano puro
pnpm --filter api smoke:fase3   # round-trip con el agente (necesita ANTHROPIC_API_KEY con saldo)
pnpm --filter api smoke:fase4   # frontend headless (requiere vite dev en :5173 y chromium)
```

`smoke:fase4` usa Playwright. Si no tenés el chromium instalado:

```bash
cd apps/api && pnpm exec playwright install chromium
```

## 9. Probar el agente manualmente

Con la UI abierta y créditos en la cuenta Anthropic:

1. Como `ana`, en `#general`, escribí:
   ```
   @agente-facturacion validá CUIT 20-12345678-9 por $10000
   ```
2. Debería aparecer:
   - Indicador "agente-facturacion está pensando…" debajo del listado.
   - Mensaje del agente con label `BOT`.
   - Bloque `validar_factura` debajo, mostrando los args en JSON.

## 10. Troubleshooting

| Síntoma                                              | Causa / fix                                          |
|------------------------------------------------------|------------------------------------------------------|
| `prisma migrate` se queja de DATABASE_URL            | Falta `apps/api/.env` (no solo el de la raíz).       |
| API arranca pero falla al conectar a Redis           | `redis-cli ping` debe responder PONG.                |
| Frontend muestra "error: TypeError: Failed to fetch" | API no levantada o CORS bloqueado. La API ya tiene `enableCors`. |
| Build de la API rompe con `TS2589`                   | Mismatch de versiones langchain/zod. Borrá `pnpm-lock.yaml` y `node_modules` y reinstalá. |
| Agente responde con `400 credit balance too low`     | La API key no tiene saldo. Cargá en console.anthropic.com. |
| `agent:typing` llega pero no llega respuesta         | Mirar logs de la API. `AgentOrchestrator` loguea el error sin crashear. |

## 11. Limpiar y empezar de cero

```bash
docker compose down -v                          # borra el volumen de Postgres
rm -rf apps/api/dist apps/web/dist node_modules apps/*/node_modules pnpm-lock.yaml
pnpm install
pnpm --filter api prisma:generate
```
