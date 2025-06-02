import { load_file, get_file_size } from "./lib";
import { dbg_assert, dbg_log } from "./log";

// The smallest size the emulated hardware can emit
const BLOCK_SIZE = 256;

const ASYNC_SAFE = false;

/**
 * Synchronous access to ArrayBuffer
 * @constructor
 */
export class SyncBuffer {
    protected buffer: any;
    protected byteLength: any;
    protected onload: any;
    protected onprogress: any;
    constructor(buffer: any) {
        dbg_assert(buffer instanceof ArrayBuffer);

        this.buffer = buffer;
        this.byteLength = buffer.byteLength;
        this.onload = undefined;
        this.onprogress = undefined;
    }

    load() {
        this.onload && this.onload({ buffer: this.buffer });
    }

    get(start: number, len: number, fn: Function) {
        dbg_assert(start + len <= this.byteLength);
        fn(new Uint8Array(this.buffer, start, len));
    }

    set(start: number, slice: Uint8Array, fn: Function) {
        dbg_assert(start + slice.byteLength <= this.byteLength);

        new Uint8Array(this.buffer, start, slice.byteLength).set(slice);
        fn();
    }

    get_buffer(fn: Function) {
        fn(this.buffer);
    }

    get_state() {
        const state = [];
        state[0] = this.byteLength;
        state[1] = new Uint8Array(this.buffer);
        return state;
    }

    set_state(state: any[]) {
        this.byteLength = state[0];
        this.buffer = state[1].slice().buffer;
    }


}

/**
 * Asynchronous access to ArrayBuffer, loading blocks lazily as needed,
 * using the `Range: bytes=...` header
 *
 * @constructor
 * @param {string} filename Name of the file to download
 * @param {number|undefined} size
 * @param {number|undefined} fixed_chunk_size
 */
class AsyncXHRBuffer {
    protected filename: any;
    protected byteLength: any;
    protected block_cache: Map<any, any>;
    protected block_cache_is_write: Set<any>;
    protected fixed_chunk_size: any;
    protected cache_reads: any;
    protected onload: any;
    protected onprogress: any;
    // private handle_read: any
    constructor(filename: string, size: any, fixed_chunk_size: any) {
        this.filename = filename;

        this.byteLength = size;

        this.block_cache = new Map();
        this.block_cache_is_write = new Set();

        this.fixed_chunk_size = fixed_chunk_size;
        this.cache_reads = !!fixed_chunk_size; // TODO: could also be useful in other cases (needs testing)

        this.onload = undefined;
        this.onprogress = undefined;
    }

    async load() {
        if (this.byteLength !== undefined) {
            this.onload && this.onload(Object.create(null));
            return;
        }

        const size = await get_file_size(this.filename);
        this.byteLength = size;
        this.onload && this.onload(Object.create(null));
    }

    get_from_cache(offset: number, len: number) {
        var number_of_blocks = len / BLOCK_SIZE;
        var block_index = offset / BLOCK_SIZE;

        for (var i = 0; i < number_of_blocks; i++) {
            var block = this.block_cache.get(block_index + i);

            if (!block) {
                return;
            }
        }

        if (number_of_blocks === 1) {
            return this.block_cache.get(block_index);
        }
        else {
            var result = new Uint8Array(len);
            for (var i = 0; i < number_of_blocks; i++) {
                result.set(this.block_cache.get(block_index + i), i * BLOCK_SIZE);
            }
            return result;
        }
    }

    get(offset: number, len: number, fn: Function) {
        dbg_assert(offset + len <= this.byteLength);
        dbg_assert(offset % BLOCK_SIZE === 0);
        dbg_assert(len % BLOCK_SIZE === 0);
        dbg_assert(len);

        var block = this.get_from_cache(offset, len);
        if (block) {
            if (ASYNC_SAFE) {
                setTimeout(fn.bind(this, block), 0);
            }
            else {
                fn(block);
            }
            return;
        }

        var requested_start = offset;
        var requested_length = len;
        if (this.fixed_chunk_size) {
            requested_start = offset - (offset % this.fixed_chunk_size);
            requested_length = Math.ceil((offset - requested_start + len) / this.fixed_chunk_size) * this.fixed_chunk_size;
        }

        load_file(this.filename, {
            done: function done(buffer: any): void {
                var block = new Uint8Array(buffer);
                this.handle_read(requested_start, requested_length, block);
                if (requested_start === offset && requested_length === len) {
                    fn(block);
                }
                else {
                    fn(block.subarray(offset - requested_start, offset - requested_start + len));
                }
            },
            range: { start: requested_start, length: requested_length },
        });
    }

