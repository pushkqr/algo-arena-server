# Algo Arena Server

Backend service for running asynchronous algorithm evaluations across game environments.

Players submit strategies per environment, activate one strategy per environment, and a service account triggers evaluation runs that rank active strategies.

---

## What this service does

- Stores user strategies by environment.
- Enforces **one active strategy per user per environment**.
- Queues environment evaluations asynchronously.
- Persists run-level metrics and rankings.
- Exposes user-scoped result and strategy APIs.

---

## Tech stack

- Node.js (CommonJS)
- Express 5
- MongoDB + Mongoose
- Firebase Admin SDK (token verification)

---

## Project structure (high level)

```text
src/
	api/
		controllers/
		middleware/
		routes/
	domain/
		evaluation/
		metrics/
		strategy/
	engine/
		environments/
		runner/
	persistence/
		models/
```

---

## Environments

Currently registered environment(s):

- `AuctionHouse`

Environment registry lives in `src/engine/environments/index.js`.

---

## Access model

- **Strategies API**: authenticated users can access **only their own** strategies.
- **Results API**: authenticated users can access **only their own** result rows (`agentOwnerId`).
- **Evaluations API**: authenticated **service user only**.

Service-user authorization is controlled by one or more of:

- Firebase custom claims: `service=true` or `isService=true`
- `SERVICE_USER_ID` or `SERVICE_USER_IDS` (comma-separated UIDs)
- `SERVICE_USER_EMAILS` (comma-separated emails)

---

## Environment variables

Create `.env` (or rely on your process env):

```bash
PORT=5432

# Mongo
MONGO_URI=mongodb://localhost:27017/algo-arena
# (or MONGODB_URI)

# Firebase Admin
# JSON string for service account credentials
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account", ...}

# Engine
EVAL_MAX_CONCURRENT=2

# Optional local/dev fallback auth
AUTH_ALLOW_FALLBACK_USER=false

# Service user allow-list
SERVICE_USER_ID=
SERVICE_USER_IDS=
SERVICE_USER_EMAILS=admin@mail.com
```

> Note: `npm start` uses `dotenvx run -- nodemon src/server.js`.

---

## Installation & run

```bash
npm install
npm start
```

Server entrypoints:

- `src/server.js`
- `src/app.js`

---

## Data model (v2)

### `strategies`

One document per strategy:

- `strategyId`
- `ownerId`
- `envName`
- `source` / `path`
- `isActive` (+ `status` compatibility)
- `metadata`

Important constraints:

- Unique per `(ownerId, envName, strategyId)`
- At most one active strategy per `(ownerId, envName)`

### `evaluations`

One document per run:

- `evaluationId`
- `envName`, config (`rounds`, `poolSize`, etc.)
- `status`: `queued | running | completed | failed`
- run-level `metrics`, `ranking`
- execution metadata and timestamps

### `results`

Aggregated per-evaluation, per-agent rows (not per episode):

- `evaluationId`, `agentId`, `agentOwnerId`
- `rank`
- aggregate metrics (`totalReturn`, `averageReturn`, `failRate`, etc.)

---

## API reference

Base URL: `http://localhost:<PORT>`

### Strategies (user-scoped)

- `GET /api/strategies`
  - Query: `envName`, `active`, `limit`, `skip`
- `GET /api/strategies/:strategyId`
- `POST /api/strategies`
- `PATCH /api/strategies/:strategyId`
- `DELETE /api/strategies/:strategyId`

Create/update body (typical):

```json
{
  "strategyId": "my-strategy-v1",
  "envName": "AuctionHouse",
  "name": "Budget Bidder",
  "source": "module.exports={reset:()=>{},act:(obs)=>1};",
  "isActive": true,
  "metadata": { "description": "safe baseline" }
}
```

### Evaluations (service-user only)

- `GET /api/evaluations/env-options?envName=AuctionHouse`
  - Returns expected `envOpts` schema for one environment.
  - If `envName` is omitted, returns schemas for all registered environments.
- `POST /api/evaluations/env-options`
  - Same behavior as GET, with optional `{ "envName": "AuctionHouse" }` in body.
- `POST /api/evaluations?envName=AuctionHouse`
  - Queues a run and returns `202` + `Location` header.
  - If `agents` are omitted, active strategies for the environment are loaded automatically.
- `GET /api/evaluations`
- `GET /api/evaluations/:evaluationId`

Start evaluation body (typical):

```json
{
  "rounds": 12,
  "poolSize": 4,
  "poolCount": 2,
  "episodesPerPool": 8,
  "shuffle": true,
  "envOpts": {
    "auctionType": "first",
    "defaultBudget": 250,
    "reserve": 5,
    "maxConsecutiveWins": 2
  }
}
```

Env options schema response (example):

```json
{
  "envName": "AuctionHouse",
  "description": "Auction environment with configurable pricing and budget dynamics.",
  "params": [
    {
      "key": "auctionType",
      "type": "string",
      "default": "second",
      "enum": ["first", "second"]
    },
    {
      "key": "defaultBudget",
      "type": "number",
      "default": null,
      "nullable": true
    }
  ]
}
```

Validation error response (example):

```json
{
  "error": "invalid envOpts",
  "envName": "AuctionHouse",
  "details": [
    "Unknown envOpts key 'foo' for environment 'AuctionHouse'",
    "envOpts.auctionType must be one of: first, second",
    "envOpts.maxItemValue must be > envOpts.minItemValue"
  ]
}
```

Example invalid request:

```json
{
  "rounds": 12,
  "poolSize": 4,
  "poolCount": 2,
  "episodesPerPool": 8,
  "envOpts": {
    "auctionType": "third",
    "minItemValue": 100,
    "maxItemValue": 20,
    "foo": true
  }
}
```

### Results (user-scoped)

- `GET /api/results`
  - General “My Results” endpoint.
  - Query: `envName`, `evaluationId`, `agentId`, `limit`, `skip`
  - Returns only rows where `agentOwnerId == req.userId`
- `GET /api/results/item/:resultId`
  - Returns a single result row where `agentOwnerId == req.userId`
- `GET /api/results/:evaluationId`
  - Returns only rows where `agentOwnerId == req.userId`

Example:

```bash
GET /api/results?envName=AuctionHouse&limit=20&skip=0
```

### Leaderboard (user-scoped)

- `GET /api/leaderboard/evaluations`
  - Global leaderboard rows for a completed evaluation (not restricted to requester-owned strategies).
  - Requires `envName` (latest completed evaluation for that environment) or `evaluationId` (specific completed evaluation).
  - Query: `envName`, `evaluationId`, `limit`, `skip`

Examples:

```bash
GET /api/leaderboard/evaluations?envName=AuctionHouse
GET /api/leaderboard/evaluations?evaluationId=<evaluation-id>&limit=20&skip=0
```

---
