import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  styleUrls: ['./login.component.scss'],
  template: `
    <section class="page-section">
      <div class="container narrow">
        <div class="card auth-card">
          <h2>Login to Kninz</h2>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <label>Email</label>
            <input type="email" formControlName="email" required>
            <label>Password</label>
            <input type="password" formControlName="password" required>
            <button class="primary" type="submit" [disabled]="form.invalid || submitting">Login</button>
          </form>
          <p class="hint">Don't have an account? <a routerLink="/register">Register</a></p>
          <div class="message" *ngIf="message">{{ message }}</div>
        </div>
      </div>
    </section>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  submitting = false;
  message = '';

  submit() {
    if (this.form.invalid) {
      return;
    }
    this.submitting = true;
    const payload = this.form.getRawValue();
    this.auth.login(payload).subscribe({
      next: () => {
        this.message = 'Welcome back!';
        this.router.navigateByUrl('/order');
      },
      error: err => {
        this.message = err?.error?.message || 'Login failed';
      }
    }).add(() => this.submitting = false);
  }
}