    set(start: number, data: Uint8Array, fn: Function) {
        var len = data.length;
        dbg_assert(start + data.byteLength <= this.byteLength);
        dbg_assert(start % BLOCK_SIZE === 0);
        dbg_assert(len % BLOCK_SIZE === 0);
        dbg_assert(len);

        var start_block = start / BLOCK_SIZE;
        var block_count = len / BLOCK_SIZE;

        for (var i = 0; i < block_count; i++) {
            var block = this.block_cache.get(start_block + i);

            if (block === undefined) {
                const data_slice = data.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE);
                this.block_cache.set(start_block + i, data_slice);
            }
            else {
                const data_slice = data.subarray(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE);
                dbg_assert(block.byteLength === data_slice.length);
                block.set(data_slice);
            }

            this.block_cache_is_write.add(start_block + i);
        }

        fn();
    }

    handle_read(offset: number, len: number, block: Uint8Array) {
        // Used by AsyncXHRBuffer, AsyncXHRPartfileBuffer and AsyncFileBuffer
        // Overwrites blocks from the original source that have been written since

        var start_block = offset / BLOCK_SIZE;
        var block_count = len / BLOCK_SIZE;

        for (var i = 0; i < block_count; i++) {
            const cached_block = this.block_cache.get(start_block + i);

            if (cached_block) {
                block.set(cached_block, i * BLOCK_SIZE);
            }
            else if (this.cache_reads) {
                this.block_cache.set(start_block + i, block.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE));
            }
        }
    }

    get_buffer(fn: Function) {
        // We must download all parts, unlikely a good idea for big files
        fn();
    }

    get_block_cache() {
        var count = Object.keys(this.block_cache).length;

        var buffer = new Uint8Array(count * BLOCK_SIZE);
        var indices = [];

        var i = 0;
        for (let index of Object.keys(this.block_cache)) {
            var block = this.block_cache.get(index);
            dbg_assert(block.length === BLOCK_SIZE);
            const numericIndex = +index;
            indices.push(numericIndex);
            buffer.set(
                block,
                i * BLOCK_SIZE
            );
            i++;
        }

        return {
            buffer,
            indices,
            block_size: BLOCK_SIZE,
        };
    }

    get_state() {
        const state = [];
        const block_cache = [];

        for (const [index, block] of this.block_cache) {
            dbg_assert(isFinite(index));
            if (this.block_cache_is_write.has(index)) {
                block_cache.push([index, block]);
            }
        }

        state[0] = block_cache;
        return state;
    }

    set_state(state: any[]) {
        const block_cache = state[0];
        this.block_cache.clear();
        this.block_cache_is_write.clear();

        for (const [index, block] of block_cache) {
            dbg_assert(isFinite(index));
            this.block_cache.set(index, block);
            this.block_cache_is_write.add(index);
        }
    }
}



/**
 * Asynchronous access to ArrayBuffer, loading blocks lazily as needed,
 * downloading files named filename-%d-%d.ext (where the %d are start and end offset).
 * Or, if partfile_alt_format is set, filename-%08d.ext (where %d is the part number, compatible with gnu split).
 *
 * @constructor
 * @param {string} filename Name of the file to download
 * @param {number|undefined} size
 * @param {number|undefined} fixed_chunk_size
 * @param {boolean|undefined} partfile_alt_format
 */
export class AsyncXHRPartfileBuffer extends AsyncXHRBuffer {
    private extension: any;
    private basename: any;
    private is_zstd: any;
    protected block_cache_is_write: Set<any>;
    protected fixed_chunk_size: any;
    protected partfile_alt_format: boolean;
    protected block_cache: Map<any, any>;
    protected zstd_decompress: any;
    protected cache_reads: boolean;
    protected onload: any;
    protected onprogress: any;

