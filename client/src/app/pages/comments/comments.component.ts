import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-visitor-comments',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./comments.component.scss'],
  template: `
    <section class="page-section">
      <div class="container">
        <h2 class="section-title">Love notes from our wearers</h2>
        <p class="section-subtitle">
          We’re gathering stories as the Kninz pieces go out into the world. Watch this space for real photos and feedback.
        </p>
        <div class="card placeholder">
          <p>Be the first to share how you style your Kninz poncho, scarf, or hat.</p>
        </div>
      </div>
    </section>
  `
})
export class VisitorCommentsComponent {}
