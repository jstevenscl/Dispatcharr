import React, { useState, useEffect } from 'react';

export default {
  Limiter: (n, list) => {
    if (!list || !list.length) {
      return;
    }

    var tail = list.splice(n);
    var head = list;
    var resolved = [];
    var processed = 0;

    return new Promise(function (resolve) {
      head.forEach(function (x) {
        var res = x();
        resolved.push(res);
        res.then(function (y) {
          runNext();
          return y;
        });
      });
      function runNext() {
        if (processed == tail.length) {
          resolve(Promise.all(resolved));
        } else {
          resolved.push(
            tail[processed]().then(function (x) {
              runNext();
              return x;
            })
          );
          processed++;
        }
      }
    });
  },
};

// Custom debounce hook
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler); // Cleanup timeout on unmount or value change
  }, [value, delay]);

  return debouncedValue;
}

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
