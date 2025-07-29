
import { useState, useEffect } from 'react';

function useLocalStorage<T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.log(error);
    }
  };
  
  // This is not what we want, we just need to use a setter
  // useEffect(() => {
  //   try {
  //     window.localStorage.setItem(key, JSON.stringify(storedValue));
  //   } catch (error) {
  //     console.log(error);
  //   }
  // }, [key, storedValue]);

  return [storedValue, setValue];
}

export default useLocalStorage;
