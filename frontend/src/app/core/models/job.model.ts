export type GeographicEligibility =
  | 'EGYPT_ELIGIBLE'
  | 'REMOTE_WORLDWIDE'
  | 'REMOTE_REGION_POSSIBLE'
  | 'RELOCATION_REQUIRED'
  | 'NOT_ELIGIBLE'
  | 'UNKNOWN';

export type JobTrack =
  | 'FRONTEND_EGYPT'
  | 'FRONTEND_REMOTE_GCC'
  | 'FRONTEND_INTERN'
  | 'WEB_ANGULAR'
  | 'NO_EXP_REMOTE'
  | 'SOFTWARE_INTERN'
  | 'OTHER';

export type OpportunitySegment = 'EGYPT' | 'REMOTE_GCC_ABROAD' | 'OTHER';

export type WorkplaceType = 'ON_SITE' | 'HYBRID' | 'REMOTE' | 'UNKNOWN';

export type SeniorityLevel =
  | 'INTERNSHIP'
  | 'GRADUATE'
  | 'ENTRY'
  | 'JUNIOR'
  | 'ASSOCIATE'
  | 'MID'
  | 'SENIOR'
  | 'LEAD'
  | 'STAFF'
  | 'PRINCIPAL'
  | 'MANAGER'
  | 'UNKNOWN';

export type MatchBand = 'EXCELLENT' | 'STRONG' | 'POSSIBLE' | 'LOW';

export type ApplicationStatus =
  | 'DISCOVERED'
  | 'SAVED'
  | 'INTERESTED'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'REJECTED'
  | 'OFFER'
  | 'ARCHIVED'
  | 'NOT_RELEVANT';

export interface JobSummary {
  id: number;
  source_name: string;
  company: string;
  title: string;
  raw_location: string | null;
  workplace_type: WorkplaceType;
  job_track?: JobTrack;
  eligibility: GeographicEligibility;
  seniority: SeniorityLevel;
  match_score: number;
  match_band: MatchBand;
  published_at: string | null;
  first_seen_at: string;
  original_application_url: string;
  required_skills: string[];
  tracker_status?: ApplicationStatus | null;
  opportunity_segment?: OpportunitySegment;
  is_social_post?: boolean;
  source_category_label?: string;
  poster_name?: string | null;
  contact_hint?: string | null;
  direct_email?: string | null;
  whatsapp_contact?: string | null;
  apply_form_url?: string | null;
  origin_board?: string | null;
}

export interface JobDetail extends JobSummary {
  description_text: string;
  description_html: string | null;
  eligibility_reason: string;
  score_breakdown: Record<string, number>;
  match_reasons: string[];
  skill_gaps: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
}

export interface CandidateProfile {
  id: number;
  full_name?: string | null;
  professional_summary?: string | null;
  country: string;
  career_direction: string;
  priority_target: string;
  target_role_terms: string[];
  target_technology_terms: string[];
  confirmed_skills: string[];
  target_skills: string[];
  learning_or_exposure_skills: string[];
  linkedin_url: string | null;
  education_institution: string | null;
  degree_title: string | null;
  graduation_year: number | null;
  experience_years: number | null;
  github_url: string | null;
  portfolio_url: string | null;
  experiences?: ParsedExperience[];
  educations?: ParsedEducation[];
  projects?: ParsedProject[];
  certifications?: ParsedCertification[];
  languages?: string[];
  soft_skills?: string[];
  digest_enabled: boolean;
  digest_time: string;
  digest_threshold: number;
}

export interface ParsedPersonalInfo {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
}

export interface ParsedExperience {
  role: string;
  company: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  bullets: string[];
}

export interface ParsedEducation {
  degree: string;
  institution: string;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  graduation_year?: number | null;
  coursework: string[];
}

export interface ParsedProject {
  name: string;
  technologies: string[];
  context?: string | null;
  bullets: string[];
}

export interface ParsedCertification {
  name: string;
  issuer?: string | null;
  score?: string | null;
}

export interface ParsedCVResult {
  personal_info: ParsedPersonalInfo;
  professional_summary?: string | null;
  confirmed_skills: string[];
  target_skills: string[];
  learning_or_exposure_skills: string[];
  experiences: ParsedExperience[];
  educations: ParsedEducation[];
  projects: ParsedProject[];
  certifications: ParsedCertification[];
  languages: string[];
  soft_skills: string[];
  experience_years?: number | null;
  requires_user_confirmation: boolean;
  sanitized_text_preview: string;
}

export interface SourceInfo {
  name: string;
  source_type: string;
  base_url: string;
  doc_url: string;
  allowed_usage: string;
  rate_limit_per_min: number;
  attribution: string;
  freshness: string;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

export interface DailyRunRecord {
  id: number;
  run_date: string;
  run_key: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  jobs_discovered: number;
  jobs_new: number;
  jobs_notified: number;
  metrics: Record<string, any>;
  error_message: string | null;
}

export interface TrackedJobItem {
  job_id: number;
  title: string;
  company: string;
  match_score: number;
  status: ApplicationStatus;
  applied_at: string | null;
  follow_up_at?: string | null;
  follow_up_sent?: boolean;
  follow_up_note?: string | null;
  updated_at: string | null;
  original_application_url: string;
}
