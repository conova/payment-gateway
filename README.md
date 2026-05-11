# Payment Gateway

Mandal Capital-ын **NEGDI ecommerce merchant API** интеграцийн микросервис. Mobile app болон Core system нь NEGDI-тэй шууд харьцалцахын оронд энэ микросервисээр дамжина. Үндсэн зорилго:

- Merchant credential (terminal id / username / password) сервер-д хадгалах
- NEGDI-ийн **RSA-SHA256 signature шалгалт**-ыг автоматаар хийх
- Захиалга / Token / Audit log-ыг Oracle DB-д хадгалах
- Mobile-руу цэвэр **REST** контракт (NEGDI-ийн нарийн дотроос мобайл хамгаалагдсан)

## Архитектур

```
Mobile (Bearer JWT) ─┐
                     ├─▶ Payment Gateway HTTP ──▶ NEGDI ecommerce API
Core   (ApiKey)     ─┘     │                       (RSA-signed)
                           │
                           ├─▶ Oracle DB
                           │   ├─ payment_orders     (бүх захиалга)
                           │   ├─ payment_tokens     (хадгалсан картууд)
                           │   └─ payment_events     (NEGDI-той хийсэн бүх call-ын audit)
```

**Flow жишээ — Mobile-аас Card төлбөр:**

1. `POST /v1/payments { amount, kind: "card" }` Mobile-аас
2. Gateway → NEGDI `ec1000` (auth кэдэв-тэй) → `tranid`, `checkid`, `negdiurl`
3. Gateway хариуны signature-ийг шалгана + DB-д хадгална
4. Mobile-руу `{ tranid, checkid, redirect_url, status: "Preparing" }` буцаана
5. Mobile WebView дотор `redirect_url`-г нээнэ
6. Хэрэглэгч NEGDI-ийн UI-аар төлбөр төлнө
7. NEGDI нь `returnurl`-руу буцаана (default deep link `mandalcapital://payment/callback`)
8. Mobile → `GET /v1/payments/:tranid?checkid=...` дуудаж эцсийн статусыг авна

## Стек

- Node.js 20+ / Fastify 5 / TypeScript
- Oracle DB (`oracledb` driver, thin mode)
- `undici` — HTTP client to NEGDI
- Node `crypto` — RSA signature verification
- JWT (HS256) — Mobile auth (Core-той ижил secret)
- Static API key — Core / Admin

## Setup

```bash
cd payment-gateway
cp .env.example .env
# .env-д NEGDI credentials (terminal/user/password) болон бусдыг оруулна
npm install
npm run migrate        # 3 хүснэгт үүсгэх
npm run dev            # localhost:3002
```

Docker:
```bash
docker compose up --build
```

## API

### Health
```
GET /health
```

### Mobile (Authorization: Bearer <JWT>)

#### Төлбөр эхлүүлэх
```
POST /v1/payments
{
  "amount": 1000,
  "currency": "MNT",                   // default MNT
  "description": "...",
  "ordernum": "ORD-1234",
  "kind": "card",                       // card | qpay | save_card | token
  "customer_name": "...",               // save_card-д заавал
  "customer_register_id": "...",        // save_card-д сонголтоор
  "tokenid": 1234,                      // kind=token үед заавал
  "return_url": "mandalcapital://...",  // default env-ээс
  "theme": "W",
  "lang": "mn"
}
→ 200
{
  "tranid": 123546,
  "checkid": "1qg5gwoqmyl8",
  "status": "Preparing",
  "redirect_url": "http://x.negdi.mn:8888/...",
  "approval_code": null,
  "detail": null
}
```

#### 3DS дараа process хийх (kind=token + 3dsOrder)
```
POST /v1/payments/process
{ "tranid": 123546, "checkid": "...", "amount": 1000, "tokenid": 1246 }
→ { tranid, checkid, status, approval_code }
```

#### Захиалгын статус
```
GET /v1/payments/:tranid?checkid=...
→ Full order info (NEGDI-аас дахин татах + DB шинэчилнэ)
```

