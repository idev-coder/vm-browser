import { dbg_assert } from "./log";

export var Bus: any = {};

/** @constructor */
export class BusConnector {
    private listeners: any
    private pair: any
    constructor() {
        this.listeners = {};
        this.pair = undefined;
    }

    register(name: string, fn: Function, this_value?: any) {
        var listeners = this.listeners[name];

        if (listeners === undefined) {
            listeners = this.listeners[name] = [];
        }

        listeners.push({
            fn: fn,
            this_value: this_value,
        });
    }

    unregister(name: string, fn: Function) {
        var listeners = this.listeners[name];

        if (listeners === undefined) {
            return;
        }

        this.listeners[name] = listeners.filter(function (l: any) {
            return l.fn !== fn;
        });
    }

    send(name: string, value: any, unused_transfer?: any) {
        if (!this.pair) {
            return;
        }

        var listeners = this.pair.listeners[name];

        if (listeners === undefined) {
            return;
        }

        for (var i = 0; i < listeners.length; i++) {
            var listener = listeners[i];
            listener.fn.call(listener.this_value, value);
        }
    }

    send_async(name: string, value: any) {
        dbg_assert(arguments.length === 1 || arguments.length === 2);

        setTimeout(this.send.bind(this, name, value), 0);
    }

}

Bus.create = function () {
    var c0: any = new BusConnector();
    var c1: any = new BusConnector();

    c0.pair = c1;
    c1.pair = c0;

    return [c0, c1];
};
