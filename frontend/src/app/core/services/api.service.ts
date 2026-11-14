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

  getJobs(paramsMap?: Record<string, string | number>): Observable<{
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

  updateJobStatus(jobId: number, newStatus: ApplicationStatus): Observable<{ status: string }> {
    return this.http.put<{ status: string }>(`${this.baseUrl}/api/v1/tracker/${jobId}/status`, {
      status: newStatus,
    });
  }

  getSources(): Observable<SourceInfo[]> {
    return this.http.get<SourceInfo[]>(`${this.baseUrl}/api/v1/sources`);
  }

  getRuns(): Observable<DailyRunRecord[]> {
    return this.http.get<DailyRunRecord[]>(`${this.baseUrl}/api/v1/runs`);
  }

  triggerRun(force: boolean = false): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/api/v1/runs/trigger?force=${force}`, {});
  }
}
