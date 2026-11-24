"""Frontend Opportunity and Social Hiring Intent Filter Engine.

Enforces strict domain boundaries:
1. Exclusively accepts genuine Frontend Engineering roles (Angular, React, Vue, Next.js,
   Nuxt, TypeScript/JavaScript Web, UI Engineering, Frontend Internships).
2. Strictly rejects non-frontend roles (pure Backend, Mobile-only iOS/Android/Flutter,
   DevOps, Cloud/Infrastructure, QA/Testing, Data/AI-only, Graphic/UI-UX-only without
   coding, Operations, Sales, Customer Support, Data Entry).
3. Full-stack roles are excluded unless clearly Frontend-heavy (documented deterministic rule).
4. For social posts (LinkedIn, Twitter/X, etc.), filters out job-seeker posts (#OpenToWork,
   portfolio self-promo, seeking internships) and accepts only authentic hiring/recruiting posts.
"""

import re

# ---------------------------------------------------------------------------
# 1. Frontend Core Keywords (English + Arabic)
# ---------------------------------------------------------------------------

FRONTEND_TITLE_PATTERNS = [
    # Explicit frontend and client-side engineering
    r"\b(frontend|front-end|front end|web frontend|client-side|client side)\b",
    # Frameworks & Core Web Tech
    r"\b(angular|angularjs|ngrx|rxjs)\b",
    r"\b(react(?!\s*native)|reactjs|react\.js|nextjs|next\.js)\b",
    r"\b(vue|vuejs|vue\.js|nuxt|nuxtjs|nuxt\.js)\b",
    r"\b(svelte|sveltekit)\b",
    # UI Engineering & Web Development
    r"\b(ui developer|ui engineer|ui software engineer|web ui developer)\b",
    r"\b(web developer|web development engineer|web programmer)\b",
    r"\b(javascript developer|typescript developer|js developer|ts developer)\b",
    # Arabic Frontend terms
    r"(فرونت\s*اند|فرونت\s*إند|واجهات\s*أمامية|واجهات\s*المستخدم|مطور\s*واجهات|مهندس\s*واجهات|تطوير\s*الويب|مطور\s*ويب|مبرمج\s*ويب|مطور\s*مواقع|مطور\s*انجلر|مطور\s*أنجلر|مطور\s*رياكت|مطور\s*فيو)",
]

FRONTEND_TITLE_REGEX = re.compile(
    "|".join(FRONTEND_TITLE_PATTERNS),
    re.IGNORECASE,
)

FRONTEND_TECH_SET: set[str] = {
    "angular", "angularjs", "react", "reactjs", "react.js", "nextjs", "next.js",
    "vue", "vuejs", "vue.js", "nuxt", "nuxtjs", "nuxt.js", "svelte", "sveltekit",
    "typescript", "javascript", "html", "html5", "css", "css3", "sass", "scss",
    "tailwind", "tailwindcss", "bootstrap", "rxjs", "ngrx", "pinia", "vuex",
    "redux", "webpack", "vite", "web components", "responsive design",
}

# ---------------------------------------------------------------------------
# 2. Strict Rejection Keywords (Non-Frontend Domains)
# ---------------------------------------------------------------------------

