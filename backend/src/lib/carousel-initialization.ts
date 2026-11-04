export interface CarouselInitializationOptions {
    initialize: () => Promise<unknown>;
    onFailure: (error: unknown, retryInMs: number) => void;
    onSuccess: () => void;
    setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
    initialDelayMs?: number;
    maxDelayMs?: number;
}

export function logCarouselInitializationFailure(error: unknown, retryInMs: number): void {
    const knownErrorNames = new Set([
        "Error", "TypeError", "RangeError", "PrismaClientKnownRequestError",
        "PrismaClientUnknownRequestError", "PrismaClientInitializationError"
    ]);
    const rawName = error instanceof Error ? error.name : "unknown";
    const errorType = knownErrorNames.has(rawName) ? rawName : "unknown";
    const rawCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : "";
    const errorCode = rawCode.match(/^(?:P\d{4}|[A-Z][0-9A-Z]{4,9})$/)?.[0];
    console.error("Carousel initialization failed; retry scheduled.", {
        errorType,
        ...(errorCode ? { errorCode } : {}),
        retryInMs
    });
}

export function startCarouselInitialization(options: CarouselInitializationOptions) {
    const setTimer = options.setTimer ?? setTimeout;
    const clearTimer = options.clearTimer ?? clearTimeout;
    const initialDelayMs = options.initialDelayMs ?? 1_000;
    const maxDelayMs = options.maxDelayMs ?? 60_000;
    let stopped = false;
    let completed = false;
    let running = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
        if (stopped || completed || running) return;
        running = true;
        try {
            await options.initialize();
            if (!stopped) {
                completed = true;
                options.onSuccess();
            }
        } catch (error) {
            if (!stopped) {
                const retryInMs = Math.min(initialDelayMs * 2 ** attempt, maxDelayMs);
                attempt += 1;
                options.onFailure(error, retryInMs);
                timer = setTimer(() => {
                    timer = undefined;
                    void run();
                }, retryInMs) as ReturnType<typeof setTimeout>;
            }
        } finally {
            running = false;
        }
    };

    void run();

    return {
        stop() {
            stopped = true;
            if (timer !== undefined) {
                clearTimer(timer);
                timer = undefined;
            }
        },
        get completed() { return completed; }
    };
}
