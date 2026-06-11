'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

// Premium "ease-out-expo"-style curve: fast start, long graceful settle.
const EASE = [0.16, 1, 0.3, 1] as const;
const OFFSET = 24; // subtle travel — pro sites move elements a little, not a lot

const offsetFor = (d: Direction) => {
  switch (d) {
    case 'up': return { y: OFFSET, x: 0 };
    case 'down': return { y: -OFFSET, x: 0 };
    case 'left': return { x: OFFSET, y: 0 };
    case 'right': return { x: -OFFSET, y: 0 };
    default: return { x: 0, y: 0 };
  }
};

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  direction?: Direction;
  className?: string;
  /** Subtle blur-in for a high-end feel. On by default; ignored under reduced motion. */
  blur?: boolean;
}

export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  className = '',
  blur = true,
}: FadeInProps) {
  const reduce = useReducedMotion();
  const off = reduce ? { x: 0, y: 0 } : offsetFor(direction);

  return (
    <motion.div
      initial={{ opacity: 0, ...off, filter: blur && !reduce ? 'blur(6px)' : 'blur(0px)' }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -80px 0px' }}
      transition={{ duration: reduce ? 0.2 : 0.7, delay: reduce ? 0 : delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Orchestrated reveal: wrap a group in <FadeInStagger> and each direct child in
 * <FadeInItem>. Children cascade in automatically — cleaner than hand-tuning a
 * `delay` per item, and the whole group shares one scroll trigger.
 */
export function FadeInStagger({
  children,
  className = '',
  stagger = 0.1,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2, margin: '0px 0px -80px 0px' }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: reduce ? 0 : stagger, delayChildren: reduce ? 0 : delay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function FadeInItem({
  children,
  className = '',
  direction = 'up',
  blur = true,
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
  blur?: boolean;
}) {
  const reduce = useReducedMotion();
  const off = reduce ? { x: 0, y: 0 } : offsetFor(direction);
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, ...off, filter: blur && !reduce ? 'blur(6px)' : 'blur(0px)' },
        show: {
          opacity: 1,
          x: 0,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: reduce ? 0.2 : 0.7, ease: EASE },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
