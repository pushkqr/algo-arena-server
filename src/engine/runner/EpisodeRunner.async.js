function createAbortError() {
  const err = new Error("aborted");
  err.name = "AbortError";
  return err;
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw createAbortError();
  }
}

function timeoutPromise(promise, ms) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("timeout"));
      }
    }, ms);
    Promise.resolve(promise)
      .then((value) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch((err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

function raceWithAbort(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise)
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

async function safeCallWithAbort(fnPromiseLike, timeoutMs, signal) {
  return raceWithAbort(
    timeoutPromise(Promise.resolve(fnPromiseLike), timeoutMs),
    signal,
  );
}

module.exports = {
  createAbortError,
  throwIfAborted,
  timeoutPromise,
  raceWithAbort,
  safeCallWithAbort,
};
