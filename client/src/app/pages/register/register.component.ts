import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  styleUrls: ['./register.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <div class="card auth-card">
          <h2>Create your Kninz account</h2>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <div class="form-grid">
              <div>
                <label>Full name</label>
                <input type="text" formControlName="username" required>
              </div>
              <div>
                <label>Email</label>
                <input type="email" formControlName="email" required>
              </div>
              <div>
                <label>Phone</label>
                <input type="tel" formControlName="phone" required>
              </div>
              <div>
                <label>Password</label>
                <input type="password" formControlName="password" required>
              </div>
              <div>
                <label>Role</label>
                <select formControlName="role">
                  <option value="customer">Customer</option>
                  <option value="deliverer">Deliverer</option>
                  <option value="admin">Admin (manage catalog)</option>
                </select>
              </div>
            </div>
            <button class="primary" type="submit" [disabled]="form.invalid || submitting">Register</button>
          </form>
          <p class="hint">Already registered? <a routerLink="/login">Login</a></p>
          <div class="message" *ngIf="message">{{ message }}</div>
        </div>
      </div>
    </section>
  `
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    role: ['customer', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submitting = false;
  message = '';

  submit() {
    if (this.form.invalid) {
      return;
    }
    this.submitting = true;
    const payload = this.form.getRawValue();
    this.auth.register(payload).subscribe({
      next: () => {
        this.message = 'Registration successful!';
        this.router.navigateByUrl('/order');
      },
      error: err => {
        this.message = err?.error?.message || 'Registration failed';
      }
    }).add(() => this.submitting = false);
  }
}
