import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

interface Dot {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  highlight: number; // 0 to 1 for glow & scale on hover
  phase: number;
}

@Component({
  selector: 'app-antigravity-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <canvas #canvas class="antigravity-canvas" aria-hidden="true"></canvas>
  `,
  styles: [`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    .antigravity-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
})
export class AntigravityCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private readonly ngZone = inject(NgZone);
  private readonly theme = inject(ThemeService);

  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private dots: Dot[] = [];
  private width = 0;
  private height = 0;
  private dpr = 1;

  // Pointer tracking
  private mouseX = -9999;
  private mouseY = -9999;
  private targetMouseX = -9999;
  private targetMouseY = -9999;
  private isPointerInside = false;

  private isTabVisible = true;
  private prefersReducedMotion = false;
  private time = 0;

  private readonly boundResize = () => this.resize();
  private readonly boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private readonly boundPointerLeave = () => this.onPointerLeave();
  private readonly boundTouchMove = (e: TouchEvent) => this.onTouchMove(e);
  private readonly boundTouchEnd = () => this.onPointerLeave();
  private readonly boundVisibility = () => this.onVisibilityChange();

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;

    this.prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: true });

    this.resize();

    // Run animation and pointer listeners outside Angular change detection zone
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', this.boundResize, { passive: true });
      window.addEventListener('pointermove', this.boundPointerMove, { passive: true });
      window.addEventListener('pointerleave', this.boundPointerLeave, { passive: true });
      window.addEventListener('touchmove', this.boundTouchMove, { passive: true });
      window.addEventListener('touchend', this.boundTouchEnd, { passive: true });
      window.addEventListener('touchcancel', this.boundTouchEnd, { passive: true });
      document.addEventListener('visibilitychange', this.boundVisibility);

      if (!this.prefersReducedMotion) {
        this.loop();
      } else {
        this.drawStaticGrid();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.boundResize);
      window.removeEventListener('pointermove', this.boundPointerMove);
      window.removeEventListener('pointerleave', this.boundPointerLeave);
      window.removeEventListener('touchmove', this.boundTouchMove);
      window.removeEventListener('touchend', this.boundTouchEnd);
      window.removeEventListener('touchcancel', this.boundTouchEnd);
      document.removeEventListener('visibilitychange', this.boundVisibility);
    }
  }

  private resize(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    canvas.width = Math.floor(this.width * this.dpr);
    canvas.height = Math.floor(this.height * this.dpr);

    if (this.ctx) {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    this.initDotGrid();
  }

  private initDotGrid(): void {
    const isMobile = this.width < 768;
    // Spacing: 32px on wide desktop, 26px on mobile
    const gap = isMobile ? 26 : 32;
    const cols = Math.ceil(this.width / gap) + 1;
    const rows = Math.ceil(this.height / gap) + 1;

    const offsetX = (this.width - (cols - 1) * gap) / 2;
    const offsetY = (this.height - (rows - 1) * gap) / 2;

    this.dots = [];
    const baseRadius = isMobile ? 1.15 : 1.35;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = offsetX + c * gap;
        const oy = offsetY + r * gap;
        this.dots.push({
          originX: ox,
          originY: oy,
          x: ox,
          y: oy,
          vx: 0,
          vy: 0,
          baseRadius,
          highlight: 0,
          phase: (ox * 0.015 + oy * 0.02) % (Math.PI * 2),
        });
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    this.targetMouseX = e.clientX;
    this.targetMouseY = e.clientY;
    this.isPointerInside = true;
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches && e.touches.length > 0) {
      this.targetMouseX = e.touches[0].clientX;
      this.targetMouseY = e.touches[0].clientY;
      this.isPointerInside = true;
    }
  }

  private onPointerLeave(): void {
    this.isPointerInside = false;
    this.targetMouseX = -9999;
    this.targetMouseY = -9999;
  }

  private onVisibilityChange(): void {
    this.isTabVisible = !document.hidden;
    if (this.isTabVisible && !this.animFrameId && !this.prefersReducedMotion) {
      this.loop();
    } else if (!this.isTabVisible && this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private loop(): void {
    if (!this.isTabVisible || this.prefersReducedMotion) {
      this.animFrameId = null;
      return;
    }

    this.time += 1;
    this.updatePhysics();
    this.drawFrame();

    this.animFrameId = requestAnimationFrame(() => this.loop());
  }

  private updatePhysics(): void {
    // Smooth mouse interpolation for liquid feel
    if (this.isPointerInside) {
      this.mouseX += (this.targetMouseX - this.mouseX) * 0.25;
      this.mouseY += (this.targetMouseY - this.mouseY) * 0.25;
    } else {
      this.mouseX = -9999;
      this.mouseY = -9999;
    }

    const isMobile = this.width < 768;
    const repulsionRadius = isMobile ? 95 : 135;
    const repulsionRadiusSq = repulsionRadius * repulsionRadius;
    const maxRepulsionForce = isMobile ? 4.2 : 6.0;

    // Physics parameters for organic spring
    const springK = 0.042;
    const damping = 0.86;

    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];

      // 1. Subtle idle harmonic breath so it stays alive
      const idleWaveY = Math.sin(this.time * 0.02 + dot.phase) * 0.5;
      const targetOriginY = dot.originY + idleWaveY;

      // 2. Mouse Repulsion Force
      if (this.isPointerInside) {
        const dx = dot.x - this.mouseX;
        const dy = dot.y - this.mouseY;
        const distSq = dx * dx + dy * dy;

        if (distSq < repulsionRadiusSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          // Inverse non-linear falloff
          const factor = Math.pow(1 - dist / repulsionRadius, 1.6);
          const force = factor * maxRepulsionForce;

          dot.vx += (dx / dist) * force;
          dot.vy += (dy / dist) * force;

          // Boost highlight
          dot.highlight = Math.max(dot.highlight, factor);
        }
      }

      // 3. Hooke's Law Spring Return to Origin
      const ax = (dot.originX - dot.x) * springK;
      const ay = (targetOriginY - dot.y) * springK;

      dot.vx = (dot.vx + ax) * damping;
      dot.vy = (dot.vy + ay) * damping;

      dot.x += dot.vx;
      dot.y += dot.vy;

      // Decay highlight smoothly
      dot.highlight *= 0.91;
    }
  }

  private drawFrame(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.width, this.height);

    const isDark = this.theme.isDark();

    // Palette values based on current theme
    // Dark: slate-500 base dots, electric cyan-blue on hover
    // Light: slate-400 base dots, cobalt-blue on hover
    const baseR = isDark ? 148 : 100;
    const baseG = isDark ? 163 : 116;
    const baseB = isDark ? 184 : 139;
    const baseAlpha = isDark ? 0.17 : 0.15;

    const activeR = isDark ? 96 : 37;
    const activeG = isDark ? 165 : 99;
    const activeB = isDark ? 250 : 235;

    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];
      const h = dot.highlight;

      // Interpolate radius: slightly expands when near mouse
      const r = dot.baseRadius + h * 1.1;

      // Interpolate color and alpha
      let color: string;
      if (h > 0.02) {
        const curR = Math.round(baseR + (activeR - baseR) * h);
        const curG = Math.round(baseG + (activeG - baseG) * h);
        const curB = Math.round(baseB + (activeB - baseB) * h);
        const alpha = Math.min(baseAlpha + h * (isDark ? 0.65 : 0.6), 0.85);
        color = `rgba(${curR}, ${curG}, ${curB}, ${alpha})`;
      } else {
        color = `rgba(${baseR}, ${baseG}, ${baseB}, ${baseAlpha})`;
      }

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  private drawStaticGrid(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.width, this.height);
    const isDark = this.theme.isDark();
    ctx.fillStyle = isDark ? 'rgba(148, 163, 184, 0.17)' : 'rgba(100, 116, 139, 0.15)';

    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];
      ctx.beginPath();
      ctx.arc(dot.originX, dot.originY, dot.baseRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
