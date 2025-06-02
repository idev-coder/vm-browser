import { dbg_assert } from "./log";

export function pads(str: any, len: any) {
    str = (str || str === 0) ? str + "" : "";
    return str.padEnd(len, " ");
}

// pad string with zeros on the left
export function pad0(str: any, len: any) {
    str = (str || str === 0) ? str + "" : "";
    return str.padStart(len, "0");
}
export var view = function (constructor: any, memory: any, offset: any, length: any) {
    dbg_assert(offset >= 0);
    return new Proxy({},
        {
            get: function (target: any, property: any, receiver: any) {
                const b = new constructor(memory.buffer, offset, length);
                const x = b[property];
                if (typeof x === "function") {
                    return x.bind(b);
                }
                dbg_assert(/^\d+$/.test(property) || property === "buffer" || property === "length" ||
                    property === "BYTES_PER_ELEMENT" || property === "byteOffset");
                return x;
            },
            set: function (target: any, property: any, value: any, receiver: any) {
                dbg_assert(typeof property === "string" && /^\d+$/.test(property));
                if (typeof property === "string") {
                    new constructor(memory.buffer, offset, length)[property] = value;
                } else {
                    // Ignore symbol properties or handle as needed
                    return false;
                }
                return true;
            },
        });
};

/**
 * number to hex
 * @param {number} n
 * @param {number=} len
 * @return {string}
 */
export function h(n: any, len?: any) {
    if (!n) {
        var str: string = "";
    }
    else {
        var str: string = n.toString(16);
    }

    return "0x" + pad0(str.toUpperCase(), len || 1);
}

export function hex_dump(buffer: string | any[]) {
    function hex(n: number, len: number) {
        return pad0(n.toString(16).toUpperCase(), len);
    }

    const result = [];
    let offset = 0;

    for (; offset + 15 < buffer.length; offset += 16) {
        let line = hex(offset, 5) + "   ";

        for (let j = 0; j < 0x10; j++) {
            line += hex(buffer[offset + j], 2) + " ";
        }

        line += "  ";

        for (let j = 0; j < 0x10; j++) {
            const x = buffer[offset + j];
            line += (x >= 33 && x !== 34 && x !== 92 && x <= 126) ? String.fromCharCode(x) : ".";
        }

        result.push(line);
    }

    let line = hex(offset, 5) + "   ";

    for (; offset < buffer.length; offset++) {
        line += hex(buffer[offset], 2) + " ";
    }

    const remainder = offset & 0xF;
    line += "   ".repeat(0x10 - remainder);
    line += "  ";

    for (let j = 0; j < remainder; j++) {
        const x = buffer[offset + j];
        line += (x >= 33 && x !== 34 && x !== 92 && x <= 126) ? String.fromCharCode(x) : ".";
    }

    result.push(line);

    return "\n" + result.join("\n") + "\n";
}

/* global require */
export var get_rand_int: any;
if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const rand_data = new Int32Array(1);

    get_rand_int = function () {
        crypto.getRandomValues(rand_data);
        return rand_data[0];
    };
}
else if (typeof require !== "undefined") {
    /** @type {{ randomBytes: Function }} */
    const crypto = require("crypto");

    get_rand_int = function () {
        return crypto.randomBytes(4)["readInt32LE"](0);
    };
}
else if (typeof process !== "undefined") {
    import("node:" + "crypto").then(crypto => {
        get_rand_int = function () {
            return crypto["randomBytes"](4)["readInt32LE"](0);
        };
    });
}
else {
    dbg_assert(false, "Unsupported platform: No cryptographic random values");
}

export var int_log2: (arg0: number) => number;

