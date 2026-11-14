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


def make_progress_bar(value: float, max_val: float = 100.0, length: int = 10) -> str:
    """Render a clean UTF-8 progress bar."""
    if max_val <= 0:
        return "░" * length
    ratio = min(max(value / max_val, 0.0), 1.0)
    filled = int(round(ratio * length))
    empty = length - filled
    return "█" * filled + "░" * empty


def format_band_label(band: MatchBand) -> str:
    labels = {
        MatchBand.EXCELLENT: "ممتاز / Excellent ⭐⭐⭐",
        MatchBand.STRONG: "قوي / Strong ⭐⭐",
        MatchBand.POSSIBLE: "محتمل / Possible ⭐",
        MatchBand.LOW: "منخفض / Low",
    }
    return labels.get(band, "")


def format_job_card(job: Job) -> str:
    """Format an individual job into an executive Telegram HTML card."""
    lines: List[str] = []

    # Score Tier Header Badge
    score = job.match_score
    if score >= 90.0:
        tier_badge = "🟢 <b>تطابق استثنائي (Top Match) ⭐⭐⭐</b>"
    elif score >= 75.0:
        tier_badge = "🔵 <b>تطابق قوي جداً (Strong Match) ⭐⭐</b>"
    elif score >= 60.0:
        tier_badge = "🟡 <b>تطابق جيد (Good Match) ⭐</b>"
    else:
        tier_badge = "⚪ <b>تطابق محتمل</b>"

    lines.append(f"💼 <b>{escape(job.title)}</b>")
    lines.append(f"🏢 <b>{escape(job.company)}</b>")
    lines.append("─────────────────────────")

    bar = make_progress_bar(score, 100.0, 10)
    lines.append(f"🎯 التوافق: <b>{score:.1f}%</b> <code>[{bar}]</code>\n    {tier_badge}")
    lines.append(f"📍 الأهلية: <b>{format_eligibility_badge(job.eligibility)}</b>")

    loc_display = escape(job.raw_location or job.remote_scope or "Remote")
    workplace_arabic = {
        WorkplaceType.REMOTE: "عن بُعد (Remote)",
        WorkplaceType.ON_SITE: "مقر الشركة (On-site)",
        WorkplaceType.HYBRID: "هجين (Hybrid)",
        WorkplaceType.UNKNOWN: "عن بُعد",
    }.get(job.workplace_type, "عن بُعد")
    lines.append(f"🌍 المكان: <code>{loc_display}</code> ({workplace_arabic})")

    sen_display = job.seniority.value if job.seniority != SeniorityLevel.UNKNOWN else "Junior / Entry"
    emp_display = job.employment_type.value if job.employment_type != EmploymentType.UNKNOWN else "دوام كامل (Full-time)"
    lines.append(f"📊 المستوى: <b>{sen_display}</b> | نوع العمل: <b>{emp_display}</b>")

    if job.salary_min or job.salary_max:
        curr = escape(job.salary_currency or "$")
        if job.salary_min and job.salary_max:
            sal_str = f"{curr}{job.salary_min:,.0f} - {curr}{job.salary_max:,.0f}"
        elif job.salary_min:
            sal_str = f"يبدأ من {curr}{job.salary_min:,.0f}"
        else:
            sal_str = f"حتى {curr}{job.salary_max:,.0f}"
        period = f" / {job.salary_period}" if job.salary_period else ""
        lines.append(f"💵 الراتب: <b>{sal_str}{period}</b>")

    date_label = format_date_label(job.published_at, job.first_seen_at)
    lines.append(f"{date_label} • <i>{escape(job.source_name)}</i>")

    skills = (job.required_skills or [])[:6]
    if skills:
        tags = " ".join([f"#{escape(s).replace(' ', '_').replace('.', '_')}" for s in skills])
        lines.append(f"🛠️ التقنيات: {tags}")

    if job.match_reasons:
        lines.append("")
        lines.append("<b>💡 لماذا تناسبك هذه الفرصة؟</b>")
        for reason in job.match_reasons[:3]:
            lines.append(f"  ✓ {escape(reason)}")

    if score < 100.0 and job.skill_gaps:
        lines.append("")
        lines.append(f"<b>🔍 ما ينقصك للحصول على 100% (-{100.0 - score:.1f}%):</b>")
        for gap in job.skill_gaps[:3]:
            lines.append(f"  ✗ {escape(gap)}")
    elif score >= 100.0:
        lines.append("")
        lines.append("🌟 <b>تطابق كامل ومثالي 100% مع كافة متطلبات الـ CV!</b>")

    return "\n".join(lines)


