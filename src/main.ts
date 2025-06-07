import { CPU } from "./cpu";
import { save_state, restore_state } from "./state";
export { V86 } from "./browser/starter";

/**
 * @constructor
 * @param {Object=} wasm
 */
export class v86 {
    private running: boolean;
    private stopping: boolean;
    private idle: boolean;
    private tick_counter: number;
    private worker: any;
    private cpu: CPU;
    private bus: any;
    yield: any
    register_yield: any
    unregister_yield: any
    microtick: any
    constructor(bus: any, wasm: any) {
        /** @type {boolean} */
        this.running = false;

        /** @type {boolean} */
        this.stopping = false;

        /** @type {boolean} */
        this.idle = true;

        this.tick_counter = 0;
        this.worker = null;

        /** @type {CPU} */
        this.cpu = new CPU(bus, wasm, () => { this.idle && this.next_tick(0); });

        this.bus = bus;

        this.register_yield();

        if (typeof process !== "undefined") {
            this.yield = function (t: any | undefined, tick: any) {
                /* global global */
                if (t < 1) {
                    global.setImmediate((tick: number) => this.yield_callback(tick), tick);
                }
                else {
                    setTimeout(tick => this.yield_callback(tick), t, tick);
                }
            };

            this.register_yield = function () { };
            this.unregister_yield = function () { };
        }
        else if (typeof Worker !== "undefined") {
            // XXX: This has a slightly lower throughput compared to window.postMessage

            function the_worker() {
                let timeout: any;
                globalThis.onmessage = function (e) {
                    const t = e.data.t;
                    timeout = timeout && clearTimeout(timeout);
                    if (t < 1) postMessage(e.data.tick);
                    else timeout = setTimeout(() => postMessage(e.data.tick), t);
                };
            }

            this.register_yield = () => {
                const url = URL.createObjectURL(new Blob(["(" + the_worker.toString() + ")()"], { type: "text/javascript" }));
                this.worker = new Worker(url);
                this.worker.onmessage = e => this.yield_callback(e.data);
                URL.revokeObjectURL(url);
            };

            this.yield = function (t: any, tick: any) {
                this.worker.postMessage({ t, tick });
            };

            this.unregister_yield = function () {
                this.worker && this.worker.terminate();
                this.worker = null;
            };
        }
        //else if(typeof window !== "undefined" && typeof postMessage !== "undefined")
        //{
        //    // setImmediate shim for the browser.
        //    // TODO: Make this deactivatable, for other applications
        //    //       using postMessage
        //
        //    const MAGIC_POST_MESSAGE = 0xAA55;
        //
        //    v86.prototype.yield = function(t)
        //    {
        //        // XXX: Use t
        //        window.postMessage(MAGIC_POST_MESSAGE, "*");
        //    };
        //
        //    let tick;
        //
        //    v86.prototype.register_yield = function()
        //    {
        //        tick = e =>
        //        {
        //            if(e.source === window && e.data === MAGIC_POST_MESSAGE)
        //            {
        //                this.do_tick();
        //            }
        //        };
        //
        //        window.addEventListener("message", tick, false);
        //    };
        //
        //    v86.prototype.unregister_yield = function()
        //    {
        //        window.removeEventListener("message", tick);
        //        tick = null;
        //    };
        //}
        else {
            this.yield = function (t: number | undefined) {
                setTimeout(() => { this.do_tick(); }, t);
            };

            this.register_yield = function () { };
            this.unregister_yield = function () { };
        }


        /* global require */
        if (typeof performance === "object" && performance.now) {
            this.microtick = performance.now.bind(performance);
        }
        else if (typeof require === "function") {
            const { performance } = require("perf_hooks");
            this.microtick = performance.now.bind(performance);
        }
        else if (typeof process === "object" && process.hrtime) {
            this.microtick = function () {
                var t: any = process.hrtime();
                return t[0] * 1000 + t[1] / 1e6;
            };
        }
        else {
            this.microtick = Date.now;
        }

    }

    run() {
        this.stopping = false;

        if (!this.running) {
            this.running = true;
            this.bus.send("emulator-started");
        }

        this.next_tick(0);
    };

    do_tick() {
        if (this.stopping || !this.running) {
            this.stopping = this.running = false;
            this.bus.send("emulator-stopped");
            return;
        }

        this.idle = false;
        const t = this.cpu.main_loop();

        this.next_tick(t);
    };

    next_tick(t: number) {
        const tick = ++this.tick_counter;
        this.idle = true;
        this.yield(t, tick);
    };

    yield_callback(tick: number) {
        if (tick === this.tick_counter) {
            this.do_tick();
        }
    };

    stop() {
        if (this.running) {
            this.stopping = true;
        }
    };

    destroy() {
        this.unregister_yield();
    };

    restart() {
        this.cpu.reset_cpu();
        this.cpu.load_bios();
    };

    init(settings: any) {
        this.cpu.init(settings, this.bus);
        this.bus.send("emulator-ready");
    };

    save_state() {
        // TODO: Should be implemented here, not on cpu
        return save_state(this.cpu);
    };

    restore_state(state: any) {
        // TODO: Should be implemented here, not on cpu
        return restore_state(this.cpu, state);
    };

}

