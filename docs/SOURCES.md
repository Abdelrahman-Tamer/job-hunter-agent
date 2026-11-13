# Job Hunter Agent — Source Integration & Compliance Directory

This document details all integrated and non-public job discovery sources, their technical contracts, terms of service, attribution requirements, and operational rate limits.

---

## 1. Verified Public Integrations

### 1. Himalayas Public Jobs API
- **Base Endpoint:** `https://himalayas.app/jobs/api`
- **Documentation:** `https://himalayas.app/jobs/api`
- **Integration Mode:** JSON REST API with cursor pagination.
- **Allowed Usage:** Read-only remote job discovery.
- **Attribution Requirement:** Visible credit to Himalayas; preserve original `applicationLink` intact without modifying tracking parameters.
- **Rate Limit:** Concurrency limited; 30 requests/minute.
- **Freshness:** Real-time remote jobs.

### 2. Remotive Public Remote Jobs API
- **Base Endpoint:** `https://remotive.com/api/remote-jobs`
- **Documentation:** `https://remotive.com/api-documentation`
- **Integration Mode:** JSON REST API with category filters (`category=software-dev`).
- **Allowed Usage:** Public feed for developers sharing jobs. Strictly prohibits submitting Remotive jobs to third-party aggregator aggregators (Jooble, Google Jobs, LinkedIn Jobs).
- **Attribution Requirement:** Visible credit to Remotive and direct link back to Remotive job listing URL.
- **Rate Limit:** Maximum 4 requests per day recommended by terms; delayed by 24 hours.
- **Freshness:** 24-hour delayed public feed.

### 3. Greenhouse Public Job Boards
- **Base Endpoint:** `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true`
- **Documentation:** `https://developers.greenhouse.io/job-board.html`
- **Integration Mode:** Public read-only company job boards (e.g. Canonical, Cloudflare, Reddit).
- **Allowed Usage:** Retrieval of published job openings for authorized board tokens.
- **Attribution Requirement:** Attributed to employer career board on Greenhouse. Direct link to application page.
- **Rate Limit:** 20 requests/minute.

### 4. Lever Postings API
- **Base Endpoint:** `https://api.lever.co/v0/postings/{company_slug}?mode=json`
- **Documentation:** `https://github.com/lever/postings-api`
- **Integration Mode:** Public read-only company postings (e.g. Palantir).
- **Allowed Usage:** Retrieval of active postings for configured company slugs.
- **Attribution Requirement:** Attributed to employer postings on Lever. Direct link to hosted posting.
- **Rate Limit:** 20 requests/minute.

### 5. RSS / Atom Syndication Feeds
- **Example Feeds:** We Work Remotely (`https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss`).
- **Integration Mode:** Standard RSS 2.0 / Atom 1.0 XML parsing via `feedparser`.
- **Allowed Usage:** Public syndication feeds conforming to standard RSS conventions.
- **Attribution Requirement:** Attributed to syndication feed domain.

---

## 2. Non-Public / Restricted Sources & Extension Policy

Platforms including **LinkedIn, Wuzzuf, Indeed, Bayt, GulfTalent, Naukrigulf, Wellfound, and Remote OK** do not offer unrestricted public APIs and strictly prohibit unauthorized scraping and login simulation in their Terms of Service.

In strict compliance with Rule 5:
- **No unauthorized scraping:** The system does NOT scrape, simulate browser logins, or bypass Cloudflare/anti-bot protection on these sites.
- **Authorized Ingestion Endpoint:** A dedicated endpoint (`POST /api/v1/sources/ingest/user-alert`) is provided so candidates can forward official email job alerts or manually input opportunities. The system automatically deduplicates, classifies geographic eligibility, and scores these inputs identically to automated feeds.
