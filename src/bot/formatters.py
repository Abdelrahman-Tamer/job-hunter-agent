"""Message and job card formatting for Telegram with crisp, executive English UX."""

from datetime import datetime, timezone
import html
from typing import Any, Dict, List, Optional
from src.models.enums import (
    EmploymentType,
    GeographicEligibility,
    JobTrack,
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
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        diff_days = (now - published_at).days
        date_str = published_at.strftime("%Y-%m-%d")
        if diff_days <= 0:
            return f"🗓️ Published today ({date_str})"
        elif diff_days == 1:
            return f"🗓️ Published yesterday ({date_str})"
        else:
            return f"🗓️ Published {diff_days}d ago ({date_str})"
    else:
        if not first_seen_at:
            first_seen_at = now
        elif first_seen_at.tzinfo is None:
            first_seen_at = first_seen_at.replace(tzinfo=timezone.utc)
        diff_days = (now - first_seen_at).days
        date_str = first_seen_at.strftime("%Y-%m-%d")
        if diff_days <= 0:
            return f"🔍 First discovered today ({date_str})"
        else:
            return f"🔍 First discovered {diff_days}d ago ({date_str})"


def format_eligibility_badge(eligibility: GeographicEligibility) -> str:
    badges = {
        GeographicEligibility.EGYPT_ELIGIBLE: "🇪🇬 Egypt Eligible (فرصة داخل مصر)",
        GeographicEligibility.REMOTE_WORLDWIDE: "🌐 Remote Worldwide",
        GeographicEligibility.REMOTE_REGION_POSSIBLE: "⚠️ Regional Remote (Confirm EG)",
        GeographicEligibility.RELOCATION_REQUIRED: "✈️ Relocation Required",
        GeographicEligibility.NOT_ELIGIBLE: "🚫 Ineligible Location",
        GeographicEligibility.UNKNOWN: "❓ Scope Unspecified",
    }
    return badges.get(eligibility, "❓ Unknown")


def format_track_badge(track: Optional[JobTrack]) -> str:
    badges = {
        JobTrack.FRONTEND_EGYPT: "🇪🇬 Egypt Frontend (فرص مصر)",
        JobTrack.FRONTEND_REMOTE_GCC: "🌐 Remote Abroad / GCC (ريموت خارج مصر)",
        JobTrack.FRONTEND_INTERN: "🎓 Frontend Internship (تدريب واجهات)",
        JobTrack.WEB_ANGULAR: "🌐 Web & Angular Frontend",
        JobTrack.NO_EXP_REMOTE: "💼 Remote Without Experience",
        JobTrack.SOFTWARE_INTERN: "🎓 Software & AI Internship",
        JobTrack.OTHER: "📌 General Opportunity",
    }
    return badges.get(track, "📌 Opportunity")


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
        MatchBand.EXCELLENT: "Top Match ⭐⭐⭐",
        MatchBand.STRONG: "Strong Match ⭐⭐",
        MatchBand.POSSIBLE: "Good Match ⭐",
        MatchBand.LOW: "Low Match",
    }
    return labels.get(band, "")


