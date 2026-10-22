# Universal Downloader

A production-ready, scalable, premium Universal Downloader web application capable of downloading publicly accessible media from thousands of websites using yt-dlp.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  React (Vite)│────▶│  Express.js  │────▶│  FastAPI + yt-dlp │
│  TypeScript  │     │  Node.js     │     │  Python           │
│  TailwindCSS │     │  Prisma ORM  │     │  Background Tasks │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────▼───────┐
                     │  PostgreSQL  │
                     └──────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, TypeScript, TailwindCSS, Framer Motion |
| Backend | Node.js, Express.js, Prisma ORM |
| Download Engine | Python, FastAPI, yt-dlp |
| Database | PostgreSQL |
| Auth | JWT, Magic Link, Google OAuth |
| Deployment | Docker, Docker Compose, Nginx |

## Features

- **Smart URL Detection** - Automatically detects media type (video, audio, playlist, short)
- **Multiple Formats** - Download in various formats and qualities
- **Real-time Progress** - Live download progress with speed and ETA
- **Download Queue** - Manage multiple downloads with concurrency control
- **Premium UI** - Glassmorphism design with dark/light mode
- **Secure Auth** - Email/password, magic link, and Google OAuth
- **Download History** - Full history with search and pagination
- **Favorites** - Save URLs for quick re-downloading
- **Settings** - Customizable download preferences

## Project Structure

```
universal-downloader/
├── client/              # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utilities and API client
│   │   ├── pages/       # Page components
│   │   ├── stores/      # Zustand state management
│   │   ├── styles/      # Global CSS
│   │   └── types/       # TypeScript type definitions
│   └── ...
├── server/              # Express.js backend
│   └── src/
│       ├── config/      # App configuration
│       ├── middleware/   # Auth, error handling
│       ├── routes/      # API routes
│       ├── services/    # Business logic
│       └── utils/       # Utilities
├── python-service/      # FastAPI download engine
│   └── app/
│       ├── models/      # Pydantic schemas
│       ├── routers/     # API endpoints
│       └── services/    # yt-dlp integration
├── database/            # Prisma schema and seeds
├── docker/              # Dockerfiles and configs
└── shared/              # Shared types/utilities
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- PostgreSQL 14+
- FFmpeg (for audio/video processing)
- yt-dlp (or install via pip)

## Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd universal-downloader

# Copy environment file
cp .env.example .env

# Edit .env with your settings
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Install server dependencies
cd server && npm install && cd ..

# Install Python dependencies
cd python-service && pip install -r requirements.txt && cd ..
```

### 3. Setup Database

```bash
# Generate Prisma client
cd database && npx prisma generate

# Push schema to database (or use migrate)
npx prisma db push

# Seed admin user
npx tsx prisma/seed.ts
```

### 4. Start Development

```bash
# Start all services concurrently
npm run dev

# Or start individually:
npm run dev:client   # Frontend on :5173
npm run dev:server   # Backend on :3001
npm run dev:python   # Python service on :8001
```

### 5. Access

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001
- **Python API Docs**: http://localhost:8001/docs
- **Admin Login**: admin@universaldl.com / admin123456

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Environment Variables

See `.env.example` for all available configuration options.

### Required Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `JWT_REFRESH_SECRET` | Secret for refresh token signing |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | smtp.gmail.com | Email server host |
| `SMTP_USER` | - | Email for sending magic links |
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID |
| `PROXY_URL` | - | Proxy for yt-dlp requests |

## API Documentation

### Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login with email/password |
| POST | `/api/auth/magic-link` | Send magic link email |
| POST | `/api/auth/verify-magic` | Verify magic link token |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout and clear session |
| GET | `/api/auth/me` | Get current user |

### Download Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/downloads/analyze` | Analyze URL and get metadata |
| POST | `/api/downloads/start` | Start a download |
| GET | `/api/downloads/status/:id` | Get download progress |
| POST | `/api/downloads/cancel/:id` | Cancel active download |
| DELETE | `/api/downloads/:id` | Delete download record |
| GET | `/api/downloads/history` | Get download history |

### Favorites Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/favorites` | List favorites |
| POST | `/api/favorites` | Add to favorites |
| DELETE | `/api/favorites/:url` | Remove from favorites |

### Settings Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update user settings |

### Python Service Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/download/analyze` | Analyze URL with yt-dlp |
| POST | `/api/download/start` | Start download |
| GET | `/api/download/status/:id` | Get download status |
| POST | `/api/download/cancel` | Cancel download |
| GET | `/docs` | Swagger documentation |

## Supported Platforms

The application supports any publicly accessible content that yt-dlp can extract, including but not limited to:

- YouTube (videos, shorts, playlists)
- Vimeo
- Dailymotion
- SoundCloud
- TikTok
- Instagram (reels, posts)
- Twitter/X
- Twitch
- Facebook
- Reddit
- And many more...

## Security

- Helmet.js for HTTP header security
- Rate limiting on API endpoints
- CORS configuration
- JWT with refresh token rotation
- Input validation with Zod (server) and Pydantic (Python)
- SQL injection prevention via Prisma ORM
- XSS protection via React's automatic escaping

## License

MIT License
