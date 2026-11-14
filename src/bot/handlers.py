"""Telegram command and callback query dispatcher with strict owner allow-list."""

from datetime import datetime, timezone
import html
from typing import Any, Dict, List, Optional
from sqlalchemy import select, delete, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import (
    build_job_inline_keyboard,
    build_main_menu_keyboard,
    build_persistent_reply_keyboard,
    build_quick_filters_keyboard,
    escape,
    format_job_card,
    format_match_breakdown,
)
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.engine.gemini_extractor import GeminiJobExtractor
from src.models import (
    ApplicationStatus,
    CandidateProfile,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    MatchBand,
    NotificationLog,
    SeniorityLevel,
    WorkplaceType,
)
from src.services.profile_service import apply_verified_cv_to_profile, get_or_create_candidate_profile


class TelegramBotDispatcher:
    """Dispatches Telegram commands and callbacks with strict single-user authorization."""

    def __init__(self, telegram_client: Optional[TelegramClient] = None):
        self.client = telegram_client or TelegramClient()
        self.owner_id = settings.TELEGRAM_OWNER_ID
        self.gemini = GeminiJobExtractor()

    def is_authorized(self, user_id: int) -> bool:
        """Verify user matches numeric owner ID allow-list."""
        if self.owner_id is None:
            # If owner ID is not set yet, reject by default to avoid leaking data
            return False
        return user_id == self.owner_id

    async def handle_update(self, update: Dict[str, Any], session: AsyncSession) -> None:
        """Route incoming Telegram update."""
        if "message" in update:
            await self._handle_message(update["message"], session)
        elif "callback_query" in update:
            await self._handle_callback(update["callback_query"], session)

    async def _handle_message(self, message: Dict[str, Any], session: AsyncSession) -> None:
        user = message.get("from", {})
        user_id = user.get("id")
        chat_id = message.get("chat", {}).get("id")
        text = (message.get("text") or "").strip()

        if not user_id or not chat_id:
            return

        # Security: Enforce numeric allow-list
        if not self.is_authorized(user_id):
            logger.warning(f"Unauthorized Telegram access attempt from user_id={user_id}")
            await self.client.send_message(
                chat_id=chat_id,
                text="⛔ <b>عفواً، هذا البوت خاص بمرشح محدد فقط.</b>\nAccess Denied: Private candidate bot.",
            )
            return

        parts = text.split(maxsplit=1)
        command = parts[0].lower().split("@")[0]
        args = parts[1] if len(parts) > 1 else ""

        clean_text = text.strip()
        clean_lower = clean_text.lower()

        # Handle Conversational Greetings
        greetings = ("السلام عليكم", "مرحبا", "أهلا", "اهلا", "صباح الخير", "مساء الخير", "ازيك", "hello", "hi", "hey")
        if any(clean_lower == g or clean_lower.startswith(g + " ") for g in greetings):
            profile = await get_or_create_candidate_profile(session)
            welcome_msg = f"""👋 <b>أهلاً بك يا {escape(profile.full_name or 'Abdelrahman')}!</b>
أنا مساعدك الذكي المخصص لاقتناص أفضل فرص <b>Angular & Frontend Engineering</b> العالمية والمحلية 🇪🇬.

💡 يمكنك اختيار إجراء سريع من الأزرار الثابتة بالأسفل، أو كتابة اسم أي تقنية للبحث عنها فوراً:"""
            markup = build_main_menu_keyboard()
            reply_kb = build_persistent_reply_keyboard()
            await self.client.send_message(chat_id=chat_id, text=welcome_msg, reply_markup=reply_kb)
            await self.client.send_message(chat_id=chat_id, text="🎛️ <b>لوحة التحكم الرئيسية:</b>", reply_markup=markup)
            return

        # Handle Persistent Bottom Keyboard Actions
        if clean_text in ("🚀 فحص الوظائف الآن", "🚀 Run Scan Now", "فحص الوظائف", "فحص فوري", "run"):
            await self._cmd_trigger_run(chat_id, session)
            return
        elif clean_text in ("📋 أفضل وظائف اليوم", "📋 Today Jobs", "وظائف اليوم", "فرص اليوم", "today"):
            await self._cmd_today(chat_id, session)
            return
        elif clean_text in ("👤 ملفي والـ CV", "👤 My Profile", "ملفي الشخصي", "البروفايل", "profile", "سيرتي الذاتية"):
            await self._cmd_profile(chat_id, session)
            return
        elif clean_text in ("⭐ وظائفي المحفوظة", "⭐ Saved Jobs", "المحفوظات", "saved"):
            await self._cmd_saved(chat_id, session)
            return
        elif clean_text in ("📝 سجل التقديمات", "📝 Applied Pipeline", "التقديمات", "سجل التقديمات", "applied"):
            await self._cmd_applied(chat_id, session)
            return
        elif clean_text in ("🔍 فلاتر وتصنيفات", "🔍 فلاتر سريعة", "🔍 Quick Filters", "فلاتر", "filters"):
            await self._cmd_quick_filters(chat_id)
            return
        elif clean_text in ("🌐 لوحة التحكم (Mini App)", "🌐 لوحة التحكم المباشرة", "لوحة التحكم", "dashboard", "الموقع"):
            await self._cmd_open_dashboard(chat_id)
            return
        elif clean_text in ("📖 المساعدة والدليل", "📖 Help & Guide", "المساعدة", "دليل الاستخدام", "help"):
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
            # Natural language query fallback (e.g. typing "Angular" or "Remote")
            await self._cmd_search(chat_id, text, session)
        else:
            await self.client.send_message(
                chat_id=chat_id,
                text="❓ <b>أمر غير معروف.</b>\nأرسل /help لعرض قائمة الأوامر أو اضغط على الأزرار السريعة أسفل الشاشة.",
            )

    async def _cmd_start(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        if not profile.confirmed_skills or not profile.full_name:
            profile = await apply_verified_cv_to_profile(session)

        skills_count = len(profile.confirmed_skills or [])
        welcome = f"""👋 <b>مرحباً بك في BottaJobs Control Center!</b>
Welcome, <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>.

🤖 مساعدك الذكي الشخصي المخصص لاقتناص أفضل فرص <b>Angular & Frontend Engineering</b> العالمية والمحلية المتوافقة مع سيرتك الذاتية 🇪🇬.

🎯 <b>الملف المعتمد حالياً:</b>
• المرشح: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• التخصص: <b>{escape(profile.priority_target)}</b>
• المهارات المؤكدة: <b>{skills_count} مهارة موثقة بالكامل</b>
• موعد النشرة اليومية: <b>{profile.digest_time} بتوقيت القاهرة (Africa/Cairo)</b>
• الحالة: <b>{'نشرة نشطة وتعمل يومياً ✅' if profile.digest_enabled else 'متوقفة مؤقتاً ⏸️'}</b>

👇 <i>استخدم الأزرار الثابتة بالأسفل أو اختر إجراءً تفاعلياً من لوحة التحكم أدناه:</i>
"""
        reply_kb = build_persistent_reply_keyboard()
        await self.client.send_message(chat_id=chat_id, text=welcome, reply_markup=reply_kb)
        markup = build_main_menu_keyboard()
        await self.client.send_message(chat_id=chat_id, text="🎛️ <b>لوحة التحكم الرئيسية:</b>", reply_markup=markup)

    async def _cmd_menu(self, chat_id: int, session: AsyncSession) -> None:
        """Display interactive inline control center."""
        profile = await get_or_create_candidate_profile(session)
        text = f"""🎛️ <b>BottaJobs Interactive Control Center</b>
═════════════════════════════
👤 <b>المرشح:</b> {escape(profile.full_name or 'Abdelrahman Emam')}
🎯 <b>الهدف:</b> {escape(profile.priority_target)}
🛠️ <b>المهارات المؤكدة:</b> {len(profile.confirmed_skills or [])} مهارة

<i>اضغط على أي زر تفاعلي للتحكم المباشر أو فتح التطبيق:</i>"""
        markup = build_main_menu_keyboard()
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_open_dashboard(self, chat_id: int) -> None:
        markup = {
            "inline_keyboard": [
                [
                    {
                        "text": "🌐 فتح لوحة التحكم المباشرة (Angular App)",
                        "web_app": {"url": "https://job-hunter-agent-bottajobs.onrender.com"},
                    }
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text="🚀 <b>لوحة تحكم BottaJobs المباشرة (Web App):</b>\nاضغط على الزر أدناه لفتح لوحة التحكم والتعديل على سيرتك الذاتية ومتابعة الوظائف مباشرة داخل تيليجرام.",
            reply_markup=markup,
        )

    async def _cmd_quick_filters(self, chat_id: int) -> None:
        markup = build_quick_filters_keyboard()
        await self.client.send_message(
            chat_id=chat_id,
            text="🔍 <b>اختر تصنيفاً سريعاً لتصفية الوظائف المتاحة:</b>\nSelect a quick filter to display matching opportunities:",
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
                        {"text": "🚀 تشغيل فحص فوري للمصادر", "callback_data": "menu:run"},
                        {"text": "🔍 تصفية وفلاتر سريعة", "callback_data": "menu:filters"},
                    ],
                    [
                        {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="📭 <b>لا توجد وظائف جديدة متطابقة مسجلة حالياً.</b>\nيمكنك تشغيل فحص فوري للمصادر لجلب أحدث الوظائف فوراً، أو انتظار النشرة اليومية في 09:00 ص بتوقيت القاهرة.",
                reply_markup=empty_today_markup,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"📋 <b>أبرز {len(jobs)} فرص مطابقة لملفك الشخصي اليوم:</b>\n<i>مرتبة تنازلياً حسب أعلى نسبة توافق مع مهاراتك وسيرتك الذاتية 🎯</i>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        today_footer = {
            "inline_keyboard": [
                [
                    {"text": "🚀 فحص واكتشاف المزيد", "callback_data": "menu:run"},
                    {"text": "🔍 تصنيفات وفلاتر", "callback_data": "menu:filters"},
                ],
                [
                    {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text="✨ <i>تذكر أن تقوم بحفظ الفرص المناسبة أو تسجيل التقديم لمتابعتها بسهولة.</i>",
            reply_markup=today_footer,
        )

    async def _cmd_search(self, chat_id: int, query: str, session: AsyncSession) -> None:
        """Search active jobs with precision across title, company, skills, and location."""
        clean_q = query.strip()
        if not clean_q:
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ يرجى كتابة كلمة البحث بعد الأمر، مثال:\n<code>/search angular</code> أو <code>/search remote</code>",
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
                        {"text": "🚀 تشغيل فحص فوري للمصادر", "callback_data": "menu:run"},
                        {"text": "🔍 تصفية سريعة", "callback_data": "menu:filters"},
                    ],
                    [
                        {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text=f"🔍 لم يتم العثور على وظائف مسجلة تطابق '<b>{escape(clean_q)}</b>' حالياً.\n💡 جرب البحث بكلمات عامة مثل: <code>Angular</code> أو <code>Frontend</code> أو <code>Remote</code> أو قم بتشغيل فحص فوري للمصادر.",
                reply_markup=empty_search_markup,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"🔍 <b>نتائج البحث عن '{escape(clean_q)}' ({len(jobs)} وظائف):</b>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        search_footer = {
            "inline_keyboard": [
                [
                    {"text": "🔍 تصنيفات وفلاتر", "callback_data": "menu:filters"},
                    {"text": "📋 وظائف اليوم", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"✨ <i>نهاية نتائج البحث عن '{escape(clean_q)}'.</i>",
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

        exp_str = f"{profile.experience_years} سنة" if profile.experience_years is not None else "خريج حديث (موثق بمشاريع واقعية)"

        text = f"""👤 <b>الملف المهني للمرشح / Candidate Profile</b>
═════════════════════════════
👤 <b>الاسم:</b> {escape(profile.full_name or 'Abdelrahman Emam')}
🎯 <b>التخصص والهدف:</b> {escape(profile.priority_target)}
🌍 <b>الإقامة:</b> {profile.country} (مصر) 🇪🇬 | مؤهل للعمل عن بُعد عالمياً
💼 <b>مستوى الخبرة:</b> {exp_str}
🎓 <b>المؤهل:</b> {escape(profile.degree_title or 'Computer Science / Engineering')} ({profile.graduation_year or '2024'})
🏛️ <b>الجامعة:</b> {escape(profile.education_institution or 'N/A')}

🛠️ <b>المهارات المعتمدة بالكامل من الـ CV ({len(skills)} مهارة):</b>
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

🔗 <b>روابط الحسابات المهنية:</b>
• LinkedIn: {escape(profile.linkedin_url or 'https://www.linkedin.com/in/abdelrahman-tamer')}
• GitHub: {escape(profile.github_url or 'https://github.com/Abdelrahman-Tamer')}
"""
        markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 فحص فرص تناسب ملفي", "callback_data": "menu:run"},
                    {"text": "📋 أفضل فرص اليوم", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🌐 فتح الـ Dashboard والـ Mini App", "web_app": {"url": "https://job-hunter-agent-bottajobs.onrender.com"}},
                ],
                [
                    {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_settings(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        is_active = bool(profile.digest_enabled)

        toggle_btn_text = "⏸️ إيقاف النشرة مؤقتاً" if is_active else "▶️ تفعيل النشرة اليومية"
        toggle_callback = "settings:pause" if is_active else "settings:resume"

        text = f"""⚙️ <b>إعدادات النشرة والتنبيهات اليومية / Digest Settings</b>
═════════════════════════════
• ⏰ <b>موعد النشرة اليومية:</b> {profile.digest_time} بتوقيت القاهرة (Africa/Cairo)
• 🔔 <b>حالة النشرة:</b> {'نشطة وتعمل يومياً ✅' if is_active else 'متوقفة مؤقتاً ⏸️'}
• 🎯 <b>الحد الأدنى للتوافق في النشرة:</b> {profile.digest_threshold:.0f}%
• 🇪🇬 <b>نطاق العمل المقبول:</b> مصر فقط للوظائف المكتبية، وعالمياً/الخليج للوظائف عن بُعد
• ⏳ <b>أقصى عمر للإعلان:</b> 30 يوماً كحد أقصى (استبعاد الإعلانات القديمة تلقائياً)

<i>اضغط على الزر أدناه لتغيير حالة النشرة بنقرة واحدة:</i>"""

        markup = {
            "inline_keyboard": [
                [
                    {"text": toggle_btn_text, "callback_data": toggle_callback},
                ],
                [
                    {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(chat_id=chat_id, text=text, reply_markup=markup)

    async def _cmd_toggle_digest(self, chat_id: int, enabled: bool, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        profile.digest_enabled = 1 if enabled else 0
        await session.commit()
        msg = "✅ تم استئناف النشرة اليومية بنجاح." if enabled else "⏸️ تم إيقاف النشرة اليومية مؤقتاً."
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
                        {"text": "📋 استعراض أفضل وظائف اليوم", "callback_data": "menu:today"},
                        {"text": "🚀 تشغيل فحص فوري", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="⭐ <b>قائمة الوظائف المحفوظة فارغة حالياً.</b>\n\n💡 <i>لحفظ أي وظيفة والرجوع إليها لاحقاً، اضغط على زر ⭐ أسفل أي بطاقة وظيفة.</i>",
                reply_markup=empty_markup,
            )
            return

        await self.client.send_message(chat_id=chat_id, text=f"⭐ <b>الوظائف المحفوظة في قائمتك المفضلة ({len(jobs)}):</b>")
        for job in jobs[:5]:
            tracker_status = job.tracker.status.value if job.tracker else "saved"
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        footer_markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 فحص فرص جديدة", "callback_data": "menu:run"},
                    {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"⭐ <i>إجمالي الوظائف المحفوظة: {len(jobs)} وظيفة.</i>",
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
                        {"text": "📋 استعراض أفضل وظائف اليوم", "callback_data": "menu:today"},
                        {"text": "🚀 تشغيل فحص فوري", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="📝 <b>سجل التقديمات فارغ حتى الآن.</b>\n\n💡 <i>عند التقديم على أي وظيفة، اضغط على زر ✅ أسفل بطاقتها لتوثيقها في سجلك ومتابعة مراحلها.</i>",
                reply_markup=empty_markup,
            )
            return

        applied_lines = [
            f"📝 <b>سجل متابعة التقديمات ({len(jobs)} وظيفة):</b>",
            "═════════════════════════════",
        ]
        for idx, job in enumerate(jobs[:8], 1):
            applied_date = job.tracker.applied_at.strftime("%Y-%m-%d") if job.tracker and job.tracker.applied_at else "مؤخراً"
            app_url = job.original_application_url or job.source_url
            applied_lines.append(
                f"{idx}. 💼 <b>{escape(job.title)}</b>\n"
                f"   🏢 {escape(job.company)} | 🎯 {job.match_score:.0f}%\n"
                f"   📅 تاريخ التقديم: <code>{applied_date}</code>\n"
                f"   🔗 <a href=\"{app_url}\">رابط التقديم المباشر</a>\n"
            )

        applied_markup = {
            "inline_keyboard": [
                [
                    {"text": "📋 استعراض وظائف اليوم", "callback_data": "menu:today"},
                    {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
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
        exp_text = f"{profile.experience_years} سنة" if profile.experience_years is not None else "غير محدد"

        msg = f"""🧹 <b>تم مسح جميع الوظائف السابقة بنجاح!</b>
All legacy jobs have been deleted.

👤 <b>الملف المعتمد للبحث الآن:</b>
• المرشح: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• التخصص: <b>{escape(profile.priority_target)}</b>
• المهارات المؤكدة: <b>{len(profile.confirmed_skills)} مهارة</b> ({escape(sample_skills)})
• الخبرة الموثقة: <b>{exp_text}</b>

🚀 لبدء فحص المصادر والبحث عن الوظائف المتطابقة مع الـ CV فوراً، أرسل:
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
📡 <b>بدء الاتصال وفحص المصادر بالتوازي...</b>
• المرشح: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b> ({skills_count} مهارة موثقة)
• التخصص: <b>{escape(profile.priority_target)}</b>
• المصادر: <i>Himalayas, Remotive, Greenhouse, Lever, RSS...</i>
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
• المرشح: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• التخصص: <b>{escape(profile.priority_target)}</b>
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

        final_summary = f"""✨ <b>اكتمل فحص المصادر والمطابقة بنجاح!</b>
═════════════════════════════
✅ <code>[██████████] 100%</code>

📊 <b>نتائج الفحص المباشر:</b>
• إجمالي الوظائف المفحوصة: <b>{run_record.jobs_discovered} وظيفة</b>
• وظائف جديدة أضيفت: <b>{run_record.jobs_new} فرصة</b>
• فرص عالية التوافق مع الـ CV (≥ {min_score:.0f}%): <b>{len(top_jobs)} وظيفة</b>
• سرعة المعالجة الكلية: <b>{duration:.1f} ثانية</b> ⚡
"""
        if msg_id:
            await self.client.edit_message_text(chat_id=chat_id, message_id=msg_id, text=final_summary)
        else:
            await self.client.send_message(chat_id=chat_id, text=final_summary)

        if top_jobs:
            await self.client.send_message(
                chat_id=chat_id,
                text=f"📋 <b>أبرز {len(top_jobs)} فرص متطابقة مع سيرتك الذاتية الآن:</b>",
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
                        {"text": "🔍 فلاتر وتصنيفات سريعة", "callback_data": "menu:filters"},
                        {"text": "📋 استعراض جميع الوظائف", "callback_data": "menu:today"},
                    ],
                    [
                        {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ تم فحص المصادر ولم تظهر فرص جديدة تفوق نسبة التوافق في هذه اللحظة. سيتم إخطارك في النشرة الصباحية (09:00 ص) أو يمكنك تجربة الفلاتر السريعة أدناه:",
                reply_markup=no_jobs_markup,
            )

    async def _cmd_help(self, chat_id: int) -> None:
        help_text = """📖 <b>دليل استخدام BottaJobs الذكي (User Guide):</b>
═════════════════════════════
🤖 <b>مساعدك الذكي المخصص لفرص Angular و Frontend:</b>

• <b>🚀 فحص الوظائف الآن</b> (<code>/run</code>):
  يفحص 7 مصادر عالمية ومحلية بالتوازي ويطابقها مع مهاراتك الـ 32 مع عداد تقدم حي.

• <b>📋 أفضل وظائف اليوم</b> (<code>/today</code>):
  يعرض أعلى الوظائف تطابقاً مع سيرتك الذاتية (بما فيها تفاصيل النواقص للحصول على 100%).

• <b>🔍 فلاتر وتصنيفات</b> (<code>/filters</code>):
  تصفية سريعة بحسب (Angular، فرص Junior، ريموت عالمياً، مصر والخليج، رواتب معلنة).

• <b>👤 ملفي والـ CV</b> (<code>/profile</code>):
  استعراض الـ 32 مهارة المعتمدة، المشاريع، وسنوات الخبرة من السيرة الذاتية.

• <b>⭐ وظائفي المحفوظة</b> (<code>/saved</code>):
  الرجوع للفرص التي قمت بحفظها للمراجعة لاحقاً.

• <b>📝 سجل التقديمات</b> (<code>/applied</code>):
  متابعة الشركات والوظائف التي سجلت تقديمك فيها.

• <b>⚙️ إعدادات النشرة</b> (<code>/settings</code>):
  التحكم في موعد النشرة اليومية (09:00 ص) وإيقافها أو تفعيلها بنقرة واحدة.

• <b>🔎 البحث المباشر</b>:
  أرسل أي كلمة مثل <code>Angular</code> أو <code>TypeScript</code> أو <code>Remote</code> وسيبحث البوت فوراً في قاعدة البيانات!

💡 <i>ملاحظة أمان: البوت لا يرسل تقديمات بالنيابة عنك دون علمك، بل يجهز لك الرابط المباشر، وخطاب التقديم (Cover Letter)، وأسئلة المقابلة بنقرة واحدة.</i>
"""
        markup = {
            "inline_keyboard": [
                [
                    {"text": "🚀 تشغيل فحص فوري", "callback_data": "menu:run"},
                    {"text": "📋 استعراض وظائف اليوم", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🔍 فلاتر سريعة", "callback_data": "menu:filters"},
                    {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
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
            await self.client.answer_callback_query(query_id, text="غير مصرح / Unauthorized", show_alert=True)
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
                text="✅ تم تفعيل النشرة اليومية!" if is_enable else "⏸️ تم إيقاف النشرة مؤقتاً!",
            )
            profile = await get_or_create_candidate_profile(session)
            toggle_btn_text = "⏸️ إيقاف النشرة مؤقتاً" if is_enable else "▶️ تفعيل النشرة اليومية"
            toggle_callback = "settings:pause" if is_enable else "settings:resume"
            text = f"""⚙️ <b>إعدادات النشرة والتنبيهات اليومية / Digest Settings</b>
═════════════════════════════
• ⏰ <b>موعد النشرة اليومية:</b> {profile.digest_time} بتوقيت القاهرة (Africa/Cairo)
• 🔔 <b>حالة النشرة:</b> {'نشطة وتعمل يومياً ✅' if is_enable else 'متوقفة مؤقتاً ⏸️'}
• 🎯 <b>الحد الأدنى للتوافق في النشرة:</b> {profile.digest_threshold:.0f}%
• 🇪🇬 <b>نطاق العمل المقبول:</b> مصر فقط للوظائف المكتبية، وعالمياً/الخليج للوظائف عن بُعد
• ⏳ <b>أقصى عمر للإعلان:</b> 30 يوماً كحد أقصى (استبعاد الإعلانات القديمة تلقائياً)

<i>اضغط على الزر أدناه لتغيير حالة النشرة بنقرة واحدة:</i>"""
            markup = {
                "inline_keyboard": [
                    [{"text": toggle_btn_text, "callback_data": toggle_callback}],
                    [{"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"}],
                ]
            }
            if message_id:
                await self.client.edit_message_text(chat_id=chat_id, message_id=message_id, text=text, reply_markup=markup)
            return

        if data.startswith("filter:"):
            key = data.split(":", 1)[1]
            await self.client.answer_callback_query(query_id, text="🔍 جاري التصفية...")
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
            await self.client.answer_callback_query(query_id, text="الوظيفة غير موجودة / Job not found")
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
                await self.client.answer_callback_query(query_id, text="⭐ تم إزالة الوظيفة من المحفوظات.")
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
                await self.client.answer_callback_query(query_id, text="⭐ تم حفظ الوظيفة في قائمتك المفضلة!")
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
            await self.client.answer_callback_query(query_id, text="🎉 رائع! تم تسجيل التقديم بنجاح في السجل.")
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
            await self.client.answer_callback_query(query_id, text="↩️ تم التراجع وإعادة الوظيفة إلى قائمتك!")
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
            await self.client.answer_callback_query(query_id, text="❌ تم استبعاد الوظيفة من التوصيات.")
            if message_id:
                dismissed_text = f"<s>{escape(job.title)} — {escape(job.company)}</s>\n\n<i>❌ تم استبعاد هذه الوظيفة من قائمة الترشيحات.</i>"
                undo_markup = {
                    "inline_keyboard": [
                        [
                            {"text": "↩️ تراجع عن الاستبعاد (Undo)", "callback_data": f"undo_dismiss:{job.id}"},
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
            await self.client.answer_callback_query(query_id, text="📊 تم تحميل تفاصيل المطابقة!")
        elif action == "cover":
            await self.client.answer_callback_query(query_id, text="✍️ جاري صياغة خطاب التقديم المخصص...")
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

            msg = f"""✍️ <b>خطاب تقديم مخصص بالذكاء الاصطناعي / Tailored Cover Letter</b>
💼 <b>الوظيفة:</b> {escape(job.title)}
🏢 <b>الشركة:</b> {escape(job.company)}
─────────────────────────
<code>{escape(cover_letter)}</code>
─────────────────────────
💡 <i>اضغط على النص بالأعلى لنسخه فوراً والصقه في استمارة التقديم أو أرسله عبر الإيميل/LinkedIn!</i>"""
            cover_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🌐 فتح رابط التقديم المباشر ↗", "url": job.original_application_url or job.source_url},
                    ],
                    [
                        {"text": "🎯 أسئلة الإنترفيو المتوقعة", "callback_data": f"interview:{job.id}"},
                        {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(chat_id=chat_id, text=msg, reply_markup=cover_markup)
        elif action == "interview":
            await self.client.answer_callback_query(query_id, text="🎯 جاري تحليل متطلبات الوظيفة وتوقع أسئلة المقابلة...")
            await self.client.send_chat_action(chat_id, "typing")

            profile = await get_or_create_candidate_profile(session)
            prep_content = await self.gemini.generate_interview_prep(
                candidate_name=profile.full_name or "Abdelrahman Emam",
                skills=profile.confirmed_skills or [],
                company=job.company,
                job_title=job.title,
                job_description=job.description_text or "",
            )

            msg = f"""🎯 <b>دليل وتوقعات الإنترفيو التقني / Interview Preparation</b>
💼 <b>{escape(job.title)}</b> — <i>{escape(job.company)}</i>
─────────────────────────
{prep_content}
─────────────────────────
🌟 <i>راجع هذه النقاط وركز على مشاريعك العملية لتضمن تميزك في المقابلة!</i>"""
            interview_markup = {
                "inline_keyboard": [
                    [
                        {"text": "🌐 فتح رابط التقديم المباشر ↗", "url": job.original_application_url or job.source_url},
                    ],
                    [
                        {"text": "✍️ توليد خطاب التقديم AI", "callback_data": f"cover:{job.id}"},
                        {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
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
            "angular": "🅰️ فرص Angular وتطوير الواجهات Frontend",
            "top": "⭐ أعلى الوظائف تطابقاً مع سيرتك الذاتية (≥ 75%)",
            "egypt": "🇪🇬 الوظائف المتاحة في مصر والخليج العربي",
            "remote": "🌍 وظائف العمل عن بُعد عالمياً (Remote Worldwide)",
            "junior": "⚡ وظائف مخصصة لمستوى Junior وخريجين",
            "cv_skills": "🛠️ وظائف تطابق مهاراتك الأساسية (TypeScript, RxJS, REST API)",
            "salary": "💵 وظائف ذات رواتب معلنة وواضحة",
        }
        title = filter_titles.get(key, "نتائج الفلترة")

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
                        {"text": "🔍 اختيار فلتر آخر", "callback_data": "menu:filters"},
                        {"text": "🚀 تشغيل فحص فوري للمصادر", "callback_data": "menu:run"},
                    ],
                    [
                        {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
                    ]
                ]
            }
            await self.client.send_message(
                chat_id=chat_id,
                text=f"🔍 لم يتم العثور على وظائف مسجلة تطابق: <b>{title}</b> حالياً.\nيمكنك تشغيل فحص جديد للمصادر أو اختيار تصنيف آخر:",
                reply_markup=empty_nav,
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"🎯 <b>{title} ({len(jobs)} وظائف):</b>",
        )
        for job in jobs:
            tracker_status = job.tracker.status.value if job.tracker else None
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job, tracker_status=tracker_status)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

        filter_nav_markup = {
            "inline_keyboard": [
                [
                    {"text": "🔍 تصنيف آخر", "callback_data": "menu:filters"},
                    {"text": "📋 استعراض وظائف اليوم", "callback_data": "menu:today"},
                ],
                [
                    {"text": "🔙 العودة للقائمة الرئيسية", "callback_data": "menu:main"},
                ]
            ]
        }
        await self.client.send_message(
            chat_id=chat_id,
            text=f"✨ <i>تم استعراض نتائج {title}. يمكنك اختيار تصنيف آخر أو العودة للرئيسية:</i>",
            reply_markup=filter_nav_markup,
        )