def format_job_card(job: Job) -> str:
    """Format an individual job into an executive Telegram HTML card."""
    lines: List[str] = []

    # Score Tier Header Badge
    score = job.match_score
    if score >= 90.0:
        tier_badge = "🟢 <b>Top Match ⭐⭐⭐</b>"
    elif score >= 75.0:
        tier_badge = "🔵 <b>Strong Match ⭐⭐</b>"
    elif score >= 60.0:
        tier_badge = "🟡 <b>Good Match ⭐</b>"
    else:
        tier_badge = "⚪ <b>Potential Match</b>"

    is_social = getattr(job, "is_social_post", False)
    seg = getattr(job, "opportunity_segment", "")

    if seg == "EGYPT" or (
        job.eligibility == GeographicEligibility.EGYPT_ELIGIBLE
        and any(e in (job.raw_location or "").lower() for e in ["egypt", "cairo", "giza", "alexandria", "smart village", "مصر", "القاهرة", "الجيزة"])
    ):
        lines.append("🇪🇬 <b>[فرصة داخل مصر • Egypt Frontend]</b>")
    elif seg == "REMOTE_GCC_ABROAD" or job.job_track == JobTrack.FRONTEND_REMOTE_GCC:
        lines.append("🌐 <b>[ريموت خارج مصر • Remote Abroad / GCC]</b>")
    else:
        lines.append("📌 <b>[فرصة متوافقة • Verified Frontend]</b>")

    lines.append(f"💼 <b>{escape(job.title)}</b>")
    company_prefix = "👤 Poster:" if is_social else "🏢 Company:"
    lines.append(f"{company_prefix} <b>{escape(job.company)}</b>")
    lines.append("─────────────────────────")

    bar = make_progress_bar(score, 100.0, 10)
    lines.append(f"🎯 Match Score: <b>{score:.1f}%</b> <code>[{bar}]</code>\n    {tier_badge}")
    track_val = getattr(job, "job_track", None)
    if track_val:
        lines.append(f"🏷️ Track: <b>{format_track_badge(track_val)}</b>")
    lines.append(f"📍 Eligibility: <b>{format_eligibility_badge(job.eligibility)}</b>")

    loc_display = escape(job.raw_location or job.remote_scope or "Remote")
    workplace_text = {
        WorkplaceType.REMOTE: "Remote",
        WorkplaceType.ON_SITE: "On-site",
        WorkplaceType.HYBRID: "Hybrid",
        WorkplaceType.UNKNOWN: "Remote",
    }.get(job.workplace_type, "Remote")
    lines.append(f"🌍 Region & Work Mode: <code>{loc_display}</code> (<b>{workplace_text}</b>)")

    sen_display = job.seniority.value if job.seniority != SeniorityLevel.UNKNOWN else "Junior / Entry"
    emp_display = job.employment_type.value if job.employment_type != EmploymentType.UNKNOWN else "Full-time"
    lines.append(f"📊 Level: <b>{sen_display}</b> | Type: <b>{emp_display}</b>")

    source_type_label = "Social Post (LinkedIn)" if is_social else f"Job Board ({escape(job.source_name)})"
    lines.append(f"📡 Source: <b>{source_type_label}</b>")

    if job.salary_min or job.salary_max:
        curr = escape(job.salary_currency or "$")
        if job.salary_min and job.salary_max:
            sal_str = f"{curr}{job.salary_min:,.0f} - {curr}{job.salary_max:,.0f}"
        elif job.salary_min:
            sal_str = f"From {curr}{job.salary_min:,.0f}"
        else:
            sal_str = f"Up to {curr}{job.salary_max:,.0f}"
        period = f" / {job.salary_period}" if job.salary_period else ""
        lines.append(f"💵 Salary: <b>{sal_str}{period}</b>")

    date_label = format_date_label(job.published_at, job.first_seen_at)
    app_url = job.original_application_url or job.source_url
    lines.append(f"{date_label} • <a href=\"{app_url}\">Direct Link ↗</a>")

    skills = (job.required_skills or [])[:6]
    if skills:
        tags = " ".join([f"#{escape(s).replace(' ', '_').replace('.', '_')}" for s in skills])
        lines.append(f"🛠️ Stack: {tags}")

    if job.match_reasons:
        lines.append("")
        lines.append("<b>💡 Match Highlights:</b>")
        for reason in job.match_reasons[:3]:
            lines.append(f"  ✓ {escape(reason)}")

    if score < 100.0 and job.skill_gaps:
        lines.append("")
        lines.append(f"<b>🔍 Gaps to 100% (-{100.0 - score:.1f}%):</b>")
        for gap in job.skill_gaps[:3]:
            lines.append(f"  ✗ {escape(gap)}")
    elif score >= 100.0:
        lines.append("")
        lines.append("🌟 <b>Perfect 100% Match with all verified CV requirements!</b>")

    return "\n".join(lines)


def format_match_breakdown(job: Job) -> str:
    """Format deep score breakdown with visual progress bars."""
    breakdown = job.score_breakdown or {}

    role = float(breakdown.get("role_relevance", 0.0))
    skills = float(breakdown.get("confirmed_skills", 0.0))
    sen = float(breakdown.get("experience_seniority", 0.0))
    elig = float(breakdown.get("work_eligibility", 0.0))
    emp = float(breakdown.get("employment_type", 0.0))
    fresh = float(breakdown.get("freshness_evidence", 0.0))

    lines = [
        "📊 <b>Job Match Analytics</b>",
        f"💼 <b>{escape(job.title)}</b>",
        f"🏢 <i>{escape(job.company)}</i>",
        "─────────────────────────",
        f"🎯 <b>Overall Match: {job.match_score:.1f}/100</b> <code>[{make_progress_bar(job.match_score, 100.0, 10)}]</code>",
        "",
        f"• <b>Target Role Alignment:</b> {role:.1f}/20 <code>[{make_progress_bar(role, 20.0, 8)}]</code>",
        f"• <b>Verified CV Skills:</b> {skills:.1f}/25 <code>[{make_progress_bar(skills, 25.0, 8)}]</code>",
        f"• <b>Seniority Alignment:</b> {sen:.1f}/20 <code>[{make_progress_bar(sen, 20.0, 8)}]</code>",
        f"• <b>Location & Eligibility:</b> {elig:.1f}/20 <code>[{make_progress_bar(elig, 20.0, 8)}]</code>",
        f"• <b>Contract Preference:</b> {emp:.1f}/10 <code>[{make_progress_bar(emp, 10.0, 8)}]</code>",
        f"• <b>Posting Freshness:</b> {fresh:.1f}/5 <code>[{make_progress_bar(fresh, 5.0, 8)}]</code>",
    ]
    if job.match_reasons:
        lines.append("")
        lines.append("💡 <b>Key Match Drivers:</b>")
        for r in job.match_reasons[:3]:
            lines.append(f"  ✓ {escape(r)}")
    if job.skill_gaps:
        lines.append("")
        lines.append("🔍 <b>Requirement Gaps (Why not 100%):</b>")
        for g in job.skill_gaps:
            lines.append(f"  ✗ {escape(g)}")

    return "\n".join(lines)


