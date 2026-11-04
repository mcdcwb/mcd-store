import assert from "node:assert/strict";
import { test } from "node:test";
import { logCarouselInitializationFailure, startCarouselInitialization } from "../src/lib/carousel-initialization.js";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function scheduler() {
    let nextId = 0;
    const pending = new Map<number, { callback: () => void; delayMs: number }>();
    return {
        pending,
        setTimer(callback: () => void, delayMs: number) {
            const id = ++nextId;
            pending.set(id, { callback, delayMs });
            return id as ReturnType<typeof setTimeout>;
        },
        clearTimer(id: ReturnType<typeof setTimeout>) { pending.delete(id as number); },
        runNext() {
            const entry = pending.entries().next().value as [number, { callback: () => void; delayMs: number }] | undefined;
            assert.ok(entry, "expected scheduled retry");
            pending.delete(entry[0]);
            entry[1].callback();
            return entry[1].delayMs;
        }
    };
}

const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

test("failure diagnostics omit error messages and secret-bearing names", () => {
    const original = console.error;
    let output = "";
    console.error = (...args: unknown[]) => { output = args.map(value => typeof value === "string" ? value : JSON.stringify(value)).join(" "); };
    try {
        const error = new Error("postgres://user:secret@host/db token=hidden");
        error.name = "Bearer secret-token";
        logCarouselInitializationFailure(error, 1_000);
    } finally {
        console.error = original;
    }
    assert.match(output, /Carousel initialization failed/);
    assert.match(output, /retryInMs/);
    assert.doesNotMatch(output, /secret|token=hidden|postgres:\/\//i);
});

test("a failed initialization logs safe diagnostics and retries with capped backoff until success", async () => {
    const clock = scheduler();
    const failures: { error: unknown; delay: number }[] = [];
    let attempts = 0;
    let successes = 0;
    const secretError = new Error("postgres://user:secret@host/database token=hidden");
    const recovery = startCarouselInitialization({
        initialize: async () => { attempts += 1; if (attempts <= 3) throw secretError; },
        onFailure: (error, delay) => failures.push({ error, delay }),
        onSuccess: () => { successes += 1; },
        setTimer: clock.setTimer,
        clearTimer: clock.clearTimer,
        initialDelayMs: 10,
        maxDelayMs: 25
    });
    await flush();
    assert.equal(attempts, 1);
    assert.deepEqual(failures.map(item => item.delay), [10]);
    assert.equal(clock.runNext(), 10);
    await flush();
    assert.equal(clock.runNext(), 20);
    await flush();
    assert.equal(clock.runNext(), 25);
    await flush();
    assert.equal(recovery.completed, true);
    assert.equal(successes, 1);
    assert.equal(clock.pending.size, 0);
    await flush();
    assert.equal(attempts, 4);
    assert.ok(failures.every(item => item.error === secretError));
});

test("concurrent triggers do not overlap initialization calls", async () => {
    const clock = scheduler();
    const first = deferred<void>();
    let calls = 0;
    let active = 0;
    let maxActive = 0;
    const recovery = startCarouselInitialization({
        initialize: async () => {
            calls += 1; active += 1; maxActive = Math.max(active, maxActive);
            if (calls === 1) await first.promise;
            active -= 1;
        },
        onFailure: () => {}, onSuccess: () => {},
        setTimer: clock.setTimer, clearTimer: clock.clearTimer
    });
    await flush();
    first.resolve();
    await flush();
    assert.equal(calls, 1);
    assert.equal(maxActive, 1);
    assert.equal(recovery.completed, true);
});

test("stopping cancels a pending retry and prevents another attempt", async () => {
    const clock = scheduler();
    let calls = 0;
    const recovery = startCarouselInitialization({
        initialize: async () => { calls += 1; throw new Error("offline"); },
        onFailure: () => {}, onSuccess: () => {},
        setTimer: clock.setTimer, clearTimer: clock.clearTimer
    });
    await flush();
    assert.equal(clock.pending.size, 1);
    recovery.stop();
    assert.equal(clock.pending.size, 0);
    await flush();
    assert.equal(calls, 1);
});

test("stopping during an in-flight attempt prevents success callbacks and retry scheduling", async () => {
    const clock = scheduler();
    const attempt = deferred<void>();
    let successes = 0;
    const recovery = startCarouselInitialization({
        initialize: () => attempt.promise,
        onFailure: () => {}, onSuccess: () => { successes += 1; },
        setTimer: clock.setTimer, clearTimer: clock.clearTimer
    });
    recovery.stop();
    attempt.resolve();
    await flush();
    assert.equal(recovery.completed, false);
    assert.equal(successes, 0);
    assert.equal(clock.pending.size, 0);
});
