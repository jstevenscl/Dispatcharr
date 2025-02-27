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
