export interface Job {
  id: string;
  source: string;
  title: string;
  company: string;
  url: string;
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  cvTips: string;
  recruiterMessage: string;
  status: string; // 'novo' | 'aplicado' | 'entrevista' | 'descartada' | 'salvo'
  notes?: string;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface JobFilter {
  page?: number;
  pageSize?: number;
  status?: string;
  minScore?: number;
  maxScore?: number;
  source?: string;
  search?: string;
  orderBy?: string;
  descending?: boolean;
}

export interface JobStatistics {
  totalJobs: number;
  newJobs: number;
  appliedJobs: number;
  interviewJobs: number;
  discardedJobs: number;
  savedJobs: number;
  averageScore: number;
  highScoreJobs: number;
  statusDistribution: Record<string, number>;
  scoreDistribution: Record<number, number>;
  sourceDistribution: Record<string, number>;
}

export interface RunStatus {
  isRunning: boolean;
  lastRunTime?: string;
  lastRunDuration?: string;
  lastScoredCount: number;
  lastCollectedCount: number;
  lastError?: string;
  totalRuns: number;
  currentPhase?: string;
}

export interface AgentOptions {
  runEveryMinutes: number;
  minScoreToNotify: number;
  maxJobsPerRun: number;
  candidateProfilePath: string;
  databasePath: string;
  enableBackgroundWorker: boolean;
  llmProvider: string;
  includeTitleKeywords: string[];
  excludeTitleKeywords: string[];
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface TelegramOptions {
  botToken: string;
  chatId: string;
}

export interface RssFeed {
  name: string;
  url: string;
}

export interface RssOptions {
  feeds: RssFeed[];
}

export interface EmailOptions {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  appPassword: string;
  folder: string;
  maxAgeDays: number;
  fromContains: string[];
  linkContains: string[];
}

export interface AppConfig {
  agent: AgentOptions;
  geminiConfigured?: boolean;
  anthropicConfigured?: boolean;
  telegramConfigured?: boolean;
  emailConfigured?: boolean;
  gemini: GeminiOptions;
  anthropic: AnthropicOptions;
  telegram: TelegramOptions;
  rss: RssOptions;
  email: EmailOptions;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  pictureUrl?: string;
  role: 'admin' | 'user';
  searchCreditsRemaining: number;
  savedJobsCount: number;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
}

export interface AccountStatus {
  user: AuthUser;
  maxSavedJobs: number;
  maxInitialSearchCredits: number;
  lastRun: RunStatus;
}

export type AdminUser = AuthUser;

export interface Invitation {
  email: string;
  inviteCode: string;
  expiresAt: string;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface ProfileAnalysis {
  profileMarkdown: string;
  includeTitleKeywords: string[];
  excludeTitleKeywords: string[];
  warnings: string[];
}

export interface CandidateProfile {
  id: string;
  name: string;
  profileMarkdown: string;
  includeTitleKeywords: string[];
  excludeTitleKeywords: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