    constructor(filename: string, size: any, fixed_chunk_size: any, partfile_alt_format: any, zstd_decompress: any) {
        super(filename, size, fixed_chunk_size);
        const parts = filename.match(/\.[^\.]+(\.zst)?$/);

        this.extension = parts ? parts[0] : "";
        this.basename = filename.substring(0, filename.length - this.extension.length);

        this.is_zstd = this.extension.endsWith(".zst");

        if (!this.basename.endsWith("/")) {
            this.basename += "-";
        }

        this.block_cache = new Map();
        this.block_cache = new Map();
        this.block_cache_is_write = new Set();

        this.fixed_chunk_size = fixed_chunk_size;
        this.partfile_alt_format = !!partfile_alt_format;
        this.zstd_decompress = zstd_decompress;
        this.cache_reads = !!fixed_chunk_size; // TODO: could also be useful in other cases (needs testing)

        this.onload = undefined;
        this.onprogress = undefined;
    }

    async load(): Promise<void> {
        if (this.byteLength !== undefined) {
            this.onload && this.onload(Object.create(null));
            return;
        }
        dbg_assert(false);
        this.onload && this.onload(Object.create(null));
    }

    get(offset: number, len: number, fn: Function) {
        dbg_assert(offset + len <= this.byteLength);
        dbg_assert(offset % BLOCK_SIZE === 0);
        dbg_assert(len % BLOCK_SIZE === 0);
        dbg_assert(len);

        const block = this.get_from_cache(offset, len);

        if (block) {
            if (ASYNC_SAFE) {
                setTimeout(fn.bind(this, block), 0);
            }
            else {
                fn(block);
            }
            return;
        }

        if (this.fixed_chunk_size) {
            const start_index = Math.floor(offset / this.fixed_chunk_size);
            const m_offset = offset - start_index * this.fixed_chunk_size;
            dbg_assert(m_offset >= 0);
            const total_count = Math.ceil((m_offset + len) / this.fixed_chunk_size);
            const blocks = new Uint8Array(total_count * this.fixed_chunk_size);
            let finished = 0;

            for (let i = 0; i < total_count; i++) {
                const offset = (start_index + i) * this.fixed_chunk_size;

                const part_filename =
                    this.partfile_alt_format ?
                        // matches output of gnu split:
                        //   split -b 512 -a8 -d --additional-suffix .img w95.img w95-
                        this.basename + (start_index + i + "").padStart(8, "0") + this.extension
                        :
                        this.basename + offset + "-" + (offset + this.fixed_chunk_size) + this.extension;

                // XXX: unnecessary allocation
                const block = this.get_from_cache(offset, this.fixed_chunk_size);

                if (block) {
                    blocks.set(block, i * this.fixed_chunk_size);
                    finished++;
                    if (finished === total_count) {
                        fn(blocks.subarray(m_offset, m_offset + len));
                    }
                }
                else {
                    load_file(part_filename, {
                        done: async (buffer: any) => {
                            let block = new Uint8Array(buffer);

                            if (this.is_zstd) {
                                const decompressed = await this.zstd_decompress(this.fixed_chunk_size, block);
                                block = new Uint8Array(decompressed);
                            }

                            blocks.set(block, i * this.fixed_chunk_size);
                            this.handle_read((start_index + i) * this.fixed_chunk_size, this.fixed_chunk_size | 0, block);

                            finished++;
                            if (finished === total_count) {
                                fn(blocks.subarray(m_offset, m_offset + len));
                            }
                        },
                    });
                }
            }
        }
        else {
            const part_filename = this.basename + offset + "-" + (offset + len) + this.extension;

            load_file(part_filename, {
                done: (buffer: any) => {
                    dbg_assert(buffer.byteLength === len);
                    var block = new Uint8Array(buffer);
                    this.handle_read(offset, len, block);
                    fn(block);
                },
            });
        }
    }

}


/**
 * Synchronous access to File, loading blocks from the input type=file
 * The whole file is loaded into memory during initialisation
 *
 * @constructor
 */
export class SyncFileBuffer extends SyncBuffer {
    private file: any;
    constructor(file: any) {
        const buffer = new ArrayBuffer(file.size);
        super(buffer);
        this.file = file;
        this.byteLength = file.size;

        if (file.size > (1 << 30)) {
            console.warn("SyncFileBuffer: Allocating buffer of " + (file.size >> 20) + " MB ...");
        }

        // No need to assign this.buffer = buffer; already done in super()

        this.onload = undefined;
        this.onprogress = undefined;
    }

    load() {
        this.load_next(0);
    }

