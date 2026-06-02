# RUNBOOK — Discord-for-Agents (MVP Pickit)

> Este archivo es la fuente de verdad para construir el proyecto.
> Si sos un agente de código: leé TODO antes de escribir una línea.

## Qué estamos construyendo
Chat estilo Discord donde **humanos y agentes son miembros de primera clase**.
Los agentes viven en canales, se despiertan por mención o escucha, y **ejecutan
tools** (no solo responden) vía LangGraph + LangSmith.

MVP a entregar: chat humano funcional + 1 agente real que responde y ejecuta
tools, sobre Socket.IO.

## Stack OBLIGATORIO (no proponer alternativas)
- Backend: NestJS + TypeScript
- Realtime: Socket.IO (`@nestjs/platform-socket.io`)
- DB: PostgreSQL vía Prisma
- Pub/sub entre Gateway y Orchestrator: Redis (`ioredis`)
- Agentes: `@langchain/langgraph` + `@langchain/anthropic`
- Observabilidad: LangSmith (vía env vars, sin código extra)
- Frontend: React + Vite + TypeScript, cliente `socket.io-client`
- Gestor de paquetes: pnpm

## Decisiones de arquitectura — NO CAMBIAR
1. `Member` unifica humanos y agentes (`type: HUMAN | AGENT`). Una sola tabla.
2. El `ChatGateway` NUNCA llama al LLM. Persiste, hace broadcast, y publica a
   Redis. El `AgentOrchestrator` (servicio separado) escucha Redis e invoca al
   agente. Un agente lento NO debe congelar el chat de las personas.
3. Las respuestas de agente vuelven al canal como un `Message` normal con
   `role: AGENT` y `metadata` (traceId de LangSmith + toolCalls).

## Archivos que YA EXISTEN — usarlos como contrato, NO reescribir
- `schema.prisma` — modelo de datos definitivo.
- `chat.gateway.ts` — Gateway Socket.IO.
- `agent-orchestrator.service.ts` — orquestador de agentes.
- `agent-runner.ts` — wrapper LangGraph ReAct con tools.

Podés MOVERLOS a la estructura de carpetas correcta y ajustar imports, pero la
lógica y las firmas de método se respetan.

---

## FASES — ejecutá UNA por vez. Compilá y corré al final de cada una antes de seguir.

### FASE 0 — Scaffold
- Inicializar monorepo pnpm con `apps/api` (NestJS) y `apps/web` (React+Vite).
- Generar `package.json`, `tsconfig`, `nest-cli.json`, `.env.example`.
- Mover los 4 archivos existentes a su lugar correcto en `apps/api/src`.
- Instalar dependencias.
- **Criterio de done:** `pnpm --filter api build` compila sin errores.
- PARÁ. Mostrame qué generaste antes de seguir.

### FASE 1 — Infra de soporte (los huecos del esqueleto)
- Implementar `AgentEventBus` sobre ioredis: canales pub/sub `dispatch`,
  `agent:message`, `agent:typing`. Métodos que usa el código existente:
  `dispatchToAgents`, `onDispatch`, `emitAgentMessage`, `onAgentMessage`,
  `emitTyping`, `onAgentTyping`.
- Implementar `MessageService` y `PrismaService` (CRUD contra el schema).
- Configurar `docker-compose.yml` con Postgres + Redis para desarrollo local.
- Correr `prisma migrate dev`.
- **Criterio de done:** la API levanta (`pnpm --filter api start:dev`) sin
  crashear y conecta a Postgres + Redis.
- PARÁ. Verificá conmigo.

### FASE 2 — Chat humano puro (sin agentes todavía)
- Endpoint/seed para crear un Workspace, 2 Members humanos y 1 Channel.
- Probar el flujo Socket.IO: dos clientes se mandan mensajes en un canal y los
  ven en tiempo real. Podés usar un script de test o el frontend mínimo.
- **Criterio de done:** dos sockets en el mismo canal intercambian mensajes
  persistidos. SIN tocar agentes.
- PARÁ.

### FASE 3 — Enchufar 1 agente real
- Seed: crear un Member `type: AGENT` llamado `agente-facturacion`, suscripto al
  canal en modo `mention`, con `agentConfig` que habilite la tool
  `validar_factura` (ya existe en `agent-runner.ts`).
- Verificar el loop completo: humano escribe "@agente-facturacion validá CUIT
  20-... por $10000" → Orchestrator despierta al agente → ejecuta la tool →
  responde en el thread con el resultado.
- Confirmar que LangSmith recibe la traza (con las env vars seteadas).
- **Criterio de done:** el agente responde Y la toolCall aparece en
  `message.metadata`.
- PARÁ.

### FASE 4 — Frontend React mínimo
- Lista de canales (sidebar), vista de mensajes con virtualización
  (`react-window`), input de envío.
- Render diferenciado de mensajes humano vs agente.
- Indicador "el agente está pensando…" escuchando `agent:typing`.
- Render de `metadata.toolCalls` debajo del mensaje del agente.
- **Criterio de done:** se ve y se usa end-to-end en el navegador.

---

## Reglas para el agente de código
- NO avances de fase sin que yo confirme. Después de cada fase, resumí qué
  hiciste y cómo lo probaste.
- NO instales librerías fuera del stack de arriba sin avisar y justificar.
- NO reescribas los 4 archivos existentes; integralos.
- Si algo del esqueleto no cierra con una mejor práctica, decímelo y proponé,
  no lo cambies por tu cuenta.
- Preferí correr y ver el error antes que generar mucho código a ciegas.

## Env necesarias (ver .env.example)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discord_agents
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
```
