export type CallBack<Args extends unknown[], V = void> = (...args: Args) => V;

export type CallBackSet = Set<CallBack<unknown[]>>;

class EventLite {
  doMap = new Map<unknown, CallBackSet>();

  constructor() {}

  on<Args extends unknown[], E>(
    event: E,
    genFn: (eventWatcher: EventWatcher<Args, E>) => CallBack<Args>
  ) {
    return new EventWatcher(this, event, genFn).start();
  }

  remove<Args extends unknown[], E>(
    event: E | undefined,
    fn: CallBack<Args> | undefined
  ) {
    if (event && fn) {
      const callBackSet = this.doMap.get(event);
      if (callBackSet) {
        callBackSet.delete(fn);
        if (!callBackSet.size) {
          this.doMap.delete(event);
        }
      }
    } else if (fn) {
      [...this.doMap.entries()].forEach(([eventKey, callBackSet]) => {
        callBackSet.delete(fn);
        if (!callBackSet.size) {
          this.doMap.delete(eventKey);
        }
      });
    } else if (event) {
      this.doMap.delete(event);
    }

    return this;
  }

  emit<Args extends unknown[], E>(event: E, ...args: Args) {
    this.doMap.get(event)?.forEach((fn) => {
      fn(...args);
    });
    return this;
  }

  promise<E>(this: EventLite, event: E, timeout: number = -1) {
    return <Args extends unknown[]>() => {
      return new Promise<Args>((resolve, reject) => {
        if (timeout >= 0) {
          const h = setTimeout(() => {
            watcher.cancal();
            reject("timeout");
          }, timeout);
          const watcher = new EventWatcher(this, event, (watcher) => {
            return (...args: Args) => {
              clearTimeout(h);
              resolve(args);
              watcher.cancal();
            };
          });
        } else {
          const watcher = new EventWatcher(this, event, (watcher) => {
            return (...args: Args) => {
              resolve(args);
              watcher.cancal();
            };
          });
        }
      });
    };
  }

  pipe<Args extends unknown[], V, E, F>(
    this: EventLite,
    event: E,
    fn: CallBack<Args, V>,
    follow: F
  ) {
    const watcher = new EventWatcher(this, event, (watcher) => {
      return (...args: Args) => {
        const value = fn(...args);
        watcher.eventLite.emit(follow, value);
      };
    });

    return this;
  }

  connect<Args extends unknown[], E = unknown>(
    this: EventLite,
    event: E,
    eventLite = new EventLite()
  ) {
    const watcher = new EventWatcher(eventLite, event, (watcher) => {
      return (...args: Args) => {
        watcher.emit(...args);
      };
    });

    return this;
  }

  async *asyncIterable<Args extends unknown[], R = unknown, E = unknown>(
    this: EventLite,
    event: E
  ) {
    type MyAsyncIterator = {
      cancel: (reason: R) => void;
      args: Args;
    };

    let resolverPool: [
      (myAsyncIterator: MyAsyncIterator) => void,
      (reason: R) => void
    ][] = [];
    const argsPool: Args[] = [];

    const watcher = new EventWatcher(this, event, (watcher) => {
      return (...args: Args) => {
        argsPool.push(args);
        deal();
      };
    });

    let status = true;

    const cancel = (reason: R) => {
      status = false;
      watcher.cancal();
      deal();

      resolverPool.forEach(([resolve, reject]) => {
        reject(reason);
      });

      resolverPool.length = 0;
      argsPool.length = 0;
    };

    const deal = () => {
      while (resolverPool.length && argsPool.length) {
        const [resolve, reject] = resolverPool.shift();
        const args = argsPool.shift();
        resolve({
          args,
          cancel,
        });
      }
    };

    while (status) {
      yield new Promise<MyAsyncIterator>((rsolve, reject) => {
        resolverPool.push([rsolve, reject]);
        deal();
      });
    }
  }
}

class EventWatcher<Args extends unknown[], E> {
  fn: CallBack<Args>;
  constructor(
    public eventLite: EventLite,
    public event: E,
    genFn: (eventWatcher: EventWatcher<Args, E>) => CallBack<Args>
  ) {
    this.fn = genFn(this);
  }

  start() {
    const doMap = this.eventLite.doMap;
    let callBackSet: CallBackSet;
    if (!(callBackSet = doMap.get(this.event))) {
      doMap.set(this.event, (callBackSet = new Set([])));
    }

    callBackSet.add(this.fn);
    return this;
  }

  cancal() {
    this.eventLite.remove(this.event, this.fn);
    return this;
  }

  emit(...args: Args) {
    this.eventLite.emit(this.event, ...args);
    return this;
  }
}

const eventLite = new EventLite();

// once
eventLite.on("eat", (watcher) => {
  return () => {
    console.log("only eat once");
    watcher.cancal();
  };
});
// on
eventLite.on("eat", (watcher) => {
  return () => {
    console.log("eat");
  };
});
