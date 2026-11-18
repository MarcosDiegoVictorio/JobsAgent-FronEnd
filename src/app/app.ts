import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobApiService } from './services/job-api.service';
import { AuthService } from './services/auth.service';
import { firstValueFrom } from 'rxjs';
import {
  AccountStatus,
  AdminUser,
  AppConfig,
  CandidateProfile,
  Invitation,
  Job,
  JobFilter,
  JobStatistics,
  ProfileAnalysis,
  RunStatus,
  TestResult,
  RssFeed
} from './models/job.model';

interface GoogleCredentialResponse {
  credential: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            nonce: string;
            callback: (response: GoogleCredentialResponse) => void;
          }): void;
          renderButton(element: HTMLElement, options: Record<string, string>): void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private api = inject(JobApiService);
  private auth = inject(AuthService);
  readonly authUser = this.auth.currentUser;
  isAuthenticated = signal(false);
  isRestoringSession = signal(false);
  isLoadingGoogle = false;
  googleClientId = '';
  inviteCode = '';
  authError = '';
  adminUsers: AdminUser[] = [];
  inviteEmail = '';
  inviteExpiresInDays = 7;
  createdInvitation: Invitation | null = null;
  isLoadingAdmin = false;
  isCreatingInvitation = false;

  // Tabs
  activeTab = 'jobs'; // 'jobs' | 'config' | 'profile'

  // Orchestrator status
  runStatus = signal<RunStatus>({
    isRunning: false,
    lastScoredCount: 0,
    lastCollectedCount: 0,
    totalRuns: 0,
    currentPhase: 'Ocioso'
  });
  private statusPollInterval: any;

  // Jobs & Stats
  jobs: Job[] = [];
  stats: JobStatistics | null = null;
  totalJobs = 0;
  totalPages = 1;
  isLoadingJobs = false;
  selectedJob: Job | null = null;

  // Filters
  filter: JobFilter = {
    page: 1,
    pageSize: 12,
    status: '',
    minScore: undefined,
    search: '',
    orderBy: 'score',
    descending: true
  };

  // Config
  config: AppConfig = {
    agent: {
      runEveryMinutes: 360,
      minScoreToNotify: 7,
      maxJobsPerRun: 40,
      candidateProfilePath: 'profile/candidate.md',
      databasePath: 'jobs.db',
      enableBackgroundWorker: true,
      llmProvider: 'Gemini',
      includeTitleKeywords: [],
      excludeTitleKeywords: []
    },
    gemini: {
      apiKey: '',
      model: 'gemini-2.5-flash'
    },
    anthropic: {
      apiKey: '',
      model: 'claude-sonnet-5-5',
      maxTokens: 1500
    },
    telegram: {
      botToken: '',
      chatId: ''
    },
    rss: {
      feeds: []
    },
    email: {
      enabled: false,
      host: 'imap.gmail.com',
      port: 993,
      user: '',
      appPassword: '',
      folder: 'INBOX',
      maxAgeDays: 3,
      fromContains: [],
      linkContains: []
    }
  };
  isLoadingConfig = false;
  isSavingConfig = false;

  // Profile
  profileMarkdown = '';
  profiles: CandidateProfile[] = [];
  activeProfileId = '';
  newProfileName = '';
  isLoadingProfile = false;
  isSavingProfile = false;
  profilePdf: File | null = null;
  profilePdfError = '';
  isAnalyzingProfile = false;
  isApplyingProfileAnalysis = false;
  profileAnalysis: ProfileAnalysis | null = null;
  analysisIncludeKeywords = '';
  analysisExcludeKeywords = '';

  // Test states
  testing = {
    gemini: false,
    anthropic: false,
    telegram: false,
    email: false
  };
  testResults: {
    gemini?: TestResult;
    anthropic?: TestResult;
    telegram?: TestResult;
    email?: TestResult;
  } = {};

  // Form helpers
  showGeminiApiKey = false;
  showApiKey = false;
  showEmailPassword = false;
  newIncludeKeyword = '';
  newExcludeKeyword = '';
  newEmailFrom = '';
  newEmailLink = '';
  newRssFeed: RssFeed = { name: '', url: '' };

  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null = null;
  private toastTimer: any;

  ngOnInit(): void {
    this.inviteCode = new URLSearchParams(window.location.search).get('invite') || '';
    if (this.auth.accessToken()) {
      this.restoreSession();
    } else {
      this.loadGoogleAuthConfig();
    }
  }

  ngOnDestroy(): void {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  setTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'jobs') {
      this.loadStats();
      this.loadJobs();
    } else if (tab === 'config') {
      this.loadConfig();
    } else if (tab === 'profile') {
      this.loadProfile();
    } else if (tab === 'admin') {
      this.loadAdminUsers();
    }
  }

  private restoreSession(): void {
    this.isRestoringSession.set(true);
    this.api.getAccount().subscribe({
      next: (account) => {
        this.auth.updateUser(account.user);
        this.isRestoringSession.set(false);
        this.enterApplication(account);
      },
      error: () => {
        this.auth.clearSession();
        this.isAuthenticated.set(false);
        this.isRestoringSession.set(false);
        this.loadGoogleAuthConfig();
      }
    });
  }

  private enterApplication(account?: AccountStatus): void {
    this.isAuthenticated.set(true);
    if (account) {
      this.runStatus.set(account.lastRun);
    }
    this.loadStats();
    this.loadJobs();
    this.loadProfile();
    this.startStatusPolling();
    if (this.authUser()?.role === 'admin') {
      this.loadAdminUsers();
    }
  }

  private loadGoogleAuthConfig(): void {
    this.api.getGoogleAuthConfig().subscribe({
      next: (config) => {
        this.googleClientId = config.googleClientId;
        this.authError = '';
        this.initializeGoogleButton();
      },
      error: (error) => {
        this.authError = error.error?.detail ?? error.error?.message ?? 'Login do Google não configurado.';
      }
    });
  }

  private async initializeGoogleButton(): Promise<void> {
    if (!this.googleClientId) return;

    this.isLoadingGoogle = true;
    this.authError = '';
    try {
      await this.loadGoogleIdentityScript();
      const { nonce } = await firstValueFrom(this.api.createAuthNonce());
      const google = window.google;
      if (!nonce || !google) {
        throw new Error('Não foi possível iniciar o login do Google.');
      }

      const container = document.getElementById('googleSignInButton');
      if (!container) return;
      container.replaceChildren();
      google.accounts.id.initialize({
        client_id: this.googleClientId,
        nonce,
        callback: (response) => this.finishGoogleSignIn(response.credential, nonce)
      });
      google.accounts.id.renderButton(container, {
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'signin_with',
        locale: 'pt-BR',
        width: '320'
      });
    } catch (error) {
      this.authError = error instanceof Error ? error.message : 'Não foi possível iniciar o login do Google.';
    } finally {
      this.isLoadingGoogle = false;
    }
  }

  retryGoogleSignIn(): void {
    this.initializeGoogleButton();
  }

  canRunSearch(): boolean {
    const user = this.authUser();
    return !!user && user.searchCreditsRemaining > 0 && user.savedJobsCount < 10;
  }

  private loadGoogleIdentityScript(): Promise<void> {
    if (window.google) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar o login do Google.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset['googleIdentity'] = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar o login do Google.'));
      document.head.appendChild(script);
    });
  }

  private finishGoogleSignIn(credential: string, nonce: string): void {
    this.isLoadingGoogle = true;
    this.authError = '';
    this.api.signInWithGoogle(credential, nonce, this.inviteCode.trim()).subscribe({
      next: (session) => {
        this.auth.saveSession(session.accessToken, session.user);
        this.inviteCode = '';
        this.isLoadingGoogle = false;
        this.enterApplication();
      },
      error: (error) => {
        this.isLoadingGoogle = false;
        this.authError = error.error?.message ?? error.error?.detail ?? error.message ?? 'Não foi possível entrar.';
        this.initializeGoogleButton();
      }
    });
  }

  signOut(): void {
    if (this.statusPollInterval) {
      clearInterval(this.statusPollInterval);
      this.statusPollInterval = undefined;
    }
    this.auth.clearSession();
    this.isAuthenticated.set(false);
    this.activeTab = 'jobs';
    this.jobs = [];
    this.stats = null;
    this.profiles = [];
    this.profileMarkdown = '';
    this.activeProfileId = '';
    this.profileAnalysis = null;
    this.selectedJob = null;
    this.adminUsers = [];
    this.filter = {
      page: 1,
      pageSize: 12,
      status: '',
      minScore: undefined,
      search: '',
      orderBy: 'score',
      descending: true
    };
    this.runStatus.set({
      isRunning: false,
      lastScoredCount: 0,
      lastCollectedCount: 0,
      totalRuns: 0,
      currentPhase: 'Ocioso'
    });
    this.loadGoogleAuthConfig();
  }

  private refreshAccount(): void {
    this.api.getAccount().subscribe({
      next: (account) => this.auth.updateUser(account.user),
      error: (error) => {
        if (error.status === 401) this.signOut();
      }
    });
  }

  loadAdminUsers(): void {
    this.isLoadingAdmin = true;
    this.api.getAdminUsers().subscribe({
      next: (users) => {
        this.adminUsers = users;
        this.isLoadingAdmin = false;
      },
      error: (error) => {
        this.isLoadingAdmin = false;
        this.showToast(error.error?.message ?? error.message ?? 'Não foi possível carregar as contas.', 'error');
      }
    });
  }

  createInvitation(): void {
    this.isCreatingInvitation = true;
    this.createdInvitation = null;
    this.api.createInvitation(this.inviteEmail.trim(), this.inviteExpiresInDays).subscribe({
      next: (invitation) => {
        this.createdInvitation = invitation;
        this.inviteEmail = '';
        this.isCreatingInvitation = false;
      },
      error: (error) => {
        this.isCreatingInvitation = false;
        this.showToast(error.error?.message ?? error.error?.detail ?? error.message ?? 'Não foi possível criar o convite.', 'error');
      }
    });
  }

  copyInvitation(): void {
    if (!this.createdInvitation) return;
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('invite', this.createdInvitation.inviteCode);
    this.copyToClipboard(url.toString(), 'Convite');
  }

  grantSearchCredit(user: AdminUser): void {
    this.api.grantSearchCredit(user.id).subscribe({
      next: (result) => {
        user.searchCreditsRemaining = result.searchCreditsRemaining;
        this.showToast(`Crédito liberado para ${user.email}.`, 'success');
      },
      error: (error) => {
        this.showToast(error.error?.message ?? error.message ?? 'Não foi possível liberar o crédito.', 'error');
      }
    });
  }

  // --- Orchestrator ---
  startStatusPolling(): void {
    this.checkStatus();
    this.statusPollInterval = setInterval(() => this.checkStatus(), 3000);
  }

  checkStatus(): void {
    this.api.getOrchestratorStatus().subscribe({
      next: (status) => {
        const wasRunning = this.runStatus().isRunning;
        this.runStatus.set(status);

        // If it just finished running, reload jobs and stats!
        if (wasRunning && !status.isRunning) {
          this.loadStats();
          this.loadJobs();
          this.refreshAccount();
          this.showToast('Ciclo de busca finalizado!', 'info');
        }
      },
      error: (error) => {
        if (error.status === 401) {
          this.signOut();
        }
      }
    });
  }

  triggerRun(): void {
    if (this.runStatus().isRunning) return;

    this.showToast('Iniciando busca...', 'info');
    this.api.runOrchestrator(false).subscribe({
      next: (result) => {
        const user = this.authUser();
        if (user && typeof result.remainingSearchCredits === 'number') {
          this.auth.updateUser({
            ...user,
            searchCreditsRemaining: result.remainingSearchCredits
          });
        }
        this.runStatus.update((status) => ({
          ...status,
          isRunning: true,
          currentPhase: 'Busca iniciada'
        }));
        this.checkStatus();
      },
      error: (err) => {
        this.showToast(err.error?.message ?? 'Erro ao iniciar busca: ' + err.message, 'error');
      }
    });
  }

  // --- Jobs ---
  loadJobs(): void {
    this.isLoadingJobs = true;
    this.api.getJobs(this.filter).subscribe({
      next: (res) => {
        this.jobs = res.items || [];
        this.totalJobs = res.totalCount;
        this.totalPages = res.totalPages;
        this.isLoadingJobs = false;
      },
      error: (err) => {
        this.isLoadingJobs = false;
        this.showToast('Erro ao carregar vagas: ' + err.message, 'error');
      }
    });
  }

  loadStats(): void {
    this.api.getJobStats().subscribe({
      next: (s) => (this.stats = s),
      error: () => {}
    });
  }

  applyStatusFilter(status: string): void {
    this.filter.status = status;
    this.filter.page = 1;
    this.loadJobs();
  }

  onSearch(): void {
    this.filter.page = 1;
    this.loadJobs();
  }

  prevPage(): void {
    if (this.filter.page && this.filter.page > 1) {
      this.filter.page--;
      this.loadJobs();
    }
  }

  nextPage(): void {
    if (this.filter.page && this.filter.page < this.totalPages) {
      this.filter.page++;
      this.loadJobs();
    }
  }

  openJobModal(job: Job): void {
    this.selectedJob = job;
  }

  closeJobModal(): void {
    this.selectedJob = null;
  }

  updateJobStatus(job: Job, newStatus: string): void {
    this.api.updateJobStatus(job.id, newStatus).subscribe({
      next: () => {
        job.status = newStatus;
        this.loadStats();
        this.showToast(`Status atualizado para "${newStatus}"!`, 'success');
      },
      error: (err) => {
        this.showToast('Erro ao atualizar status: ' + err.message, 'error');
      }
    });
  }

  deleteJob(job: Job, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (!confirm(`Deseja realmente remover a vaga "${job.title}"?`)) return;

    this.api.deleteJob(job.id).subscribe({
      next: () => {
        this.jobs = this.jobs.filter((j) => j.id !== job.id);
        if (this.selectedJob?.id === job.id) this.selectedJob = null;
        this.loadStats();
        this.refreshAccount();
        this.showToast('Vaga removida com sucesso.', 'info');
      },
      error: (err) => {
        this.showToast('Erro ao remover vaga: ' + err.message, 'error');
      }
    });
  }

  copyToClipboard(text: string, label: string): void {
    navigator.clipboard.writeText(text).then(
      () => this.showToast(`${label} copiado para a área de transferência!`, 'success'),
      () => this.showToast('Falha ao copiar.', 'error')
    );
  }

  // --- Config ---
  loadConfig(): void {
    this.isLoadingConfig = true;
    this.api.getConfig().subscribe({
      next: (cfg) => {
        this.config = {
          ...this.config,
          ...cfg,
          agent: { ...this.config.agent, ...cfg.agent },
          gemini: this.config.gemini,
          anthropic: this.config.anthropic,
          telegram: this.config.telegram,
          email: this.config.email,
          rss: { ...this.config.rss, ...cfg.rss }
        };
        this.isLoadingConfig = false;
      },
      error: (err) => {
        this.isLoadingConfig = false;
        this.showToast('Erro ao carregar configurações: ' + err.message, 'error');
      }
    });
  }

  saveConfig(): void {
    this.isSavingConfig = true;
    this.api.saveConfig(this.config).subscribe({
      next: (res) => {
        this.isSavingConfig = false;
        this.showToast(res.message || 'Configurações salvas com sucesso!', 'success');
      },
      error: (err) => {
        this.isSavingConfig = false;
        this.showToast('Erro ao salvar configurações: ' + err.message, 'error');
      }
    });
  }

  testGemini(): void {
    this.testing.gemini = true;
    this.testResults.gemini = undefined;
    this.api.testGemini().subscribe({
      next: (res) => {
        this.testing.gemini = false;
        this.testResults.gemini = res;
      },
      error: (err) => {
        this.testing.gemini = false;
        this.testResults.gemini = { success: false, message: err.message };
      }
    });
  }

  testAnthropic(): void {
    this.testing.anthropic = true;
    this.testResults.anthropic = undefined;
    this.api.testAnthropic().subscribe({
      next: (res) => {
        this.testing.anthropic = false;
        this.testResults.anthropic = res;
      },
      error: (err) => {
        this.testing.anthropic = false;
        this.testResults.anthropic = { success: false, message: err.message };
      }
    });
  }

  testTelegram(): void {
    this.testing.telegram = true;
    this.testResults.telegram = undefined;
    this.api.testTelegram().subscribe({
      next: (res) => {
        this.testing.telegram = false;
        this.testResults.telegram = res;
      },
      error: (err) => {
        this.testing.telegram = false;
        this.testResults.telegram = { success: false, message: err.message };
      }
    });
  }

  testEmail(): void {
    this.testing.email = true;
    this.testResults.email = undefined;
    this.api.testEmail().subscribe({
      next: (res) => {
        this.testing.email = false;
        this.testResults.email = res;
      },
      error: (err) => {
        this.testing.email = false;
        this.testResults.email = { success: false, message: err.message };
      }
    });
  }

  // Keyword tags
  addIncludeKeyword(): void {
    const val = this.newIncludeKeyword.trim();
    if (val && !this.config.agent.includeTitleKeywords.includes(val)) {
      this.config.agent.includeTitleKeywords.push(val);
      this.newIncludeKeyword = '';
    }
  }

  removeIncludeKeyword(index: number): void {
    this.config.agent.includeTitleKeywords.splice(index, 1);
  }

  addExcludeKeyword(): void {
    const val = this.newExcludeKeyword.trim();
    if (val && !this.config.agent.excludeTitleKeywords.includes(val)) {
      this.config.agent.excludeTitleKeywords.push(val);
      this.newExcludeKeyword = '';
    }
  }

  removeExcludeKeyword(index: number): void {
    this.config.agent.excludeTitleKeywords.splice(index, 1);
  }

  // RSS feeds
  addRssFeed(): void {
    if (this.newRssFeed.name.trim() && this.newRssFeed.url.trim()) {
      this.config.rss.feeds.push({ ...this.newRssFeed });
      this.newRssFeed = { name: '', url: '' };
    }
  }

  removeRssFeed(index: number): void {
    this.config.rss.feeds.splice(index, 1);
  }

  // Email filters
  addEmailFrom(): void {
    const val = this.newEmailFrom.trim();
    if (val && !this.config.email.fromContains.includes(val)) {
      this.config.email.fromContains.push(val);
      this.newEmailFrom = '';
    }
  }

  removeEmailFrom(index: number): void {
    this.config.email.fromContains.splice(index, 1);
  }

  addEmailLink(): void {
    const val = this.newEmailLink.trim();
    if (val && !this.config.email.linkContains.includes(val)) {
      this.config.email.linkContains.push(val);
      this.newEmailLink = '';
    }
  }

  removeEmailLink(index: number): void {
    this.config.email.linkContains.splice(index, 1);
  }

  // --- Profile ---
  loadProfile(): void {
    this.isLoadingProfile = true;
    this.api.getProfiles().subscribe({
      next: (profiles) => {
        this.profiles = profiles || [];
        const activeProfile = this.profiles.find((profile) => profile.isActive);
        if (activeProfile) {
          this.setActiveProfile(activeProfile);
        }
        this.isLoadingProfile = false;
      },
      error: (err) => {
        this.isLoadingProfile = false;
        this.showToast('Erro ao carregar perfil: ' + err.message, 'error');
      }
    });
  }

  saveProfile(): void {
    this.isSavingProfile = true;
    this.api.saveActiveProfile({
      content: this.profileMarkdown,
      includeTitleKeywords: this.config.agent.includeTitleKeywords,
      excludeTitleKeywords: this.config.agent.excludeTitleKeywords
    }).subscribe({
      next: (profile) => {
        this.updateProfileList(profile);
        this.isSavingProfile = false;
        this.showToast('Perfil e filtros salvos com sucesso!', 'success');
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.showToast('Erro ao salvar perfil: ' + err.message, 'error');
      }
    });
  }

  createProfile(): void {
    const name = this.newProfileName.trim();
    if (!name) {
      this.showToast('Informe um nome para o novo perfil.', 'error');
      return;
    }

    this.isSavingProfile = true;
    this.api.createProfile({
      name,
      content: this.profileMarkdown,
      includeTitleKeywords: this.config.agent.includeTitleKeywords,
      excludeTitleKeywords: this.config.agent.excludeTitleKeywords
    }).subscribe({
      next: (profile) => {
        this.newProfileName = '';
        this.updateProfileList(profile);
        this.isSavingProfile = false;
        this.resetJobsForActiveProfile();
        this.showToast(`Perfil "${profile.name}" criado e ativado.`, 'success');
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.showToast(
          err.error?.message ?? err.error?.detail ?? err.message ?? 'Erro ao criar perfil.',
          'error'
        );
      }
    });
  }

  activateProfile(profileId: string): void {
    if (!profileId || profileId === this.activeProfileId) return;

    this.isLoadingProfile = true;
    this.api.activateProfile(profileId).subscribe({
      next: (profile) => {
        this.updateProfileList(profile);
        this.isLoadingProfile = false;
        this.profileAnalysis = null;
        this.resetJobsForActiveProfile();
        this.showToast(`Perfil "${profile.name}" ativado. O histórico de vagas foi separado.`, 'success');
      },
      error: (err) => {
        this.isLoadingProfile = false;
        this.showToast(
          err.error?.message ?? err.error?.detail ?? err.message ?? 'Erro ao ativar perfil.',
          'error'
        );
      }
    });
  }

  private updateProfileList(activeProfile: CandidateProfile): void {
    this.profiles = [
      ...this.profiles.filter((profile) => profile.id !== activeProfile.id),
      { ...activeProfile }
    ].map((profile) => ({ ...profile, isActive: profile.id === activeProfile.id }));
    this.profiles.sort((a, b) => a.name.localeCompare(b.name));
    this.setActiveProfile(activeProfile);
  }

  private setActiveProfile(profile: CandidateProfile): void {
    this.activeProfileId = profile.id;
    this.profileMarkdown = profile.profileMarkdown || '';
    this.config.agent.includeTitleKeywords = [...profile.includeTitleKeywords];
    this.config.agent.excludeTitleKeywords = [...profile.excludeTitleKeywords];
  }

  private resetJobsForActiveProfile(): void {
    this.filter.page = 1;
    this.filter.status = '';
    this.selectedJob = null;
    this.loadStats();
    this.loadJobs();
  }

  getBoardSearchUrl(board: string): string {
    const term = encodeURIComponent(
      this.config.agent.includeTitleKeywords[0]?.trim() || 'desenvolvedor .NET'
    );

    switch (board) {
      case 'gupy':
        return `https://portal.gupy.io/job-search/term?search=${term}`;
      case 'infojobs':
        return `https://www.infojobs.com.br/empregos.aspx?palabra=${term}`;
      case 'catho':
        return `https://www.catho.com.br/vagas/?q=${term}`;
      case 'indeed':
        return `https://br.indeed.com/jobs?q=${term}&l=Brasil`;
      default:
        return '#';
    }
  }

  onProfilePdfSelected(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;

    const file = event.target.files?.[0] ?? null;
    this.profileAnalysis = null;
    this.profilePdfError = '';

    if (!file) {
      this.profilePdf = null;
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      this.profilePdf = null;
      this.profilePdfError = 'Selecione um arquivo com extensão PDF.';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.profilePdf = null;
      this.profilePdfError = 'O arquivo deve ter no máximo 10 MB.';
      return;
    }

    this.profilePdf = file;
  }

  analyzeProfilePdf(): void {
    if (!this.profilePdf || this.isAnalyzingProfile) return;

    this.isAnalyzingProfile = true;
    this.profilePdfError = '';
    this.profileAnalysis = null;

    this.api.analyzeProfilePdf(this.profilePdf, this.profileMarkdown).subscribe({
      next: (analysis) => {
        this.profileAnalysis = analysis;
        this.analysisIncludeKeywords = analysis.includeTitleKeywords.join(', ');
        this.analysisExcludeKeywords = analysis.excludeTitleKeywords.join(', ');
        this.isAnalyzingProfile = false;
      },
      error: (err) => {
        this.profilePdfError =
          err.error?.message ??
          err.error?.detail ??
          err.message ??
          'Não foi possível analisar o PDF.';
        this.isAnalyzingProfile = false;
      }
    });
  }

  applyProfileAnalysis(): void {
    if (!this.profileAnalysis || this.isApplyingProfileAnalysis) return;

    const analysis: ProfileAnalysis = {
      ...this.profileAnalysis,
      profileMarkdown: this.profileAnalysis.profileMarkdown.trim(),
      includeTitleKeywords: this.parseAnalysisKeywords(this.analysisIncludeKeywords),
      excludeTitleKeywords: this.parseAnalysisKeywords(this.analysisExcludeKeywords)
    };

    this.isApplyingProfileAnalysis = true;
    this.api.applyProfileAnalysis(analysis).subscribe({
      next: (result) => {
        this.profileMarkdown = analysis.profileMarkdown;
        this.config.agent.includeTitleKeywords = analysis.includeTitleKeywords;
        this.config.agent.excludeTitleKeywords = analysis.excludeTitleKeywords;
        this.profileAnalysis = null;
        this.profilePdf = null;
        this.isApplyingProfileAnalysis = false;
        this.loadProfile();
        this.showToast(result.message || 'Perfil e filtros atualizados.', 'success');
      },
      error: (err) => {
        this.isApplyingProfileAnalysis = false;
        this.showToast(
          err.error?.message ?? err.error?.detail ?? err.message ?? 'Não foi possível aplicar a análise.',
          'error'
        );
      }
    });
  }

  discardProfileAnalysis(): void {
    this.profileAnalysis = null;
    this.profilePdf = null;
    this.profilePdfError = '';
  }

  private parseAnalysisKeywords(value: string): string[] {
    return [...new Set(
      value
        .split(/[,\n;]/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 0)
    )].slice(0, 25);
  }

  // Helper score color
  getScoreBadgeClass(score: number): string {
    if (score >= 8) return 'badge-emerald';
    if (score >= 6) return 'badge-blue';
    if (score >= 4) return 'badge-amber';
    return 'badge-rose';
  }

  getStatusBadgeClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'novo': return 'badge-indigo';
      case 'aplicado': return 'badge-blue';
      case 'entrevista': return 'badge-emerald';
      case 'salvo': return 'badge-amber';
      case 'descartada': return 'badge-dim';
      default: return 'badge-dim';
    }
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.toast = { message, type };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
    }, 4000);
  }
}
