import { Component, OnInit, Signal, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { MapsService } from '../../services/maps.service';

interface Product {
  id: string;
  name: string;
  type: 'poncho' | 'hat' | 'scarf';
  price: number;
  description: string;
  image: string;
  quantity: number;
}

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['./order.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <h2 class="section-title">Build your Kninz order</h2>
        <p class="section-subtitle">Select the hand-knit pieces you love, then share your delivery details. We’ll coordinate ride-shared drop-offs where possible to keep costs low.</p>

        <div class="product-grid">
          <div class="card product" *ngFor="let product of products; trackBy: trackById">
            <div class="image" [style.backgroundImage]="'url(' + product.image + ')'"></div>
            <div class="product-body">
              <div class="header">
                <h3>{{ product.name }}</h3>
                <span class="price">R{{ product.price }}</span>
              </div>
              <p class="description">{{ product.description }}</p>
              <div class="quantity-stepper">
                <button type="button" (click)="adjustQuantity(product, -1)" [disabled]="product.quantity === 0">-</button>
                <span>{{ product.quantity }}</span>
                <button type="button" (click)="adjustQuantity(product, 1)">+</button>
              </div>
            </div>
          </div>
        </div>

        <div class="two-column">
          <form [formGroup]="deliveryForm" (ngSubmit)="submit()" class="card">
            <h3>Delivery & payment details</h3>
            <div class="form-grid">
              <div class="field-group">
                <label for="recipient_name">Full name</label>
                <input id="recipient_name" type="text" formControlName="recipient_name" placeholder="Name for the parcel">
              </div>
              <div class="field-group">
                <label for="email">Email</label>
                <input id="email" type="email" formControlName="email" placeholder="you@example.com">
              </div>
              <div class="field-group">
                <label for="phone">Phone</label>
                <input id="phone" type="tel" formControlName="phone" placeholder="Delivery contact number">
              </div>
              <div class="field-group full">
                <label for="address">Delivery address</label>
                <div class="stacked">
                  <input id="address" type="text" formControlName="address" placeholder="Street and house number">
                  <button class="ghost" type="button" (click)="useLocation()">Use My Location</button>
                </div>
              </div>
              <div class="field-group">
                <label for="city">City/Suburb</label>
                <input id="city" type="text" formControlName="city" placeholder="e.g. Sandton, Umlazi">
              </div>
              <div class="field-group">
                <label for="payment_method">Payment method</label>
                <select id="payment_method" formControlName="payment_method">
                  <option *ngFor="let method of paymentMethods" [value]="method">{{ method }}</option>
                </select>
              </div>
              <div class="field-group full">
                <label for="notes">Delivery notes</label>
                <input id="notes" type="text" formControlName="notes" placeholder="Gate codes, best time to deliver, etc." />
              </div>
              <label class="ride-share">
                <input type="checkbox" formControlName="ride_share">
                I’m happy to ride-share deliveries with nearby customers to reduce shipping costs.
              </label>
            </div>
            <div class="footer">
              <div class="status" *ngIf="message()" [class.success]="success()" [class.error]="!success()">{{ message() }}</div>
              <button class="primary" type="submit" [disabled]="deliveryForm.invalid || cartItems.length === 0 || submitting">Confirm &amp; Pay</button>
            </div>
          </form>

          <div class="card summary">
            <h3>Your cart</h3>
            <p *ngIf="cartItems.length === 0">Choose a poncho, hat, or scarf to get started.</p>
            <div class="summary-line" *ngFor="let item of cartItems">
              <div>
                <strong>{{ item.name }}</strong>
                <div class="muted">{{ item.quantity }} × R{{ item.price }}</div>
              </div>
              <div>R{{ item.price * item.quantity }}</div>
            </div>
            <div class="summary-total" *ngIf="cartItems.length">
              <span>Subtotal</span>
              <strong>R{{ subtotal }}</strong>
            </div>
            <p class="muted">Payments are securely tokenised via {{ deliveryForm.value.payment_method || 'Yoco' }}. We’ll confirm delivery schedules by SMS.</p>
          </div>
        </div>
      </div>
    </section>
  `
})
export class OrderComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly maps = inject(MapsService);

  products: Product[] = [
    {
      id: 'white-poncho-1',
      name: 'Snow Day Poncho',
      type: 'poncho',
      price: 350,
      description: 'Feathery white knit that drapes softly for effortless layering.',
      image: 'assets/kninz/white-poncho-1.svg',
      quantity: 0
    },
    {
      id: 'white-poncho-2',
      name: 'Frosted Wrap',
      type: 'poncho',
      price: 350,
      description: 'Textured white wrap that hugs the shoulders with gentle warmth.',
      image: 'assets/kninz/white-poncho-2.svg',
      quantity: 0
    },
    {
      id: 'cream-poncho-1',
      name: 'Champagne Bloom',
      type: 'poncho',
      price: 350,
      description: 'Soft champagne-toned poncho with a classic triangular fall.',
      image: 'assets/kninz/cream-poncho-1.svg',
      quantity: 0
    },
    {
      id: 'cream-poncho-2',
      name: 'Pearl Brooch Poncho',
      type: 'poncho',
      price: 350,
      description: 'Chunky knit with a vintage brooch clasp for effortless polish.',
      image: 'assets/kninz/cream-poncho-2.svg',
      quantity: 0
    },
    {
      id: 'blue-poncho-1',
      name: 'Ocean Drift Poncho',
      type: 'poncho',
      price: 350,
      description: 'Bright blues blended with fringe for joyful movement.',
      image: 'assets/kninz/blue-poncho-1.svg',
      quantity: 0
    },
    {
      id: 'purple-cowl',
      name: 'Plum Cowl',
      type: 'scarf',
      price: 250,
      description: 'Circular scarf with frosted tips—pull on for instant coziness.',
      image: 'assets/kninz/purple-cowl.svg',
      quantity: 0
    },
    {
      id: 'blue-scarf-1',
      name: 'Azure Trail Scarf',
      type: 'scarf',
      price: 250,
      description: 'Ribbed azure scarf that layers beautifully with denim.',
      image: 'assets/kninz/blue-scarf-1.svg',
      quantity: 0
    },
    {
      id: 'blue-poncho-2',
      name: 'Midnight Poncho',
      type: 'poncho',
      price: 350,
      description: 'Plush midnight-blue poncho that feels like a wearable hug.',
      image: 'assets/kninz/blue-poncho-2.svg',
      quantity: 0
    },
    {
      id: 'hat-cloud',
      name: 'Cloud Beanie',
      type: 'hat',
      price: 150,
      description: 'Lightweight knit hat that pairs with every winter look.',
      image: 'assets/kninz/hat-cloud.svg',
      quantity: 0
    }
  ];

  deliveryForm = this.fb.nonNullable.group({
    recipient_name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    address: ['', Validators.required],
    city: [''],
    notes: [''],
    ride_share: [true],
    payment_method: ['Yoco', Validators.required]
  });

  submitting = false;
  paymentMethods: string[] = ['Yoco', 'PayGate', 'iKhokha'];
  private messageSignal = signal<string | null>(null);
  private successSignal = signal<boolean>(false);

  message: Signal<string | null> = computed(() => this.messageSignal());
  success: Signal<boolean> = computed(() => this.successSignal());

  ngOnInit(): void {
    this.maps.load().catch(() => {
      this.messageSignal.set('Could not load Google Maps. Autocomplete is disabled.');
      this.successSignal.set(false);
    });

    this.api.getConfig().subscribe(cfg => {
      this.paymentMethods = cfg.paymentMethods || this.paymentMethods;
      const paymentMethod = this.deliveryForm.getRawValue().payment_method;
      if (!this.paymentMethods.includes(paymentMethod)) {
        this.deliveryForm.patchValue({ payment_method: this.paymentMethods[0] });
      }
    });
  }

  get cartItems() {
    return this.products.filter(p => p.quantity > 0);
  }

  get subtotal(): number {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  adjustQuantity(product: Product, delta: number) {
    const next = Math.max(0, product.quantity + delta);
    product.quantity = next;
  }

  trackById(_: number, item: Product) {
    return item.id;
  }

  async useLocation() {
    if (!navigator.geolocation) {
      this.messageSignal.set('Geolocation not supported by this browser.');
      this.successSignal.set(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      const address = await this.maps.geocode(pos.coords.latitude, pos.coords.longitude);
      const formatted = address || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      this.deliveryForm.get('address')?.setValue(formatted);
    }, () => {
      this.messageSignal.set('Unable to fetch your current location.');
      this.successSignal.set(false);
    });
  }

  submit() {
    if (this.deliveryForm.invalid || this.cartItems.length === 0) {
      this.deliveryForm.markAllAsTouched();
      return;
    }
    const token = this.auth.token();
    if (!token) {
      this.messageSignal.set('Please login before placing an order.');
      this.successSignal.set(false);
      return;
    }
    this.submitting = true;
    const payload = {
      items: this.cartItems.map(item => ({ type: item.type, quantity: item.quantity })),
      delivery: this.deliveryForm.getRawValue()
    };

    this.api.createOrder(payload, token).subscribe({
      next: order => {
        this.api.sendYocoToken('kninz-demo-token', order?._id).subscribe();
        this.messageSignal.set('Order captured! We will confirm your delivery window shortly.');
        this.successSignal.set(true);
        this.products = this.products.map(product => ({ ...product, quantity: 0 }));
        this.deliveryForm.reset({
          recipient_name: '',
          email: '',
          phone: '',
          address: '',
          city: '',
          notes: '',
          ride_share: true,
          payment_method: this.paymentMethods[0] || 'Yoco'
        });
      },
      error: err => {
        this.messageSignal.set(err?.error?.message || 'Failed to submit order. Try again.');
        this.successSignal.set(false);
      }
    }).add(() => this.submitting = false);
  }
}
