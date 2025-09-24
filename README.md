# Propositions API + Crawler (weekly)

Projeto único contendo:
- API Fastify para consultas (port 3000)
- Crawler que roda semanalmente (node-cron) e popula o Postgres
- Postgres inicializado via init.sql
- Dockerfile + docker-compose para rodar tudo

## Como usar (local / Docker)
- Ajuste variáveis em `.env` se necessário.
- Rodar com Docker:
  ```
  docker-compose up --build
  ```
- A API ficará disponível em http://localhost:3000
- O crawler roda semanalmente pela expressão cron (padrão: `0 0 * * 0` — domingo meia-noite).
