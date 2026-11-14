"""Telegram Bot Dispatcher with crisp, executive English UX and zero-lag responsiveness."""

import asyncio
from datetime import datetime, timezone
import html
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import (
    build_job_inline_keyboard,
    build_main_menu_keyboard,
    build_persistent_reply_keyboard,
    build_quick_filters_keyboard,
    chunk_message,
    escape,
    format_job_card,
    format_match_breakdown,
    make_progress_bar,
)
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.engine.gemini_extractor import GeminiJobExtractor
from src.models.enums import (
    ApplicationStatus,
    GeographicEligibility,
    SeniorityLevel,
    WorkplaceType,
)
from src.models.job import Job
from src.models.notification import NotificationLog
from src.models.tracker import JobStatusTracker
from src.services.profile_service import (
    apply_verified_cv_to_profile,
    get_or_create_candidate_profile,
)


class TelegramBotDispatcher:
    """Dispatches incoming Telegram updates to specialized handlers with executive English UX."""

    def __init__(self, telegram_client: Optional[TelegramClient] = None):
        self.client = telegram_client or TelegramClient()
        self.owner_id = settings.TELEGRAM_OWNER_ID
        self.gemini = GeminiJobExtractor()

    def is_authorized(self, user_id: Optional[int]) -> bool:
        """Enforce strict allowlist check if TELEGRAM_OWNER_ID is configured."""
        if not self.owner_id or self.owner_id == 0:
            return True
        return user_id == self.owner_id

    async def handle_update(self, update: Dict[str, Any], session: AsyncSession) -> None:
        """Route incoming message or callback query."""
        if "message" in update:
            await self._handle_message(update["message"], session)
        elif "callback_query" in update:
            await self._handle_callback(update["callback_query"], session)

    async def _handle_message(self, message: Dict[str, Any], session: AsyncSession) -> None:
        user_id = message.get("from", {}).get("id")
        chat_id = message.get("chat", {}).get("id")
        text = (message.get("text") or "").strip()

        if not chat_id or not text:
            return

        # Security allowlist
        if not self.is_authorized(user_id):
            logger.warning(f"Unauthorized Telegram access attempt from user_id={user_id}")
            await self.client.send_message(
                chat_id=chat_id,
                text="⛔ <b>Access Denied: Private Candidate Bot.</b>\nThis bot is private and locked to its authorized candidate owner.",
            )
            return

        clean_text = text.strip()
        clean_lower = clean_text.lower()

        # Handle Conversational Greetings (English + Arabic fallbacks)
        greetings = ("hello", "hi", "hey", "welcome", "good morning", "good evening", "howdy", "start",
                     "السلام عليكم", "مرحبا", "أهلا", "اهلا", "صباح الخير", "مساء الخير", "ازيك")
        if any(clean_lower == g or clean_lower.startswith(g + " ") for g in greetings):
            profile = await get_or_create_candidate_profile(session)
            welcome_msg = f"""👋 <b>Welcome, {escape(profile.full_name or 'Abdelrahman')}!</b>
I am your AI agent specialized in high-fit <b>Angular & Frontend Engineering</b> opportunities across Egypt 🇪🇬 and Worldwide Remote.

💡 <i>Tap any quick action on the bottom keyboard, or type any tech keyword to search instantly:</i>"""
            markup = build_main_menu_keyboard()
            reply_kb = build_persistent_reply_keyboard()
            await self.client.send_message(chat_id=chat_id, text=welcome_msg, reply_markup=reply_kb)
            await self.client.send_message(chat_id=chat_id, text="🎛️ <b>BottaJobs Control Center:</b>", reply_markup=markup)
            return

        # Handle Persistent Bottom Keyboard Actions (English primary + Arabic fallbacks)
        if clean_text in ("🚀 Run Scan", "🚀 Run Scan Now", "Run Scan", "run", "🚀 فحص الوظائف الآن", "فحص الوظائف", "فحص فوري"):
            await self._cmd_trigger_run(chat_id, session)
            return
        elif clean_text in ("📋 Today's Jobs", "Today's Jobs", "Today Jobs", "today", "📋 أفضل وظائف اليوم", "وظائف اليوم", "فرص اليوم"):
            await self._cmd_today(chat_id, session)
            return
        elif clean_text in ("👤 My Profile / CV", "My Profile", "Profile", "profile", "👤 ملفي والـ CV", "ملفي الشخصي", "البروفايل"):
            await self._cmd_profile(chat_id, session)
            return
        elif clean_text in ("⭐ Saved Jobs", "Saved Jobs", "Saved", "saved", "⭐ وظائفي المحفوظة", "المحفوظات"):
            await self._cmd_saved(chat_id, session)
            return
        elif clean_text in ("📝 Applied Pipeline", "Applied Pipeline", "Applied", "applied", "📝 سجل التقديمات", "التقديمات"):
            await self._cmd_applied(chat_id, session)
            return
        elif clean_text in ("🔍 Smart Filters", "Filters", "filters", "🔍 فلاتر وتصنيفات", "🔍 فلاتر سريعة"):
            await self._cmd_quick_filters(chat_id)
            return
        elif clean_text in ("🌐 Web Dashboard", "Dashboard", "dashboard", "🌐 لوحة التحكم (Mini App)", "الموقع"):
            await self._cmd_open_dashboard(chat_id)
            return
        elif clean_text in ("📖 Help & Guide", "Help", "help", "📖 المساعدة والدليل", "المساعدة"):
            await self._cmd_help(chat_id)
            return

        parts = text.split(maxsplit=1)
        command = parts[0].lower().split("@")[0]
        args = parts[1] if len(parts) > 1 else ""

        if command == "/start":
            await self._cmd_start(chat_id, session)
        elif command == "/menu":
            await self._cmd_menu(chat_id, session)
        elif command == "/today":
            await self._cmd_today(chat_id, session)
        elif command == "/search":
            await self._cmd_search(chat_id, args, session)
        elif command == "/filters":
            await self._cmd_quick_filters(chat_id)
        elif command == "/profile":
            await self._cmd_profile(chat_id, session)
        elif command == "/settings":
            await self._cmd_settings(chat_id, session)
        elif command == "/saved":
            await self._cmd_saved(chat_id, session)
        elif command == "/applied":
            await self._cmd_applied(chat_id, session)
        elif command == "/pause":
            await self._cmd_toggle_digest(chat_id, enabled=False, session=session)
        elif command == "/resume":
            await self._cmd_toggle_digest(chat_id, enabled=True, session=session)
        elif command in ("/wipe", "/reset", "/clear"):
            await self._cmd_wipe(chat_id, session)
        elif command in ("/run", "/crawl", "/trigger"):
            await self._cmd_trigger_run(chat_id, session)
        elif command == "/help":
            await self._cmd_help(chat_id)
        elif not command.startswith("/"):
            # Natural language keyword query (e.g. user sends "Angular" or "Remote")
            await self._cmd_search(chat_id, text, session)
        else:
            await self.client.send_message(
                chat_id=chat_id,
                text="❓ <b>Unknown command.</b>\nSend /help to view all available commands or tap the quick buttons below.",
            )

    async def _cmd_start(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        if not profile.confirmed_skills or not profile.full_name:
            profile = await apply_verified_cv_to_profile(session)

        skills_count = len(profile.confirmed_skills or [])
        welcome = f"""👋 <b>Welcome to BottaJobs Control Center!</b>
Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>

🤖 Personal AI job agent specialized in high-fit <b>Angular & Frontend Engineering</b> roles across Egypt 🇪🇬 and Worldwide Remote.

🎯 <b>Current Target Criteria:</b>
• Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• Priority Target: <b>{escape(profile.priority_target)}</b>
• Verified Skills: <b>{skills_count} authenticated skills</b>
• Daily Digest: <b>{profile.digest_time} (Africa/Cairo)</b>
• Status: <b>{'Active & Running Daily ✅' if profile.digest_enabled else 'Paused ⏸️'}</b>

👇 <i>Use the persistent keyboard below or choose from the interactive control center:</i>
"""
        reply_kb = build_persistent_reply_keyboard()
        await self.client.send_message(chat_id=chat_id, text=welcome, reply_markup=reply_kb)
        markup = build_main_menu_keyboard()
        await self.client.send_message(chat_id=chat_id, text="🎛️ <b>BottaJobs Control Center:</b>", reply_markup=markup)

    async def _cmd_menu(self, chat_id: int, session: AsyncSession) -> None:
        """Display interactive inline control center."""
        profile = await get_or_create_candidate_profile(session)
        text = f"""🎛️ <b>BottaJobs Interactive Control Center</b>
═════════════════════════════
👤 <b>Candidate:</b> {escape(profile.full_name or 'Abdelrahman Emam')}
🎯 <b>Focus:</b> {escape(profile.priority_target)}
🛠️ <b>Verified Skills:</b> {len(profile.confirmed_skills or [])} authenticated

<i>Tap any interactive button below:</i>"""
        markup = build_main_menu_keyboard()
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_open_dashboard(self, chat_id: int) -> None:
        markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "🌐 Launch Web App Dashboard",
                        "web_app": {"url": "https://job-hunter-agent-bottajobs.onrender.com"},
                    }
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text="🚀 <b>BottaJobs Web App Dashboard:</b>\nTap below to open the interactive dashboard directly within Telegram to inspect analytics, review jobs, and manage your CV.",
            reply_markup=markup,
        )

    async def _cmd_quick_filters(self, chat_id: int) -> None:
        markup = build_quick_filters_keyboard()
        await self.client.send_message(
            chat_id=chat_id,
            text="🔍 <b>Select a Smart Preset Filter:</b>\nChoose a category to browse curated matching opportunities:",
            reply_markup=markup,
        )

    async def _cmd_today(self, chat_id: int, session: AsyncSession) -> None:
        """Display today's top matches."""
        stmt = (
            select(Job)
            .where(
                Job.is_active == True,
                Job.eligibility != GeographicEligibility.NOT_ELIGIBLE,
                Job.match_score >= 60.0,
            )
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            empty_today_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🚀 Run Live Scan Now", "callback_data": "menu:run"},
                        {"text": "🔍 Browse Smart Filters", "callback_data": "menu:filters"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="📭 <b>No active matches above threshold (≥ 60%) recorded right now.</b>\nYou can trigger an immediate scan across all job sources or browse preset filters:",
                reply_markup=empty_today_markup,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"📋 <b>Top {len(jobs)} Opportunities Matched Today:</b>\n<i>Ranked by relevance to your verified CV & skills 🎯</i>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        today_footer = {
            "inline_keyboard": [
                [
                    {"text": "🚀 Scan More Sources", "callback_data": "menu:run"},
                    {"text": "🔍 Smart Presets", "callback_data": "menu:filters"},
                ],
                [
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text="✨ <i>Tip: Save opportunities to review later or mark applied to update your pipeline.</i>",
            reply_markup=today_footer,
        )

    async def _cmd_search(self, chat_id: int, query: str, session: AsyncSession) -> None:
        """Search active jobs with precision across title, company, skills, and location."""
        clean_q = query.strip()
        if not clean_q:
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ Please provide a search term. Example:\n<code>/search Angular</code> or <code>/search Remote</code>",
            )
            return

        stmt = (
            select(Job)
            .where(
                Job.is_active == True,
                Job.eligibility != GeographicEligibility.NOT_ELIGIBLE,
                or_(
                    Job.title.ilike(f"%{clean_q}%"),
                    Job.company.ilike(f"%{clean_q}%"),
                    Job.raw_location.ilike(f"%{clean_q}%"),
                    Job.description_text.ilike(f"%{clean_q}%"),
                ),
            )
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            empty_search_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🚀 Run Live Scan Now", "callback_data": "menu:run"},
                        {"text": "🔍 Smart Presets", "callback_data": "menu:filters"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text=f"🔍 No active jobs matched '<b>{escape(clean_q)}</b>'.\n💡 Try broad keywords like <code>Angular</code>, <code>TypeScript</code>, or <code>Remote</code>, or trigger a live multi-source scan.",
                reply_markup=empty_search_markup,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"🔍 <b>Search results for '{escape(clean_q)}' ({len(jobs)} jobs):</b>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        search_footer = {
            "inline_keyboard": [
                [
                    {"text": "🔍 Smart Presets", "callback_data": "menu:filters"},
                    {"text": "📋 Today's Jobs", "callback_data": "menu:today"},
                ],
                [
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"✨ <i>End of results for '{escape(clean_q)}'.</i>",
            reply_markup=search_footer,
        )

    async def _cmd_profile(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        if not profile.confirmed_skills or not profile.full_name:
            profile = await apply_verified_cv_to_profile(session)

        skills = profile.confirmed_skills or []

        def filter_group(expected: List[str]) -> List[str]:
            return [s for s in skills if any(e.lower() in s.lower() or s.lower() in e.lower() for e in expected)]

        group_frontend = filter_group(["Angular", "TypeScript", "JavaScript", "RxJS", "HTML5", "CSS3", "JSON"])
        group_styling = filter_group(["Tailwind", "Bootstrap", "Responsive", "UI/UX"])
        group_arch = filter_group(["RESTful APIs", "REST APIs", "HttpClient", "State Management", "SPA Architecture", "Component-Driven"])
        group_tools = filter_group(["Firebase", "Supabase", "Git", "GitHub"])
        group_eng = filter_group(["Clean Code", "Frontend Performance", "Cross-Browser", "Agile", "Scrum", "Problem Solving", "Debugging"])

        categorized = set(group_frontend + group_styling + group_arch + group_tools + group_eng)
        remaining = [s for s in skills if s not in categorized]

        exp_str = f"{profile.experience_years} years" if profile.experience_years is not None else "Graduate / Junior (Verified with production projects)"

        text = f"""👤 <b>Candidate Profile & Verified Credentials</b>
═════════════════════════════
👤 <b>Name:</b> {escape(profile.full_name or 'Abdelrahman Emam')}
🎯 <b>Target:</b> {escape(profile.priority_target)}
🌍 <b>Location:</b> {profile.country} (Egypt) 🇪🇬 | Open to Remote Worldwide
💼 <b>Seniority:</b> {exp_str}
🎓 <b>Degree:</b> {escape(profile.degree_title or 'Computer Science / Engineering')} ({profile.graduation_year or '2024'})
🏛️ <b>Institution:</b> {escape(profile.education_institution or 'N/A')}

🛠️ <b>Verified Skills ({len(skills)} authenticated from CV):</b>
• 🅰️ <b>Frontend Core:</b>
  <code>{escape(', '.join(group_frontend) or 'Angular, TypeScript, RxJS')}</code>
• 🎨 <b>UI & Styling:</b>
  <code>{escape(', '.join(group_styling) or 'Tailwind CSS, Bootstrap 5')}</code>
• 🌐 <b>APIs & Architecture:</b>
  <code>{escape(', '.join(group_arch) or 'RESTful APIs, HttpClient, SPA Architecture')}</code>
• 🗄️ <b>Cloud & Tools:</b>
  <code>{escape(', '.join(group_tools) or 'Firebase, Supabase, Git, GitHub')}</code>
• ⚙️ <b>Engineering & Practices:</b>
  <code>{escape(', '.join(group_eng + remaining))}</code>

🔗 <b>Professional Portfolios:</b>
• LinkedIn: {escape(profile.linkedin_url or 'https://www.linkedin.com/in/abdelrahman-tamer')}
• GitHub: {escape(profile.github_url or 'https://github.com/Abdelrahman-Tamer')}
"""
        markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 Scan for Matching Jobs", "callback_data": "menu:run"},
                    {"text": "📋 Top Matches Today", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🌐 Open Web Dashboard & CV Editor", "web_app": {"url": "https://job-hunter-agent-bottajobs.onrender.com"}},
                ],
                [
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_settings(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        is_active = bool(profile.digest_enabled)

        toggle_btn_text = "⏸️ Pause Daily Digest" if is_active else "▶️ Resume Daily Digest"
        toggle_callback = "settings:pause" if is_active else "settings:resume"

        text = f"""⚙️ <b>Daily Digest & Alert Settings</b>
═════════════════════════════
• ⏰ <b>Schedule:</b> {profile.digest_time} Cairo Time (Africa/Cairo)
• 🔔 <b>Status:</b> {'Active & Scheduled Daily ✅' if is_active else 'Paused ⏸️'}
• 🎯 <b>Minimum Score Threshold:</b> {profile.digest_threshold:.0f}%
• 🇪🇬 <b>Geographic Scope:</b> Egypt on-site + Worldwide & Gulf remote
• ⏳ <b>Freshness Window:</b> Max 30 days (older posts excluded)

<i>Tap below to toggle your daily digest with one click:</i>"""

        markup = {
            "inline_keyboard": [
                [
                    {"text": toggle_btn_text, "callback_data": toggle_callback},
                ],
                [
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_toggle_digest(self, chat_id: int, enabled: bool, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        profile.digest_enabled = 1 if enabled else 0
        await session.commit()
        msg = "✅ Daily digest resumed successfully." if enabled else "⏸️ Daily digest paused."
        await self.client.send_message(chat_id=chat_id, text=msg)

    async def _cmd_saved(self, chat_id: int, session: AsyncSession) -> None:
        stmt = (
            select(Job)
            .join(JobStatusTracker)
            .where(JobStatusTracker.status == ApplicationStatus.SAVED)
            .order_by(Job.match_score.desc())
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            empty_markup = {
                "inline_keyboard": [
                    [
                        {"text": "📋 Browse Today's Top Matches", "callback_data": "menu:today"},
                        {"text": "🚀 Run Live Scan", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="⭐ <b>Your saved jobs list is currently empty.</b>\n\n💡 <i>Tap ⭐ Save Job on any job card to bookmark it for later review.</i>",
                reply_markup=empty_markup,
            )
            return

        await self.client.send_message(chat_id=chat_id, text=f"⭐ <b>Bookmarked Opportunities ({len(jobs)}):</b>")
        for job in jobs[:5]:
            tracker_status = job.tracker.status.value if job.tracker else "saved"
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        footer_markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 Scan for New Jobs", "callback_data": "menu:run"},
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"⭐ <i>Total bookmarked opportunities: {len(jobs)} jobs.</i>",
            reply_markup=footer_markup,
        )

    async def _cmd_applied(self, chat_id: int, session: AsyncSession) -> None:
        stmt = (
            select(Job)
            .join(JobStatusTracker)
            .where(JobStatusTracker.status == ApplicationStatus.APPLIED)
            .order_by(JobStatusTracker.applied_at.desc())
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            empty_markup = {
                "inline_keyboard": [
                    [
                        {"text": "📋 Browse Today's Top Matches", "callback_data": "menu:today"},
                        {"text": "🚀 Run Live Scan", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="📝 <b>Your application pipeline is currently empty.</b>\n\n💡 <i>When you apply for a position, tap ✅ Mark as Applied on its card to track it here.</i>",
                reply_markup=empty_markup,
            )
            return

        applied_lines = [
            f"📝 <b>Application Pipeline ({len(jobs)} active):</b>",
            "═════════════════════════════",
        ]
        for idx, job in enumerate(jobs[:8], 1):
            applied_date = job.tracker.applied_at.strftime("%Y-%m-%d") if job.tracker and job.tracker.applied_at else "Recently"
            app_url = job.original_application_url or job.source_url
            applied_lines.append(
                f"{idx}. 💼 <b>{escape(job.title)}</b>\n"
                f"   🏢 {escape(job.company)} | 🎯 {job.match_score:.0f}%\n"
                f"   📅 Applied: <code>{applied_date}</code>\n"
                f"   🔗 <a href=\"{app_url}\">Direct Application Link</a>\n"
            )

        applied_markup = {
            "inline_keyboard": [
                [
                    {"text": "📋 Today's Jobs", "callback_data": "menu:today"},
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text="\n".join(applied_lines),
            reply_markup=applied_markup,
        )

    async def _cmd_wipe(self, chat_id: int, session: AsyncSession) -> None:
        """Wipe all legacy jobs to start fresh with verified CV."""
        await session.execute(delete(JobStatusTracker))
        await session.execute(delete(NotificationLog))
        await session.execute(delete(Job))
        await session.commit()

        # Ensure verified profile is active
        profile = await apply_verified_cv_to_profile(session)

        sample_skills = ", ".join(profile.confirmed_skills[:5]) + ("..." if len(profile.confirmed_skills) > 5 else "")
        exp_text = f"{profile.experience_years} years" if profile.experience_years is not None else "Unspecified"

        msg = f"""🧹 <b>Legacy job database cleared successfully!</b>
All previous listings have been purged.

👤 <b>Verified Active Candidate:</b>
• Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• Priority Target: <b>{escape(profile.priority_target)}</b>
• Verified Skills: <b>{len(profile.confirmed_skills)} skills</b> ({escape(sample_skills)})
• Experience: <b>{exp_text}</b>

🚀 To run an immediate multi-source discovery scan with your verified profile, send:
/run"""
        await self.client.send_message(chat_id=chat_id, text=msg)

    async def _cmd_trigger_run(self, chat_id: int, session: AsyncSession) -> None:
        """Trigger an on-demand discovery and matching run with live animated telemetry."""
        profile = await get_or_create_candidate_profile(session)
        skills_count = len(profile.confirmed_skills or [])

        # Broadcast typing status
        await self.client.send_chat_action(chat_id, "typing")

        init_frame = f"""⚡ <b>BottaJobs Discovery & AI Matching Engine</b>
═════════════════════════════
⏳ <code>[██░░░░░░░░] 20%</code>
📡 <b>Connecting to job sources in parallel...</b>
• Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b> ({skills_count} verified skills)
• Target: <b>{escape(profile.priority_target)}</b>
• Sources: <i>Himalayas, Remotive, Greenhouse, Lever, RSS...</i>
"""
        progress_resp = await self.client.send_message(chat_id=chat_id, text=init_frame)
        msg_id = progress_resp.get("result", {}).get("message_id")

        last_update_ts = [datetime.now(timezone.utc)]

        async def telemetry_callback(status_text: str, percent: int):
            if not msg_id:
                return
            now = datetime.now(timezone.utc)
            if (now - last_update_ts[0]).total_seconds() < 1.0 and percent < 100:
                return
            last_update_ts[0] = now
            bar = make_progress_bar(percent, 100, 10)
            frame = f"""⚡ <b>BottaJobs Discovery & AI Matching Engine</b>
═════════════════════════════
⏳ <code>[{bar}] {percent}%</code>
📡 <b>{escape(status_text)}</b>
• Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• Target: <b>{escape(profile.priority_target)}</b>
"""
            try:
                await self.client.edit_message_text(chat_id=chat_id, message_id=msg_id, text=frame)
            except Exception:
                pass

        start_time = datetime.now(timezone.utc)
        from src.scheduler.runner import DailyPipelineRunner
        runner = DailyPipelineRunner()
        run_record = await runner.execute_daily_run(
            session,
            force=True,
            target_chat_id=chat_id,
            progress_callback=telemetry_callback,
        )
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()

        min_score = min(60.0, profile.digest_threshold)
        stmt = (
            select(Job)
            .where(
                Job.is_active == True,
                Job.eligibility != GeographicEligibility.NOT_ELIGIBLE,
                Job.match_score >= min_score,
            )
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        top_jobs = res.scalars().all()

        final_summary = f"""✨ <b>Discovery and matching completed!</b>
═════════════════════════════
✅ <code>[██████████] 100%</code>

📊 <b>Live Scan Summary:</b>
• Total opportunities scanned: <b>{run_record.jobs_discovered}</b>
• New listings ingested: <b>{run_record.jobs_new}</b>
• High-fit matches (≥ {min_score:.0f}%): <b>{len(top_jobs)}</b>
• Total execution time: <b>{duration:.1f}s</b> ⚡
"""
        if msg_id:
            await self.client.edit_message_text(chat_id=chat_id, message_id=msg_id, text=final_summary)
        else:
            await self.client.send_message(chat_id=chat_id, text=final_summary)

        if top_jobs:
            await self.client.send_message(
                chat_id=chat_id,
                text=f"📋 <b>Top {len(top_jobs)} verified matches for your profile:</b>",
            )
            for job in top_jobs:
                tracker_status = job.tracker.status.value if job.tracker else None
                card_html = format_job_card(job)
                markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
                await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)
        else:
            no_jobs_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🔍 Browse Smart Presets", "callback_data": "menu:filters"},
                        {"text": "📋 View All Jobs", "callback_data": "menu:today"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ Scan completed, but no new jobs exceeded your match threshold at this exact moment. You will be notified in your morning digest (09:00 AM Cairo), or you can explore preset filters below:",
                reply_markup=no_jobs_markup,
            )

    async def _cmd_help(self, chat_id: int) -> None:
        help_text = """📖 <b>BottaJobs Executive User Guide</b>
═════════════════════════════
🤖 <b>AI Job Hunter specialized in Angular & Frontend Engineering:</b>

• <b>🚀 Run Scan</b> (<code>/run</code>):
  Scans all configured global and local sources in parallel with real-time animated telemetry.

• <b>📋 Today's Jobs</b> (<code>/today</code>):
  Shows the top curated matches against your verified CV (including itemized requirement gaps to reach 100%).

• <b>🔍 Smart Filters</b> (<code>/filters</code>):
  Instant presets for Angular, Junior roles, Remote Worldwide, Egypt & Gulf, and Disclosed Salaries.

• <b>👤 My Profile / CV</b> (<code>/profile</code>):
  Displays your 32 verified skills, experience, portfolio links, and education.

• <b>⭐ Saved Jobs</b> (<code>/saved</code>):
  Review your bookmarked opportunities.

• <b>📝 Applied Pipeline</b> (<code>/applied</code>):
  Track the companies and positions you have applied to.

• <b>⚙️ Digest Settings</b> (<code>/settings</code>):
  Configure or pause your daily 09:00 AM Cairo digest with one tap.

• <b>🔎 Instant Search</b>:
  Type any keyword directly (e.g. <code>Angular</code>, <code>TypeScript</code>, <code>Remote</code>) to search the active database instantly.

💡 <i>Safety Guarantee: The bot never applies on your behalf without your direct oversight. It equips you with direct apply links, tailored AI cover letters, and technical interview questions at a single tap.</i>
"""
        markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 Run Live Scan", "callback_data": "menu:run"},
                    {"text": "📋 Top Matches Today", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🔍 Smart Presets", "callback_data": "menu:filters"},
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(chat_id=chat_id, text=help_text, reply_markup=markup)

    async def _handle_callback(self, query: Dict[str, Any], session: AsyncSession) -> None:
        user_id = query.get("from", {}).get("id")
        query_id = query.get("id")
        data = query.get("data", "")
        message = query.get("message", {})
        message_id = message.get("message_id")
        chat_id = message.get("chat", {}).get("id")

        if not self.is_authorized(user_id):
            await self.client.answer_callback_query(query_id, text="Unauthorized access", show_alert=True)
            return

        # Handle Menu Quick Actions
        if data.startswith("menu:"):
            action = data.split(":", 1)[1]
            await self.client.answer_callback_query(query_id)
            if action in ("main", "close"):
                await self._cmd_menu(chat_id, session)
            elif action == "run":
                await self._cmd_trigger_run(chat_id, session)
            elif action == "today":
                await self._cmd_today(chat_id, session)
            elif action == "profile":
                await self._cmd_profile(chat_id, session)
            elif action == "saved":
                await self._cmd_saved(chat_id, session)
            elif action == "applied":
                await self._cmd_applied(chat_id, session)
            elif action == "settings":
                await self._cmd_settings(chat_id, session)
            elif action == "filters":
                await self._cmd_quick_filters(chat_id)
            elif action == "help":
                await self._cmd_help(chat_id)
            return

        # Handle Settings Toggle
        if data in ("settings:pause", "settings:resume"):
            is_enable = (data == "settings:resume")
            await self._cmd_toggle_digest(chat_id, enabled=is_enable, session=session)
            await self.client.answer_callback_query(
                query_id,
                text="✅ Daily digest enabled!" if is_enable else "⏸️ Daily digest paused!",
            )
            profile = await get_or_create_candidate_profile(session)
            toggle_btn_text = "⏸️ Pause Daily Digest" if is_enable else "▶️ Resume Daily Digest"
            toggle_callback = "settings:pause" if is_enable else "settings:resume"
            text = f"""⚙️ <b>Daily Digest & Alert Settings</b>
═════════════════════════════
• ⏰ <b>Schedule:</b> {profile.digest_time} Cairo Time (Africa/Cairo)
• 🔔 <b>Status:</b> {'Active & Scheduled Daily ✅' if is_enable else 'Paused ⏸️'}
• 🎯 <b>Minimum Score Threshold:</b> {profile.digest_threshold:.0f}%
• 🇪🇬 <b>Geographic Scope:</b> Egypt on-site + Worldwide & Gulf remote
• ⏳ <b>Freshness Window:</b> Max 30 days (older posts excluded)

<i>Tap below to toggle your daily digest with one click:</i>"""
            markup = {
                "inline_keyboard": [
                    [{"text": toggle_btn_text, "callback_data": toggle_callback}],
                    [{"text": "« Back to Main Menu", "callback_data": "menu:main"}],
                ]
            }
            if message_id:
                await self.client.edit_message_text(chat_id=chat_id, message_id=message_id, text=text, reply_markup=markup)
            return

        if data.startswith("filter:"):
            key = data.split(":", 1)[1]
            await self.client.answer_callback_query(query_id, text="🔍 Filtering opportunities...")
            await self._handle_filter_query(chat_id, key, session)
            return

        if ":" not in data:
            return

        action, job_id_str = data.split(":", 1)
        try:
            job_id = int(job_id_str)
        except ValueError:
            return

        # Fetch job
        stmt = select(Job).where(Job.id == job_id)
        res = await session.execute(stmt)
        job = res.scalar_one_or_none()
        if not job:
            await self.client.answer_callback_query(query_id, text="Job not found")
            return

        # Get or create tracker
        stmt_t = select(JobStatusTracker).where(JobStatusTracker.job_id == job_id)
        res_t = await session.execute(stmt_t)
        tracker = res_t.scalar_one_or_none()
        if not tracker:
            tracker = JobStatusTracker(job_id=job.id)
            session.add(tracker)

        if action == "save":
            is_already_saved = (tracker.status == ApplicationStatus.SAVED)
            if is_already_saved:
                tracker.status = ApplicationStatus.NEW
                await session.commit()
                await self.client.answer_callback_query(query_id, text="⭐ Removed from saved jobs.")
                if message_id:
                    markup = build_job_inline_keyboard(job, tracker_status="new")
                    await self.client.edit_message_text(
                        chat_id=chat_id,
                        message_id=message_id,
                        text=format_job_card(job),
                        reply_markup=markup,
                    )
            else:
                tracker.status = ApplicationStatus.SAVED
                await session.commit()
                await self.client.answer_callback_query(query_id, text="⭐ Job saved to favorites!")
                if message_id:
                    markup = build_job_inline_keyboard(job, tracker_status="saved")
                    await self.client.edit_message_text(
                        chat_id=chat_id,
                        message_id=message_id,
                        text=format_job_card(job),
                        reply_markup=markup,
                    )
        elif action == "applied":
            tracker.status = ApplicationStatus.APPLIED
            tracker.applied_at = datetime.now(timezone.utc)
            await session.commit()
            await self.client.answer_callback_query(query_id, text="🎉 Application logged successfully!")
            if message_id:
                markup = build_job_inline_keyboard(job, tracker_status="applied")
                await self.client.edit_message_text(
                    chat_id=chat_id,
                    message_id=message_id,
                    text=format_job_card(job),
                    reply_markup=markup,
                )
        elif action == "undo_dismiss":
            tracker.status = ApplicationStatus.NEW
            await session.commit()
            await self.client.answer_callback_query(query_id, text="↩️ Dismiss undone. Job restored to feed!")
            if message_id:
                markup = build_job_inline_keyboard(job, tracker_status="new")
                await self.client.edit_message_text(
                    chat_id=chat_id,
                    message_id=message_id,
                    text=format_job_card(job),
                    reply_markup=markup,
                )
        elif action == "dismiss":
            tracker.status = ApplicationStatus.NOT_RELEVANT
            await session.commit()
            await self.client.answer_callback_query(query_id, text="❌ Job dismissed.")
            if message_id:
                dismissed_text = f"<s>{escape(job.title)} — {escape(job.company)}</s>\n\n<i>❌ This job has been dismissed from recommendations.</i>"
                undo_markup = {
                    "inline_keyboard": [
                        [
                            {"text": "↩️ Undo Dismiss", "callback_data": f"undo_dismiss:{job.id}"},
                        ]
                    ]
                }
                await self.client.edit_message_text(
                    chat_id=chat_id,
                    message_id=message_id,
                    text=dismissed_text,
                    reply_markup=undo_markup,
                )
        elif action == "why":
            breakdown_text = format_match_breakdown(job)
            await self.client.send_message(chat_id=chat_id, text=breakdown_text)
            await self.client.answer_callback_query(query_id, text="📊 Match analytics loaded!")
        elif action == "cover":
            await self.client.answer_callback_query(query_id, text="✍️ Generating tailored cover letter...")
            await self.client.send_chat_action(chat_id, "typing")

            profile = await get_or_create_candidate_profile(session)
            cover_letter = await self.gemini.generate_cover_letter(
                candidate_name=profile.full_name or "Abdelrahman Emam",
                candidate_title=profile.priority_target or "Frontend Developer (Angular)",
                skills=profile.confirmed_skills or [],
                projects=profile.projects or [],
                company=job.company,
                job_title=job.title,
                job_description=job.description_text or "",
            )

            msg = f"""✍️ <b>Tailored AI Cover Letter</b>
💼 <b>Role:</b> {escape(job.title)}
🏢 <b>Company:</b> {escape(job.company)}
─────────────────────────
<code>{escape(cover_letter)}</code>
─────────────────────────
💡 <i>Tap the text above to copy instantly and paste into your application!</i>"""
            cover_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🌐 Direct Application Link ↗", "url": job.original_application_url or job.source_url},
                    ],
                    [
                        {"text": "🎯 Expected Interview Questions", "callback_data": f"interview:{job.id}"},
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(chat_id=chat_id, text=msg, reply_markup=cover_markup)
        elif action == "interview":
            await self.client.answer_callback_query(query_id, text="🎯 Predicting interview questions...")
            await self.client.send_chat_action(chat_id, "typing")

            profile = await get_or_create_candidate_profile(session)
            prep_content = await self.gemini.generate_interview_prep(
                candidate_name=profile.full_name or "Abdelrahman Emam",
                skills=profile.confirmed_skills or [],
                company=job.company,
                job_title=job.title,
                job_description=job.description_text or "",
            )

            msg = f"""🎯 <b>Technical Interview Preparation Guide</b>
💼 <b>{escape(job.title)}</b> — <i>{escape(job.company)}</i>
─────────────────────────
{prep_content}
─────────────────────────
🌟 <i>Review these targeted questions and focus on your concrete Angular projects!</i>"""
            interview_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🌐 Direct Application Link ↗", "url": job.original_application_url or job.source_url},
                    ],
                    [
                        {"text": "✍️ Generate AI Cover Letter", "callback_data": f"cover:{job.id}"},
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(chat_id=chat_id, text=msg, reply_markup=interview_markup)

    async def _handle_filter_query(self, chat_id: int, key: str, session: AsyncSession) -> None:
        """Filter and display active opportunities based on user-selected criteria."""
        stmt = select(Job).where(
            Job.is_active == True,
            Job.eligibility != GeographicEligibility.NOT_ELIGIBLE,
        )

        filter_titles = {
            "angular": "🅰️ Angular & Frontend Engineering Roles",
            "top": "⭐ Top Matches (Score ≥ 75%)",
            "egypt": "🇪🇬 Egypt & Gulf Opportunities",
            "remote": "🌍 Remote Worldwide Positions",
            "junior": "⚡ Junior & Entry-Level Roles",
            "cv_skills": "🛠️ Core CV Skills (TypeScript, RxJS, APIs)",
            "salary": "💵 Roles with Disclosed Salary",
        }
        title = filter_titles.get(key, "Filtered Results")

        if key == "angular":
            stmt = stmt.where(
                or_(
                    Job.title.ilike("%angular%"),
                    Job.description_text.ilike("%angular%"),
                    Job.title.ilike("%frontend%"),
                    Job.title.ilike("%front-end%"),
                )
            )
        elif key == "top":
            stmt = stmt.where(Job.match_score >= 75.0)
        elif key == "egypt":
            stmt = stmt.where(
                or_(
                    Job.eligibility == GeographicEligibility.EGYPT_ELIGIBLE,
                    Job.raw_location.ilike("%egypt%"),
                    Job.raw_location.ilike("%cairo%"),
                    Job.raw_location.ilike("%alexandria%"),
                    Job.raw_location.ilike("%saudi%"),
                    Job.raw_location.ilike("%uae%"),
                    Job.raw_location.ilike("%dubai%"),
                    Job.raw_location.ilike("%riyadh%"),
                )
            )
        elif key == "remote":
            stmt = stmt.where(Job.workplace_type == WorkplaceType.REMOTE)
        elif key == "junior":
            stmt = stmt.where(
                or_(
                    Job.seniority.in_([
                        SeniorityLevel.ENTRY,
                        SeniorityLevel.JUNIOR,
                        SeniorityLevel.GRADUATE,
                        SeniorityLevel.INTERNSHIP,
                    ]),
                    and_(Job.required_experience_years != None, Job.required_experience_years <= 2.0),
                )
            )
        elif key == "cv_skills":
            stmt = stmt.where(
                or_(
                    Job.title.ilike("%typescript%"),
                    Job.description_text.ilike("%typescript%"),
                    Job.description_text.ilike("%rxjs%"),
                    Job.description_text.ilike("%tailwind%"),
                    Job.description_text.ilike("%bootstrap%"),
                    Job.description_text.ilike("%rest api%"),
                    Job.description_text.ilike("%firebase%"),
                )
            )
        elif key == "salary":
            stmt = stmt.where(Job.salary_min != None, Job.salary_min > 0)

        stmt = stmt.order_by(Job.match_score.desc()).limit(5)
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            empty_nav = {
                "inline_keyboard": [
                    [
                        {"text": "🔍 Choose Another Filter", "callback_data": "menu:filters"},
                        {"text": "🚀 Run Live Scan Now", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text=f"🔍 No active jobs found matching: <b>{title}</b>.\nYou can run a fresh multi-source scan or try another filter:",
                reply_markup=empty_nav,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"🎯 <b>{title} ({len(jobs)} opportunities):</b>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        filter_nav_markup = {
            "inline_keyboard": [
                [
                    {"text": "🔍 Another Filter", "callback_data": "menu:filters"},
                    {"text": "📋 Today's Jobs", "callback_data": "menu:today"},
                ],
                [
                    {"text": "« Back to Main Menu", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"✨ <i>Viewing results for {title}. Select another filter or return to main menu:</i>",
            reply_markup=filter_nav_markup,
        )
