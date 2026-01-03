import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapsService } from '../../services/maps.service';

declare const google: any;

@Component({
  selector: 'app-track',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./track.component.scss'],
  template: `
    <section class="page-section">
      <div class="container">
        <h2 class="section-title">Delivery coverage</h2>
        <p class="section-subtitle">We deliver across South Africa with SMS updates. In Gauteng we can often ride-share nearby orders to lower courier fees.</p>
        <div class="track-layout">
          <div class="map-card card">
            <div #map class="map-container"></div>
          </div>
          <div class="card legend">
            <h3>What to expect</h3>
            <ul>
              <li><strong>Gauteng:</strong> next-day delivery, ride-share friendly.</li>
              <li><strong>Major metros:</strong> 2-4 day courier with tracking.</li>
              <li><strong>Payment:</strong> Yoco, PayGate, or iKhokha tokenised checkout.</li>
              <li><strong>Ride-share:</strong> Opt-in at checkout to pool deliveries and reduce costs.</li>
            </ul>
            <p class="muted">Need a special hand-off? Add it to your delivery notes and we’ll confirm by SMS.</p>
          </div>
        </div>
      </div>
    </section>
  `
})
export class TrackComponent implements OnInit {
  @ViewChild('map', { static: true }) mapRef!: ElementRef<HTMLDivElement>;
  private map: any | null = null;

  constructor(private readonly maps: MapsService) {}

  ngOnInit(): void {
    this.initMap();
  }

  private async initMap() {
    await this.maps.load();
    this.map = new window.google.maps.Map(this.mapRef.nativeElement, {
      center: { lat: -26.2041, lng: 28.0473 },
      zoom: 6,
      disableDefaultUI: true,
      styles: this.mapStyle
    });

    const markers = [
      { position: { lat: -26.2041, lng: 28.0473 }, title: 'Gauteng Hub' },
      { position: { lat: -33.9249, lng: 18.4241 }, title: 'Cape Town Courier' },
      { position: { lat: -29.8587, lng: 31.0218 }, title: 'Durban Courier' }
    ];

    markers.forEach(marker => {
      new window.google.maps.Marker({
        position: marker.position,
        map: this.map,
        title: marker.title,
        icon: { url: 'https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2_hdpi.png', scaledSize: new window.google.maps.Size(24, 38) }
      });
    });
  }

  private readonly mapStyle: any[] = [
    { elementType: 'geometry', stylers: [{ color: '#f7f8fb' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f8fb' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbfe' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] },
    { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] }
  ];
}
