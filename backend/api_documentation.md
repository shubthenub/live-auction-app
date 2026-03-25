# API Endpoints Documentation

This document outlines all the available REST endpoints in the `live-auction-app` backend, including required authentication, input payloads, and expected outputs.

All API routes are prefixed with `/api/v1`.

---

## 🔐 Authentication Routes (`/api/v1/auth`)

### 1. Register User
- **Endpoint**: `POST /auth/register`
- **Auth**: None
- **Input Template**:
  ```json
  {
    "username": "shash",
    "email": "shash@example.com",
    "password": "securepassword123",
    "role": "USER" // Or "AUCTIONEER"
  }
  ```
- **Expected Output** (201 Created):
  ```json
  {
    "success": true,
    "message": "Registration successful"
  }
  ```

### 2. Login User
- **Endpoint**: `POST /auth/login`
- **Auth**: None
- **Input Template**:
  ```json
  {
    "email": "shash@example.com",
    "password": "securepassword123"
  }
  ```
- **Expected Output** (200 OK):
  *(Also sets `accessToken` and `refreshToken` HttpOnly Cookies)*
  ```json
  {
    "success": true,
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6I...",
    "message": "Login successful"
  }
  ```

### 3. Get Current User (Me)
- **Endpoint**: `GET /auth/me`
- **Auth**: Required (`accessToken` cookie)
- **Expected Output** (200 OK):
  ```json
  {
    "id": "60d5ecb8b392d70..."
  }
  ```

### 4. Refresh Token
- **Endpoint**: `POST /auth/refresh`
- **Auth**: Required (`refreshToken` cookie)
- **Expected Output** (200 OK):
  *(Sets a new `accessToken` HttpOnly Cookie)*
  ```json
  {
    "message": "Token refreshed successfully"
  }
  ```

### 5. Logout
- **Endpoint**: `POST /auth/logout`
- **Auth**: Required (`refreshToken` cookie)
- **Expected Output** (200 OK):
  *(Clears all auth cookies)*
  ```json
  {
    "message": "Logged out successfully, deleted Token was: <token>"
  }
  ```

---

## 🩺 Health Check (`/api/v1/health`)

