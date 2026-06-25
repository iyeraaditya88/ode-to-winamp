'use client';

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';

interface LogoIntroProps {
  onComplete: () => void;
}

const SPARK_COUNT = 12;

export default function LogoIntro({ onComplete }: LogoIntroProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const sparksRef = useRef<HTMLDivElement[]>([]);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const tl = gsap.timeline({
      onComplete,
    });

    gsap.set(logoRef.current, { scale: 0.3, opacity: 0 });
    gsap.set(overlayRef.current, { opacity: 1 });

    tl.to(logoRef.current, {
      scale: 1,
      opacity: 1,
      duration: 0.8,
      ease: 'power2.out',
    })
      .to(logoRef.current, {
        rotation: 720,
        duration: 1.4,
        ease: 'power2.inOut',
      })
      .to(
        sparksRef.current,
        {
          x: (i) => Math.cos((i / SPARK_COUNT) * Math.PI * 2) * 160,
          y: (i) => Math.sin((i / SPARK_COUNT) * Math.PI * 2) * 160,
          scale: 0,
          opacity: 0,
          duration: 0.6,
          stagger: 0.04,
          ease: 'power2.out',
        },
        '-=1.0'
      )
      .to(logoRef.current, {
        scale: 18,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in',
      })
      .to(
        overlayRef.current,
        {
          opacity: 0,
          duration: 0.4,
        },
        '-=0.3'
      );

    return () => {
      tl.kill();
    };
  }, [onComplete]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#080808]"
    >
      <div className="relative flex items-center justify-center">
        {Array.from({ length: SPARK_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              if (el) sparksRef.current[i] = el;
            }}
            className="absolute h-2 w-2 rounded-full bg-[#00b4b4]"
            style={{
              boxShadow: '0 0 6px 2px #00b4b4',
            }}
          />
        ))}
        <div ref={logoRef} className="relative">
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="40" cy="40" r="38" stroke="#00b4b4" strokeWidth="2" opacity="0.3" />
            <circle cx="40" cy="40" r="28" stroke="#00b4b4" strokeWidth="1" opacity="0.2" />
            <circle cx="40" cy="40" r="10" fill="#00b4b4" opacity="0.9" />
            <path
              d="M14 52 L22 28 L30 44 L40 24 L50 44 L58 28 L66 52"
              stroke="#00b4b4"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(0,180,180,0.15) 0%, transparent 70%)',
              filter: 'blur(8px)',
            }}
          />
        </div>
      </div>
      <div className="absolute bottom-1/3 text-[10px] tracking-[0.4em] text-[#00b4b4] opacity-40 font-mono uppercase">
        Ode to Winamp
      </div>
    </div>
  );
}