# Hard negative roles in title (unless overridden by clear frontend qualification)
HARD_REJECT_TITLE_PATTERNS = [
    # Pure Backend
    r"\b(backend|back-end|back end)\b",
    r"(?:(?<!\w)(?:\.net|c#)|\b(?:node\.js|nodejs|python|django|fastapi|flask|java|spring boot|golang|go|dotnet|php|laravel|ruby|rails|rust))(?!\w)\s+(developer|engineer|software engineer|lead|architect|specialist)\b",
    r"\b(database administrator|dba|sql developer|oracle developer|database engineer)\b",
    r"(باك\s*اند|باك\s*إند|مطور\s*باك|مطور\s*خلفي|مهندس\s*خلفي|مهندس\s*باك|بايثون|جافا|دوت\s*نت|نود|لارافيل|بي\s*اتش\s*بي)",
    # Mobile Only
    r"\b(ios|android|flutter|react native|swift|kotlin|mobile|mobile app|mobile application)\s*(developer|engineer|software engineer|lead|architect|specialist)?\b",
    r"(مطور\s*تطبيقات|مهندس\s*تطبيقات|فلاتر|اندرويد|أندرويد|ايفون|آيفون|تطبيقات\s*الجوال|مطور\s*موبايل)",
    # DevOps, SRE, Cloud, Infrastructure
    r"\b(devops|devsecops|cloud engineer|cloud architect|sre|site reliability|infrastructure engineer|sysadmin|system administrator|platform engineer|kubernetes)\b",
    r"(ديف\s*اوبس|سحابي|مهندس\s*سحابي|بنية\s*تحتية|مهندس\s*شبكات)",
    # QA & Software Testing
    r"\b(qa engineer|quality assurance|software tester|test engineer|sdet|automation tester|manual tester|qa tester|test automation)\b",
    r"(اختبار\s*برمجيات|فاحص\s*برمجيات|مهندس\s*جودة|فحص\s*برمجيات|تيستر)",
    # Data & AI Only
    r"\b(data scientist|data engineer|data analyst|machine learning|deep learning|ai engineer|artificial intelligence|nlp engineer|computer vision|bi developer|big data|analytics engineer)\b",
    r"(ذكاء\s*اصطناعي|علم\s*البيانات|تحليل\s*البيانات|مهندس\s*بيانات|تعلم\s*الآلة|بيانات\s*ضخمة)",
    # Graphic / UI-UX Design Only (Without Frontend Coding)
    r"\b(?:ui\s*[/&]\s*ux|ux\s*[/&]\s*ui)(?:\s+(?:designer|researcher|specialist|lead|architect))?\b",
    r"\b(?:ui|ux)\s+(?:designer|researcher)\b",
    r"\b(?:product designer|graphic designer|visual designer|figma designer|motion designer|brand designer|web designer)\b",
    r"(مصمم\s*واجهات|مصمم\s*جرافيك|تصميم\s*واجهات|مصمم\s*منتجات|يو\s*اي\s*يو\s*اكس)",
    # Engineering Management & Executive Leadership (Non-IC)
    r"\b(?:head\s+of\s+(?:[\w\s]+\s+)?engineering|(?:[\w-]+\s+)?engineering\s+manager|vp\s+of\s+engineering|vice\s+president\s+of\s+engineering|director\s+of\s+(?:[\w\s]+\s+)?engineering|engineering\s+director|cto|chief\s+technology\s+officer)\b",
    r"(مدير\s*هندسي|مدير\s*تطوير|رئيس\s*قسم|مدير\s*فريق)",
    # Non-Tech Operations, Support & Data Entry
    r"\b(data entry|call center|customer support|customer care|customer service|help desk|virtual assistant|moderator|clerk|typist)\b",
    r"\b(sales|marketing|accountant|human resources|recruiter|talent acquisition|business analyst|project manager|product manager|scrum master)\b",
    r"(مدخل\s*بيانات|خدمة\s*عملاء|كول\s*سنتر|مساعد\s*افتراضي|محاسب|تسويق|مبيعات|موارد\s*بشرية)",
]

HARD_REJECT_TITLE_REGEX = re.compile(
    "|".join(HARD_REJECT_TITLE_PATTERNS),
    re.IGNORECASE,
)

BACKEND_TECH_SET: set[str] = {
    "django", "flask", "fastapi", "spring boot", "laravel", "rails", "express.js",
    "nestjs", "asp.net", "hibernate", "postgresql", "mysql", "mongodb", "redis",
    "kafka", "rabbitmq", "kubernetes", "docker", "aws", "gcp", "azure",
}

# ---------------------------------------------------------------------------
# 3. Social Hiring Intent vs Job-Seeker Patterns
# ---------------------------------------------------------------------------

JOB_SEEKER_PATTERNS = [
    r"(?<!\w)#open_?to_?work\b",
    r"(?<!\w)#looking_?for_?job\b",
    r"(?<!\w)#looking_?for_?work\b",
    r"(?<!\w)#job_?hunt\b",
    r"(?<!\w)#hire_?me\b",
    r"\bi am looking for (a|an|new)? (job|opportunity|position|role|internship)\b",
    r"\bi'm looking for (a|an|new)? (job|opportunity|position|role|internship)\b",
    r"\bseeking (a|an|new)? (job|opportunity|position|role|internship)\b",
    r"\bi am available for (hire|work|freelance|immediate start)\b",
    r"\bi'm available for (hire|work|freelance|immediate start)\b",
    r"\bhire me\b",
    r"\bcheck out my (portfolio|github|projects|resume|cv)\b",
    r"\bopen to work\b",
    r"\bopen for new opportunities\b",
    r"\bactively looking for (a|an)?\b",
    r"\bcan anyone refer me\b",
    r"\blooking for any referral\b",
    r"\bjust graduated\b.*\blooking for\b",
    r"(ابحث\s*عن\s*فرصة|أبحث\s*عن\s*فرصة|أبحث\s*عن\s*عمل|ابحث\s*عن\s*عمل|ابحث\s*عن\s*وظيفة|أبحث\s*عن\s*وظيفة|متاح\s*للعمل|أبحث\s*عن\s*تدريب|مهتم\s*بفرصة|مهتم\s*بالعمل|جاهز\s*للعمل)",
]

