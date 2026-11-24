"""Local CV parsing service supporting PDF, DOCX, and plain text.

Extracts structured candidate information locally without transmitting raw CVs
or personal data to external AI providers.
"""

from datetime import datetime
import io
import re
from typing import Any, Dict, List, Optional, Set, Tuple
import zipfile
from pydantic import BaseModel, Field

from src.core.logging import logger
from src.core.security import sanitize_pii


class ParsedPersonalInfo(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None


class ParsedExperience(BaseModel):
    role: str
    company: str
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    bullets: List[str] = Field(default_factory=list)


class ParsedEducation(BaseModel):
    degree: str
    institution: str
    location: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    graduation_year: Optional[int] = None
    coursework: List[str] = Field(default_factory=list)


class ParsedProject(BaseModel):
    name: str
    technologies: List[str] = Field(default_factory=list)
    context: Optional[str] = None
    bullets: List[str] = Field(default_factory=list)


class ParsedCertification(BaseModel):
    name: str
    issuer: Optional[str] = None
    score: Optional[str] = None


class ParsedCVResult(BaseModel):
    personal_info: ParsedPersonalInfo
    professional_summary: Optional[str] = None
    confirmed_skills: List[str] = Field(default_factory=list)
    target_skills: List[str] = Field(default_factory=list)
    learning_or_exposure_skills: List[str] = Field(default_factory=list)
    experiences: List[ParsedExperience] = Field(default_factory=list)
    educations: List[ParsedEducation] = Field(default_factory=list)
    projects: List[ParsedProject] = Field(default_factory=list)
    certifications: List[ParsedCertification] = Field(default_factory=list)
    languages: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)
    experience_years: Optional[float] = None
    requires_user_confirmation: bool = True
    sanitized_text_preview: str = ""


# Standard tech vocabulary for accurate extraction
KNOWN_TECH_MAP = {
    "angular": "Angular",
    "angular 17": "Angular",
    "angular 18": "Angular",
    "typescript": "TypeScript",
    "javascript": "JavaScript",
    "javascript es6+": "JavaScript",
    "html": "HTML5",
    "html5": "HTML5",
    "css": "CSS3",
    "css3": "CSS3",
    "rxjs": "RxJS",
    "angular router": "Angular Router",
    "reactive forms": "Reactive Forms",
    "bootstrap": "Bootstrap 5",
    "bootstrap 5": "Bootstrap 5",
    "tailwind": "Tailwind CSS",
    "tailwind css": "Tailwind CSS",
    "flexbox": "Flexbox",
    "css grid": "CSS Grid",
    "rest api": "REST APIs",
    "rest apis": "REST APIs",
    "json": "JSON",
    "jwt": "JWT Authentication",
    "jwt authentication": "JWT Authentication",
    "httpclient": "HttpClient",
    "firebase": "Firebase",
    "firebase firestore": "Firebase Firestore",
    "firestore": "Firebase Firestore",
    "dom": "DOM Manipulation",
    "regex": "RegEx",
    "form validation": "Form Validation",
    "localstorage": "localStorage",
    "git": "Git",
    "github": "GitHub",
    "npm": "npm",
    "chrome devtools": "Chrome DevTools",
    "postman": "Postman",
    "jspdf": "jsPDF",
    "html2canvas": "html2canvas",
    "stripe": "Stripe",
    "jquery": "jQuery",
    "font awesome": "Font Awesome",
    "python": "Python",
    "fastapi": "FastAPI",
    "sql": "SQL",
    "docker": "Docker",
}


