// Clear service worker and cache for debugging React issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      console.log('🧹 Unregistering service worker:', registration);
      registration.unregister();
    });
  });
}

// Clear all caches
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => {
      console.log('🧹 Deleting cache:', name);
      caches.delete(name);
    });
  });
}

console.log('🧹 Cache clearing complete. Please refresh the page.');