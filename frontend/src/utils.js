export default {
  Limiter: (concurrency, promiseList) => {
    if (!promiseList || promiseList.length === 0) {
      return Promise.resolve([]); // Return a resolved empty array if no promises
    }

    let index = 0; // Keeps track of the current promise to be processed
    const results = []; // Stores the results of all promises
    const totalPromises = promiseList.length;

    // Helper function to process promises one by one, respecting concurrency
    const processNext = () => {
      // If we've processed all promises, resolve with the results
      if (index >= totalPromises) {
        return Promise.all(results);
      }

      // Execute the current promise and store the result
      const currentPromise = promiseList[index]();
      results.push(currentPromise);

      // Once the current promise resolves, move on to the next one
      return currentPromise.then(() => {
        index++; // Move to the next promise
        return processNext(); // Process the next promise
      });
    };

    // Start processing promises up to the given concurrency
    const concurrencyPromises = [];
    for (let i = 0; i < concurrency && i < totalPromises; i++) {
      concurrencyPromises.push(processNext());
    }

    // Wait for all promises to resolve
    return Promise.all(concurrencyPromises).then(() => results);
  }
}
