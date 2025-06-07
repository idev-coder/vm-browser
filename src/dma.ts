import { LOG_DMA } from "./const";
import { h } from "./lib";
import { dbg_log } from "./log";

// For Types Only
import { CPU } from "./cpu";

/**
 * @constructor
 * @param {CPU} cpu
 */
export class DMA {
    private cpu: CPU;
    private channel_page: Uint8Array<ArrayBuffer>;
    private channel_addr: Uint16Array<ArrayBuffer>;
    private channel_addr_init: Uint16Array<ArrayBuffer>;
    private channel_count: Uint16Array<ArrayBuffer>;
    private channel_count_init: Uint16Array<ArrayBuffer>;
    private channel_mask: Uint8Array<ArrayBuffer>;
    private channel_mode: Uint8Array<ArrayBuffer>;
    private unmask_listeners: any[];
    private lsb_msb_flipflop: number;
    private channel_pagehi: any;
    constructor(cpu: CPU) {
        /** @const @type {CPU} */
        this.cpu = cpu;

        this.channel_page = new Uint8Array(8);
        this.channel_page = new Uint8Array(8);
        this.channel_addr = new Uint16Array(8);
        this.channel_addr_init = new Uint16Array(8);
        this.channel_count = new Uint16Array(8);
        this.channel_count_init = new Uint16Array(8);
        this.channel_mask = new Uint8Array(8);
        this.channel_mode = new Uint8Array(8);
        this.unmask_listeners = [];

        this.lsb_msb_flipflop = 0;

        const io = cpu.io;

        io.register_write(0x00, this, this.port_addr_write.bind(this, 0));
        io.register_write(0x02, this, this.port_addr_write.bind(this, 1));
        io.register_write(0x04, this, this.port_addr_write.bind(this, 2));
        io.register_write(0x06, this, this.port_addr_write.bind(this, 3));
        io.register_write(0x01, this, this.port_count_write.bind(this, 0));
        io.register_write(0x03, this, this.port_count_write.bind(this, 1));
        io.register_write(0x05, this, this.port_count_write.bind(this, 2));
        io.register_write(0x07, this, this.port_count_write.bind(this, 3));

        io.register_read(0x00, this, this.port_addr_read.bind(this, 0));
        io.register_read(0x02, this, this.port_addr_read.bind(this, 1));
        io.register_read(0x04, this, this.port_addr_read.bind(this, 2));
        io.register_read(0x06, this, this.port_addr_read.bind(this, 3));
        io.register_read(0x01, this, this.port_count_read.bind(this, 0));
        io.register_read(0x03, this, this.port_count_read.bind(this, 1));
        io.register_read(0x05, this, this.port_count_read.bind(this, 2));
        io.register_read(0x07, this, this.port_count_read.bind(this, 3));

        io.register_write(0xC0, this, this.port_addr_write.bind(this, 4));
        io.register_write(0xC4, this, this.port_addr_write.bind(this, 5));
        io.register_write(0xC8, this, this.port_addr_write.bind(this, 6));
        io.register_write(0xCC, this, this.port_addr_write.bind(this, 7));
        io.register_write(0xC2, this, this.port_count_write.bind(this, 4));
        io.register_write(0xC6, this, this.port_count_write.bind(this, 5));
        io.register_write(0xCA, this, this.port_count_write.bind(this, 6));
        io.register_write(0xCE, this, this.port_count_write.bind(this, 7));

        io.register_read(0xC0, this, this.port_addr_read.bind(this, 4));
        io.register_read(0xC4, this, this.port_addr_read.bind(this, 5));
        io.register_read(0xC8, this, this.port_addr_read.bind(this, 6));
        io.register_read(0xCC, this, this.port_addr_read.bind(this, 7));
        io.register_read(0xC2, this, this.port_count_read.bind(this, 4));
        io.register_read(0xC6, this, this.port_count_read.bind(this, 5));
        io.register_read(0xCA, this, this.port_count_read.bind(this, 6));
        io.register_read(0xCE, this, this.port_count_read.bind(this, 7));

        io.register_write(0x87, this, this.port_page_write.bind(this, 0));
        io.register_write(0x83, this, this.port_page_write.bind(this, 1));
        io.register_write(0x81, this, this.port_page_write.bind(this, 2));
        io.register_write(0x82, this, this.port_page_write.bind(this, 3));
        io.register_write(0x8F, this, this.port_page_write.bind(this, 4));
        io.register_write(0x8B, this, this.port_page_write.bind(this, 5));
        io.register_write(0x89, this, this.port_page_write.bind(this, 6));
        io.register_write(0x8A, this, this.port_page_write.bind(this, 7));

        io.register_read(0x87, this, this.port_page_read.bind(this, 0));
        io.register_read(0x83, this, this.port_page_read.bind(this, 1));
        io.register_read(0x81, this, this.port_page_read.bind(this, 2));
        io.register_read(0x82, this, this.port_page_read.bind(this, 3));
        io.register_read(0x8F, this, this.port_page_read.bind(this, 4));
        io.register_read(0x8B, this, this.port_page_read.bind(this, 5));
        io.register_read(0x89, this, this.port_page_read.bind(this, 6));
        io.register_read(0x8A, this, this.port_page_read.bind(this, 7));

        io.register_write(0x487, this, this.port_pagehi_write.bind(this, 0));
        io.register_write(0x483, this, this.port_pagehi_write.bind(this, 1));
        io.register_write(0x481, this, this.port_pagehi_write.bind(this, 2));
        io.register_write(0x482, this, this.port_pagehi_write.bind(this, 3));
        io.register_write(0x48B, this, this.port_pagehi_write.bind(this, 5));
        io.register_write(0x489, this, this.port_pagehi_write.bind(this, 6));
        io.register_write(0x48A, this, this.port_pagehi_write.bind(this, 7));

        io.register_read(0x487, this, this.port_pagehi_read.bind(this, 0));
        io.register_read(0x483, this, this.port_pagehi_read.bind(this, 1));
        io.register_read(0x481, this, this.port_pagehi_read.bind(this, 2));
        io.register_read(0x482, this, this.port_pagehi_read.bind(this, 3));
        io.register_read(0x48B, this, this.port_pagehi_read.bind(this, 5));
        io.register_read(0x489, this, this.port_pagehi_read.bind(this, 6));
        io.register_read(0x48A, this, this.port_pagehi_read.bind(this, 7));

        io.register_write(0x0A, this, this.port_singlemask_write.bind(this, 0));
        io.register_write(0xD4, this, this.port_singlemask_write.bind(this, 4));
        io.register_write(0x0F, this, this.port_multimask_write.bind(this, 0));
        io.register_write(0xDE, this, this.port_multimask_write.bind(this, 4));

        io.register_read(0x0F, this, this.port_multimask_read.bind(this, 0));
        io.register_read(0xDE, this, this.port_multimask_read.bind(this, 4));

        io.register_write(0x0B, this, this.port_mode_write.bind(this, 0));
        io.register_write(0xD6, this, this.port_mode_write.bind(this, 4));

        io.register_write(0x0C, this, this.portC_write);
        io.register_write(0xD8, this, this.portC_write);
    }


