# Job Hunter Agent

Production-minded personal job discovery, evaluation, and matching agent built for a candidate based in **Egypt (EG)** seeking **Software Engineering and Web Development** roles, with a primary focus on **Angular and Frontend Development**.

Features a **Telegram-first daily digest** dispatched at **09:00 Africa/Cairo**, accompanied by a FastAPI backend and modern Angular dashboard.

---

## Key Features

- **Geographic Eligibility Engine:** Deterministically classifies opportunities into 6 explicit states (`EGYPT_ELIGIBLE`, `REMOTE_WORLDWIDE`, `REMOTE_REGION_POSSIBLE`, `RELOCATION_REQUIRED`, `NOT_ELIGIBLE`, `UNKNOWN`). Conflating "Remote" with "Worldwide" is strictly prohibited.
- **Explainable 0–100 Matching:** Pure Python scoring across 6 dimensions: Role Relevance (20), Confirmed Skills (25), Experience & Seniority (20), Location & Eligibility (20), Employment Type (10), and Freshness (5).
- **Critical Profile Semantics:** Strict separation between `confirmed_skills`, `target_skills`, and `learning_skills`. Target skills (like Angular) **never** earn unverified confirmed points.
- **Truthful Date Labels:** Distinguishes `published_at` from `first_seen_at`. Never claims a job was "Posted today" unless explicitly published on the current day.
- **Compliant Public Source Adapters:** Pluggable adapters for Himalayas, Remotive, Greenhouse Job Boards, Lever Postings, and RSS feeds. Adheres to terms, respects rate limits, and preserves attribution.
- **Private Telegram Bot:** Private single-user bot strictly allow-listing the owner's numeric Telegram ID. Features bilingual cards (Arabic RTL support + English technical terms) and inline action buttons (Save, Applied, Dismiss, Why this match?).
- **Automated Daily Scheduler:** Executes daily at `09:00 Africa/Cairo` with database-backed idempotency locks (`daily-digest-YYYY-MM-DD`) and missed-run catchup logic.
- **Angular 22 Dashboard:** Standalone components, Signals, Arabic RTL support, job explorer, profile manager, and application tracker.

---

## Architecture Overview

```
                                +---------------------------+
                                |  Compliant Source APIs    |
                                |  (Himalayas, Remotive,    |
                                |   Greenhouse, Lever, RSS) |
                                +-------------+-------------+
                                              |
                                              v
+-----------------------+       +-------------+-------------+
| Telegram Bot Service  | <---> |   FastAPI Modular Monolith|
| (Private single-user) |       |   - Deduplication Engine  |
+-----------------------+       |   - Eligibility Engine    |
                                |   - 0-100 Matching Engine |
+-----------------------+       |   - APScheduler (09:00)   |
| Angular 22 Dashboard  | <---> |   - Gemini AI Extractor   |
| (Standalone + Signals)|       +-------------+-------------+
+-----------------------+                     |
                                              v
                                +-------------+-------------+
                                |  SQLAlchemy 2.x + Alembic |
                                |  (SQLite / PostgreSQL)    |
                                +---------------------------+
```

---

## Quickstart & Local Setup

### 1. Prerequisites
- Python 3.12+ (tested up to Python 3.14)
- Node.js 20+ and npm
- Telegram account

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update the following settings in `.env`:
- `TELEGRAM_BOT_TOKEN`: Your bot token from [@BotFather](https://t.me/BotFather).
- `TELEGRAM_OWNER_ID`: Your numeric Telegram user ID from [@userinfobot](https://t.me/userinfobot).
- `GEMINI_API_KEY`: Your API key from [Google AI Studio](https://aistudio.google.com/) (optional, enables AI attribute extraction).

### 3. Run Migrations & Start Backend
```bash
# Apply database migrations
python -m alembic upgrade head

# Start FastAPI server, scheduler, and Telegram bot
python -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Running the Automated Test Suite

Execute the complete test suite (36+ tests):
```bash
pytest -v
```

The test suite covers:
- Geographic eligibility classification (Egypt on-site/hybrid, remote worldwide, EMEA/MENA, relocation, exclusions).
- Deterministic 0–100 matching engine and proof that target skills do not earn confirmed-skill points.
- Source adapter normalization, rate limit retries, and SSRF prevention.
- Prompt injection defense and PII sanitization.
- Deduplication, canonical URL hashing, and tracking parameter stripping.
- Telegram owner authorization allow-list and callback query updates.
- Idempotency locks, source failure isolation, and zero-results summaries.
- REST API routes (`/health`, `/ready`, `/jobs`, `/profile`, `/tracker`, `/sources`, `/runs`).

---

## Telegram Bot Guide

1. Start your bot by sending `/start` from your authorized Telegram account.
2. Available commands:
   - `/today` — View top matching jobs for today.
   - `/search [term]` — Search active opportunities (e.g. `/search angular`).
   - `/profile` — Inspect candidate profile, confirmed vs target skills.
   - `/settings` — View schedule (09:00 Cairo) and digest preferences.
   - `/saved` — Review saved jobs.
   - `/applied` — Review opportunities marked as applied.
   - `/pause` & `/resume` — Toggle daily digests.
   - `/help` — List all available commands.

---

## Docker Deployment

To build and run the containerized service:
```bash
docker compose up -d --build
```
Verify container health:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

---

## Source Integrations & Compliance

| Source | Integration Mode | Attribution | Freshness |
|---|---|---|---|
| **Himalayas** | Public REST API | Himalayas (app link preserved) | Real-time |
| **Remotive** | Public REST API | Remotive (link back required) | Delayed 24h |
| **Greenhouse** | Public Board API | Employer via Greenhouse | Real-time |
| **Lever** | Public Postings API | Employer via Lever | Real-time |
| **RSS / Atom** | Syndication Feeds | Syndication Provider | Periodic |
| **User Alert Ingest**| Direct API Ingest | Forwarded Alert | Instant |

---

## License

MIT License. Designed with security, privacy, and accuracy as primary requirements.