JOB_SEEKER_REGEX = re.compile("|".join(JOB_SEEKER_PATTERNS), re.IGNORECASE)

HIRING_INTENT_PATTERNS = [
    r"\bwe are hiring\b",
    r"\bwe're hiring\b",
    r"\bis hiring\b",
    r"\bhiring alert\b",
    r"\bactively hiring\b",
    r"\burgent hiring\b",
    r"\bwe are looking for\b",
    r"\bwe're looking for\b",
    r"\bour team is looking for\b",
    r"\bour team is expanding\b",
    r"\bjoin our team\b",
    r"\bopen position\b",
    r"\bjob opening\b",
    r"\bjob vacancy\b",
    r"\bvacancies\b",
    r"\bhiring a (frontend|front-end|angular|react|vue|web developer)\b",
    r"\bhiring (frontend|front-end|angular|react|vue|web developers)\b",
    r"\bsend your (cv|resume)\b",
    r"\bshare your (cv|resume)\b",
    r"\bdrop your (cv|resume)\b",
    r"\bemail your (cv|resume)\b",
    r"\bforward your (cv|resume)\b",
    r"\bapply at\b",
    r"\bapply via\b",
    r"\bapply here\b",
    r"\binterested candidates can send\b",
    r"\bdm me (if interested|your cv|your resume)\b",
    r"(نحن\s*نوظف|بنبحث\s*عن|مطلوب\s*للتعيين|مطلوب\s*مطور|وظيفة\s*شاغرة|فرصة\s*عمل|تدريب\s*متاح|ارسل\s*سيرتك\s*الذاتية|ارسال\s*السي\s*في|شاغر\s*وظيفي|مطلوب\s*مهندس|مطلوب\s*فرونت)",
]

HIRING_INTENT_REGEX = re.compile("|".join(HIRING_INTENT_PATTERNS), re.IGNORECASE)

INTERNSHIP_TITLE_REGEX = re.compile(
    r"\b(intern|internship|trainee|fresh\s+graduate|fresh\s+grad)\b|متدرب|تدريب",
    re.IGNORECASE,
)

FRONTEND_INTERNSHIP_KEYWORD_REGEX = re.compile(
    r"\b(frontend|front-end|web|angular|react|vue|ui)\b|واجهات",
    re.IGNORECASE,
)

