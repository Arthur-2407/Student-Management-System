
declare module 'framer-motion' {
  import * as React from 'react';

  type MotionProps = {
    initial?: Record<string, unknown>;
    animate?: Record<string, unknown>;
    exit?: Record<string, unknown>;
    transition?: Record<string, unknown>;
    variants?: Record<string, unknown>;
    whileHover?: Record<string, unknown>;
    whileTap?: Record<string, unknown>;
    whileInView?: Record<string, unknown>;
    className?: string;
    style?: React.CSSProperties;
    onClick?: React.MouseEventHandler;
    [key: string]: unknown;
  };

  type MotionComponent<T extends keyof JSX.IntrinsicElements> = React.ForwardRefExoticComponent<
    MotionProps & JSX.IntrinsicElements[T]
  >;

  type MotionFactory = {
    [K in keyof JSX.IntrinsicElements]: MotionComponent<K>;
  };

  export const motion: MotionFactory;
  export const AnimatePresence: React.FC<{
    children?: React.ReactNode;
    mode?: 'wait' | 'sync' | 'popLayout';
  }>;
  export function useAnimation(): unknown;
  export function useMotionValue(initial: number): unknown;
  export function useTransform(...args: unknown[]): unknown;
  export function useSpring(source: unknown, config?: unknown): unknown;
  export function useScroll(options?: unknown): unknown;
  export function useInView(ref: React.RefObject<Element>, options?: unknown): boolean;
  export default motion;
}


// NodeJS namespace for Timeout
declare namespace NodeJS {
  interface Timeout {}
}

// Global JSX intrinsic elements fallback
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elem: string]: any;
    }
  }
}
