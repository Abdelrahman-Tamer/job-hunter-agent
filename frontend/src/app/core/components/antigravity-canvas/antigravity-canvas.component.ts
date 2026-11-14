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

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  alpha: number;
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

  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private mouseX = -9999;
  private mouseY = -9999;
  private isTabVisible = true;
  private prefersReducedMotion = false;

  private readonly boundResize = () => this.resize();
  private readonly boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private readonly boundMouseLeave = () => this.onMouseLeave();
  private readonly boundVisibility = () => this.onVisibilityChange();

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;

    this.prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: true });

    this.resize();
    this.initParticles();

    // Run outside Angular change detection zone for 60fps performance
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', this.boundResize, { passive: true });
      window.addEventListener('mousemove', this.boundMouseMove, { passive: true });
      window.addEventListener('mouseleave', this.boundMouseLeave, { passive: true });
      document.addEventListener('visibilitychange', this.boundVisibility);

      if (!this.prefersReducedMotion) {
        this.loop();
      } else {
        this.renderStaticFrame();
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
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('mouseleave', this.boundMouseLeave);
      document.removeEventListener('visibilitychange', this.boundVisibility);
    }
  }

  private resize(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    canvas.width = Math.floor(this.width * dpr);
    canvas.height = Math.floor(this.height * dpr);

    if (this.ctx) {
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (this.particles.length === 0) {
      this.initParticles();
    }
  }

  private initParticles(): void {
    const isMobile = this.width < 768;
    const count = isMobile ? 24 : Math.min(54, Math.floor((this.width * this.height) / 25000));
    this.particles = [];

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        baseRadius: 1.2 + Math.random() * 1.4,
        alpha: 0.18 + Math.random() * 0.32,
      });
    }
  }

  private onMouseMove(e: MouseEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
  }

  private onMouseLeave(): void {
    this.mouseX = -9999;
    this.mouseY = -9999;
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

    this.drawFrame();
    this.animFrameId = requestAnimationFrame(() => this.loop());
  }

  private renderStaticFrame(): void {
    this.drawFrame();
  }

  private drawFrame(): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, this.width, this.height);

    const maxDist = 130;
    const mouseRadius = 140;

    // 1. Update and draw particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      if (!this.prefersReducedMotion) {
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around bounds softly
        if (p.x < -10) p.x = this.width + 10;
        else if (p.x > this.width + 10) p.x = -10;
        if (p.y < -10) p.y = this.height + 10;
        else if (p.y > this.height + 10) p.y = -10;

        // Gentle interactive mouse deflection
        const dx = p.x - this.mouseX;
        const dy = p.y - this.mouseY;
        const distToMouse = Math.sqrt(dx * dx + dy * dy);

        if (distToMouse < mouseRadius && distToMouse > 0) {
          const force = (1 - distToMouse / mouseRadius) * 0.8;
          p.x += (dx / distToMouse) * force;
          p.y += (dy / distToMouse) * force;
        }
      }

      // Draw particle dot with subtle glowing tint
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56, 189, 248, ${p.alpha})`;
      ctx.fill();

      // Draw constellation connections to nearby nodes
      for (let j = i + 1; j < this.particles.length; j++) {
        const p2 = this.particles[j];
        const cdx = p.x - p2.x;
        const cdy = p.y - p2.y;
        const dist = Math.sqrt(cdx * cdx + cdy * cdy);

        if (dist < maxDist) {
          const lineAlpha = (1 - dist / maxDist) * 0.14;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(56, 189, 248, ${lineAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
  }
}
