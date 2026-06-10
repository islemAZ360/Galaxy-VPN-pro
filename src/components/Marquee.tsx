// @ts-nocheck
'use client';

import { useRef, useEffect, ReactNode } from 'react';
import './Marquee.css';

interface MarqueeProps {
  children: ReactNode;
  speed?: number;
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
  className?: string;
}

export default function Marquee({
  children,
  speed = 30,
  direction = 'left',
  pauseOnHover = true,
  className = '',
}: MarqueeProps) {
  return (
    <div
      className={`marquee-container ${pauseOnHover ? 'marquee-pause-hover' : ''} ${className}`}
    >
      <div
        className="marquee-track"
        style={{
          animationDuration: `${speed}s`,
          animationDirection: direction === 'right' ? 'reverse' : 'normal',
        }}
      >
        <div className="marquee-content">{children}</div>
        <div className="marquee-content" aria-hidden>{children}</div>
      </div>
    </div>
  );
}
