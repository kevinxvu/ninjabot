import { useEffect, useState } from 'react';
import { readStorage, writeStorage } from '@/lib/storage';

/** String state that is restored from and persisted to localStorage. */
export function useLocalStorageState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => readStorage(key) || defaultValue);

  useEffect(() => {
    writeStorage(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
