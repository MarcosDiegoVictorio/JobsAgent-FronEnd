import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JobApiService } from './services/job-api.service';
import {
  AppConfig,
  CandidateProfile,
  Job,
  JobFilter,
  JobStatistics,
  ProfileAnalysis,
  RunStatus,
  TestResult,
  RssFeed
} from './models/job.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private api = inject(JobApiService);

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
    this.loadStats();
    this.loadJobs();
    this.loadConfig();
    this.loadProfile();
    this.startStatusPolling();
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
    }
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
          this.showToast('Ciclo de busca finalizado!', 'info');
        }
      },
      error: () => {}
    });
  }

  triggerRun(): void {
    if (this.runStatus().isRunning) return;

    this.showToast('Iniciando ciclo de busca em segundo plano...', 'info');
    this.api.runOrchestrator(false).subscribe({
      next: () => {
        this.checkStatus();
      },
      error: (err) => {
        this.showToast('Erro ao iniciar busca: ' + err.message, 'error');
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
        this.config = cfg;
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