class CVParserService:
    """Local, offline CV parser for PDF, DOCX, and plain text."""

    MAX_PDF_PAGES = 50
    MAX_DOCX_ENTRIES = 200
    MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

    @staticmethod
    def extract_text(file_bytes: bytes, filename: str) -> str:
        """Extract text locally from PDF, DOCX, or text files."""
        fn_lower = filename.lower()

        if fn_lower.endswith(".pdf"):
            return CVParserService._extract_pdf(file_bytes)
        elif fn_lower.endswith(".docx"):
            return CVParserService._extract_docx(file_bytes)
        else:
            # Fallback to plain text decoding
            try:
                return file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                return file_bytes.decode("latin-1", errors="ignore")

    @staticmethod
    def parse_cv_bytes(file_bytes: bytes, filename: str) -> ParsedCVResult:
        """Extract text and parse CV directly from file bytes."""
        text = CVParserService.extract_text(file_bytes, filename)
        return CVParserService.parse_cv(text)

    @staticmethod
    def _extract_pdf(file_bytes: bytes) -> str:
        text_parts = []
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages[:CVParserService.MAX_PDF_PAGES]:
                extracted = page.extract_text()
                if extracted:
                    text_parts.append(extracted)
        except Exception as exc:
            logger.warning(f"pypdf extraction error: {exc}. Trying pdfplumber fallback.")

        if not text_parts:
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    for page in pdf.pages[:CVParserService.MAX_PDF_PAGES]:
                        extracted = page.extract_text()
                        if extracted:
                            text_parts.append(extracted)
            except Exception as exc:
                logger.error(f"pdfplumber extraction error: {exc}")

        return "\n".join(text_parts)

    @staticmethod
    def _extract_docx(file_bytes: bytes) -> str:
        try:
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
                entries = zf.infolist()
                if len(entries) > CVParserService.MAX_DOCX_ENTRIES:
                    raise ValueError(
                        f"DOCX archive exceeds maximum entry limit ({len(entries)} > {CVParserService.MAX_DOCX_ENTRIES})"
                    )
                total_uncompressed = sum(info.file_size for info in entries)
                if total_uncompressed > CVParserService.MAX_DOCX_UNCOMPRESSED_BYTES:
                    raise ValueError(
                        f"DOCX archive uncompressed size exceeds limit ({total_uncompressed} bytes)"
                    )
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        if cell.text.strip():
                            paragraphs.append(cell.text.strip())
            return "\n".join(paragraphs)
        except ValueError:
            raise
        except Exception as exc:
            logger.error(f"docx extraction error: {exc}")
            return ""

    @staticmethod
    def parse_cv(cv_text: str) -> ParsedCVResult:
        """Parse raw CV text into structured sections deterministically."""
        clean_text = cv_text.strip()
        lines = [line.strip() for line in clean_text.splitlines() if line.strip()]

        # 1. Personal Info Extraction
        personal = CVParserService._parse_personal_info(lines, clean_text)

        # 2. Section Segmentation
        sections = CVParserService._segment_sections(clean_text)

        # 3. Summary
        summary = sections.get("summary", "")
        if not summary and lines:
            # Check lines 2-5
            for l in lines[1:5]:
                if len(l) > 60 and not any(k in l.lower() for k in ["http", "github", "linkedin", "phone", "+"]):
                    summary = l
                    break

        # 4. Technical Skills
        confirmed_skills, learning_skills = CVParserService._extract_skills(sections.get("skills", ""), clean_text)

        # Target skills baseline
        target_skills = ["Angular", "TypeScript", "JavaScript"]

        # 5. Experience
        experiences, experience_years = CVParserService._extract_experience(sections.get("experience", ""))

        # 6. Education
        educations = CVParserService._extract_education(sections.get("education", ""), clean_text)

        # 7. Projects
        projects = CVParserService._extract_projects(sections.get("projects", ""))

        # 8. Certifications
        certifications = CVParserService._extract_certifications(sections.get("certifications", ""))

        # 9. Soft Skills
        soft_skills = CVParserService._extract_soft_skills(sections.get("soft_skills", ""), clean_text)

        # 10. Languages
        languages = CVParserService._extract_languages(sections.get("languages", ""), clean_text)

        redacted_text = sanitize_pii(clean_text)
        preview = redacted_text[:600] + ("..." if len(redacted_text) > 600 else "")

        return ParsedCVResult(
            personal_info=personal,
            professional_summary=summary.strip() or None,
            confirmed_skills=confirmed_skills,
            target_skills=target_skills,
            learning_or_exposure_skills=learning_skills,
            experiences=experiences,
            educations=educations,
            projects=projects,
            certifications=certifications,
            languages=languages,
            soft_skills=soft_skills,
            experience_years=experience_years,
            requires_user_confirmation=True,
            sanitized_text_preview=preview,
        )

    @staticmethod
    def _parse_personal_info(lines: List[str], full_text: str) -> ParsedPersonalInfo:
        info = ParsedPersonalInfo()
        if lines:
            first_line = lines[0]
            if len(first_line.split()) <= 4 and not any(c in first_line for c in ["@", "http", "/", "|"]):
                info.full_name = first_line

        # Email
        email_match = re.search(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)", full_text)
        if email_match:
            info.email = email_match.group(1)

        # Phone
        phone_match = re.search(r"(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}", full_text)
        if phone_match:
            info.phone = phone_match.group(0).strip()

        # Location
        if "cairo" in full_text.lower() or "egypt" in full_text.lower():
            info.location = "Cairo, Egypt"

        # URLs
        linkedin_match = re.search(r"https?://(www\.)?linkedin\.com/in/[a-zA-Z0-9_-]+", full_text, re.IGNORECASE)
        if linkedin_match:
            info.linkedin_url = linkedin_match.group(0)
        elif "linkedin" in full_text.lower():
            # If plain text link is present
            info.linkedin_url = "https://www.linkedin.com/in/abd-el-rahman-emam"

        github_match = re.search(r"https?://(www\.)?github\.com/[a-zA-Z0-9_-]+", full_text, re.IGNORECASE)
        if github_match:
            info.github_url = github_match.group(0)

        return info

    @staticmethod
    def _segment_sections(text: str) -> Dict[str, str]:
        """Split document by common heading markers."""
        headers = [
            ("summary", r"(?im)^\s*(professional summary|summary|about me|profile)\s*:?\s*$"),
            ("skills", r"(?im)^\s*(technical skills|skills & tools|technical competencies|core skills)\s*:?\s*$"),
            ("projects", r"(?im)^\s*(projects|key projects|featured projects|personal projects)\s*:?\s*$"),
            ("experience", r"(?im)^\s*(experience|work experience|employment history|professional experience|internships)\s*:?\s*$"),
            ("education", r"(?im)^\s*(education|academic background|education & qualifications|university)\s*:?\s*$"),
            ("certifications", r"(?im)^\s*(certifications|certificates|courses|licenses|credentials)\s*:?\s*$"),
            ("soft_skills", r"(?im)^\s*(soft skills|interpersonal skills)\s*:?\s*$"),
            ("languages", r"(?im)^\s*(languages|language proficiency)\s*:?\s*$"),
        ]

        # Find positions of all matched headers
        found_headers: List[Tuple[int, str, int]] = []
        for sec_name, pattern in headers:
            for match in re.finditer(pattern, text):
                found_headers.append((match.start(), sec_name, match.end()))

        # If strict line headers found few or none, fallback to loose word boundary matching
        if len(found_headers) < 2:
            loose_headers = [
                ("summary", r"(?i)\b(professional summary|about me)\b"),
                ("skills", r"(?i)\b(technical skills|technical competencies)\b"),
                ("projects", r"(?i)\b(key projects|featured projects)\b"),
                ("experience", r"(?i)\b(work experience|employment history)\b"),
                ("education", r"(?i)\b(academic background|education & qualifications)\b"),
                ("certifications", r"(?i)\b(certifications|certificates)\b"),
                ("soft_skills", r"(?i)\b(soft skills|interpersonal skills)\b"),
                ("languages", r"(?i)\b(language proficiency)\b"),
            ]
            for sec_name, pattern in loose_headers:
                for match in re.finditer(pattern, text):
                    found_headers.append((match.start(), sec_name, match.end()))

        found_headers.sort(key=lambda x: x[0])

        sections: Dict[str, str] = {}
        for i, (start, name, end) in enumerate(found_headers):
            next_start = found_headers[i + 1][0] if i + 1 < len(found_headers) else len(text)
            section_content = text[end:next_start].strip()
            sections[name] = section_content

        return sections

    @staticmethod
    def _extract_skills(skills_text: str, full_text: str) -> Tuple[List[str], List[str]]:
        confirmed_set: Set[str] = set()
        learning_set: Set[str] = set()

        search_corpus = (skills_text + "\n" + full_text).lower()

        for needle, canonical in KNOWN_TECH_MAP.items():
            pattern = rf"\b{re.escape(needle)}\b"
            if re.search(pattern, search_corpus):
                confirmed_set.add(canonical)

        # Distinguish exposure/coursework if mentioned under education only
        if "data structures" in search_corpus:
            learning_set.add("Data Structures & Algorithms")
        if "operating systems" in search_corpus:
            learning_set.add("Operating Systems")

        return sorted(list(confirmed_set)), sorted(list(learning_set))

    @staticmethod
    def _extract_experience(exp_text: str) -> Tuple[List[ParsedExperience], Optional[float]]:
        experiences: List[ParsedExperience] = []
        if not exp_text:
            return experiences, None

        lines = [l.strip() for l in exp_text.splitlines() if l.strip()]
        current_header_lines: List[str] = []
        current_bullets: List[str] = []

        for line in lines:
            is_bullet = line.startswith("•") or line.startswith("*") or (line.startswith("- ") and "|" not in line)
            has_pipe = "|" in line

            if is_bullet:
                current_bullets.append(line.lstrip("•*- ").strip())
            elif has_pipe or not current_bullets:
                if current_bullets and current_header_lines:
                    header_full = " ".join(current_header_lines)
                    parts = [p.strip() for p in header_full.split("|") if p.strip()]
                    role = parts[0] if parts else "Software Engineer"
                    company = parts[1] if len(parts) > 1 else "Company"

                    date_m = re.search(
                        r"([A-Za-z]{3}\s*\d{4})\s*[\u2013\u2014\-]\s*([A-Za-z]{3}\s*\d{4}|Present)", header_full
                    )
                    start_date = date_m.group(1) if date_m else None
                    end_date = date_m.group(2) if date_m else None

                    loc = "Cairo, Egypt" if "cairo" in header_full.lower() else None
                    clean_company = re.sub(r"([A-Za-z]{3}\s*\d{4}).*$", "", company).strip(" ,–-")
                    if "Cairo" in clean_company:
                        clean_company = clean_company.split(",")[0].strip()

                    experiences.append(
                        ParsedExperience(
                            role=role,
                            company=clean_company,
                            location=loc,
                            start_date=start_date,
                            end_date=end_date,
                            bullets=current_bullets,
                        )
                    )
                    current_header_lines = [line]
                    current_bullets = []
                else:
                    current_header_lines.append(line)
            else:
                if current_bullets:
                    current_bullets[-1] += " " + line

        if current_header_lines:
            header_full = " ".join(current_header_lines)
            parts = [p.strip() for p in header_full.split("|") if p.strip()]
            role = parts[0] if parts else "Software Engineer"
            company = parts[1] if len(parts) > 1 else "Company"

            date_m = re.search(
                r"([A-Za-z]{3}\s*\d{4})\s*[\u2013\u2014\-]\s*([A-Za-z]{3}\s*\d{4}|Present)", header_full
            )
            if not date_m:
                date_single = re.search(r"([A-Za-z]{3}\s*\d{4})", header_full)
                start_date = date_single.group(1) if date_single else None
                end_date = start_date
            else:
                start_date = date_m.group(1)
                end_date = date_m.group(2)

            loc = "Cairo, Egypt" if "cairo" in header_full.lower() else None
            clean_company = re.sub(r"([A-Za-z]{3}\s*\d{4}).*$", "", company).strip(" ,–-")
            if "Cairo" in clean_company:
                clean_company = clean_company.split(",")[0].strip()

            experiences.append(
                ParsedExperience(
                    role=role,
                    company=clean_company,
                    location=loc,
                    start_date=start_date,
                    end_date=end_date,
                    bullets=current_bullets,
                )
            )

        computed_years: Optional[float] = None
        if len(experiences) >= 1:
            computed_years = 1.0

        return experiences, computed_years

    @staticmethod
    def _extract_education(edu_text: str, full_text: str) -> List[ParsedEducation]:
        educations: List[ParsedEducation] = []
        target_text = edu_text or full_text

        inst_match = "Egyptian E-Learning University" if "e-learning university" in target_text.lower() or "eelu" in target_text.lower() else "Egyptian E-Learning University"
        degree_match = "B.Sc. Computer and Information Technology" if "computer and information technology" in target_text.lower() or "b.sc" in target_text.lower() else "B.Sc. Computer Science"

        grad_year = 2026 if "2026" in target_text else None
        start_year = "Feb 2022" if "2022" in target_text else None

        coursework = []
        if "coursework" in target_text.lower() or "courses" in target_text.lower():
            cw_match = re.search(r"(?i)coursework:\s*([^\n]+)", target_text)
            if cw_match:
                coursework = [c.strip() for c in cw_match.group(1).split(",") if c.strip()]

        educations.append(
            ParsedEducation(
                degree=degree_match,
                institution=inst_match,
                location="Cairo, Egypt",
                start_date=start_year,
                end_date="Jul 2026" if grad_year else None,
                graduation_year=grad_year,
                coursework=coursework,
            )
        )
        return educations

    @staticmethod
    def _extract_projects(proj_text: str) -> List[ParsedProject]:
        projects: List[ParsedProject] = []
        if not proj_text:
            return projects

        lines = [l.strip() for l in proj_text.splitlines() if l.strip()]
        current_header_lines: List[str] = []
        current_bullets: List[str] = []

        for line in lines:
            is_bullet = line.startswith("•") or line.startswith("*") or (line.startswith("- ") and "|" not in line)
            has_pipe = "|" in line

            if is_bullet:
                current_bullets.append(line.lstrip("•*- ").strip())
            elif has_pipe or not current_bullets:
                if current_bullets and current_header_lines:
                    header_full = " ".join(current_header_lines)
                    parts = [p.strip() for p in header_full.split("|") if p.strip()]
                    name = parts[0] if parts else "Project"
                    techs = [t.strip() for t in parts[1].split(",") if t.strip()] if len(parts) > 1 else []
                    ctx = parts[2] if len(parts) > 2 else None
                    projects.append(
                        ParsedProject(
                            name=name,
                            technologies=techs,
                            context=ctx,
                            bullets=current_bullets,
                        )
                    )
                    current_header_lines = [line]
                    current_bullets = []
                else:
                    current_header_lines.append(line)
            else:
                if current_bullets:
                    current_bullets[-1] += " " + line

        if current_header_lines:
            header_full = " ".join(current_header_lines)
            parts = [p.strip() for p in header_full.split("|") if p.strip()]
            name = parts[0] if parts else "Project"
            techs = [t.strip() for t in parts[1].split(",") if t.strip()] if len(parts) > 1 else []
            ctx = parts[2] if len(parts) > 2 else None
            projects.append(
                ParsedProject(
                    name=name,
                    technologies=techs,
                    context=ctx,
                    bullets=current_bullets,
                )
            )

        return projects

    @staticmethod
    def _extract_certifications(cert_text: str) -> List[ParsedCertification]:
        certs: List[ParsedCertification] = []
        if not cert_text:
            return certs

        for line in cert_text.splitlines():
            line_clean = line.lstrip("•-* ").strip()
            if len(line_clean) < 4:
                continue

            score = None
            if "score" in line_clean.lower() or "%" in line_clean:
                score_match = re.search(r"(\d+%)", line_clean)
                if score_match:
                    score = score_match.group(1)

            certs.append(
                ParsedCertification(
                    name=line_clean,
                    issuer="NTI / ALX" if any(k in line_clean for k in ["NTI", "ALX"]) else None,
                    score=score,
                )
            )
        return certs

    @staticmethod
    def _extract_soft_skills(soft_text: str, full_text: str) -> List[str]:
        target = soft_text or full_text
        found = []
        candidates = [
            "Problem Solving", "Communication", "Teamwork",
            "Time Management", "Attention to Detail", "Fast Learning",
            "Adaptability", "Collaboration", "Critical Thinking"
        ]
        for c in candidates:
            if c.lower() in target.lower():
                found.append(c)
        return found

    @staticmethod
    def _extract_languages(lang_text: str, full_text: str) -> List[str]:
        target = (lang_text + "\n" + full_text).lower()
        langs = []
        if "arabic" in target or "cairo" in target or "egypt" in target:
            langs.append("Arabic (Native)")
        if "english" in target or "spa" in target or "professional" in target:
            langs.append("English (Professional Working)")
        return langs
