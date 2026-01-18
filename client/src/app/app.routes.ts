import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { OrderComponent } from './pages/order/order.component';
import { PricingComponent } from './pages/pricing/pricing.component';
import { VisitorCommentsComponent } from './pages/comments/comments.component';
import { TrackComponent } from './pages/track/track.component';
import { LinkPhoneComponent } from './pages/link-phone/link-phone.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';

export const APP_ROUTES: Routes = [
  { path: '', component: HomeComponent },
  { path: 'order', component: OrderComponent },
  { path: 'pricing', component: PricingComponent },
  { path: 'comments', component: VisitorCommentsComponent },
  {
    path: 'track',
    children: [
      { path: '', component: TrackComponent },
      { path: 'link-phone', component: LinkPhoneComponent }
    ]
  },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: '**', redirectTo: '' }
];
