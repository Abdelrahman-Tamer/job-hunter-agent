"""Application Follow-Up Reminder Scheduler and Notification Service."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from src.bot.formatters import escape
from src.bot.telegram_client import TelegramClient
from src.core.config import settings
from src.core.logging import logger
from src.engine.gemini_extractor import GeminiJobExtractor
from src.models.enums import ApplicationStatus
from src.models.tracker import JobStatusTracker
from src.services.profile_service import get_or_create_candidate_profile


async def check_and_send_followup_reminders(
    session: AsyncSession,
    telegram: TelegramClient,
    gemini: GeminiJobExtractor,
    target_chat_id: Optional[int] = None,
) -> int:
    """
    Find applied jobs whose 5-day follow-up window has arrived,
    and dispatch an executive reminder with a tailored follow-up note.
    """
    recipient_chat_id = target_chat_id or settings.TELEGRAM_OWNER_ID
    if not recipient_chat_id or not telegram.is_configured:
        return 0

    now = datetime.now(timezone.utc)
    stmt = (
        select(JobStatusTracker)
        .options(joinedload(JobStatusTracker.job))
        .where(
            and_(
                JobStatusTracker.status == ApplicationStatus.APPLIED,
                JobStatusTracker.follow_up_sent == False,
                JobStatusTracker.follow_up_at != None,
                JobStatusTracker.follow_up_at <= now,
            )
        )
    )
    res = await session.execute(stmt)
    trackers = res.scalars().all()

    if not trackers:
        return 0

    profile = await get_or_create_candidate_profile(session)
    reminders_sent = 0

    for t in trackers:
        job = t.job
        if not job:
            continue

        # Generate custom follow up note
        outreach = await gemini.generate_linkedin_outreach(
            candidate_name=profile.full_name or "Abdelrahman Emam",
            candidate_title=profile.priority_target or "Frontend Developer (Angular)",
            skills=profile.confirmed_skills or [],
            company=job.company,
            job_title=job.title,
            job_description=job.description_text or "",
        )
        followup_text = outreach.get("follow_up_note") or (
            f"Hi! Following up on my application for the {job.title} position submitted 5 days ago. "
            f"I remain very excited about {job.company}'s engineering vision and would love to discuss how my "
            f"Angular & frontend background can contribute to your goals. Thank you! - {profile.full_name or 'Abdelrahman Emam'}"
        )

        app_url = job.original_application_url or job.source_url

        msg = f"""⏰ <b>Application Follow-Up Reminder (Day 5)</b>
💼 <b>Role:</b> {escape(job.title)}
🏢 <b>Company:</b> {escape(job.company)}
─────────────────────────
It has been <b>5 days</b> since you submitted your application! Following up now increases candidate callback rates by over 40%.

💬 <b>Recommended Follow-Up Note (Email / LinkedIn DM):</b>
<code>{escape(followup_text)}</code>
─────────────────────────
💡 <i>Tap the code block above to copy instantly, send to the recruiter, and update your tracker:</i>"""

        markup = {
            "inline_keyboard": [
                [
                    {"text": "🌐 Original Listing ↗", "url": app_url},
                ],
                [
                    {"text": "🎉 Got Interview!", "callback_data": f"interview_status:{job.id}"},
                    {"text": "⏰ Remind in 3d", "callback_data": f"postpone:{job.id}"},
                ],
                [
                    {"text": "❌ Marked Rejected", "callback_data": f"rejected_status:{job.id}"},
                    {"text": "✍️ AI Cover Letter", "callback_data": f"cover:{job.id}"},
                ],
            ]
        }

        try:
            res = await telegram.send_message(
                chat_id=recipient_chat_id,
                text=msg,
                reply_markup=markup,
            )
            sent_ok = bool(res.get("ok")) if isinstance(res, dict) else bool(res)
            if not sent_ok:
                err_desc = res.get("description") if isinstance(res, dict) else "unknown error"
                logger.error(f"Telegram failed to deliver 5-day follow-up reminder for Job #{job.id}: {err_desc}")
                continue
            t.follow_up_sent = True
            t.follow_up_note = followup_text
            reminders_sent += 1
            logger.info(f"Sent 5-day follow-up reminder for Job #{job.id} ({job.title} at {job.company})")
        except Exception as exc:
            logger.error(f"Failed to send follow-up reminder for Job #{job.id}: {exc}")

    await session.commit()
    return reminders_sent