GENERIC_DEV_REGEX = re.compile(
    r"\b(developer|engineer|programmer)\b|مطور|مهندس",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Filter Functions
# ---------------------------------------------------------------------------

def is_hiring_intent_social_post(text: str) -> tuple[bool, str]:
    """
    Evaluate whether a social post represents an authentic hiring opportunity
    or a job-seeker post (e.g. #OpenToWork).

    Returns:
        (is_hiring, reason)
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return False, "Empty post text."

    # 1. Job-seeker check: Immediate disqualification
    if JOB_SEEKER_REGEX.search(clean_text):
        return False, "Disqualified: Post identified as job-seeker, self-promotion, or #OpenToWork."

    # 2. Hiring intent check: Must exhibit recruiting / vacancy indicators
    if HIRING_INTENT_REGEX.search(clean_text):
        return True, "Authentic hiring / recruiter intent detected."

    # Fallback for structured post snippets containing clear role + application indicators
    has_role = bool(FRONTEND_TITLE_REGEX.search(clean_text))
    contact_terms = ["@", "apply", "careers", "mailto:", "link in", "linkedin.com/jobs"]
    has_contact = any(term in clean_text.lower() for term in contact_terms) or bool(
        re.search(r"\b(dm\s+(me|your|us)|dm\b|inbox\b)", clean_text, re.IGNORECASE)
    )
    if has_role and has_contact:
        return True, "Hiring context detected via role title and contact/apply channel."

    return False, "Post does not contain clear hiring intent indicators."


def is_frontend_opportunity(
    title: str,
    description: str = "",
    skills: list[str] | None = None,
) -> tuple[bool, str]:
    """
    Strict Frontend Engineering Domain Filter.

    Rules:
    1. Rejects non-frontend domains (Backend, Mobile, DevOps, QA, Data/AI, Graphic Design, Operations).
    2. Accepts genuine Frontend roles (Frontend, Angular, React, Vue, Next.js, Nuxt, TypeScript Web, UI Eng).
    3. Handles Full-Stack with documented rule:
       Full-stack is REJECTED unless clearly Frontend-heavy:
       (a) Title explicitly indicates frontend focus (e.g. "Full Stack Developer (Frontend Focus)"); OR
       (b) Required skills contain >= 2 core frontend technologies AND frontend technologies outnumber
           backend technologies by at least 1.5x in description/skills.
    4. Handles Internships:
       Software internships are ACCEPTED ONLY IF they are Frontend/Web internships.

    Returns:
        (is_frontend, reason)
    """
    title_clean = title.strip()
    title_lower = title_clean.lower()
    desc_clean = (description or "")[:4000].lower()
    skills_clean = [s.strip().lower() for s in (skills or [])]

    # --- Step 1: Check for hard non-frontend role in title ---
    # Exception: if title has both frontend and non-frontend (e.g., "Frontend Developer (Backend experience a plus)")
    has_fe_title = bool(FRONTEND_TITLE_REGEX.search(title_lower))
    has_reject_title = bool(HARD_REJECT_TITLE_REGEX.search(title_lower))

    # Check for Full-Stack explicitly
    is_fullstack = any(fs in title_lower for fs in ["fullstack", "full stack", "full-stack"])

    if is_fullstack:
        # Full-stack rule evaluation:
        # Title priority: e.g. "Fullstack (Frontend Heavy)", "Full Stack Developer (Frontend Focus)"
        has_fe_priority_in_title = any(
            p in title_lower
            for p in [
                "frontend focus", "front-end focus", "frontend heavy", "front-end heavy",
                "ui focus", "client-side focus", "frontend-heavy", "frontend-focused",
            ]
        ) or (
            ("frontend" in title_lower or "front-end" in title_lower)
            and not any(be in title_lower for be in ["backend", "back-end", ".net", "java", "python", "php", "c#", "node"])
        )
        # Skills evaluation:
        fe_skill_count = sum(1 for s in skills_clean if any(fe in s for fe in FRONTEND_TECH_SET))
        be_skill_count = sum(1 for s in skills_clean if any(be in s for be in BACKEND_TECH_SET))

        desc_fe_mentions = sum(len(re.findall(rf"\b{re.escape(k)}\b", desc_clean)) for k in ["angular", "react", "vue", "frontend", "typescript", "css", "html"])
        desc_be_mentions = sum(
            len(re.findall(rf"(?<!\w){re.escape(k)}(?!\w)" if k in (".net", "c#") else rf"\b{re.escape(k)}\b", desc_clean))
            for k in ["backend", "python", "java", "sql", "django", "spring", "docker", "database", ".net", "c#"]
        )

        is_fe_heavy = (
            has_fe_priority_in_title
            or (fe_skill_count >= 2 and (be_skill_count == 0 or fe_skill_count >= be_skill_count * 1.5))
            or (desc_fe_mentions >= 4 and desc_fe_mentions >= (desc_be_mentions * 1.5))
        )
        if is_fe_heavy:
            return True, "Full-stack role accepted: Verified as Frontend-heavy / client-side focused."
        return False, "Full-stack role rejected: Not predominantly frontend-focused."

    if has_reject_title:
        if not has_fe_title:
            return False, f"Non-frontend domain detected in title: '{title_clean}'."
        # If title mentions both a rejected domain and frontend:
        # Check which is primary (e.g. "Frontend Developer (Backend a plus)" vs "Backend Developer with Frontend")
        reject_match = HARD_REJECT_TITLE_REGEX.search(title_lower)
        fe_match = FRONTEND_TITLE_REGEX.search(title_lower)
        if reject_match and fe_match and reject_match.start() <= fe_match.start():
            return False, f"Non-frontend domain detected as primary role in title: '{title_clean}'."

    # --- Step 2: Positive Frontend Title Match ---
    if has_fe_title:
        return True, f"Direct Frontend title match: '{title_clean}'."

    # --- Step 3: Check Internships ---
    is_intern = bool(INTERNSHIP_TITLE_REGEX.search(title_lower))
    if is_intern:
        # Internships must be frontend-specific
        has_fe_intern_keyword = bool(
            FRONTEND_INTERNSHIP_KEYWORD_REGEX.search(title_lower)
            or FRONTEND_INTERNSHIP_KEYWORD_REGEX.search(desc_clean[:1000])
        )
        if has_fe_intern_keyword:
            return True, "Frontend Engineering internship / trainee program."
        return False, "Non-frontend internship (general software/AI/backend/mobile intern is excluded)."

    # --- Step 4: Title is generic ("Software Engineer", "Developer") -> Inspect description & skills ---
    is_generic_dev = bool(GENERIC_DEV_REGEX.search(title_lower))
    if is_generic_dev and not has_reject_title:
        fe_matches = [k for k in ["angular", "frontend", "react", "vue", "typescript", "front-end"] if k in desc_clean[:1200]]
        if len(fe_matches) >= 2 or "angular" in desc_clean[:800] or "frontend" in desc_clean[:800]:
            return True, f"Generic title with prominent frontend focus in description: {', '.join(fe_matches)}."

    return False, f"Outside frontend engineering scope: '{title_clean}'."