    get_state() {
        return [
            this.channel_page,
            this.channel_pagehi,
            this.channel_addr,
            this.channel_addr_init,
            this.channel_count,
            this.channel_count_init,
            this.channel_mask,
            this.channel_mode,
            this.lsb_msb_flipflop,
        ];
    };

    set_state(state: any[]) {
        this.channel_page = state[0];
        this.channel_pagehi = state[1];
        this.channel_addr = state[2];
        this.channel_addr_init = state[3];
        this.channel_count = state[4];
        this.channel_count_init = state[5];
        this.channel_mask = state[6];
        this.channel_mode = state[7];
        this.lsb_msb_flipflop = state[8];
    };

    port_count_write(channel: any, data_byte: any) {
        dbg_log("count write [" + channel + "] = " + h(data_byte), LOG_DMA);

        this.channel_count[channel] =
            this.flipflop_get(this.channel_count[channel], data_byte, false);

        this.channel_count_init[channel] =
            this.flipflop_get(this.channel_count_init[channel], data_byte, true);
    };

    port_count_read(channel: any) {
        dbg_log("count read [" + channel + "] -> " + h(this.channel_count[channel]), LOG_DMA);
        return this.flipflop_read(this.channel_count[channel]);
    };

    port_addr_write(channel: any, data_byte: any) {
        dbg_log("addr write [" + channel + "] = " + h(data_byte), LOG_DMA);

        this.channel_addr[channel] =
            this.flipflop_get(this.channel_addr[channel], data_byte, false);

        this.channel_addr_init[channel] =
            this.flipflop_get(this.channel_addr_init[channel], data_byte, true);
    };