if (typeof Math.clz32 === "function" && Math.clz32(0) === 32 && Math.clz32(0x12345) === 15 && Math.clz32(-1) === 0) {
    /**
     * calculate the integer logarithm base 2
     * @param {number} x
     * @return {number}
     */
    int_log2 = function (x: number) {
        dbg_assert(x > 0);

        return 31 - Math.clz32(x);
    };
} else {

    var int_log2_table = new Int8Array(256);

    for (var i = 0, b = -2; i < 256; i++) {
        if (!(i & i - 1))
            b++;

        int_log2_table[i] = b;
    }

    /**
     * calculate the integer logarithm base 2
     * @param {number} x
     * @return {number}
     */
    int_log2 = function (x: number) {
        x >>>= 0;
        dbg_assert(x > 0);

        // http://jsperf.com/integer-log2/6
        var tt = x >>> 16;

        if (tt) {
            var t = tt >>> 8;
            if (t) {
                return 24 + int_log2_table[t];
            }
            else {
                return 16 + int_log2_table[tt];
            }
        }
        else {
            var t = x >>> 8;
            if (t) {
                return 8 + int_log2_table[t];
            }
            else {
                return int_log2_table[x];
            }
        }
    };
}

export const round_up_to_next_power_of_2 = function (x: number) {
    dbg_assert(x >= 0);
    return x <= 1 ? 1 : 1 << 1 + int_log2(x - 1);
};

if (DEBUG) {
    dbg_assert(int_log2(1) === 0);
    dbg_assert(int_log2(2) === 1);
    dbg_assert(int_log2(7) === 2);
    dbg_assert(int_log2(8) === 3);
    dbg_assert(int_log2(123456789) === 26);

    dbg_assert(round_up_to_next_power_of_2(0) === 1);
    dbg_assert(round_up_to_next_power_of_2(1) === 1);
    dbg_assert(round_up_to_next_power_of_2(2) === 2);
    dbg_assert(round_up_to_next_power_of_2(7) === 8);
    dbg_assert(round_up_to_next_power_of_2(8) === 8);
    dbg_assert(round_up_to_next_power_of_2(123456789) === 134217728);
}

/**
 * @constructor
 *
 * Queue wrapper around Uint8Array
 * Used by devices such as the PS2 controller
 */
export class ByteQueue {
    private data: Uint8Array;
    private start: number;
    private end: number;
    public length: number;
    private size: number;

    constructor(size: number) {
        // size ต้องเป็น power of 2
        if ((size & (size - 1)) !== 0) {
            throw new Error("Size must be a power of 2");
        }

        this.size = size;
        this.data = new Uint8Array(size);
        this.start = 0;
        this.end = 0;
        this.length = 0;
    }

    push(item: number): void {
        if (this.length === this.size) {
            // intentional overwrite
            // ถ้าต้องการให้ลบ item เก่าออกก่อนเพิ่ม item ใหม่ (optional)
            this.start = (this.start + 1) & (this.size - 1);
        } else {
            this.length++;
        }

        this.data[this.end] = item;
        this.end = (this.end + 1) & (this.size - 1);
    }

    shift(): number {
        if (this.length === 0) {
            return -1;
        }

        const item = this.data[this.start];
        this.start = (this.start + 1) & (this.size - 1);
        this.length--;

        return item;
    }

    peek(): number {
        if (this.length === 0) {
            return -1;
        }
        return this.data[this.start];
    }

    clear(): void {
        this.start = 0;
        this.end = 0;
        this.length = 0;
    }
}


/**
 * @constructor
 *
 * Queue wrapper around Float32Array
 * Used by devices such as the sound blaster sound card
 */
export class FloatQueue {
    private data: Float32Array;
    private start: number;
    private end: number;
    public length: number;
    private size: number;

    constructor(size: number) {
        // size ต้องเป็น power of 2
        if ((size & (size - 1)) !== 0) {
            throw new Error("Size must be a power of 2");
        }

        this.size = size;
        this.data = new Float32Array(size);
        this.start = 0;
        this.end = 0;
        this.length = 0;
    }

    push(item: number): void {
        if (this.length === this.size) {
            // intentional overwrite
            // ถ้าต้องการให้ลบ item เก่าออกก่อนเพิ่ม item ใหม่ (optional)
            this.start = (this.start + 1) & (this.size - 1);
        } else {
            this.length++;
        }

        this.data[this.end] = item;
        this.end = (this.end + 1) & (this.size - 1);
    }

    shift(): number | undefined {
        if (!this.length) {
            return undefined;
        } else {
            const item = this.data[this.start];
            this.start = (this.start + 1) & (this.size - 1);
            this.length--;

            return item;
        }

    }

