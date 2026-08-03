# GuardianLink 🛡️

> **Voluntary live GPS location sharing between family members.**
> The recipient opens a link, grants browser permission, and their location appears on your dashboard in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Map | Leaflet.js + OpenStreetMap |
| PWA | vite-plugin-pwa + Workbox |
| Backend | Django 6 + Django REST Framework |
| Auth | djangorestframework-simplejwt (JWT) |
| Real-time | Django Channels + Daphne (ASGI) |
| DB | PostgreSQL (prod) / SQLite (dev) |
| Cache/WS | Redis (prod) / in-memory (dev) |
| Deployment | Render.com |

---

## Project Structure

```
GPS/
├── backend/
│   ├── guardianlink/          ← Django project
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── asgi.py
│   ├── authentication/        ← JWT login/logout/profile
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── tracking/              ← Person & Location models + WS consumer
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── consumers.py
│   │   ├── routing.py
│   │   └── urls.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/        ← LiveMap, PersonCard, StatsPanel, QRModal, TopBar
│   │   ├── context/           ← AuthContext, ThemeContext
│   │   ├── hooks/             ← useWebSocket, useGeolocation
│   │   ├── lib/               ← api.ts (axios)
│   │   ├── pages/             ← LoginPage, DashboardPage, SharePage
│   │   └── types.ts
│   ├── public/
│   │   └── _redirects
│   ├── vite.config.ts
│   └── .env.example
├── render.yaml
└── README.md
```

---

## Local Development

### Prerequisites
- Python 3.10+
- Node 20+
- (Optional) Redis for WebSocket channel layer

### Backend Setup

```bash
cd GPS

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env — at minimum set SECRET_KEY

# Run migrations
cd backend
python manage.py migrate

# Create admin account (NO public registration)
python manage.py createsuperuser

# Start development server (ASGI)
python manage.py runserver
# Or with Daphne:
# daphne -p 8000 guardianlink.asgi:application
```

### Frontend Setup

```bash
cd GPS/frontend

# Install dependencies
npm install

# Configure environment (optional for dev — proxy handles it)
cp .env.example .env.local

# Start dev server (proxies /api and /ws to localhost:8000)
npm run dev
```

Open http://localhost:5173 in your browser.

---

## API Reference

### Authentication (JWT)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/login/` | — | Get access + refresh tokens |
| POST | `/api/logout/` | JWT | Blacklist refresh token |
| POST | `/api/token/refresh/` | — | Refresh access token |
| GET | `/api/profile/` | JWT | Current admin profile |

### Persons (Admin only)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/persons/` | JWT | List your persons |
| POST | `/api/persons/` | JWT | Create a person |
| GET | `/api/persons/{id}/` | JWT | Get one person |
| PATCH | `/api/persons/{id}/` | JWT | Update name or enabled |
| DELETE | `/api/persons/{id}/` | JWT | Delete person + history |
| POST | `/api/persons/{id}/regenerate/` | JWT | New tracking token |

### Location (Public — token-authenticated)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/location/{token}/` | Token | Post GPS ping |
| POST | `/api/share/start/{token}/` | Token | Signal sharing started |
| POST | `/api/share/stop/{token}/` | Token | Signal sharing stopped |

### Location (Admin)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/location/latest/{token}/` | JWT | Latest location |
| GET | `/api/location/history/{token}/` | JWT | History (up to 1000) |
| GET | `/api/export/{token}/?format=json\|csv` | JWT | Export data |

### WebSocket

```
ws://host/ws/location/{tracking_token}/
```

Message types received by dashboard:
- `{"type": "location.update", "data": {...Location}}` — new GPS ping
- `{"type": "presence.update", "data": {"status": "online|offline", "person_id": N}}`
- `{"type": "connected"}`
- `{"type": "pong"}` — response to ping heartbeat

---

## Deployment on Render

### Prerequisites
1. Push this repository to GitHub
2. Create a Render account at render.com

### Steps

1. **Connect repository** — In Render dashboard, click "New Blueprint" and select your GitHub repo
2. **Apply `render.yaml`** — Render will detect it and provision:
   - `guardianlink-backend` (Python web service)
   - `guardianlink` (Static site)
   - `guardianlink-db` (PostgreSQL)
3. **Add Redis** — In Render dashboard, create a Redis instance named `guardianlink-redis`
4. **Link Redis** — Add `REDIS_URL` env var to the backend service using the Redis internal URL
5. **Update CORS** — Set `CORS_ORIGIN` on backend to your frontend URL
6. **Create admin** — Use Render's Shell tab to run:
   ```bash
   python manage.py createsuperuser
   ```
7. **Update frontend env** — Set `VITE_API_URL` and `VITE_WS_URL` to your backend URL

### Environment Variables

#### Backend
| Variable | Description | Example |
|---|---|---|
| `SECRET_KEY` | Django secret key | Auto-generated by Render |
| `DEBUG` | Debug mode | `False` |
| `DATABASE_URL` | PostgreSQL connection | Auto-wired from database |
| `REDIS_URL` | Redis connection | From Redis service |
| `ALLOWED_HOSTS` | Backend hostnames | `guardianlink-backend.onrender.com` |
| `CORS_ORIGIN` | Frontend origin | `https://guardianlink.onrender.com` |
| `FRONTEND_URL` | Frontend base URL | `https://guardianlink.onrender.com` |

#### Frontend
| Variable | Description | Example |
|---|---|---|
| `VITE_API_URL` | Backend API base URL | `https://guardianlink-backend.onrender.com/api` |
| `VITE_WS_URL` | WebSocket base URL | `wss://guardianlink-backend.onrender.com` |

---

## Security Notes

- **No public registration** — Admin accounts are created via `python manage.py createsuperuser` only
- **Multi-tenant isolation** — Each admin only sees and manages their own persons
- **Token security** — Tracking tokens are random UUIDs; never predictable
- **JWT blacklisting** — Logout invalidates the refresh token server-side
- **HTTPS enforced** in production (`SECURE_SSL_REDIRECT = True` when `DEBUG=False`)
- **Rate limiting** — 120 req/min for anonymous, 600/min for authenticated users
- **CORS** — Only the configured frontend origin is allowed

---

## Privacy

> GuardianLink only collects location **after the recipient explicitly grants browser geolocation permission**.
> No background tracking, no silent collection. The recipient can stop sharing at any time.

---

## License

MIT — Built for family safety with ❤️
