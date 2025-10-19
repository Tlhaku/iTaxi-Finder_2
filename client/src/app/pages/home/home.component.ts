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
          <h1>Door-to-door LPG refills for busy South Africans</h1>
          <p>
            BasaGas connects households with certified deliverers for 2 kg - 7 kg cylinders.
            Order refills, track your deliverer in real-time, and pay securely with Yoco.
          </p>
          <div class="actions">
            <a routerLink="/order" class="primary">Place an order</a>
            <a routerLink="/track" class="ghost">Track my order</a>
          </div>
        </div>
        <div class="metrics card">
          <h3>Why BasaGas</h3>
          <ul>
            <li><span>✔</span> Licensed LPG partners across Gauteng</li>
            <li><span>✔</span> Live tracking with Google Maps</li>
            <li><span>✔</span> Secured by Yoco Checkout</li>
            <li><span>✔</span> Deliverers verified & trained</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="page-section">
      <div class="container">
        <h2 class="section-title">How it works</h2>
        <p class="section-subtitle">Three simple steps to get your cylinders refilled.</p>
        <div class="steps">
          <div class="card">
            <h3>1. Order online</h3>
            <p>Schedule a pickup and drop-off, choose your cylinder size and manufacturer.</p>
          </div>
          <div class="card">
            <h3>2. Pay securely</h3>
            <p>Use Yoco Checkout to tokenize your payment and confirm your order.</p>
          </div>
          <div class="card">
            <h3>3. Track delivery</h3>
            <p>Follow your deliverer on our live map from pickup to drop-off.</p>
          </div>
        </div>
      </div>
    </section>
  `
})
export class HomeComponent {}
