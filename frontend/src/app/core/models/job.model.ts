export type GeographicEligibility =
  | 'EGYPT_ELIGIBLE'
  | 'REMOTE_WORLDWIDE'
  | 'REMOTE_REGION_POSSIBLE'
  | 'RELOCATION_REQUIRED'
  | 'NOT_ELIGIBLE'
  | 'UNKNOWN';

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
  eligibility: GeographicEligibility;
  seniority: SeniorityLevel;
  match_score: number;
  match_band: MatchBand;
  published_at: string | null;
  first_seen_at: string;
  original_application_url: string;
  required_skills: string[];
  tracker_status?: ApplicationStatus | null;
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
  digest_enabled: boolean;
  digest_time: string;
  digest_threshold: number;
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
  updated_at: string | null;
  original_application_url: string;
}