    shift_block(count: number): Float32Array {
        const slice = new Float32Array(count);

        if (count > this.length) {
            count = this.length;
        }
        let slice_end = this.start + count;

        const partial = this.data.subarray(this.start, slice_end);

        slice.set(partial);
        if (slice_end >= this.size) {
            slice_end -= this.size;
            slice.set(this.data.subarray(0, slice_end), partial.length);
        }
        this.start = slice_end;

        this.length -= count;

        return slice;

    }

    peek(): number | undefined {
        if (!this.length) {
            return undefined;
        } else {
            return this.data[this.start];
        }
    }

    clear(): void {
        this.start = 0;
        this.end = 0;
        this.length = 0;
    }


}

/**
 * Simple circular queue for logs
 *
 * @param {number} size
 * @constructor
 */
export class CircularQueue {
    private data: any[];
    private size: number;
    private index: number;

    constructor(size: number) {

        this.data = [];
        this.index = 0;
        this.size = size;
    }

    add(item: any) {
        this.data[this.index] = item;
        this.index = (this.index + 1) % this.size;
    }

    toArray(): any[] {
        return [].slice.call(this.data, this.index).concat([].slice.call(this.data, 0, this.index));
    }

    clear() {
        this.data = [];
        this.index = 0;
    }

    set(new_data: any) {
        this.data = new_data;
        this.index = 0;
    }


}


export function dump_file(ab: any[] | undefined, name: any) {
    if (!Array.isArray(ab)) {
        ab = [ab];
    }

    var blob = new Blob(ab);
    download(blob, name);
}

export function download(file_or_blob: Blob | MediaSource, name: string) {
    var a = document.createElement("a");
    a["download"] = name;
    a.href = window.URL.createObjectURL(file_or_blob);
    a.dataset["downloadurl"] = ["application/octet-stream", a["download"], a.href].join(":");

    if (document.createEvent) {
        var ev = document.createEvent("MouseEvent");
        ev.initMouseEvent("click", true, true, window,
            0, 0, 0, 0, 0, false, false, false, false, 0, null);
        a.dispatchEvent(ev);
    }
    else {
        a.click();
    }

    window.URL.revokeObjectURL(a.href);
}

export class Bitmap {
    private view: any;
    constructor(length_or_buffer: number | ArrayBuffer) {
        if (typeof length_or_buffer === "number") {
            this.view = new Uint8Array(length_or_buffer + 7 >> 3);
        }
        else if (length_or_buffer instanceof ArrayBuffer) {
            this.view = new Uint8Array(length_or_buffer);
        }
        else {
            dbg_assert(false, "Bitmap: Invalid argument");
        }
    }
    set(index: number, value: number) {
        const bit_index = index & 7;
        const byte_index = index >> 3;
        const bit_mask = 1 << bit_index;

        this.view[byte_index] =
            value ? this.view[byte_index] | bit_mask : this.view[byte_index] & ~bit_mask;
    }

    get(index: number) {
        const bit_index = index & 7;
        const byte_index = index >> 3;

        return this.view[byte_index] >> bit_index & 1;
    }

    get_buffer() {
        return this.view.buffer;
    }

}

/**
 * A simple 1d bitmap
 * @constructor
 */


export var load_file: (...args: any[]) => any;
export var get_file_size: { (path: any): Promise<any>; (url: any): Promise<unknown>; };