    load_next(start: number) {
        const PART_SIZE = 4 << 20;

        var filereader = new FileReader();

        filereader.onload = (e: any): void => {
            var buffer = new Uint8Array(e.target.result);
            new Uint8Array(this.buffer, start).set(buffer);
            this.load_next(start + PART_SIZE);
        };

        if (this.onprogress) {
            this.onprogress({
                loaded: start,
                total: this.byteLength,
                lengthComputable: true,
            });
        }

        if (start < this.byteLength) {
            var end = Math.min(start + PART_SIZE, this.byteLength);
            var slice = this.file.slice(start, end);
            filereader.readAsArrayBuffer(slice);
        }
        else {
            this.file = undefined;
            this.onload && this.onload({ buffer: this.buffer });
        }
    }
}


/**
 * Asynchronous access to File, loading blocks from the input type=file
 *
 * @constructor
 */
export class AsyncFileBuffer extends AsyncXHRBuffer {
    private file: any;
    constructor(file: any) {
        super(file.name, file.size, undefined);
        this.file = file;
        this.byteLength = file.size;

        this.block_cache = new Map();
        this.block_cache_is_write = new Set();

        this.onload = undefined;
        this.onprogress = undefined;
    }

    async load(): Promise<void> {
        this.onload && this.onload(Object.create(null));
    }

    get(offset: number, len: number, fn: Function) {
        dbg_assert(offset % BLOCK_SIZE === 0);
        dbg_assert(len % BLOCK_SIZE === 0);
        dbg_assert(len);

        var block = this.get_from_cache(offset, len);
        if (block) {
            fn(block);
            return;
        }

        var fr = new FileReader();

        fr.onload = (e: any): void => {
            var buffer = e.target.result;
            var block = new Uint8Array(buffer);

            this.handle_read(offset, len, block);
            fn(block);
        };

        fr.readAsArrayBuffer(this.file.slice(offset, offset + len));
    }

    get_buffer(fn: Function) {
        fn();
    }

    get_as_file(name: any) {
        var parts = [];
        var existing_blocks = Array.from(this.block_cache.keys()).sort(function (x, y) { return x - y; });

        var current_offset = 0;

        for (var i = 0; i < existing_blocks.length; i++) {
            var block_index = existing_blocks[i];
            var block = this.block_cache.get(block_index);
            var start = block_index * BLOCK_SIZE;
            dbg_assert(start >= current_offset);

            if (start !== current_offset) {
                parts.push(this.file.slice(current_offset, start));
                current_offset = start;
            }

            parts.push(block);
            current_offset += block.length;
        }

        if (current_offset !== this.file.size) {
            parts.push(this.file.slice(current_offset));
        }

        var file = new File(parts, name);
        dbg_assert(file.size === this.file.size);

        return file;
    }
}

export function buffer_from_object(obj: any, zstd_decompress_worker: any): any {
    // TODO: accept Uint8Array, ArrayBuffer, File, url rather than { url }

    if (obj.buffer instanceof ArrayBuffer) {
        return new SyncBuffer(obj.buffer);
    }
    else if (typeof File !== "undefined" && obj.buffer instanceof File) {
        // SyncFileBuffer:
        // - loads the whole disk image into memory, impossible for large files (more than 1GB)
        // - can later serve get/set operations fast and synchronously
        // - takes some time for first load, neglectable for small files (up to 100Mb)
        //
        // AsyncFileBuffer:
        // - loads slices of the file asynchronously as requested
        // - slower get/set

        // Heuristics: If file is larger than or equal to 256M, use AsyncFileBuffer
        let is_async = obj.async;
        if (is_async === undefined) {
            is_async = obj.buffer.size >= 256 * 1024 * 1024;
        }

        if (is_async) {
            return new AsyncFileBuffer(obj.buffer);
        }
        else {
            return new SyncFileBuffer(obj.buffer);
        }
    }
    else if (obj.url) {
        // Note: Only async for now

        if (obj.use_parts) {
            return new AsyncXHRPartfileBuffer(obj.url, obj.size, obj.fixed_chunk_size, false, zstd_decompress_worker);
        }
        else {
            return new AsyncXHRBuffer(obj.url, obj.size, obj.fixed_chunk_size);
        }
    }
    else {
        dbg_log("Ignored file: url=" + obj.url + " buffer=" + obj.buffer);
    }
}
