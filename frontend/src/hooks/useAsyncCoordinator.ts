import { useEffect, useRef } from 'react';
import { asyncCoordinator } from '@services/asyncCoordinator';

/**
 * Hook to utilize the Global Async Coordinator in a React component lifecycle.
 * Automatically drains and aborts all registered async tasks for the given domain
 * when the component unmounts.
 */
export function useAsyncCoordinator(domain: string) {
  const domainRef = useRef(domain);
  domainRef.current = domain;

  useEffect(() => {
    return () => {
      console.log(`[useAsyncCoordinator] Component unmounted. Draining tasks for domain: ${domainRef.current}`);
      asyncCoordinator.cancel(domainRef.current);
    };
  }, []);

  return asyncCoordinator;
}

export default useAsyncCoordinator;
