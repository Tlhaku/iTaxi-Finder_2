import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ApiService } from './api.service';

declare global {
  interface Window {
    google: any;
  }
}

@Injectable({ providedIn: 'root' })
export class MapsService {
  private loader?: Promise<void>;

  constructor(private readonly api: ApiService) {}

  load(): Promise<void> {
    if (this.loader) {
      return this.loader;
    }
    this.loader = lastValueFrom(this.api.getConfig()).then(config => {
      return new Promise<void>((resolve, reject) => {
        if (window.google?.maps) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${config.googleMapsApiKey}&libraries=places`;
        script.async = true;
        script.onerror = () => reject(new Error('Failed to load Google Maps'));
        script.onload = () => resolve();
        document.body.appendChild(script);
      });
    });
    return this.loader;
  }

  async geocode(lat: number, lng: number): Promise<string | null> {
    await this.load();
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ location: { lat, lng } }, (results: any, status: string) => {
        if (status === 'OK' && results?.length) {
          resolve(results[0].formatted_address);
        } else {
          resolve(null);
        }
      });
    });
  }
}
