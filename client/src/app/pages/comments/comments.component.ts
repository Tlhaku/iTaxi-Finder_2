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
        <h2 class="section-title">Community feedback</h2>
        <p class="section-subtitle">
          Visitor comments will appear here once we enable public reviews. Leave your email to stay in the loop.
        </p>
        <div class="card placeholder">
          <p>No comments yet. Be the first to share your BasaGas experience.</p>
        </div>
      </div>
    </section>
  `
})
export class VisitorCommentsComponent {}