def build_job_inline_keyboard(job: Job, tracker_status: Optional[str] = None) -> Dict[str, Any]:
    """Generate clean, intuitive inline keyboard for a job card."""
    app_url = job.original_application_url or job.source_url
    is_social = getattr(job, "is_social_post", False)
    apply_btn_label = "💬 View LinkedIn Post ↗" if is_social else "🌐 Apply Direct ↗"

    save_text = "⭐ Saved to Favorites ✅" if tracker_status == "saved" else "⭐ Save Job"
    applied_text = "🎉 Applied ✅" if tracker_status == "applied" else "✅ Mark as Applied"

    return {
        "inline_keyboard": [
            [
                {"text": apply_btn_label, "url": app_url},
            ],
            [
                {"text": save_text, "callback_data": f"save:{job.id}"},
                {"text": applied_text, "callback_data": f"applied:{job.id}"},
            ],
            [
                {"text": "✍️ AI Cover Letter", "callback_data": f"cover:{job.id}"},
                {"text": "💬 Recruiter DM", "callback_data": f"dm:{job.id}"},
            ],
            [
                {"text": "📄 Tailored PDF", "callback_data": f"resume:{job.id}"},
                {"text": "🎯 Interview Prep", "callback_data": f"interview:{job.id}"},
            ],
            [
                {"text": "📊 Score Breakdown", "callback_data": f"why:{job.id}"},
                {"text": "❌ Dismiss", "callback_data": f"dismiss:{job.id}"},
            ],
        ]
    }


def build_persistent_reply_keyboard() -> Dict[str, Any]:
    """Bottom pinned reply keyboard for instant zero-typing control."""
    return {
        "keyboard": [
            [
                {"text": "🚀 Run Scan"},
                {"text": "📋 Today's Jobs"},
            ],
            [
                {"text": "🇪🇬 Egypt (فرص مصر)"},
                {"text": "🌐 Remote Abroad / GCC"},
            ],
            [
                {"text": "🎓 Frontend Interns"},
                {"text": "🔍 Smart Filters"},
            ],
            [
                {"text": "👤 My Profile / CV"},
                {"text": "⭐ Saved Jobs"},
            ],
            [
                {"text": "📝 Applied Pipeline"},
                {"text": "📖 Help & Guide"},
            ],
        ],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def build_quick_filters_keyboard() -> Dict[str, Any]:
    """Interactive filter options for targeted discovery across Frontend radar."""
    return {
        "inline_keyboard": [
            [
                {"text": "🇪🇬 Egypt (Cairo/Giza/Remote)", "callback_data": "filter:egypt"},
                {"text": "🌐 Remote Abroad / GCC", "callback_data": "filter:remote_gcc"},
            ],
            [
                {"text": "🎓 Frontend Internships", "callback_data": "filter:track_intern"},
                {"text": "🅰️ Angular & TypeScript", "callback_data": "filter:angular"},
            ],
            [
                {"text": "📡 Social Hiring Posts", "callback_data": "filter:social"},
                {"text": "💼 Traditional Job Boards", "callback_data": "filter:boards"},
            ],
            [
                {"text": "⚡ Junior / Entry Level", "callback_data": "filter:junior"},
                {"text": "⭐ Top Matches (≥ 75%)", "callback_data": "filter:top"},
            ],
            [
                {"text": "💵 Disclosed Salary", "callback_data": "filter:salary"},
                {"text": "« Back to Main Menu", "callback_data": "menu:main"},
            ],
        ]
    }


def build_main_menu_keyboard(dashboard_url: str = "https://job-hunter-agent-bottajobs.onrender.com") -> Dict[str, Any]:
    """Generate interactive control center keyboard."""
    return {
        "inline_keyboard": [
            [
                {"text": "🚀 Run Live Scan", "callback_data": "menu:run"},
                {"text": "📋 Top Matches Today", "callback_data": "menu:today"},
            ],
            [
                {"text": "🔍 Smart Filters", "callback_data": "menu:filters"},
                {"text": "👤 Profile & 32 Skills", "callback_data": "menu:profile"},
            ],
            [
                {"text": "⭐ Saved Jobs", "callback_data": "menu:saved"},
                {"text": "📝 Applied Pipeline", "callback_data": "menu:applied"},
            ],
            [
                {"text": "⚙️ Digest Settings", "callback_data": "menu:settings"},
                {"text": "📖 Help & Guide", "callback_data": "menu:help"},
            ],
            [
                {"text": "🌐 Open Web Dashboard (Mini App)", "web_app": {"url": dashboard_url}},
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