### 1. Health Check & Redis Keep-Alive
- **Endpoint**: `GET /health`
- **Auth**: None *(used as Render's health check path)*
- **Description**: Pings Upstash Redis and checks the MongoDB connection state. Keeps Upstash alive and signals Render whether the service is healthy.
- **Expected Output** (200 OK — all services up):
  ```json
  {
    "status": "ok",
    "checks": {
      "redis": "ok",
      "mongo": "ok"
    },
    "timestamp": "2026-03-25T12:24:10.000Z"
  }
  ```
- **Expected Output** (503 Service Unavailable — one or more services down):
  ```json
  {
    "status": "degraded",
    "checks": {
      "redis": "error",
      "mongo": "ok"
    },
    "timestamp": "2026-03-25T12:24:10.000Z"
  }
  ```

> Set Render's **Health Check Path** to `/api/v1/health`.

---

## 🏷️ Auction Routes (`/api/v1/auctions`)

### 1. Create Auction
- **Endpoint**: `POST /auctions/`
- **Auth**: `AUCTIONEER` Role only
- **Input Template**: *(Sent as `multipart/form-data` because of image uploads)*
  - `title`: "Vintage Watch" (String)
  - `description`: "A beautiful 1950s watch" (String)
  - `basePrice`: "500.00" (Number)
  - `minIncrement`: "10.00" (Number, optional)
  - `startTime`: "2024-12-01T10:00:00Z" (ISO Date, future)
  - `endTime`: "2024-12-02T10:00:00Z" (ISO Date, future)
  - `images`: [Up to 5 File Uploads]
- **Expected Output** (201 Created): Returns the fully created MongoDB Auction Object.

### 2. Get All Auctions (Paginated)
- **Endpoint**: `GET /auctions/`
- **Auth**: Authenticated User
- **Input Query Parameters**:
  - `?page=1` (default: 1)
  - `?limit=10` (default: 10)
  - `?status=LIVE` (Optional: "SCHEDULED", "LIVE", "ENDED")
- **Expected Output** (200 OK):
  ```json
  {
    "success": true,
    "data": [
      { "...auction objects..." }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 45
    }
  }
  ```

### 3. Get Single Auction by ID
- **Endpoint**: `GET /auctions/:id`
- **Auth**: Authenticated User
- **Input**: None (Uses `id` from URL params)
- **Expected Output** (200 OK): Returns the specific MongoDB Auction Object.

### 4. Get My Created Auctions (Auctioneer Dashboard)
- **Endpoint**: `GET /auctions/my-auctions`
- **Auth**: `AUCTIONEER` Role only
- **Input Query Parameters**: Same pagination/status params as *Get All Auctions*.
- **Expected Output** (200 OK): Returns Paginated object (same format as *Get All Auctions*).

### 5. Get My Won Auctions (User Dashboard)
- **Endpoint**: `GET /auctions/my-wins`
- **Auth**: `USER` Role only
- **Input Query Parameters**:
  - `?page=1` (default: 1)
  - `?limit=10` (default: 10)
- **Expected Output** (200 OK): Returns Paginated object containing only auctions the caller has won.

### 6. Start Auction (Manual Override/Hook)
- **Endpoint**: `POST /auctions/:id/start`
- **Auth**: `AUCTIONEER` Role only
- **Expected Output** (200 OK):
  ```json
  {
    "message": "Auction started"
  }
  ```

### 7. End Auction (Manual Override/Hook)
- **Endpoint**: `POST /auctions/:id/end`
- **Auth**: `AUCTIONEER` Role only
- **Input Template**:
  ```json
  {
    "finalPrice": 1200.50,
    "winnerId": "60d5ecb8b392d70..." // Optional
  }
  ```
- **Expected Output** (200 OK):
  ```json
  {
    "message": "Auction ended"
  }
  ```

---

## ⚙️ Infrastructure Notes

### RabbitMQ Auction Scheduler — Queue Design

#### Problem: Biased Queue Head (Head-of-Line Blocking)

The original implementation used a **single shared delay queue** (`auction-start-delay`) with **per-message TTL** (the `expiration` property on each message).

RabbitMQ only checks the TTL of the **head of the queue**. If an earlier message (e.g. Auction A, starting in 10 min) is at the head, a later message (Auction B, starting in 5 min) **will not fire on time** — it is blocked until A expires first.

```
auction-start-delay (shared)
┌──────────────────────────────────────┐
│ [Auction A] TTL=10min  ← HEAD        │  ← RabbitMQ only checks this one
│ [Auction B] TTL=5min   ← BLOCKED     │  ← Won't fire until A expires
└──────────────────────────────────────┘
```

This means an auction could be delayed by **minutes** depending on what is ahead of it in the queue.

#### Resolution: One Queue Per Auction (v2)

Each auction now gets its own **dedicated delay queue** (`auction-start-delay:<auctionId>`).

- TTL is set at the **queue level** (`messageTtl`), not per-message. Queue-level TTL is evaluated independently — no head-of-line blocking.
- Each queue holds exactly **1 message**, so there is nothing to block.
- The queue auto-deletes 60 seconds after firing (`expires: delay + 60_000`).
- All queues dead-letter into the same `auction-dlx` exchange → `auction-start` work queue, so the **consumer is unchanged**.

```
auction-start-delay:aaa  (TTL=5min)  → fires at T+5  ─┐
auction-start-delay:bbb  (TTL=10min) → fires at T+10 ──┤→ auction-dlx → auction-start → worker
auction-start-delay:ccc  (TTL=2min)  → fires at T+2  ─┘
```

#### Why Other Queues Are Unaffected

| Queue                       | Has TTL?        | Bias Risk | Reason                                          |
|-----------------------------|-----------------|-----------|--------------------------------------------------|
| `auction-start-delay:<id>`  | Queue-level TTL | ❌ None   | Only 1 message per queue — nothing to block     |
| `auction-dlx`               | N/A (exchange)  | ❌ None   | Routes messages, does not store them            |
| `auction-start`             | None            | ❌ None   | Consumed immediately by worker — no expiry wait |
| `bid-audit`                 | None            | ❌ None   | Consumed immediately — pure write-through       |

> Head-of-line bias is exclusively a **TTL + shared queue** problem. Queues without TTL are not subject to it.


  
