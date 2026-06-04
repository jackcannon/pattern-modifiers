import { useLayoutEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

export const useWindowSize = () => {
  const [windowSize, setWindowSizeNow] = useState([window.innerWidth, window.innerHeight]);

  const setWindowSize = useDebouncedCallback((value: number[]) => setWindowSizeNow(value), 200, { leading: true });

  useLayoutEffect(() => {
    function updateSize() {
      if (window.innerWidth !== windowSize[0] || window.innerHeight !== windowSize[1]) {
        setWindowSize([window.innerWidth, window.innerHeight]);

        setTimeout(() => {
          setWindowSizeNow([window.innerWidth, window.innerHeight]);
        }, 25);
      }
    }
    window.addEventListener('resize', updateSize);
    updateSize();
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return windowSize;
};
