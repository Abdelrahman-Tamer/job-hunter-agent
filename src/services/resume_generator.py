"""Dynamic, ATS-optimized tailored PDF resume generator using ReportLab."""

import io
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from src.models.job import Job
from src.models.profile import CandidateProfile


def generate_tailored_resume_pdf(profile: CandidateProfile, job: Optional[Job] = None) -> bytes:
    """
    Generate an ATS-compliant, executive-styled single-page/two-page PDF resume
    specifically targeted and tailored to the job opportunity requirements.
    """
    buffer = io.BytesIO()

    # Document setup with 0.5 inch margins for optimal ATS layout
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom typography hierarchy
    name_style = ParagraphStyle(
        "ResumeName",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0F172A"),
        alignment=0,
    )

    target_role_style = ParagraphStyle(
        "ResumeTargetRole",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#2563EB"),
        alignment=0,
    )

    contact_style = ParagraphStyle(
        "ResumeContact",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
        alignment=0,
    )

    section_heading_style = ParagraphStyle(
        "ResumeSectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1E3A8A"),
        spaceAfter=3,
        textTransform="uppercase",
    )

    body_style = ParagraphStyle(
        "ResumeBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#1E293B"),
    )

    bullet_style = ParagraphStyle(
        "ResumeBullet",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12.5,
        leftIndent=12,
        textColor=colors.HexColor("#334155"),
        spaceAfter=2,
    )

    bold_bullet_style = ParagraphStyle(
        "ResumeBoldBullet",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12.5,
        textColor=colors.HexColor("#0F172A"),
    )

    elements = []

    # -------------------------------------------------------------
    # 1. Header Section
    # -------------------------------------------------------------
    full_name = profile.full_name or "Candidate"
    elements.append(Paragraph(xml_escape(str(full_name)), name_style))

    target_title = profile.priority_target or "Frontend Developer (Angular)"
    if job:
        role_line = f"{xml_escape(str(target_title))} • Targeted for {xml_escape(str(job.title))} at {xml_escape(str(job.company))}"
    else:
        role_line = f"{xml_escape(str(target_title))} • Web Engineering Specialist"
    elements.append(Paragraph(role_line, target_role_style))
    elements.append(Spacer(1, 4))

    # Contact line (only include verified non-empty fields; never fabricate personal info)
    contact_parts: List[str] = []
    location_str = getattr(profile, "country", None)
    if location_str == "EG":
        location_str = "Cairo, Egypt"
    if location_str:
        contact_parts.append(xml_escape(str(location_str)))

    email = getattr(profile, "email", None)
    if email:
        contact_parts.append(xml_escape(str(email)))

    phone = getattr(profile, "phone", None)
    if phone:
        contact_parts.append(xml_escape(str(phone)))

    linkedin = getattr(profile, "linkedin_url", None)
    if linkedin:
        contact_parts.append(xml_escape(str(linkedin)))

    github = getattr(profile, "github_url", None)
    if github:
        contact_parts.append(xml_escape(str(github)))

    if contact_parts:
        elements.append(Paragraph(" | ".join(contact_parts), contact_style))
    elements.append(Spacer(1, 8))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E2E8F0"), spaceAfter=8))

    # -------------------------------------------------------------
    # 2. Executive Professional Summary (Targeted)
    # -------------------------------------------------------------
    elements.append(Paragraph("Professional Summary", section_heading_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#CBD5E1"), spaceAfter=4))

    summary_text = xml_escape(
        str(
            profile.professional_summary
            or (
                "Dedicated and performance-driven Frontend Developer specializing in modern Angular architecture, "
                "TypeScript, and scalable web interfaces. Experienced in translating complex product requirements into "
                "clean, responsive, and accessible SPAs with robust state management and seamless REST API integrations."
            )
        )
    )
    if job:
        summary_text += f" Eager to leverage proven engineering expertise to accelerate technical objectives at {xml_escape(str(job.company))}."

    elements.append(Paragraph(summary_text, body_style))
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 3. Technical Skills & Competencies (Target-Aligned)
    # -------------------------------------------------------------
    elements.append(Paragraph("Technical Competencies", section_heading_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#CBD5E1"), spaceAfter=4))

    all_confirmed: List[str] = list(profile.confirmed_skills or [])
    if not all_confirmed:
        all_confirmed = ["Angular", "TypeScript", "JavaScript", "HTML5", "CSS3", "Tailwind CSS", "RxJS", "Git", "REST APIs"]

    # Match skills against job requirements
    matched_skills = []
    other_skills = []
    if job and job.required_skills:
        req_lower = {s.lower() for s in job.required_skills}
        for s in all_confirmed:
            if s.lower() in req_lower:
                matched_skills.append(s)
            else:
                other_skills.append(s)
    else:
        matched_skills = all_confirmed[:6]
        other_skills = all_confirmed[6:]

    if matched_skills:
        escaped_skills = ", ".join(xml_escape(str(s)) for s in matched_skills)
        elements.append(
            Paragraph(
                f"<b>Core Role Matches:</b> {escaped_skills}",
                bullet_style,
            )
        )

    elements.append(
        Paragraph(
            f"<b>Frontend Frameworks & Architecture:</b> Angular (Standalone Components, Signals, RxJS), TypeScript, JavaScript (ES6+), HTML5, CSS3, SCSS",
            bullet_style,
        )
    )
    elements.append(
        Paragraph(
            f"<b>UI & Styling:</b> Tailwind CSS, Angular Material, Bootstrap, Flexbox, CSS Grid, Responsive Design, WCAG 2.2 Accessibility",
            bullet_style,
        )
    )
    elements.append(
        Paragraph(
            f"<b>Engineering Tools & APIs:</b> Git, GitHub, RESTful APIs, HTTP Interceptors, Chrome DevTools, NPM, Vite, Docker basics",
            bullet_style,
        )
    )
    elements.append(Spacer(1, 8))

    # -------------------------------------------------------------
    # 4. Work Experience & Delivery
    # -------------------------------------------------------------
    elements.append(Paragraph("Engineering Experience", section_heading_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#CBD5E1"), spaceAfter=4))

    experiences = profile.experiences or []
    if not experiences:
        experiences = [
            {
                "role": "Frontend Developer (Angular)",
                "company": "Software & Web Development Projects",
                "period": "2023 - Present",
                "location": "Cairo, Egypt",
                "bullets": [
                    "Architected and deployed responsive Angular single-page applications utilizing standalone components, Reactive Forms, and modular architecture.",
                    "Implemented asynchronous client-server communication using RxJS streams and HTTP interceptors with automated error logging.",
                    "Engineered clean, accessible UI components adhering to WCAG standards with 100% mobile-first responsiveness.",
                    "Optimized bundle size, lazy-loaded routes, and asset caching to achieve sub-second page load times.",
                ],
            }
        ]

    for exp in experiences:
        t = exp.get("role") or exp.get("title") or "Frontend Developer"
        c = exp.get("company") or ""
        p = exp.get("period") or ""
        if not p:
            sd = exp.get("start_date") or ""
            ed = exp.get("end_date") or ""
            if sd and ed:
                p = f"{sd} - {ed}"
            elif sd or ed:
                p = sd or ed
        loc = exp.get("location") or ""

        company_fragment = f" — <i>{xml_escape(str(c))}</i>" if c else ""
        right_parts = [f"<b>{xml_escape(str(p))}</b>"] if p else []
        if loc:
            right_parts.append(xml_escape(str(loc)))
        right_cell = " | ".join(right_parts)

        header_tbl = Table(
            [
                [
                    Paragraph(f"<b>{xml_escape(str(t))}</b>{company_fragment}", bold_bullet_style),
                    Paragraph(right_cell, ParagraphStyle("Right", parent=contact_style, alignment=2)),
                ]
            ],
            colWidths=[380, 160],
        )
        header_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(header_tbl)

        bullets = exp.get("bullets", [])
        if isinstance(bullets, list):
            for b in bullets:
                elements.append(Paragraph(f"• {xml_escape(str(b))}", bullet_style))
        elif isinstance(bullets, str) and bullets:
            elements.append(Paragraph(f"• {xml_escape(bullets)}", bullet_style))
        elements.append(Spacer(1, 4))

    elements.append(Spacer(1, 4))

    # -------------------------------------------------------------
    # 5. Key Production Projects
    # -------------------------------------------------------------
    projects = profile.projects or []
    if not projects:
        projects = [
            {
                "title": "FreshCart E-Commerce Platform",
                "stack": "Angular, TypeScript, RxJS, Tailwind CSS, REST APIs",
                "summary": "Full-featured online store with product browsing, categorized search, shopping cart management, user authentication, and checkout workflows.",
            },
            {
                "title": "BottaJobs Autonomous Agent Dashboard",
                "stack": "Angular 19, FastAPI, PostgreSQL, Supabase, Telegram Bot API",
                "summary": "Interactive job discovery and tracking suite with real-time CV matching analytics, Telegram Mini App integration, and ATS resume synthesis.",
            },
        ]

    elements.append(Paragraph("Featured Projects", section_heading_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#CBD5E1"), spaceAfter=4))

    for proj in projects[:3]:
        p_title = proj.get("name") or proj.get("title") or "Web Application"
        raw_tech = proj.get("technologies") or proj.get("stack") or ""
        if isinstance(raw_tech, list):
            p_stack = ", ".join(str(x) for x in raw_tech if x)
        else:
            p_stack = str(raw_tech)
        p_desc = proj.get("summary") or proj.get("context") or ""
        p_bullets = proj.get("bullets") or []

        stack_suffix = f" — <i>({xml_escape(p_stack)})</i>" if p_stack else ""
        elements.append(
            Paragraph(
                f"<b>{xml_escape(str(p_title))}</b>{stack_suffix}",
                bold_bullet_style,
            )
        )
        if isinstance(p_bullets, list) and p_bullets:
            for pb in p_bullets:
                elements.append(Paragraph(f"• {xml_escape(str(pb))}", bullet_style))
        elif isinstance(p_bullets, str) and p_bullets:
            elements.append(Paragraph(f"• {xml_escape(p_bullets)}", bullet_style))
        elif p_desc:
            elements.append(Paragraph(f"• {xml_escape(str(p_desc))}", bullet_style))
        elements.append(Spacer(1, 3))

    elements.append(Spacer(1, 4))

    # -------------------------------------------------------------
    # 6. Education & Certifications
    # -------------------------------------------------------------
    elements.append(Paragraph("Education & Credentials", section_heading_style))
    elements.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#CBD5E1"), spaceAfter=4))

    educations = profile.educations or []
    if educations:
        for edu in educations:
            deg = edu.get("degree") or "Bachelor's Degree"
            inst = edu.get("institution") or ""
            yr = edu.get("graduation_year") or edu.get("year") or ""
            if not yr:
                sd = edu.get("start_date") or ""
                ed = edu.get("end_date") or ""
                if sd and ed:
                    yr = f"{sd} - {ed}"
                elif ed or sd:
                    yr = ed or sd
            inst_part = f" — {xml_escape(str(inst))}" if inst else ""
            yr_part = f" ({xml_escape(str(yr))})" if yr else ""
            elements.append(Paragraph(f"• <b>{xml_escape(str(deg))}</b>{inst_part}{yr_part}", bullet_style))
    else:
        elements.append(Paragraph("• <b>Bachelor's Degree in Computer Science / Information Systems</b>", bullet_style))

    certs = profile.certifications or []
    if certs:
        for cert in certs:
            if isinstance(cert, dict):
                c_name = cert.get("name") or ""
                issuer = cert.get("issuer") or ""
                score = cert.get("score") or ""
                extra = f" — {issuer}" if issuer else ""
                if score:
                    extra += f" ({score})"
                display = f"{c_name}{extra}".strip()
            else:
                display = str(cert)
            if display:
                elements.append(Paragraph(f"• <b>Professional Certification:</b> {xml_escape(display)}", bullet_style))

    doc.build(elements)
    return buffer.getvalue()
