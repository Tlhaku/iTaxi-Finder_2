import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./pricing.component.scss'],
  template: `
    <section class="page-section">
      <div class="container">
        <h2 class="section-title">Transparent pricing</h2>
        <p class="section-subtitle">All prices include cylinder collection, refill and delivery back to your doorstep.</p>

        <div class="pricing-grid">
          <div class="card" *ngFor="let tier of tiers">
            <h3>{{ tier.size }}</h3>
            <p class="price">R{{ tier.price }} <span>/ cylinder</span></p>
            <ul>
              <li>Certified refill partner</li>
              <li>Yoco secure payment</li>
              <li>Delivery ETA {{ tier.eta }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  `
})
export class PricingComponent {
  tiers = [
    { size: '2 kg', price: 95, eta: 'under 2 hours' },
    { size: '3 kg', price: 130, eta: 'under 2 hours' },
    { size: '5 kg', price: 215, eta: 'same day' },
    { size: '7 kg', price: 280, eta: 'same day' }
  ];
}
