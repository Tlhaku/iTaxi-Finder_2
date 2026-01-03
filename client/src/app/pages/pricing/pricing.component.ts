import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./pricing.component.scss'],
  template: `
    <section class="page-section">
      <div class="container">
        <h2 class="section-title">The Kninz collection</h2>
        <p class="section-subtitle">Classic, cozy, and priced simply. All pieces are handmade and ready to deliver.</p>

        <div class="collection-grid" *ngIf="catalog().length; else catalogFallback">
          <div class="card collection" *ngFor="let item of catalog(); trackBy: trackById">
            <div class="thumb" [style.backgroundImage]="'url(' + item.image + ')'"></div>
            <div class="body">
              <div class="header">
                <h3>{{ item.name }}</h3>
                <span class="badge">{{ item.type }}</span>
              </div>
              <p class="description">{{ item.description }}</p>
              <div class="price">R{{ item.price }}<span> / piece</span></div>
            </div>
          </div>
        </div>

        <ng-template #catalogFallback>
          <div class="card info">Loading the latest drop...</div>
        </ng-template>

        <div class="pricing-grid">
          <div class="card" *ngFor="let tier of tiers">
            <h3>{{ tier.name }}</h3>
            <p class="price">R{{ tier.price }} <span>/ {{ tier.unit }}</span></p>
            <ul>
              <li>{{ tier.detail }}</li>
              <li>Available in current drop colours</li>
              <li>Ride-share friendly delivery</li>
            </ul>
          </div>
        </div>

        <div class="card shipping">
          <h3>Delivery & ride-sharing</h3>
          <p>We consolidate nearby drop-offs when you tick the ride-share box during checkout. You’ll always get an SMS with the confirmed window.</p>
          <ul>
            <li>Johannesburg & Pretoria: next-day or shared-route delivery</li>
            <li>Other SA metros: 2-4 days courier with tracking</li>
            <li>Secure payment options: Yoco, PayGate, iKhokha</li>
          </ul>
        </div>
      </div>
    </section>
  `
})
export class PricingComponent implements OnInit {
  private readonly api = inject(ApiService);

  catalog = signal<any[]>([]);
  tiers = [
    { name: 'Ponchos', price: 350, unit: 'piece', detail: 'Textured, drapey silhouettes' },
    { name: 'Hats', price: 150, unit: 'piece', detail: 'Soft beanies and berets' },
    { name: 'Scarves & Cowls', price: 250, unit: 'piece', detail: 'Wraps, cowls, and long scarves' }
  ];

  ngOnInit(): void {
    this.api.getCatalog().subscribe({
      next: items => this.catalog.set(items || []),
      error: () => this.catalog.set([])
    });
  }

  trackById(_: number, item: any) {
    return item._id || item.id;
  }
}
