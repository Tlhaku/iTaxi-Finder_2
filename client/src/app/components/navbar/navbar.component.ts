import { Component, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  styleUrls: ['./navbar.component.scss'],
  template: `
    <header [class.scrolled]="scrolled">
      <div class="container">
        <nav>
          <a routerLink="/" class="brand">Kninz Knitwear</a>
          <ul>
            <li><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a></li>
            <li><a routerLink="/order" routerLinkActive="active">Shop</a></li>
            <li><a routerLink="/pricing" routerLinkActive="active">Collection</a></li>
            <li><a routerLink="/comments" routerLinkActive="active">Love Notes</a></li>
            <li class="dropdown" (mouseenter)="openDropdown=true" (mouseleave)="openDropdown=false">
              <span class="dropdown-toggle" [class.active]="isTrackActive">Delivery</span>
              <div class="dropdown-menu" [class.open]="openDropdown">
                <a routerLink="/track" routerLinkActive="active">Coverage &amp; timing</a>
                <a routerLink="/track/link-phone" routerLinkActive="active">Ride-share option</a>
              </div>
            </li>
            <li class="auth">
              <a routerLink="/login" routerLinkActive="active">Login</a>
              <span>/</span>
              <a routerLink="/register" routerLinkActive="active">Register</a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  `
})
export class NavbarComponent {
  openDropdown = false;
  scrolled = false;

  @HostListener('window:scroll') onScroll() {
    this.scrolled = window.scrollY > 10;
  }

  get isTrackActive(): boolean {
    return location.pathname.startsWith('/track');
  }
}
