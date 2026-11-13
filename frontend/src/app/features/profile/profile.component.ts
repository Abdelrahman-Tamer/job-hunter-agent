import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { CandidateProfile } from '../../core/models/job.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="profile-view">
      <header class="profile-header">
        <h1>👤 Candidate Profile & Skills</h1>
        <p class="subtitle">
          Manage your verified baseline facts. Target skills do not earn confirmed points until verified.
        </p>
      </header>

      <div class="profile-layout">
        <!-- Main Profile Form -->
        <section class="panel profile-form">
          <h2>Core Candidate Facts</h2>

          <div class="form-row">
            <div class="form-group">
              <label>Base Country</label>
              <input type="text" [ngModel]="profile()?.country" readonly class="input-control readonly" />
            </div>
            <div class="form-group">
              <label>Priority Target Domain</label>
              <input type="text" [ngModel]="profile()?.priority_target" readonly class="input-control readonly" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>University / Education Institution</label>
              <input type="text" [(ngModel)]="educationInst" class="input-control" />
            </div>
            <div class="form-group">
              <label>Years of Professional Experience</label>
              <input type="number" [(ngModel)]="experienceYears" placeholder="Unknown / Null" class="input-control" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Degree Title (Kept null until confirmed)</label>
              <input type="text" [(ngModel)]="degreeTitle" placeholder="e.g. B.Sc. Computer Science" class="input-control" />
            </div>
            <div class="form-group">
              <label>Graduation Year</label>
              <input type="number" [(ngModel)]="gradYear" placeholder="e.g. 2026" class="input-control" />
            </div>
          </div>

          <div class="form-group">
            <label>LinkedIn URL</label>
            <input type="text" [(ngModel)]="linkedinUrl" class="input-control" />
          </div>

          <!-- Strict Skill Boundaries -->
          <div class="skills-section">
            <h3>Verified Confirmed Skills (Earns up to 25 pts)</h3>
            <p class="section-hint">Only add skills you have proven professional/portfolio proficiency in.</p>
            <div class="chips-container">
              <span *ngFor="let s of confirmedSkills(); let i = index" class="chip confirmed">
                {{ s }} <button (click)="removeSkill('confirmed', i)" class="remove-chip">&times;</button>
              </span>
            </div>
            <div class="add-skill-row">
              <input type="text" [(ngModel)]="newConfirmedSkill" placeholder="Add verified skill (e.g. TypeScript)..." class="input-control small" />
              <button (click)="addSkill('confirmed')" class="btn secondary-btn">Add Verified</button>
            </div>
          </div>

          <div class="skills-section">
            <h3>Target Skills (Learning / Desired Roles)</h3>
            <p class="section-hint">Skills you target or learn (e.g. Angular). Does not artificially inflate confirmed score.</p>
            <div class="chips-container">
              <span *ngFor="let s of targetSkills(); let i = index" class="chip target">
                {{ s }} <button (click)="removeSkill('target', i)" class="remove-chip">&times;</button>
              </span>
            </div>
            <div class="add-skill-row">
              <input type="text" [(ngModel)]="newTargetSkill" placeholder="Add target skill..." class="input-control small" />
              <button (click)="addSkill('target')" class="btn secondary-btn">Add Target</button>
            </div>
          </div>

          <div class="form-actions">
            <button (click)="saveProfile()" class="btn primary-btn">Save Changes</button>
            <button (click)="exportProfile()" class="btn secondary-btn">Export JSON</button>
          </div>
        </section>

        <!-- CV Import & Privacy Panel -->
        <section class="panel cv-import-panel">
          <h2>📄 Local CV Parser & Skill Verification</h2>
          <p class="panel-hint">
            Paste your CV text to extract skills locally. Personal identifiable information (email, phone, address) is automatically redacted.
          </p>

          <textarea
            [(ngModel)]="rawCvText"
            rows="8"
            placeholder="Paste your plain CV text here for local extraction..."
            class="textarea-control"
          ></textarea>

          <button (click)="parseCvLocally()" [disabled]="!rawCvText.trim()" class="btn primary-btn full-width">
            🔍 Parse CV Locally
          </button>

          <!-- Review Box -->
          <div *ngIf="parsedCvResult()" class="cv-review-card">
            <h4>Review Detected Skills Before Saving</h4>
            <div class="detected-chips">
              <span *ngFor="let s of parsedCvResult()?.detected_skills" class="chip detected">
                {{ s }}
              </span>
            </div>
            <button (click)="confirmDetectedSkills()" class="btn success-btn full-width">
              ✅ Confirm & Add to Confirmed Skills
            </button>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    .profile-view { display: flex; flex-direction: column; gap: 20px; }
    .profile-header h1 { margin: 0 0 4px 0; font-size: 1.5rem; color: #0f172a; }
    .subtitle { margin: 0; color: #64748b; font-size: 0.95rem; }

    .profile-layout {
      display: grid;
      grid-template-columns: 3fr 2fr;
      gap: 24px;
    }
    @media (max-width: 900px) {
      .profile-layout { grid-template-columns: 1fr; }
    }

    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 24px;
    }
    .panel h2 { margin: 0 0 16px 0; font-size: 1.2rem; color: #0f172a; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
    @media (max-width: 600px) { .form-row { grid-template-columns: 1fr; } }

    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .form-group label { font-size: 0.85rem; font-weight: 600; color: #475569; }
    .input-control {
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
    }
    .input-control.readonly { background: #f8fafc; color: #64748b; }
    .input-control.small { max-width: 260px; }

    .skills-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .skills-section h3 { margin: 0 0 4px 0; font-size: 0.95rem; color: #1e293b; }
    .section-hint { margin: 0 0 12px 0; font-size: 0.8rem; color: #64748b; }

    .chips-container { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .chip {
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .chip.confirmed { background: #dcfce7; color: #166534; font-weight: 600; }
    .chip.target { background: #dbeafe; color: #1e40af; font-weight: 600; }
    .chip.detected { background: #fef3c7; color: #92400e; font-weight: 600; }
    .remove-chip { background: none; border: none; cursor: pointer; font-size: 1rem; color: #64748b; line-height: 1; }

    .add-skill-row { display: flex; gap: 8px; }

    .form-actions { display: flex; gap: 12px; margin-top: 20px; }
    .btn { padding: 9px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.9rem; }
    .primary-btn { background: #2563eb; color: #fff; border: none; }
    .secondary-btn { background: #f1f5f9; border: 1px solid #cbd5e1; color: #1e293b; }
    .success-btn { background: #16a34a; color: #fff; border: none; margin-top: 12px; }
    .full-width { width: 100%; }

    .panel-hint { font-size: 0.85rem; color: #64748b; margin-bottom: 14px; }
    .textarea-control {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      font-family: inherit;
      font-size: 0.85rem;
      box-sizing: border-box;
      margin-bottom: 12px;
    }
    .cv-review-card {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      border-radius: 8px;
      padding: 14px;
      margin-top: 16px;
    }
    .cv-review-card h4 { margin: 0 0 10px 0; color: #92400e; font-size: 0.9rem; }
    .detected-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  `],
})
export class ProfileComponent implements OnInit {
  private readonly api = inject(ApiService);

  profile = signal<CandidateProfile | null>(null);
  confirmedSkills = signal<string[]>([]);
  targetSkills = signal<string[]>([]);

  educationInst: string = '';
  experienceYears: number | null = null;
  degreeTitle: string = '';
  gradYear: number | null = null;
  linkedinUrl: string = '';

  newConfirmedSkill: string = '';
  newTargetSkill: string = '';

  rawCvText: string = '';
  parsedCvResult = signal<any | null>(null);

  ngOnInit(): void {
    this.loadProfile();
  }

  loadProfile(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.confirmedSkills.set(p.confirmed_skills || []);
        this.targetSkills.set(p.target_skills || []);
        this.educationInst = p.education_institution || '';
        this.experienceYears = p.experience_years;
        this.degreeTitle = p.degree_title || '';
        this.gradYear = p.graduation_year;
        this.linkedinUrl = p.linkedin_url || '';
      },
    });
  }

  addSkill(type: 'confirmed' | 'target'): void {
    if (type === 'confirmed' && this.newConfirmedSkill.trim()) {
      this.confirmedSkills.update((list) => [...list, this.newConfirmedSkill.trim()]);
      this.newConfirmedSkill = '';
    } else if (type === 'target' && this.newTargetSkill.trim()) {
      this.targetSkills.update((list) => [...list, this.newTargetSkill.trim()]);
      this.newTargetSkill = '';
    }
  }

  removeSkill(type: 'confirmed' | 'target', index: number): void {
    if (type === 'confirmed') {
      this.confirmedSkills.update((list) => list.filter((_, i) => i !== index));
    } else {
      this.targetSkills.update((list) => list.filter((_, i) => i !== index));
    }
  }

  saveProfile(): void {
    this.api
      .updateProfile({
        education_institution: this.educationInst,
        experience_years: this.experienceYears,
        degree_title: this.degreeTitle || null,
        graduation_year: this.gradYear,
        linkedin_url: this.linkedinUrl,
        confirmed_skills: this.confirmedSkills(),
        target_skills: this.targetSkills(),
      })
      .subscribe({
        next: () => alert('Profile updated successfully!'),
      });
  }

  exportProfile(): void {
    this.api.getProfile().subscribe({
      next: (p) => {
        const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'candidate-profile.json';
        a.click();
      },
    });
  }

  parseCvLocally(): void {
    this.api.importCvLocally(this.rawCvText).subscribe({
      next: (res) => this.parsedCvResult.set(res),
    });
  }

  confirmDetectedSkills(): void {
    const detected = this.parsedCvResult()?.detected_skills || [];
    const current = new Set(this.confirmedSkills());
    detected.forEach((s: string) => current.add(s));
    this.confirmedSkills.set(Array.from(current));
    this.parsedCvResult.set(null);
    this.rawCvText = '';
  }
}
