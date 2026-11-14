"""Telegram command and callback query dispatcher with strict owner allow-list."""

from datetime import datetime, timezone
import html
from typing import Any, Dict, List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import (
    build_job_inline_keyboard,
    build_main_menu_keyboard,
    escape,
    format_job_card,
    format_match_breakdown,
)
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.models import (
    ApplicationStatus,
    CandidateProfile,
    GeographicEligibility,
    Job,
    JobStatusTracker,
    MatchBand,
    NotificationLog,
)
from src.services.profile_service import apply_verified_cv_to_profile, get_or_create_candidate_profile


class TelegramBotDispatcher:
    """Dispatches Telegram commands and callbacks with strict single-user authorization."""

    def __init__(self, telegram_client: Optional[TelegramClient] = None):
        self.client = telegram_client or TelegramClient()
        self.owner_id = settings.TELEGRAM_OWNER_ID

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

        if command in ("/start", "/menu"):
            await self._cmd_start(chat_id, session)
        elif command == "/today":
            await self._cmd_today(chat_id, session)
        elif command == "/search":
            await self._cmd_search(chat_id, args, session)
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
        else:
            await self.client.send_message(
                chat_id=chat_id,
                text="❓ أمر غير معروف. أرسل /help لعرض قائمة الأوامر المتاحة.\nUnknown command. Type /help.",
            )

    async def _cmd_start(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        if not profile.confirmed_skills or not profile.full_name:
            profile = await apply_verified_cv_to_profile(session)

        skills_count = len(profile.confirmed_skills or [])
        welcome = f"""👋 <b>مرحباً بك في Job Hunter Agent (BottaJobs Control Center)!</b>
Welcome, <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>.

🤖 مساعدك الذكي الشخصي المخصص لاقتناص أفضل فرص <b>Angular & Frontend Engineering</b> العالمية والمحلية المتوافقة مع سيرتك الذاتية 🇪🇬.

🎯 <b>الملف المعتمد حالياً:</b>
• المرشح: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b>
• التخصص: <b>{escape(profile.priority_target)}</b>
• المهارات المؤكدة: <b>{skills_count} مهارة موثقة</b>
• موعد النشرة: <b>{profile.digest_time} بتوقيت القاهرة (Africa/Cairo)</b>
• الحالة: <b>{'نشرة نشطة ✅' if profile.digest_enabled else 'متوقفة مؤقتاً ⏸️'}</b>

👇 <i>اختر إجراءً سريعاً من لوحة التحكم التفاعلية أدناه:</i>
"""
        markup = build_main_menu_keyboard()
        await self.client.send_message(chat_id=chat_id, text=welcome, reply_markup=markup)

    async def _cmd_today(self, chat_id: int, session: AsyncSession) -> None:
        """Display today's top matches."""
        stmt = (
            select(Job)
            .where(Job.is_active == True, Job.match_score >= 60.0)
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            await self.client.send_message(
                chat_id=chat_id,
                text="📭 <b>لا توجد وظائف جديدة متطابقة حالياً.</b>\nNo matching jobs currently recorded. Next digest runs at 09:00 Cairo time.",
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"📋 <b>أبرز {len(jobs)} فرص مطابقة لملفك الشخصي اليوم:</b>",
        )
        for job in jobs:
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

    async def _cmd_search(self, chat_id: int, query: str, session: AsyncSession) -> None:
        """Search active jobs."""
        if not query:
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ يرجى كتابة كلمة البحث بعد الأمر، مثال:\n<code>/search angular</code>",
            )
            return

        stmt = (
            select(Job)
            .where(
                Job.is_active == True,
                (Job.title.ilike(f"%{query}%") | Job.description_text.ilike(f"%{query}%")),
            )
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        jobs = res.scalars().all()

        if not jobs:
            await self.client.send_message(
                chat_id=chat_id,
                text=f"🔍 لم يتم العثور على وظائف تحتوي على: <b>{escape(query)}</b>",
            )
            return

        await self.client.send_message(
            chat_id=chat_id,
            text=f"🔍 <b>نتائج البحث عن '{escape(query)}' ({len(jobs)} وظائف):</b>",
        )
        for job in jobs:
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

    async def _cmd_profile(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        if not profile.confirmed_skills or not profile.full_name:
            profile = await apply_verified_cv_to_profile(session)

        name_str = f"<b>{escape(profile.full_name)}</b>\n" if profile.full_name else ""
        confirmed_str = ", ".join(profile.confirmed_skills) if profile.confirmed_skills else "لا توجد بعد (Empty until verified from CV)"
        target_str = ", ".join(profile.target_skills) if profile.target_skills else "None"
        exp_str = f"{profile.experience_years} years" if profile.experience_years is not None else "غير محدد / Unknown"

        proj_count = len(profile.projects or [])
        proj_str = f"• المشاريع المنجزة: <b>{proj_count} مشاريع</b>" if proj_count > 0 else ""

        cert_count = len(profile.certifications or [])
        cert_str = f"• الشهادات المهنية: <b>{cert_count} شهادات</b>" if cert_count > 0 else ""

        text = f"""👤 <b>الملف الشخصي للمرشح / Candidate Profile:</b>
{name_str}
• الدولة: <b>{profile.country} (مصر) 🇪🇬</b>
• المجال المستهدف: <b>{escape(profile.career_direction)}</b>
• الأولوية: <b>{escape(profile.priority_target)}</b>
• سنوات الخبرة: <b>{exp_str}</b>
• الجامعة: <b>{escape(profile.education_institution or 'N/A')}</b>
• الشهادة / التخرج: <b>{escape(profile.degree_title or 'غير مؤكد / Unconfirmed')} ({profile.graduation_year or 'N/A'})</b>
{proj_str}
{cert_str}

🛠️ <b>المهارات المؤكدة من السيرة الذاتية / Confirmed Skills ({len(profile.confirmed_skills or [])}):</b>
<code>{escape(confirmed_str)}</code>

🎯 <b>المهارات المستهدفة / Target Skills:</b>
<code>{escape(target_str)}</code>

🔗 LinkedIn: {escape(profile.linkedin_url or 'N/A')}
🔗 GitHub: {escape(profile.github_url or 'N/A')}
"""
        await self.client.send_message(chat_id=chat_id, text=text)

    async def _cmd_settings(self, chat_id: int, session: AsyncSession) -> None:
        profile = await get_or_create_candidate_profile(session)
        text = f"""⚙️ <b>إعدادات النشرة والتنبيهات / Settings:</b>

• موعد النشرة اليومية: <b>{profile.digest_time} Africa/Cairo</b>
• حالة النشرة: <b>{'مفعلة ✅ (Active)' if profile.digest_enabled else 'متوقفة ⏸️ (Paused)'}</b>
• الحد الأدنى للمطابقة في النشرة: <b>{profile.digest_threshold:.0f}/100</b>

للإيقاف المؤقت: /pause
لإعادة التفعيل: /resume
"""
        await self.client.send_message(chat_id=chat_id, text=text)

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
            await self.client.send_message(chat_id=chat_id, text="⭐ لا توجد وظائف محفوظة حالياً.\nNo saved jobs.")
            return

        await self.client.send_message(chat_id=chat_id, text=f"⭐ <b>الوظائف المحفوظة ({len(jobs)}):</b>")
        for job in jobs[:5]:
            card_html = format_job_card(job)
            markup = build_job_inline_keyboard(job)
            await self.client.send_message(chat_id=chat_id, text=card_html, reply_markup=markup)

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
            await self.client.send_message(chat_id=chat_id, text="📝 لم يتم تسجيل أي تقديمات بعد.\nNo applied jobs tracked.")
            return

        await self.client.send_message(chat_id=chat_id, text=f"✅ <b>الوظائف التي تم التقديم إليها ({len(jobs)}):</b>")
        for job in jobs[:5]:
            applied_date = job.tracker.applied_at.strftime("%Y-%m-%d") if job.tracker and job.tracker.applied_at else ""
            header = f"💼 <b>{escape(job.title)}</b> في {escape(job.company)} (تم التقديم: {applied_date})"
            await self.client.send_message(chat_id=chat_id, text=header)

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

        # Phase 1: Live Animated Handshake
        frame1 = f"""⚡ <b>BottaJobs Discovery & AI Matching Engine</b>
═════════════════════════════
⏳ <code>[██░░░░░░░░] 20%</code>
📡 <b>Phase 1/4: Initializing Channels & Handshakes...</b>
• <i>Connecting to Remotive, Himalayas, WWR, RSS, Arbeitnow...</i>
• Candidate: <b>{escape(profile.full_name or 'Abdelrahman Emam')}</b> ({skills_count} confirmed skills)
• Target: <b>{escape(profile.priority_target)}</b>
"""
        progress_resp = await self.client.send_message(chat_id=chat_id, text=frame1)
        msg_id = progress_resp.get("result", {}).get("message_id")

        if msg_id:
            await self.client.send_chat_action(chat_id, "typing")
            frame2 = f"""⚡ <b>BottaJobs Discovery & AI Matching Engine</b>
═════════════════════════════
📥 <code>[█████░░░░░] 50%</code>
🔄 <b>Phase 2/4: Ingesting & Filtering Global Openings...</b>
• <i>Scanning remote listings open to Egypt (EG) 🇪🇬</i>
• <i>Normalizing workplace types, salaries, and required tech...</i>
"""
            await self.client.edit_message_text(chat_id=chat_id, message_id=msg_id, text=frame2)

        start_time = datetime.now(timezone.utc)
        from src.scheduler.runner import DailyPipelineRunner
        runner = DailyPipelineRunner()
        run_record = await runner.execute_daily_run(session, force=True, target_chat_id=chat_id)
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()

        if msg_id:
            await self.client.send_chat_action(chat_id, "typing")
            frame3 = f"""⚡ <b>BottaJobs Discovery & AI Matching Engine</b>
═════════════════════════════
🧠 <code>[████████░░] 80%</code>
🎯 <b>Phase 3/4: Semantic Scoring & Skill Compatibility...</b>
• <i>Scoring Angular, TypeScript, RxJS, REST APIs against job specs</i>
• <i>Rank-ordering top opportunities for your portfolio...</i>
"""
            await self.client.edit_message_text(chat_id=chat_id, message_id=msg_id, text=frame3)

        min_score = min(60.0, profile.digest_threshold)
        stmt = (
            select(Job)
            .where(Job.is_active == True, Job.match_score >= min_score)
            .order_by(Job.match_score.desc())
            .limit(5)
        )
        res = await session.execute(stmt)
        top_jobs = res.scalars().all()

        final_summary = f"""✨ <b>اكتمل فحص المصادر والمطابقة بنجاح!</b>
═════════════════════════════
✅ <code>[██████████] 100%</code>

📊 <b>Live Execution Telemetry:</b>
• إجمالي الوظائف المفحوصة: <b>{run_record.jobs_discovered} وظيفة</b>
• وظائف جديدة أضيفت: <b>{run_record.jobs_new} فرصة</b>
• فرص عالية التوافق (≥ {min_score:.0f}%): <b>{len(top_jobs)} وظيفة</b>
• زمن المعالجة الفعلي: <b>{duration:.1f} ثانية</b>
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
            await self.client.send_message(
                chat_id=chat_id,
                text="ℹ️ تم فحص المصادر ولم تظهر فرص جديدة تفوق نسبة التوافق في هذه اللحظة. سيتم إخطارك في النشرة الصباحية (09:00 ص).",
            )

    async def _cmd_help(self, chat_id: int) -> None:
        help_text = """📖 <b>BottaJobs Commands & Controls:</b>

• <b>/start</b> أو <b>/menu</b> — فتح لوحة التحكم التفاعلية الرئيسية (Control Center)
• <b>/today</b> — استعراض أفضل الفرص المتطابقة مع مهاراتك اليوم
• <b>/run</b> — تشغيل فحص فوري للمصادر وتوليد المطابقات لايف مع عداد التحميل
• <b>/profile</b> — عرض الملف الشخصي الكامل والـ 32 مهارة المعتمدة
• <b>/search &lt;query&gt;</b> — البحث الفوري في الوظائف المتاحة (مثال: <code>/search Angular</code>)
• <b>/saved</b> — عرض قائمة الوظائف المحفوظة
• <b>/applied</b> — متابعة سجل الوظائف التي تقدمت إليها
• <b>/settings</b> — استعراض إعدادات النشرة والتنبيهات
• <b>/wipe</b> — مسح الوظائف السابقة وإعادة تحميل بيانات الـ CV النظيفة
• <b>/pause</b> — إيقاف النشرة الصباحية مؤقتاً
• <b>/resume</b> — استئناف النشرة الصباحية اليومية

🔒 <i>ملاحظة أمان: البوت مساعد ذكي لا يقوم بالتقديم التلقائي دون مراجعتك لحماية خصوصيتك وجودة تقديمك.</i>
💡 <i>نصيحة: اضغط على زر Menu في تليجرام أو أرسل /menu للوصول إلى لوحة الأزرار التفاعلية.</i>
"""
        await self.client.send_message(chat_id=chat_id, text=help_text)

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
            if action == "run":
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
        elif action == "dismiss":
            tracker.status = ApplicationStatus.NOT_RELEVANT
            await session.commit()
            await self.client.answer_callback_query(query_id, text="❌ تم استبعاد الوظيفة من التوصيات.")
            if message_id:
                dismissed_text = f"<s>{format_job_card(job)}</s>\n\n<i>❌ تم استبعاد هذه الوظيفة.</i>"
                await self.client.edit_message_text(
                    chat_id=chat_id,
                    message_id=message_id,
                    text=dismissed_text,
                    reply_markup=None,
                )
        elif action == "why":
            breakdown_text = format_match_breakdown(job)
            await self.client.send_message(chat_id=chat_id, text=breakdown_text)
            await self.client.answer_callback_query(query_id, text="📊 تم تحميل تفاصيل المطابقة!")