    port_addr_read(channel: any) {
        dbg_log("addr read [" + channel + "] -> " + h(this.channel_addr[channel]), LOG_DMA);
        return this.flipflop_read(this.channel_addr[channel]);
    };

    port_pagehi_write(channel: any, data_byte: any) {
        dbg_log("pagehi write [" + channel + "] = " + h(data_byte), LOG_DMA);
        this.channel_pagehi[channel] = data_byte;
    };

    port_pagehi_read(channel: string) {
        dbg_log("pagehi read [" + channel + "]", LOG_DMA);
        return this.channel_pagehi[channel];
    };

    port_page_write(channel: any, data_byte: number) {
        dbg_log("page write [" + channel + "] = " + h(data_byte), LOG_DMA);
        this.channel_page[channel] = data_byte;
    };

    port_page_read(channel: any) {
        dbg_log("page read [" + channel + "]", LOG_DMA);
        return this.channel_page[channel];
    };

    port_singlemask_write(channel_offset: number, data_byte: number) {
        var channel = (data_byte & 0x3) + channel_offset;
        var value = data_byte & 0x4 ? 1 : 0;
        dbg_log("singlechannel mask write [" + channel + "] = " + value, LOG_DMA);
        this.update_mask(channel, value);
    };

    port_multimask_write(channel_offset: number, data_byte: number) {
        dbg_log("multichannel mask write: " + h(data_byte), LOG_DMA);
        for (var i = 0; i < 4; i++) {
            this.update_mask(channel_offset + i, data_byte & (1 << i));
        }
    };

    port_multimask_read(channel_offset: number) {
        var value = 0;
        value |= this.channel_mask[channel_offset + 0];
        value |= this.channel_mask[channel_offset + 1] << 1;
        value |= this.channel_mask[channel_offset + 2] << 2;
        value |= this.channel_mask[channel_offset + 3] << 3;
        dbg_log("multichannel mask read: " + h(value), LOG_DMA);
        return value;
    };

    port_mode_write(channel_offset: number, data_byte: number) {
        var channel = (data_byte & 0x3) + channel_offset;
        dbg_log("mode write [" + channel + "] = " + h(data_byte), LOG_DMA);
        this.channel_mode[channel] = data_byte;
    };

    portC_write(data_byte: any) {
        dbg_log("flipflop reset", LOG_DMA);
        this.lsb_msb_flipflop = 0;
    };

    on_unmask(fn: any, this_value: any) {
        this.unmask_listeners.push({
            fn: fn,
            this_value: this_value,
        });
    };

    update_mask(channel: any, value: number) {
        if (this.channel_mask[channel] !== value) {
            this.channel_mask[channel] = value;

            if (!value) {
                dbg_log("firing on_unmask(" + channel + ")", LOG_DMA);
                for (var i = 0; i < this.unmask_listeners.length; i++) {
                    this.unmask_listeners[i].fn.call(
                        this.unmask_listeners[i].this_value,
                        channel
                    );
                }
            }
        }
    };

