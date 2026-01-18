import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-link-phone',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./link-phone.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <h2 class="section-title">Ride-share your delivery</h2>
        <p class="section-subtitle">
          Tick the ride-share box at checkout to let us combine your delivery with nearby Kninz customers. We’ll confirm the cost and timing by SMS before dispatch.
        </p>
        <div class="card">
          <div class="status">How it works</div>
          <ul>
            <li>Share your suburb and preferred time windows in the delivery notes.</li>
            <li>We group orders heading to the same area to cut courier costs.</li>
            <li>You can opt-out anytime; we’ll keep your order on a dedicated courier.</li>
          </ul>
          <p class="message">Have questions or special requests? WhatsApp us after placing your order and we’ll personalise the drop-off.</p>
        </div>
      </div>
    </section>
  `
})
export class LinkPhoneComponent {}
