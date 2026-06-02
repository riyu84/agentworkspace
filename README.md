# Discord-for-Agents — MVP Pickit

Chat estilo Discord donde **agentes y humanos son miembros de primera clase**.
MVP: chat humano funcional + 1 agente que responde y ejecuta tools, sobre Socket.IO.

## La idea en una línea
Los agentes no son bots pegados: viven en canales, tienen identidad en la tabla
`Member`, se despiertan por mención o por escucha, y pueden **ejecutar tools**
(no solo responder) vía LangGraph + LangSmith.

## Arquitectura (por qué está separada)

```
  Cliente React
       │  Socket.IO
       ▼
  ChatGateway ──► Postgres (persistir)
       │          
       │  Redis pub/sub (NO espera al LLM)
       ▼
  AgentOrchestrator ──► resuelve qué agente despierta
       │
       ▼
  AgentRunner (LangGraph ReAct) ──► ejecuta tools / MCP
       │                            └─► LangSmith traza
       ▼
  respuesta ──► Redis ──► ChatGateway ──► canal
```

**Regla de oro:** el Gateway NUNCA llama al LLM directo. Un agente lento NO
puede congelar el realtime de las personas. Por eso Orchestrator va aparte.

## Las 3 decisiones de diseño
1. **`Member` unificado** (`type: HUMAN | AGENT`) → menciones, threads y permisos
   funcionan igual para ambos sin código bifurcado.
2. **Triggers de despertar**: `mention` (solo si lo @mencionan) o `listen`
   (escucha todo y decide). Definido en `ChannelSubscription.mode`.
3. **Agentes que actúan**: `AgentRunner` usa `createReactAgent` con tools reales
   (ejemplo: `validar_factura` para IIBB/Percepciones de Pickit).

## Orden de implementación sugerido
1. `npx prisma migrate dev` con `schema.prisma` → DB lista.
2. Levantar Redis + el `AgentEventBus` (wrapper pub/sub — falta implementarlo,
   ~40 líneas: publish/subscribe a canales `dispatch`, `agent:message`, `typing`).
3. `ChatGateway` + `MessageService` → chat humano puro funcionando.
4. `AgentOrchestrator` + `AgentRunner` → enchufar 1 agente real.
5. Frontend React: lista de canales, virtualización de mensajes, indicador
   `agent:typing`, render de `metadata.toolCalls` en el thread.

## Pendiente para v2 (no MVP)
- Confirmación humana antes de acciones con efecto (botones en `metadata.blocks`).
- MCP servers reales en `agentConfig.mcpServers`.
- Auth JWT en el handshake del socket.
- Presencia/online status vía Redis.

## Env necesarias
```
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=...      # LangSmith
REDIS_URL=redis://...
```
