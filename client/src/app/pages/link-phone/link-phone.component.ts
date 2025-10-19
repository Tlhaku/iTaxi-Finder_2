import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-link-phone',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./link-phone.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <h2 class="section-title">Link your phone</h2>
        <p class="section-subtitle">
          Deliverers can broadcast their live location every few seconds. Customers will see your pin on the tracking map.
        </p>
        <div class="card">
          <div class="status" [class.active]="broadcasting">Status: {{ broadcasting ? 'Broadcasting' : 'Offline' }}</div>
          <p *ngIf="!isDeliverer">Login with a deliverer account to start broadcasting your location.</p>
          <p *ngIf="isDeliverer">Grant location permission and keep this page open while en-route.</p>
          <div class="actions">
            <button class="primary" (click)="toggleBroadcast()" [disabled]="!isDeliverer">{{ broadcasting ? 'Stop broadcast' : 'Start broadcast' }}</button>
          </div>
          <div class="message" *ngIf="message">{{ message }}</div>
        </div>
      </div>
    </section>
  `
})
export class LinkPhoneComponent implements OnDestroy {
  broadcasting = false;
  message = '';
  private watchId: number | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly socket: SocketService,
    private readonly api: ApiService
  ) {}

  get isDeliverer(): boolean {
    return this.auth.user()?.role === 'deliverer';
  }

  toggleBroadcast() {
    if (!this.isDeliverer) {
      this.message = 'Only deliverers can broadcast locations.';
      return;
    }
    if (!navigator.geolocation) {
      this.message = 'Geolocation is not supported on this device.';
      return;
    }
    if (this.broadcasting) {
      this.stopBroadcast();
      return;
    }
    const token = this.auth.token();
    if (!token) {
      this.message = 'Please login before broadcasting.';
      return;
    }
    this.socket.connect(token);
    this.api.setBroadcastState(token, true).subscribe();
    this.watchId = navigator.geolocation.watchPosition(position => {
      this.socket.emit('deliverer-location', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      });
    }, () => {
      this.message = 'Failed to access your location. Check permissions.';
      this.stopBroadcast();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 });
    this.broadcasting = true;
    this.message = 'Broadcast started. Keep this tab active while delivering.';
  }

  ngOnDestroy(): void {
    this.stopBroadcast();
  }

  private stopBroadcast() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    const token = this.auth.token();
    if (token) {
      this.api.setBroadcastState(token, false).subscribe();
    }
    this.socket.disconnect();
    this.broadcasting = false;
  }
}
