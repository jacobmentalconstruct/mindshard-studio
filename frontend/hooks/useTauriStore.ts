
import { useState, useEffect, useCallback } from 'react';

// This is a mock for the Tauri store plugin.
// In a real Tauri app, you would use:
// import { Store } from "tauri-plugin-store-api";
// const store = new Store(".settings.dat");

// For now, we'll use localStorage to simulate the behavior.
const store = {
  async set(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("Failed to set item in mock store:", error);
    }
  },
  async get<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error("Failed to get item from mock store:", error);
      return null;
    }
  },
  async save(): Promise<void> {
    // In the real plugin, this saves to disk. Here it's a no-op.
  }
};


function useTauriStore<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Load initial value from store
  useEffect(() => {
    let isMounted = true;
    store.get<T>(key).then(value => {
      if (isMounted && value !== null) {
        setStoredValue(value);
      }
    });
    return () => { isMounted = false; };
  }, [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    store.set(key, valueToStore).then(() => {
        // In a real tauri app, you might want to call store.save() here
        // depending on your desired save frequency.
    });
  }, [key, storedValue]);

  return [storedValue, setValue];
}

export default useTauriStore;