if (typeof XMLHttpRequest === "undefined" ||
    typeof process !== "undefined" && process.versions && process.versions.node) {
    let fs: any;

    /**
     * @param {string} filename
     * @param {Object} options
     * @param {number=} n_tries
     */
    load_file = async function (filename: any, options?: any, n_tries?: any) {
        if (!fs) {
            // string concat to work around closure compiler 'Invalid module path "node:fs/promises" for resolution mode'
            fs = await import("node:" + "fs/promises");
        }

        if (options.range) {
            dbg_assert(!options.as_json);

            const fd = await fs["open"](filename, 'r');

            const length = options.range.length;
            const buffer = Buffer.allocUnsafe(length);

            try {
                /** @type {{ bytesRead: Number }} */
                const result = await fd["read"]({
                    buffer,
                    position: options.range.start
                });
                dbg_assert(result.bytesRead === length);
            }
            finally {
                await fd["close"]();
            }

            options.done && options.done(new Uint8Array(buffer));
        }
        else {
            const o: any = {
                encoding: options.as_json ? "utf-8" : null,
            };

            const data = await fs["readFile"](filename, o);
            const result = options.as_json ? JSON.parse(data) : new Uint8Array(data).buffer;

            options.done(result);
        }
    };

    get_file_size = async function (path: any) {
        if (!fs) {
            // string concat to work around closure compiler 'Invalid module path "node:fs/promises" for resolution mode'
            fs = await import("node:" + "fs/promises");
        }
        const stat = await fs["stat"](path);
        return stat.size;
    };
}
else {
    /**
     * @param {string} filename
     * @param {Object} options
     * @param {number=} n_tries
     */
    load_file = async function (filename: string | URL, options?: any, n_tries?: number) {
        var http = new XMLHttpRequest();

        http.open(options.method || "get", filename, true);

        if (options.as_json) {
            http.responseType = "json";
        }
        else {
            http.responseType = "arraybuffer";
        }

        if (options.headers) {
            var header_names = Object.keys(options.headers);

            for (var i = 0; i < header_names.length; i++) {
                var name = header_names[i];
                http.setRequestHeader(name, options.headers[name]);
            }
        }

        if (options.range) {
            const start = options.range.start;
            const end = start + options.range.length - 1;
            http.setRequestHeader("Range", "bytes=" + start + "-" + end);
            http.setRequestHeader("X-Accept-Encoding", "identity");

            // Abort if server responds with complete file in response to range
            // request, to prevent downloading large files from broken http servers
            http.onreadystatechange = function () {
                if (http.status === 200) {
                    console.error("Server sent full file in response to ranged request, aborting", { filename });
                    http.abort();
                }
            };
        }

        http.onload = function (e) {
            if (http.readyState === 4) {
                if (http.status !== 200 && http.status !== 206) {
                    console.error("Loading the image " + filename + " failed (status %d)", http.status);
                    if (http.status >= 500 && http.status < 600) {
                        retry();
                    }
                }
                else if (http.response) {
                    if (options.range) {
                        const enc = http.getResponseHeader("Content-Encoding");
                        if (enc && enc !== "identity") {
                            console.error("Server sent Content-Encoding in response to ranged request", { filename, enc });
                        }
                    }
                    options.done && options.done(http.response, http);
                }
            }
        };

        http.onerror = function (e) {
            console.error("Loading the image " + filename + " failed", e);
            retry();
        };

        if (options.progress) {
            http.onprogress = function (e) {
                options.progress(e);
            };
        }

        http.send(null);

        function retry() {
            const number_of_tries = n_tries || 0;
            const timeout = [1, 1, 2, 3, 5, 8, 13, 21][number_of_tries] || 34;
            setTimeout(() => {
                load_file(filename, options, number_of_tries + 1);
            }, 1000 * timeout);
        }
    };

    get_file_size = async function (url: any) {
        return new Promise((resolve, reject) => {
            load_file(url, {
                done: (buffer: any, http: { getResponseHeader: (arg0: string) => string; }) => {
                    var header = http.getResponseHeader("Content-Range") || "";
                    var match = header.match(/\/(\d+)\s*$/);

                    if (match) {
                        resolve(+match[1]);
                    }
                    else {
                        const error = new Error("`Range: bytes=...` header not supported (Got `" + header + "`)");
                        reject(error);
                    }
                },
                headers: {
                    Range: "bytes=0-0",
                    "X-Accept-Encoding": "identity"
                }
            });
        });
    };
}

// Reads len characters at offset from Memory object mem as a JS string
export function read_sized_string_from_mem(mem: any, offset: any, len: any) {
    offset >>>= 0;
    len >>>= 0;
    return String.fromCharCode(...new Uint8Array(mem.buffer, offset, len));
}
