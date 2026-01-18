import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { SecurityService } from './security.service';

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  const security = inject(SecurityService);
  const requestWithCreds = req.clone({ withCredentials: true });

  if (req.method === 'GET' && req.url.includes('/api/csrf-token')) {
    return next(requestWithCreds);
  }

  const token = security.token;
  if (token) {
    return next(requestWithCreds.clone({ setHeaders: { 'x-csrf-token': token } }));
  }

  return from(security.ensureToken()).pipe(
    switchMap(csrfToken => next(requestWithCreds.clone({ setHeaders: { 'x-csrf-token': csrfToken } })))
  );
};
