"""Message and job card formatting for Telegram with Arabic RTL and English technical clarity."""

from datetime import datetime, timezone
import html
from typing import Any, Dict, List, Optional
from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    MatchBand,
    SeniorityLevel,
    WorkplaceType,
)
from src.models.job import Job


def escape(text: Optional[str]) -> str:
    """Escape text for Telegram HTML formatting."""
    if not text:
        return ""
    return html.escape(str(text))


def format_date_label(published_at: Optional[datetime], first_seen_at: datetime) -> str:
    """
    Format honest publication/discovery date without misleading labels.
    Never claims a job was posted today unless published_at is strictly today.
    """
    now = datetime.now(timezone.utc)

    if published_at:
        # Ensure published_at is timezone-aware
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        diff_days = (now - published_at).days
        date_str = published_at.strftime("%Y-%m-%d")
        if diff_days <= 0:
            return f"🗓️ نُشرت اليوم / Published today ({date_str})"
        elif diff_days == 1:
            return f"🗓️ نُشرت بالأمس / Published yesterday ({date_str})"
        else:
            return f"🗓️ نُشرت منذ {diff_days} أيام / Published {diff_days}d ago ({date_str})"
    else:
        # Publication date is unknown
        if first_seen_at.tzinfo is None:
            first_seen_at = first_seen_at.replace(tzinfo=timezone.utc)
        diff_days = (now - first_seen_at).days
        date_str = first_seen_at.strftime("%Y-%m-%d")
        if diff_days <= 0:
            return f"🔍 اكتُشفت أول مرة اليوم / First discovered today ({date_str})"
        else:
            return f"🔍 اكتُشفت أول مرة منذ {diff_days} أيام / First discovered {diff_days}d ago ({date_str})"


def format_eligibility_badge(eligibility: GeographicEligibility) -> str:
    badges = {
        GeographicEligibility.EGYPT_ELIGIBLE: "🇪🇬 مؤهلة لمصر / Egypt Eligible",
        GeographicEligibility.REMOTE_WORLDWIDE: "🌐 عن بُعد عالمياً / Remote Worldwide",
        GeographicEligibility.REMOTE_REGION_POSSIBLE: "⚠️ إقليمي (تحتاج تأكيد) / Region Possible",
        GeographicEligibility.RELOCATION_REQUIRED: "✈️ تتطلب انتقال / Relocation Required",
        GeographicEligibility.NOT_ELIGIBLE: "🚫 غير مؤهل / Not Eligible",
        GeographicEligibility.UNKNOWN: "❓ غير مؤكد / Unknown Scope",
    }
    return badges.get(eligibility, "❓ غير مؤكد / Unknown")


def format_band_label(band: MatchBand) -> str:
    labels = {
        MatchBand.EXCELLENT: "ممتاز / Excellent ⭐⭐⭐",
        MatchBand.STRONG: "قوي / Strong ⭐⭐",
        MatchBand.POSSIBLE: "محتمل / Possible ⭐",
        MatchBand.LOW: "منخفض / Low",
    }
    return labels.get(band, "")


def format_job_card(job: Job) -> str:
    """Format an individual job into a Telegram HTML card."""
    lines: List[str] = []

    # Header: Title & Company
    lines.append(f"<b>💼 {escape(job.title)}</b>")
    lines.append(f"🏢 <b>{escape(job.company)}</b>")

    # Score & Eligibility
    score_str = f"🎯 المطابقة / Match: <b>{job.match_score:.1f}/100</b> ({format_band_label(job.match_band)})"
    lines.append(score_str)
    lines.append(f"📍 الأهلية الجغرافية: <b>{format_eligibility_badge(job.eligibility)}</b>")

    # Workplace & Location
    loc_display = escape(job.raw_location or job.remote_scope or "Remote")
    lines.append(f"🌍 المكان / Location: <code>{loc_display}</code> ({job.workplace_type.value})")

    # Seniority & Employment Type
    sen_display = job.seniority.value if job.seniority != SeniorityLevel.UNKNOWN else "غير محدد / Unstated"
    emp_display = job.employment_type.value if job.employment_type != EmploymentType.UNKNOWN else "دوام كامل / Full-time"
    lines.append(f"📊 المستوى: <b>{sen_display}</b> | نوع التعاقد: <b>{emp_display}</b>")

    # Truthful Date & Source Attribution
    date_label = format_date_label(job.published_at, job.first_seen_at)
    lines.append(date_label)
    lines.append(f"🔗 المصدر / Source: <i>{escape(job.source_name)}</i>")

    # Relevant Technologies
    skills = (job.required_skills or [])[:5]
    if skills:
        tags = " ".join([f"#{escape(s).replace(' ', '_')}" for s in skills])
        lines.append(f"🛠️ التقنيات: {tags}")

    # Match Reasons
    if job.match_reasons:
        lines.append("<b>💡 أسباب التوافق / Match Reasons:</b>")
        for reason in job.match_reasons[:3]:
            lines.append(f"  • {escape(reason)}")

    # Gaps / Unknowns
    if job.skill_gaps:
        lines.append("<b>⚠️ ملاحظات وفجوات / Gaps & Notes:</b>")
        for gap in job.skill_gaps[:2]:
            lines.append(f"  • {escape(gap)}")

    return "\n".join(lines)


def build_job_inline_keyboard(job: Job) -> Dict[str, Any]:
    """Generate interactive inline keyboard for a job card."""
    app_url = job.original_application_url or job.source_url
    return {
        "inline_keyboard": [
            [
                {"text": "🌐 فتح رابط التقديم / Apply", "url": app_url},
            ],
            [
                {"text": "⭐ حفظ / Save", "callback_data": f"save:{job.id}"},
                {"text": "✅ تم التقديم / Applied", "callback_data": f"applied:{job.id}"},
            ],
            [
                {"text": "❓ تفاصيل المطابقة / Why?", "callback_data": f"why:{job.id}"},
                {"text": "❌ غير مناسب / Dismiss", "callback_data": f"dismiss:{job.id}"},
            ],
        ]
    }


def chunk_message(text: str, max_chars: int = 3800) -> List[str]:
    """Safely partition long messages into Telegram-compliant blocks (< 4096 chars)."""
    if len(text) <= max_chars:
        return [text]

    chunks: List[str] = []
    lines = text.split("\n")
    current_chunk: List[str] = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1
        if current_len + line_len > max_chars and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_len = line_len
        else:
            current_chunk.append(line)
            current_len += line_len

    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks
