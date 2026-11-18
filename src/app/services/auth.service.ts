import { Injectable, signal } from '@angular/core';
import { AuthUser } from '../models/job.model';

const TOKEN_KEY = 'jobagent.accessToken';
const USER_KEY = 'jobagent.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly accessToken = signal(sessionStorage.getItem(TOKEN_KEY));
  readonly currentUser = signal<AuthUser | null>(this.readUser());

  saveSession(accessToken: string, user: AuthUser): void {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    this.accessToken.set(accessToken);
    this.currentUser.set(user);
  }

  updateUser(user: AuthUser): void {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
  }

  clearSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this.accessToken.set(null);
    this.currentUser.set(null);
  }

  private readUser(): AuthUser | null {
    try {
      const value = sessionStorage.getItem(USER_KEY);
      return value ? JSON.parse(value) as AuthUser : null;
    } catch {
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
  }
}
