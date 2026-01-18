import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  styleUrls: ['./home.component.scss'],
  template: `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <h1>Kninz by Mom: hand-knit ponchos, scarves & hats made with love</h1>
          <p>
            Celebrate cozy days with limited-run pieces crafted in South Africa. Browse the latest drop,
            reserve your favourites, and let us deliver—ride-shared where possible to keep shipping gentle on your pocket.
          </p>
          <div class="actions">
            <a routerLink="/order" class="primary">Shop the collection</a>
            <a routerLink="/pricing" class="ghost">See lookbook</a>
          </div>
        </div>
        <div class="metrics card">
          <h3>Why Kninz</h3>
          <ul>
            <li><span>✔</span> Handmade quality from a family studio</li>
            <li><span>✔</span> Secure checkout via Yoco, PayGate or iKhokha</li>
            <li><span>✔</span> Delivery with optional ride-share savings</li>
            <li><span>✔</span> New textures and colours every season</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="page-section">
      <div class="container">
        <h2 class="section-title">How ordering works</h2>
        <p class="section-subtitle">Three simple steps to wear your next favourite knit.</p>
        <div class="steps">
          <div class="card">
            <h3>1. Choose your pieces</h3>
            <p>Add ponchos, scarves, and hats to your cart—each piece is priced and photographed.</p>
          </div>
          <div class="card">
            <h3>2. Share delivery details</h3>
            <p>Pick your payment method and opt into ride-shared delivery to lower fees.</p>
          </div>
          <div class="card">
            <h3>3. Receive with care</h3>
            <p>We confirm the delivery window by SMS, then hand-off your knitwear at your door.</p>
          </div>
        </div>
      </div>
    </section>
  `
})
export class HomeComponent {}
