import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private csrfToken: string | null = null;
  private pending: Promise<string> | null = null;

  constructor(private readonly api: ApiService) {}

  get token(): string | null {
    return this.csrfToken;
  }

  ensureToken(): Promise<string> {
    if (this.csrfToken) {
      return Promise.resolve(this.csrfToken);
    }
    if (this.pending) {
      return this.pending;
    }
    this.pending = lastValueFrom(this.api.getCsrfToken()).then(({ csrfToken }) => {
      this.csrfToken = csrfToken;
      this.pending = null;
      return csrfToken;
    }).catch(err => {
      this.pending = null;
      throw err;
    });
    return this.pending;
  }
}
