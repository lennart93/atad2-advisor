import { useState, useEffect, useRef } from 'react';

export function useDebounce<T>(value: T, delay: number): [T, () => void] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    cancel(); // Cancel any pending timeout
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(value);
      timeoutRef.current = null;
    }, delay);

    return cancel;
  }, [value, delay]);

  return [debouncedValue, cancel];
}