import { Component, OnInit, Signal, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';
import { MapsService } from '../../services/maps.service';

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['./order.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <h2 class="section-title">Place your BasaGas order</h2>
        <p class="section-subtitle">We currently support 2 kg, 3 kg, 5 kg and 7 kg cylinders across Gauteng.</p>

        <form [formGroup]="orderForm" (ngSubmit)="submit()" class="card">
          <div class="form-grid">
            <div class="field-group">
              <label for="pickup">Where should we pick up your empty cylinders</label>
              <div class="stacked">
                <input id="pickup" type="text" placeholder="Enter pickup address" formControlName="pickup" autocomplete="off">
                <button type="button" class="ghost" (click)="useLocation('pickup')">Use My Location</button>
              </div>
            </div>

            <div class="field-group">
              <label for="dropoff">Where should we drop off your refilled cylinders</label>
              <div class="stacked">
                <input id="dropoff" type="text" placeholder="Enter drop-off address" formControlName="dropoff" autocomplete="off">
                <button type="button" class="ghost" (click)="useLocation('dropoff')">Use My Location</button>
              </div>
            </div>

            <div class="field-group">
              <label for="size">Cylinder Size</label>
              <select id="size" formControlName="size">
                <option value="2kg">2 kg</option>
                <option value="3kg">3 kg</option>
                <option value="5kg">5 kg</option>
                <option value="7kg">7 kg</option>
              </select>
            </div>

            <div class="field-group">
              <label for="manufacturer">Manufacturer</label>
              <select id="manufacturer" formControlName="manufacturer">
                <option>TotalGaz</option>
                <option>Afrox</option>
                <option>Oryx Energies</option>
                <option>Other</option>
              </select>
            </div>

            <div class="field-group">
              <label for="phone">Contact Phone</label>
              <input id="phone" type="tel" placeholder="Contact number" formControlName="phone">
            </div>

            <div class="field-group">
              <label for="notes">Delivery Notes</label>
              <input id="notes" type="text" placeholder="Complex gate code, pets, etc" formControlName="notes">
            </div>
          </div>

          <div class="footer">
            <div class="status" *ngIf="message()" [class.success]="success()" [class.error]="!success()">
              {{ message() }}
            </div>
            <button class="primary" type="submit" [disabled]="orderForm.invalid || submitting">Submit &amp; Pay</button>
          </div>
        </form>

        <div class="card info">
          <h3>Payment with Yoco Checkout</h3>
          <p>
            On submit we'll launch the Yoco payment modal. For the MVP we tokenise the payment
            and store the token server-side. Operations will capture and reconcile payments manually.
          </p>
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

  orderForm = this.fb.nonNullable.group({
    pickup: ['', Validators.required],
    dropoff: ['', Validators.required],
    size: ['5kg', Validators.required],
    manufacturer: ['TotalGaz', Validators.required],
    phone: ['', Validators.required],
    notes: ['']
  });

  submitting = false;
  private messageSignal = signal<string | null>(null);
  private successSignal = signal<boolean>(false);

  message: Signal<string | null> = computed(() => this.messageSignal());
  success: Signal<boolean> = computed(() => this.successSignal());

  ngOnInit(): void {
    this.maps.load().catch(() => {
      this.messageSignal.set('Could not load Google Maps. Autocomplete is disabled.');
      this.successSignal.set(false);
    });
  }

  async useLocation(control: 'pickup' | 'dropoff') {
    if (!navigator.geolocation) {
      this.messageSignal.set('Geolocation not supported by this browser.');
      this.successSignal.set(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      const address = await this.maps.geocode(pos.coords.latitude, pos.coords.longitude);
      const formatted = address || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      this.orderForm.get(control)?.setValue(formatted);
    }, () => {
      this.messageSignal.set('Unable to fetch your current location.');
      this.successSignal.set(false);
    });
  }

  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }
    const token = this.auth.token();
    if (!token) {
      this.messageSignal.set('Please login before placing an order.');
      this.successSignal.set(false);
      return;
    }
    this.submitting = true;
    const formValue = this.orderForm.getRawValue();
    this.api.createOrder({
      pickup_address: formValue.pickup,
      dropoff_address: formValue.dropoff,
      cylinder_size: formValue.size,
      manufacturer: formValue.manufacturer,
      contact_phone: formValue.phone,
      notes: formValue.notes
    }, token).subscribe({
      next: order => {
        this.api.sendYocoToken('demo-token', order?._id).subscribe();
        this.messageSignal.set('Order captured! We have initiated the Yoco payment step.');
        this.successSignal.set(true);
        this.orderForm.reset({
          pickup: '',
          dropoff: '',
          size: '5kg',
          manufacturer: 'TotalGaz',
          phone: '',
          notes: ''
        });
      },
      error: err => {
        this.messageSignal.set(err?.error?.message || 'Failed to submit order. Try again.');
        this.successSignal.set(false);
      }
    }).add(() => this.submitting = false);
  }
}
