import '@testing-library/jest-dom';

if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      clear: () => store.clear(),
      removeItem: (key) => store.delete(key),
    },
    writable: true,
  });
}

if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    clear: () => store.clear(),
    removeItem: (key) => store.delete(key),
  };
}
