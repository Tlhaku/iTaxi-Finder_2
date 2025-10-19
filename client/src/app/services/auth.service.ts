import { Injectable, signal } from '@angular/core';
import { ApiService, AuthResponse } from './api.service';
import { tap } from 'rxjs/operators';

const TOKEN_KEY = 'basagas_token';
const USER_KEY = 'basagas_user';

function getStorageItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(key);
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<any | null>(this.loadUser());
  readonly token = signal<string | null>(getStorageItem(TOKEN_KEY));

  constructor(private readonly api: ApiService) {}

  private loadUser(): any | null {
    const raw = getStorageItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  register(payload: any) {
    return this.api.register(payload).pipe(tap(response => this.persistAuth(response)));
  }

  login(payload: any) {
    return this.api.login(payload).pipe(tap(response => this.persistAuth(response)));
  }

  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }
    this.token.set(null);
    this.user.set(null);
  }

  private persistAuth(response: AuthResponse) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_KEY, response.token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    }
    this.token.set(response.token);
    this.user.set(response.user);
  }
}