def format_match_breakdown(job: Job) -> str:
    """Format deep score breakdown with visual bars."""
    breakdown = job.score_breakdown or {}

    role = float(breakdown.get("role_relevance", 0.0))
    skills = float(breakdown.get("confirmed_skills", 0.0))
    sen = float(breakdown.get("experience_seniority", 0.0))
    elig = float(breakdown.get("work_eligibility", 0.0))
    emp = float(breakdown.get("employment_type", 0.0))
    fresh = float(breakdown.get("freshness_evidence", 0.0))

    lines = [
        f"📊 <b>تحليل مطابقة الوظيفة / Match Analytics</b>",
        f"💼 <b>{escape(job.title)}</b>",
        f"🏢 <i>{escape(job.company)}</i>",
        "─────────────────────────",
        f"🎯 <b>النتيجة الإجمالية: {job.match_score:.1f}/100</b> <code>[{make_progress_bar(job.match_score, 100.0, 10)}]</code>",
        "",
        f"• <b>توافق المسمى والهدف:</b> {role:.1f}/20 <code>[{make_progress_bar(role, 20.0, 8)}]</code>",
        f"• <b>المهارات المؤكدة من الـ CV:</b> {skills:.1f}/25 <code>[{make_progress_bar(skills, 25.0, 8)}]</code>",
        f"• <b>مستوى الخبرة والسينيورتي:</b> {sen:.1f}/20 <code>[{make_progress_bar(sen, 20.0, 8)}]</code>",
        f"• <b>الأهلية الجغرافية (مصر/عن بُعد):</b> {elig:.1f}/20 <code>[{make_progress_bar(elig, 20.0, 8)}]</code>",
        f"• <b>نوع التعاقد (دوام كامل/مرن):</b> {emp:.1f}/10 <code>[{make_progress_bar(emp, 10.0, 8)}]</code>",
        f"• <b>حداثة الإعلان وموثوقيته:</b> {fresh:.1f}/5 <code>[{make_progress_bar(fresh, 5.0, 8)}]</code>",
    ]
    if job.match_reasons:
        lines.append("")
        lines.append("💡 <b>أبرز نقاط القوة:</b>")
        for r in job.match_reasons[:3]:
            lines.append(f"  ✓ {escape(r)}")
    if job.skill_gaps:
        lines.append("")
        lines.append("🔍 <b>تفاصيل النواقص وسبب خصم النقاط (Why not 100%?):</b>")
        for g in job.skill_gaps:
            lines.append(f"  ✗ {escape(g)}")

    return "\n".join(lines)


def build_job_inline_keyboard(job: Job, tracker_status: Optional[str] = None) -> Dict[str, Any]:
    """Generate clean, intuitive inline keyboard for a job card."""
    app_url = job.original_application_url or job.source_url

    save_text = "⭐ محفوظ في المفضلة ✅" if tracker_status == "saved" else "⭐ حفظ في المفضلة"
    applied_text = "🎉 تم التقديم بنجاح ✅" if tracker_status == "applied" else "✅ سجلت التقديم"

    return {
        "inline_keyboard": [
            [
                {"text": "🌐 فتح رابط التقديم المباشر (Direct Apply) ↗", "url": app_url},
            ],
            [
                {"text": save_text, "callback_data": f"save:{job.id}"},
                {"text": applied_text, "callback_data": f"applied:{job.id}"},
            ],
            [
                {"text": "✍️ خطاب تقديم AI مخصص", "callback_data": f"cover:{job.id}"},
                {"text": "🎯 أسئلة المقابلة المتوقعة", "callback_data": f"interview:{job.id}"},
            ],
            [
                {"text": "📊 تفاصيل احتساب النسبة", "callback_data": f"why:{job.id}"},
                {"text": "❌ استبعاد الوظيفة", "callback_data": f"dismiss:{job.id}"},
            ],
        ]
    }


def build_persistent_reply_keyboard() -> Dict[str, Any]:
    """Bottom pinned reply keyboard for instant zero-typing control."""
    return {
        "keyboard": [
            [
                {"text": "🚀 فحص الوظائف الآن"},
                {"text": "📋 أفضل وظائف اليوم"},
            ],
            [
                {"text": "🔍 فلاتر وتصنيفات"},
                {"text": "👤 ملفي والـ CV"},
            ],
            [
                {"text": "⭐ وظائفي المحفوظة"},
                {"text": "📝 سجل التقديمات"},
            ],
            [
                {"text": "🌐 لوحة التحكم (Mini App)"},
                {"text": "📖 المساعدة والدليل"},
            ],
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def build_quick_filters_keyboard() -> Dict[str, Any]:
    """Interactive filter options for targeted discovery."""
    return {
        "inline_keyboard": [
            [
                {"text": "🅰️ فرص Angular وتطوير الواجهات", "callback_data": "filter:angular"},
                {"text": "⭐ أعلى تطابق بالـ CV (≥ 75%)", "callback_data": "filter:top"},
            ],
            [
                {"text": "🇪🇬 مصر والخليج العربي", "callback_data": "filter:egypt"},
                {"text": "🌍 ريموت عالمياً (Worldwide)", "callback_data": "filter:remote"},
            ],
            [
                {"text": "⚡ مستوى Junior وخريجين", "callback_data": "filter:junior"},
                {"text": "🛠️ مهارات الـ CV (TS / RxJS / APIs)", "callback_data": "filter:cv_skills"},
            ],
            [
                {"text": "💵 فرص برواتب معلنة ومحددة", "callback_data": "filter:salary"},
                {"text": "🔙 القائمة الرئيسية", "callback_data": "menu:main"},
            ],
        ]
    }


def build_main_menu_keyboard(dashboard_url: str = "https://job-hunter-agent-bottajobs.onrender.com") -> Dict[str, Any]:
    """Generate interactive control center keyboard."""
    return {
        "inline_keyboard": [
            [
                {"text": "🚀 فحص فوري للمصادر", "callback_data": "menu:run"},
                {"text": "📋 أفضل وظائف اليوم", "callback_data": "menu:today"},
            ],
            [
                {"text": "🔍 فلاتر وتصنيفات ذكية", "callback_data": "menu:filters"},
                {"text": "👤 مهاراتي والـ CV", "callback_data": "menu:profile"},
            ],
            [
                {"text": "⭐ الوظائف المحفوظة", "callback_data": "menu:saved"},
                {"text": "📝 سجل التقديمات", "callback_data": "menu:applied"},
            ],
            [
                {"text": "⚙️ إعدادات النشرة", "callback_data": "menu:settings"},
                {"text": "📖 المساعدة والدليل", "callback_data": "menu:help"},
            ],
            [
                {"text": "🌐 فتح لوحة التحكم المباشرة (Telegram Mini App)", "web_app": {"url": dashboard_url}},
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
