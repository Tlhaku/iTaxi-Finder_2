import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';
import { MapsService } from '../../services/maps.service';
import { SocketService } from '../../services/socket.service';

declare const google: any;

@Component({
  selector: 'app-track',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./track.component.scss'],
  template: `
    <section class="page-section">
      <div class="container">
        <h2 class="section-title">Live deliverers map</h2>
        <p class="section-subtitle">Track active BasaGas deliverers in real-time. Map refreshes automatically.</p>
        <div class="track-layout">
          <div class="map-card card">
            <div #map class="map-container"></div>
          </div>
          <div class="card legend">
            <h3>Active deliverers</h3>
            <div class="status-pill" *ngFor="let driver of drivers">
              <span class="dot"></span>
              <div>
                <strong>{{ driver.username }}</strong>
                <div>Updated {{ driver.updated | date:'shortTime' }}</div>
              </div>
            </div>
            <p *ngIf="drivers.length === 0">No deliverers broadcasting right now.</p>
          </div>
        </div>
      </div>
    </section>
  `
})
export class TrackComponent implements OnInit, OnDestroy {
  @ViewChild('map', { static: true }) mapRef!: ElementRef<HTMLDivElement>;

  drivers: any[] = [];
  private map: any | null = null;
  private markers = new Map<string, any>();

  constructor(
    private readonly api: ApiService,
    private readonly maps: MapsService,
    private readonly socket: SocketService
  ) {}

  ngOnInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }

  private async initMap() {
    await this.maps.load();
    this.map = new window.google.maps.Map(this.mapRef.nativeElement, {
      center: { lat: -26.2041, lng: 28.0473 },
      zoom: 11,
      disableDefaultUI: true,
      styles: this.mapStyle
    });

    this.api.getDelivererLocations().subscribe(locations => {
      this.drivers = locations;
      locations.forEach(location => this.upsertMarker(location));
    });

    this.socket.connect();
    this.socket.on<any>('deliverer-location', location => {
      this.upsertMarker(location);
      this.drivers = this.drivers
        .filter(driver => driver.user_id !== location.user_id)
        .concat(location)
        .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    });

    this.socket.on<string>('deliverer-offline', userId => {
      this.removeMarker(userId);
      this.drivers = this.drivers.filter(driver => driver.user_id !== userId);
    });
  }

  private upsertMarker(location: any) {
    if (!this.map) {
      return;
    }
    let marker = this.markers.get(location.user_id);
    if (!marker) {
      marker = new window.google.maps.Marker({
        position: { lat: location.lat, lng: location.lng },
        map: this.map,
        title: location.username,
        icon: {
          url: 'https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2_hdpi.png',
          scaledSize: new window.google.maps.Size(27, 43)
        }
      });
      this.markers.set(location.user_id, marker);
    } else {
      marker.setPosition({ lat: location.lat, lng: location.lng });
    }
    marker.setTitle(`${location.username} - updated ${new Date(location.updated).toLocaleTimeString()}`);
  }

  private removeMarker(userId: string) {
    const marker = this.markers.get(userId);
    if (marker) {
      marker.setMap(null);
      this.markers.delete(userId);
    }
  }

  private readonly mapStyle: any[] = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    {
      featureType: 'administrative.land_parcel',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#bdbdbd' }]
    },
    {
      featureType: 'poi',
      elementType: 'geometry',
      stylers: [{ color: '#eeeeee' }]
    },
    {
      featureType: 'poi',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#757575' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'geometry',
      stylers: [{ color: '#e5e5e5' }]
    },
    {
      featureType: 'poi.park',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#ffffff' }]
    },
    {
      featureType: 'road.arterial',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#757575' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: '#dadada' }]
    },
    {
      featureType: 'road.highway',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#616161' }]
    },
    {
      featureType: 'road.local',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }]
    },
    {
      featureType: 'transit.line',
      elementType: 'geometry',
      stylers: [{ color: '#e5e5e5' }]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#c9c9c9' }]
    },
    {
      featureType: 'water',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#9e9e9e' }]
    }
  ];
}