#### Цуцлах
```
POST /v1/payments/:tranid/cancel
{ "amount": 1000 }
→ { "status": "Reversed" }
```

#### Хадгалсан картууд
```
GET    /v1/tokens                  → { data: [...], count }
DELETE /v1/tokens/:tokenid         → { "status": "Approved" }
```

### Core (Authorization: ApiKey <CORE_API_KEY>)

```
POST /internal/payments/inquiry  { tranid, checkid } → Full order info
POST /internal/payments/cancel   { tranid, amount } → { status }
GET  /internal/payments/ordertypes → { status, ordertypes: [...] }
```

## NEGDI Endpoint Mapping

| Gateway endpoint                         | NEGDI endpoint | Purpose |
|------------------------------------------|----------------|---------|
| `POST /v1/payments` (kind=card)          | ec1000         | Create order (no token) |
| `POST /v1/payments` (kind=qpay)          | ec1000         | Create QR order |
| `POST /v1/payments` (kind=save_card)     | ec1001         | Create order + register token |
| `POST /v1/payments` (kind=token)         | ec1002         | Charge existing token |
| `POST /v1/payments/process`              | ec1003         | Process 3DS order |
| `GET  /v1/payments/:tranid`              | ec1098         | Inquiry order |
| `POST /v1/payments/:tranid/cancel`       | ec1099         | Cancel order |
| `DELETE /v1/tokens/:tokenid`             | ec1097         | Cancel token |
| `GET /internal/payments/ordertypes`      | ec1096         | Inquiry order types |

## Signature шалгалт

Бүх NEGDI хариунд нь `order` (object) + `ordersign` (base64 signature) бий. Сервис нь:

1. `order`-ийг `JSON.stringify(order)`-аар serialize хийнэ
2. `ordersign`-ийг base64 decode хийнэ
3. NEGDI-ийн public key-ээр RSA-SHA256-аар verify хийнэ
4. Шалгалтын үр дүн `payment_events.signature_valid`-д бичигдэнэ
5. Signature буруу бол `NegdiError` шиднэ — caller-аа 400 буцаана

Public key нь PDF баримтаас аваад `src/config/negdi.ts` дотор default-аар нэмэгдсэн. NEGDI өөрчилбөл `.env`-д `NEGDI_PUBLIC_KEY=...` гэж override хийнэ.

## DB Schema

`src/db/migrations/`:
- **payment_orders** — Бүх захиалга. `tranid` PK биш (unique), `customer_id`-р индекстэй.
- **payment_tokens** — Хадгалсан картууд. `tokenid` PK. Customer-ынхаа Active token-уудыг хайдаг.
- **payment_events** — Бүх NEGDI API call (request + response + signature шалгалтын үр дүн). Debug + audit.

## Аюулгүй байдал

- NEGDI credentials (`NEGDI_PASSWORD`) нь зөвхөн серверт. Mobile хэзээ ч хүлээж авахгүй.
- `payment_events.payload`-д password зөвхөн `***` гэж бичигдэнэ (мөшгүүлэхгүйн тулд).
- Mobile JWT-ийн `uid` (customer_id) order/token-уудтай 1:1 баталгаажуулагдана — өөр хэрэглэгчийн token-руу хандах боломжгүй.
- HTTPS reverse proxy production-д заавал (nginx → 3002 HTTP).

## Дараагийн алхамууд

- [ ] Multi-terminal (нэг сервис нь олон merchant-ын зориулсан)
- [ ] Status webhook-ийн endpoint (NEGDI-аас mid-flow notif)
- [ ] Idempotency key support (давтан хүсэлт)
- [ ] Order аудит — admin route (`GET /admin/orders`)
- [ ] Hourly inquiry job — Preparing-д удаан үлдсэн захиалгуудыг автоматаар шинэчлэх
- [ ] Tests (Vitest + nock for NEGDI mock)
- [ ] OpenAPI schema generation
