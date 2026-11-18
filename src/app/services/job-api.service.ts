import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AppConfig,
  AccountStatus,
  AdminUser,
  AuthResponse,
  CandidateProfile,
  Invitation,
  Job,
  JobFilter,
  JobStatistics,
  PagedResult,
  ProfileAnalysis,
  RunStatus,
  TestResult
} from '../models/job.model';

declare global {
  interface Window {
    jobAgentConfig?: {
      apiBaseUrl?: string;
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class JobApiService {
  private http = inject(HttpClient);
  private baseUrl = (window.jobAgentConfig?.apiBaseUrl || '/api').replace(/\/+$/, '');

  getGoogleAuthConfig(): Observable<{ googleClientId: string; inviteOnly: boolean }> {
    return this.http.get<{ googleClientId: string; inviteOnly: boolean }>(`${this.baseUrl}/auth/config`);
  }

  createAuthNonce(): Observable<{ nonce: string }> {
    return this.http.post<{ nonce: string }>(`${this.baseUrl}/auth/nonce`, {});
  }

  signInWithGoogle(credential: string, nonce: string, inviteCode: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/auth/google`, { credential, nonce, inviteCode });
  }

  getAccount(): Observable<AccountStatus> {
    return this.http.get<AccountStatus>(`${this.baseUrl}/account`);
  }

  getAdminUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.baseUrl}/admin/users`);
  }

  createInvitation(email: string, expiresInDays: number): Observable<Invitation> {
    return this.http.post<Invitation>(`${this.baseUrl}/admin/invitations`, { email, expiresInDays });
  }

  grantSearchCredit(userId: string): Observable<{ searchCreditsRemaining: number }> {
    return this.http.post<{ searchCreditsRemaining: number }>(
      `${this.baseUrl}/admin/users/${encodeURIComponent(userId)}/search-credit`,
      {}
    );
  }

  // Jobs
  getJobs(filter: JobFilter): Observable<PagedResult<Job>> {
    let params = new HttpParams();
    if (filter.page) params = params.set('page', filter.page.toString());
    if (filter.pageSize) params = params.set('pageSize', filter.pageSize.toString());
    if (filter.status) params = params.set('status', filter.status);
    if (filter.minScore !== undefined && filter.minScore !== null)
      params = params.set('minScore', filter.minScore.toString());
    if (filter.maxScore !== undefined && filter.maxScore !== null)
      params = params.set('maxScore', filter.maxScore.toString());
    if (filter.source) params = params.set('source', filter.source);
    if (filter.search) params = params.set('search', filter.search);
    if (filter.orderBy) params = params.set('orderBy', filter.orderBy);
    if (filter.descending !== undefined)
      params = params.set('descending', filter.descending.toString());

    return this.http.get<PagedResult<Job>>(`${this.baseUrl}/jobs`, { params });
  }

  getJobStats(): Observable<JobStatistics> {
    return this.http.get<JobStatistics>(`${this.baseUrl}/jobs/stats`);
  }

  getJob(id: string): Observable<Job> {
    return this.http.get<Job>(`${this.baseUrl}/jobs/${id}`);
  }

  updateJobStatus(id: string, status: string, notes?: string): Observable<any> {
    return this.http.patch(`${this.baseUrl}/jobs/${id}/status`, { status, notes });
  }

  deleteJob(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/jobs/${id}`);
  }

  // Orchestrator
  getOrchestratorStatus(): Observable<RunStatus> {
    return this.http.get<RunStatus>(`${this.baseUrl}/orchestrator/status`);
  }

  runOrchestrator(wait = false): Observable<any> {
    return this.http.post(`${this.baseUrl}/orchestrator/run?wait=${wait}`, {});
  }

  // Configuration
  getConfig(): Observable<Partial<AppConfig>> {
    return this.http.get<Partial<AppConfig>>(`${this.baseUrl}/config`);
  }

  saveConfig(config: AppConfig): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.baseUrl}/config`, config);
  }

  testGemini(): Observable<TestResult> {
    return this.http.post<TestResult>(`${this.baseUrl}/config/test/gemini`, {});
  }

  testAnthropic(): Observable<TestResult> {
    return this.http.post<TestResult>(`${this.baseUrl}/config/test/anthropic`, {});
  }

  testTelegram(): Observable<TestResult> {
    return this.http.post<TestResult>(`${this.baseUrl}/config/test/telegram`, {});
  }

  testEmail(): Observable<TestResult> {
    return this.http.post<TestResult>(`${this.baseUrl}/config/test/email`, {});
  }

  // Profile
  getProfile(): Observable<{ content: string }> {
    return this.http.get<{ content: string }>(`${this.baseUrl}/profile`);
  }

  getProfiles(): Observable<CandidateProfile[]> {
    return this.http.get<CandidateProfile[]>(`${this.baseUrl}/profile/profiles`);
  }

  saveProfile(content: string): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.baseUrl}/profile`, { content });
  }

  saveActiveProfile(profile: {
    content: string;
    includeTitleKeywords: string[];
    excludeTitleKeywords: string[];
  }): Observable<CandidateProfile> {
    return this.http.put<CandidateProfile>(`${this.baseUrl}/profile/active`, profile);
  }

  createProfile(profile: {
    name: string;
    content: string;
    includeTitleKeywords: string[];
    excludeTitleKeywords: string[];
  }): Observable<CandidateProfile> {
    return this.http.post<CandidateProfile>(`${this.baseUrl}/profile/profiles`, profile);
  }

  activateProfile(id: string): Observable<CandidateProfile> {
    return this.http.put<CandidateProfile>(`${this.baseUrl}/profile/profiles/${id}/activate`, {});
  }

  analyzeProfilePdf(file: File, currentProfile: string): Observable<ProfileAnalysis> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('currentProfile', currentProfile);
    return this.http.post<ProfileAnalysis>(`${this.baseUrl}/profile/analyze-pdf`, formData);
  }

  applyProfileAnalysis(analysis: ProfileAnalysis): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.baseUrl}/profile/apply-analysis`,
      analysis
    );
  }
}
