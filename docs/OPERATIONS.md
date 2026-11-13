# Job Hunter Agent — Operations, Deployment & Runbook

This guide covers setup, environment configuration, daily scheduler operation, Telegram bot onboarding, monitoring, and troubleshooting.

---

## 1. Environment Setup & Configuration

1. Clone or navigate to the repository directory.
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Configure the essential environment variables:
   - `TELEGRAM_BOT_TOKEN`: Obtain from [@BotFather](https://t.me/BotFather) on Telegram.
   - `TELEGRAM_OWNER_ID`: Your personal numeric Telegram user ID (obtain by messaging [@userinfobot](https://t.me/userinfobot)).
   - `TELEGRAM_POLLING`: Set to `true` to enable interactive bot commands.
   - `GEMINI_API_KEY`: API key from [Google AI Studio](https://aistudio.google.com/).
   - `DATABASE_URL`: `sqlite+aiosqlite:///./data/job_hunter.db` (local) or PostgreSQL URL (production).
   - `TIMEZONE`: `Africa/Cairo` (IANA timezone name).
   - `DAILY_DIGEST_TIME`: `09:00` (Cairo local time).

---

## 2. Local Execution

### Run Database Migrations
```bash
python -m alembic upgrade head
```

### Start the Application Server
```bash
python -m uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload
```
The FastAPI backend will start on `http://localhost:8000`, initialize the database, start the APScheduler cron at `09:00 Africa/Cairo`, and run the Telegram bot polling service.

---

## 3. Docker Deployment

### Run with Docker Compose
```bash
docker compose up -d --build
```

### Check Logs & Health
```bash
docker compose logs -f
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

---

## 4. Daily Scheduler & Missed-Run Catch-up

- **Daily Schedule:** Scheduled via APScheduler at `09:00 Africa/Cairo` every day.
- **Idempotency:** Enforced via `DailyRun.run_key = daily-digest-YYYY-MM-DD`. If a run has already completed for today, subsequent triggers are skipped to prevent duplicate messages.
- **Missed-Run Catchup:** When the service restarts or starts up past 09:00 Cairo time, `JobSchedulerService.check_and_run_missed_catchup()` checks if today's run completed. If not, it executes safely once.
- **Manual Trigger:** You can trigger a run at any time via:
  ```bash
  curl -X POST http://localhost:8000/api/v1/runs/trigger
  ```

---

## 5. Telegram Bot Commands & Interaction

- `/start`: Initializes private chat, verifies owner allow-list, shows baseline profile.
- `/today`: Displays today's top matches (score ≥ 60) with interactive action buttons.
- `/search [term]`: Searches active jobs by keyword (e.g. `/search angular`).
- `/profile`: Displays candidate profile, confirmed vs target skills, and education.
- `/settings`: Displays daily digest status and allows toggling.
- `/saved`: Lists jobs saved by candidate.
- `/applied`: Lists jobs where candidate marked "Applied".
- `/pause` & `/resume`: Pauses or resumes daily 09:00 Telegram digests.
- `/help`: Detailed command guide.

### Inline Actions on Job Cards:
- **Open Application (🌐):** Opens original application link in browser.
- **Save (⭐):** Marks job status as `SAVED` in database.
- **Applied (✅):** Marks job status as `APPLIED` and records application timestamp.
- **Why this match? (❓):** Displays transparent score breakdown across the 6 dimensions.
- **Not relevant (❌):** Dismisses job from recommendations.
