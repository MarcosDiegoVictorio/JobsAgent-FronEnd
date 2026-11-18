import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { JobApiService } from './services/job-api.service';
import { of } from 'rxjs';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{
        provide: JobApiService,
        useValue: { getGoogleAuthConfig: () => of({ googleClientId: '', inviteOnly: true }) }
      }]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the invite-only sign-in screen', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Bem-vindo ao JobAgent');
  });
});
