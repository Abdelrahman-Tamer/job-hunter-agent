import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CandidateProfile,
  DailyRunRecord,
  JobDetail,
  JobSummary,
  SourceInfo,
  TrackedJobItem,
  ApplicationStatus,
  ParsedCVResult,
} from '../models/job.model';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl =
    typeof window !== 'undefined' && window.location.port !== '4200'
      ? ''
      : 'http://localhost:8000';

  getJobs(paramsMap?: Record<string, string | number | boolean | null | undefined>): Observable<{
    page: number;
    limit: number;
    total: number;
    items: JobSummary[];
  }> {
    let params = new HttpParams();
    if (paramsMap) {
      Object.entries(paramsMap).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          params = params.set(k, v.toString());
        }
      });
    }
    return this.http.get<{ page: number; limit: number; total: number; items: JobSummary[] }>(
      `${this.baseUrl}/api/v1/jobs`,
      { params }
    );
  }

  getJobDetail(jobId: number): Observable<JobDetail> {
    return this.http.get<JobDetail>(`${this.baseUrl}/api/v1/jobs/${jobId}`);
  }

  getProfile(): Observable<CandidateProfile> {
    return this.http.get<CandidateProfile>(`${this.baseUrl}/api/v1/profile`);
  }

  updateProfile(profile: Partial<CandidateProfile>): Observable<{ status: string }> {
    return this.http.put<{ status: string }>(`${this.baseUrl}/api/v1/profile`, profile);
  }

  uploadCvFile(file: File): Observable<ParsedCVResult> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.post<ParsedCVResult>(`${this.baseUrl}/api/v1/profile/cv/upload`, formData);
  }

  uploadCvText(cvRawText: string): Observable<ParsedCVResult> {
    const formData = new FormData();
    formData.append('cv_raw_text', cvRawText);
    return this.http.post<ParsedCVResult>(`${this.baseUrl}/api/v1/profile/cv/upload`, formData);
  }

  confirmCvData(data: any): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      `${this.baseUrl}/api/v1/profile/cv/confirm`,
      data
    );
  }

  importCvLocally(cvRawText: string): Observable<{
    sanitized_text: string;
    detected_skills: string[];
    detected_roles: string[];
    detected_education: string | null;
    requires_user_confirmation: boolean;
  }> {
    return this.http.post<any>(`${this.baseUrl}/api/v1/profile/import-cv`, {
      cv_raw_text: cvRawText,
      consent_to_extract: true,
    });
  }

  getTrackedJobs(statusFilter?: ApplicationStatus): Observable<TrackedJobItem[]> {
    let params = new HttpParams();
    if (statusFilter) {
      params = params.set('status_filter', statusFilter);
    }
    return this.http.get<TrackedJobItem[]>(`${this.baseUrl}/api/v1/tracker`, { params });
  }

  updateJobStatus(
    jobId: number,
    newStatus: ApplicationStatus,
    followUpAt?: string
  ): Observable<{ status: string }> {
    const payload: any = { status: newStatus };
    if (followUpAt) {
      payload.follow_up_at = followUpAt;
    }
    return this.http.put<{ status: string }>(
      `${this.baseUrl}/api/v1/tracker/${jobId}/status`,
      payload
    );
  }

  getTailoredResumeUrl(jobId: number): string {
    return `${this.baseUrl}/api/v1/jobs/${jobId}/tailored-resume`;
  }

  getOutreachMessages(jobId: number): Observable<{
    status: string;
    job_id: number;
    company: string;
    title: string;
    connection_note: string;
    inmail_dm: string;
    follow_up_note: string;
  }> {
    return this.http.post<any>(`${this.baseUrl}/api/v1/jobs/${jobId}/outreach`, {});
  }

  getCoverLetter(jobId: number): Observable<{ status: string; job_id: number; cover_letter: string }> {
    return this.http.post<any>(`${this.baseUrl}/api/v1/jobs/${jobId}/cover-letter`, {});
  }

  verifyActiveLinks(): Observable<{ status: string; metrics: any }> {
    return this.http.post<any>(`${this.baseUrl}/api/v1/jobs/verify-links`, {});
  }

  getSources(): Observable<SourceInfo[]> {
    return this.http.get<SourceInfo[]>(`${this.baseUrl}/api/v1/sources`);
  }

  getRuns(): Observable<DailyRunRecord[]> {
    return this.http.get<DailyRunRecord[]>(`${this.baseUrl}/api/v1/runs`);
  }

  triggerRun(force: boolean = false): Observable<{ status: string; message?: string }> {
    return this.http.post<{ status: string; message?: string }>(
      `${this.baseUrl}/api/v1/runs/trigger?force=${force}`,
      {}
    );
  }

  wipeAndReset(adminKey: string): Observable<{ status: string; message: string; candidate?: string; confirmed_skills_count?: number }> {
    return this.http.post<any>(
      `${this.baseUrl}/api/v1/jobs/wipe-and-reset`,
      {},
      { headers: { 'X-Admin-Key': adminKey } }
    );
  }
}