    // read data, write to memory
    do_read(buffer: any, start: any, len: any, channel: any, fn: any) {
        var read_count = this.count_get_8bit(channel),
            addr = this.address_get_8bit(channel);

        dbg_log("DMA write channel " + channel, LOG_DMA);
        dbg_log("to " + h(addr) + " len " + h(read_count), LOG_DMA);

        if (len < read_count) {
            dbg_log("DMA should read more than provided: " + h(len) + " " + h(read_count), LOG_DMA);
        }

        if (start + read_count > buffer.byteLength) {
            dbg_log("DMA read outside of buffer", LOG_DMA);
            fn(true);
        }
        else {
            var cpu = this.cpu;
            this.channel_addr[channel] += read_count;

            buffer.get(start, read_count, function (data: any) {
                cpu.write_blob(data, addr);
                fn(false);
            });
        }
    };

    // write data, read memory
    // start and len in bytes
    do_write(buffer: any, start: any, len: any, channel: any, fn: any) {
        var read_count = (this.channel_count[channel] + 1) & 0xFFFF,
            bytes_per_count = channel >= 5 ? 2 : 1,
            read_bytes = read_count * bytes_per_count,
            addr = this.address_get_8bit(channel),
            unfinished = false,
            want_more = false,
            autoinit = this.channel_mode[channel] & 0x10;

        dbg_log("DMA write channel " + channel, LOG_DMA);
        dbg_log("to " + h(addr) + " len " + h(read_bytes), LOG_DMA);

        if (len < read_bytes) {
            dbg_log("DMA should read more than provided", LOG_DMA);
            read_count = Math.floor(len / bytes_per_count);
            read_bytes = read_count * bytes_per_count;
            unfinished = true;
        }
        else if (len > read_bytes) {
            dbg_log("DMA attempted to read more than provided", LOG_DMA);
            want_more = true;
        }

        if (start + read_bytes > buffer.byteLength) {
            dbg_log("DMA write outside of buffer", LOG_DMA);
            fn(true);
        }
        else {
            this.channel_addr[channel] += read_count;
            this.channel_count[channel] -= read_count;
            // when complete, counter should underflow to 0xFFFF

            if (!unfinished && autoinit) {
                dbg_log("DMA autoinit", LOG_DMA);
                this.channel_addr[channel] = this.channel_addr_init[channel];
                this.channel_count[channel] = this.channel_count_init[channel];
            }

            buffer.set(start,
                this.cpu.mem8.subarray(addr, addr + read_bytes),
                () => {
                    if (want_more && autoinit) {
                        dbg_log("DMA continuing from start", LOG_DMA);
                        this.do_write(buffer, start + read_bytes, len - read_bytes, channel, fn);
                    }
                    else {
                        fn(false);
                    }
                }
            );
        }
    };

    address_get_8bit(channel: number) {
        var addr = this.channel_addr[channel];

        // http://wiki.osdev.org/ISA_DMA#16_bit_issues
        if (channel >= 5) {
            addr = (addr << 1);
        }

        addr &= 0xFFFF;
        addr |= this.channel_page[channel] << 16;
        addr |= this.channel_pagehi[channel] << 24;

        return addr;
    };

    count_get_8bit(channel: number) {
        var count = this.channel_count[channel] + 1;

        if (channel >= 5) {
            count *= 2;
        }

        return count;
    };

    flipflop_get(old_dword: number, new_byte: number, continuing: boolean) {
        if (!continuing) {
            this.lsb_msb_flipflop ^= 1;
        }

        if (this.lsb_msb_flipflop) {
            // low byte
            return old_dword & ~0xFF | new_byte;
        }
        else {
            // high byte
            return old_dword & ~0xFF00 | new_byte << 8;
        }
    };

    flipflop_read(dword: number) {
        this.lsb_msb_flipflop ^= 1;

        if (this.lsb_msb_flipflop) {
            // low byte
            return dword & 0xFF;
        }
        else {
            // high byte
            return (dword >> 8) & 0xFF;
        }
    };
}