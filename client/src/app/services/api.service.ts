import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthResponse {
  token: string;
  user: any;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  register(payload: any): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/auth/register`, payload);
  }

  login(payload: any): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/api/auth/login`, payload);
  }

  createOrder(payload: any, token: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/orders`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  getOrders(token: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  getConfig(): Observable<{ googleMapsApiKey: string; yocoPublicKey: string; paymentMethods: string[] }>
  {
    return this.http.get<{ googleMapsApiKey: string; yocoPublicKey: string; paymentMethods: string[] }>(`${this.baseUrl}/api/config`, {
      withCredentials: true
    });
  }

  getCatalog(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/catalog`);
  }

  createCatalogItem(payload: any, token: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/catalog`, payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  sendYocoToken(token: string, orderId?: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.baseUrl}/api/payments/yoco-token`, { token, orderId });
  }

  getDelivererLocations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/api/deliverers/locations`);
  }

  setBroadcastState(token: string, isActive: boolean): Observable<any> {
    return this.http.post(`${this.baseUrl}/api/deliverers/broadcast`, { isActive }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  getCsrfToken(): Observable<{ csrfToken: string }> {
    return this.http.get<{ csrfToken: string }>(`${this.baseUrl}/api/csrf-token`, { withCredentials: true });
  }
}
