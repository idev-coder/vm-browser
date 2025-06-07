import { LOG_PCI } from "./const";
import { h } from "./lib";
import { dbg_assert, dbg_log } from "./log";

// For Types Only
import { CPU } from "./cpu";

// http://wiki.osdev.org/PCI

export const PCI_CONFIG_ADDRESS = 0xCF8;
export const PCI_CONFIG_DATA = 0xCFC;

/**
 * @constructor
 * @param {CPU} cpu
 */
export class PCI {
    pci_addr: Uint8Array<ArrayBuffer>;
    pci_value: Uint8Array<ArrayBuffer>;
    pci_response: Uint8Array<ArrayBuffer>;
    pci_status: Uint8Array<ArrayBuffer>;
    pci_addr32: Int32Array<ArrayBuffer>;
    pci_value32: Int32Array<ArrayBuffer>;
    pci_response32: Int32Array<ArrayBuffer>;
    pci_status32: Int32Array<ArrayBuffer>;
    device_spaces: any[];
    devices: any[];
    private cpu: CPU;
    private io: any;
    isa_bridge: { pci_id: number; pci_space: number[]; pci_bars: never[]; name: string; };
    isa_bridge_space: Int32Array<ArrayBuffer>;
    isa_bridge_space8: Uint8Array<ArrayBuffer>;
    constructor(cpu: CPU) {
        this.pci_addr = new Uint8Array(4);
        this.pci_value = new Uint8Array(4);
        this.pci_response = new Uint8Array(4);
        this.pci_status = new Uint8Array(4);

        this.pci_addr32 = new Int32Array(this.pci_addr.buffer);
        this.pci_value32 = new Int32Array(this.pci_value.buffer);
        this.pci_response32 = new Int32Array(this.pci_response.buffer);
        this.pci_status32 = new Int32Array(this.pci_status.buffer);

        this.device_spaces = [];
        this.devices = [];

        /** @const @type {CPU} */
        this.cpu = cpu;

        for (var i = 0; i < 256; i++) {
            this.device_spaces[i] = undefined;
            this.devices[i] = undefined;
        }

        this.io = cpu.io;

        cpu.io.register_write(PCI_CONFIG_DATA, this,
            (value: any) => {
                this.pci_write8(this.pci_addr32[0], value);
            },
            (value: any) => {
                this.pci_write16(this.pci_addr32[0], value);
            },
            (value: any) => {
                this.pci_write32(this.pci_addr32[0], value);
            });

        cpu.io.register_write(PCI_CONFIG_DATA + 1, this,
            (value: any) => {
                this.pci_write8(this.pci_addr32[0] + 1 | 0, value);
            });

        cpu.io.register_write(PCI_CONFIG_DATA + 2, this,
            (value: any) => {
                this.pci_write8(this.pci_addr32[0] + 2 | 0, value);
            },
            (value: any) => {
                this.pci_write16(this.pci_addr32[0] + 2 | 0, value);
            });

        cpu.io.register_write(PCI_CONFIG_DATA + 3, this,
            (value: any) => {
                this.pci_write8(this.pci_addr32[0] + 3 | 0, value);
            });

        cpu.io.register_read_consecutive(PCI_CONFIG_DATA, this,
            () => {
                return this.pci_response[0];
            },
            () => {
                return this.pci_response[1];
            },
            () => {
                return this.pci_response[2];
            },
            () => {
                return this.pci_response[3];
            }
        );

        cpu.io.register_read_consecutive(PCI_CONFIG_ADDRESS, this,
            () => {
                return this.pci_status[0];
            },
            () => {
                return this.pci_status[1];
            },
            () => {
                return this.pci_status[2];
            },
            () => {
                return this.pci_status[3];
            }
        );

        cpu.io.register_write_consecutive(PCI_CONFIG_ADDRESS, this,
            (out_byte: number) => {
                this.pci_addr[0] = out_byte & 0xFC;
            },
            (out_byte: number) => {
                if ((this.pci_addr[1] & 0x06) === 0x02 && (out_byte & 0x06) === 0x06) {
                    dbg_log("CPU reboot via PCI");
                    cpu.reboot_internal();
                    return;
                }

                this.pci_addr[1] = out_byte;
            },
            (out_byte: any) => {
                this.pci_addr[2] = out_byte;
            },
            (out_byte: any) => {
                this.pci_addr[3] = out_byte;
                this.pci_query();
            }
        );


        // Some experimental PCI devices taken from my PC:

        // 00:00.0 Host bridge: Intel Corporation 4 Series Chipset DRAM Controller (rev 02)
        //var host_bridge = {
        //    pci_id: 0,
        //    pci_space: [
        //        0x86, 0x80, 0x20, 0x2e, 0x06, 0x00, 0x90, 0x20, 0x02, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00,
        //        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        //        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x43, 0x10, 0xd3, 0x82,
        //        0x00, 0x00, 0x00, 0x00, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        //    ],
        //    pci_bars: [],
        //};

        // This needs to be set in order for seabios to not execute code outside of
        // mapped memory. While we map the BIOS into high memory, we don't allow
        // executing code there, which enables optimisations in read_imm8.
        // See [make_bios_writable_intel] in src/fw/shadow.c in seabios for details
        const PAM0 = 0x10;

        var host_bridge = {
            pci_id: 0,
            pci_space: [
                // 00:00.0 Host bridge: Intel Corporation 440FX - 82441FX PMC [Natoma] (rev 02)
                0x86, 0x80, 0x37, 0x12, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, PAM0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ],
            pci_bars: [],
            name: "82441FX PMC",
        };
        this.register_device(host_bridge);

        this.isa_bridge = {
            pci_id: 1 << 3,
            pci_space: [
                // 00:01.0 ISA bridge: Intel Corporation 82371SB PIIX3 ISA [Natoma/Triton II]
                0x86, 0x80, 0x00, 0x70, 0x07, 0x00, 0x00, 0x02, 0x00, 0x00, 0x01, 0x06, 0x00, 0x00, 0x80, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            ],
            pci_bars: [],
            name: "82371SB PIIX3 ISA",
        };
        this.isa_bridge_space = this.register_device(this.isa_bridge);
        this.isa_bridge_space8 = new Uint8Array(this.isa_bridge_space.buffer);

        // 00:1e.0 PCI bridge: Intel Corporation 82801 PCI Bridge (rev 90)
        //this.register_device([
        //    0x86, 0x80, 0x4e, 0x24, 0x07, 0x01, 0x10, 0x00, 0x90, 0x01, 0x04, 0x06, 0x00, 0x00, 0x01, 0x00,
        //    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x05, 0x20, 0xe0, 0xe0, 0x80, 0x22,
        //    0xb0, 0xfe, 0xb0, 0xfe, 0xf1, 0xff, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        //    0x00, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x00, 0x02, 0x00,
        //], 0x1e << 3);
    }

    get_state() {
        var state = [];

        for (var i = 0; i < 256; i++) {
            state[i] = this.device_spaces[i];
        }

        state[256] = this.pci_addr;
        state[257] = this.pci_value;
        state[258] = this.pci_response;
        state[259] = this.pci_status;

        return state;
    };

    set_state(state: ArrayLike<number>[]) {
        for (var i = 0; i < 256; i++) {
            var device = this.devices[i];
            var space = state[i];

            if (!device || !space) {
                if (device) {
                    dbg_log("Warning: While restoring PCI device: Device exists in current " +
                        "configuration but not in snapshot (" + device.name + ")");
                }
                if (space) {
                    dbg_log("Warning: While restoring PCI device: Device doesn't exist in current " +
                        "configuration but does in snapshot (device " + h(i, 2) + ")");
                }
                continue;
            }

            for (var bar_nr = 0; bar_nr < device.pci_bars.length; bar_nr++) {
                var value = space[(0x10 >> 2) + bar_nr];

                if (value & 1) {
                    var bar = device.pci_bars[bar_nr];
                    var from = bar.original_bar & ~1 & 0xFFFF;
                    var to = value & ~1 & 0xFFFF;
                    this.set_io_bars(bar, from, to);
                }
                else {
                    // memory, cannot be changed
                }
            }

            this.device_spaces[i].set(space);
        }

        this.pci_addr.set(state[256]);
        this.pci_value.set(state[257]);
        this.pci_response.set(state[258]);
        this.pci_status.set(state[259]);
    };

    pci_query() {
        var dbg_line = "query";

        // Bit | .31                     .0
        // Fmt | EBBBBBBBBDDDDDFFFRRRRRR00

        var bdf = this.pci_addr[2] << 8 | this.pci_addr[1],
            addr = this.pci_addr[0] & 0xFC,
            //devfn = bdf & 0xFF,
            //bus = bdf >> 8,
            dev = bdf >> 3 & 0x1F,
            //fn = bdf & 7,
            enabled = this.pci_addr[3] >> 7;

        dbg_line += " enabled=" + enabled;
        dbg_line += " bdf=" + h(bdf, 4);
        dbg_line += " dev=" + h(dev, 2);
        dbg_line += " addr=" + h(addr, 2);

        var device = this.device_spaces[bdf];

        if (device !== undefined) {
            this.pci_status32[0] = 0x80000000 | 0;

            if (addr < device.byteLength) {
                this.pci_response32[0] = device[addr >> 2];
            }
            else {
                // required by freebsd-9.1
                this.pci_response32[0] = 0;
            }

            dbg_line += " " + h(this.pci_addr32[0] >>> 0, 8) + " -> " + h(this.pci_response32[0] >>> 0, 8);

            if (addr >= device.byteLength) {
                dbg_line += " (undef)";
            }

            dbg_line += " (" + this.devices[bdf].name + ")";

            dbg_log(dbg_line, LOG_PCI);
        }
        else {
            this.pci_response32[0] = -1;
            this.pci_status32[0] = 0;
        }
    };

    pci_write8(address: number, written: number) {
        var bdf = address >> 8 & 0xFFFF;
        var addr = address & 0xFF;

        var space = new Uint8Array(this.device_spaces[bdf].buffer);
        var device = this.devices[bdf];

        if (!space) {
            return;
        }

        dbg_assert(!(addr >= 0x10 && addr < 0x2C || addr >= 0x30 && addr < 0x34),
            "PCI: Expected 32-bit write, got 8-bit (addr: " + h(addr) + ")");

        dbg_log("PCI write8 dev=" + h(bdf >> 3, 2) + " (" + device.name + ") addr=" + h(addr, 4) +
            " value=" + h(written, 2), LOG_PCI);

        space[addr] = written;
    };

    pci_write16(address: number, written: number) {
        dbg_assert((address & 1) === 0);

        var bdf = address >> 8 & 0xFFFF;
        var addr = address & 0xFF;

        var space = new Uint16Array(this.device_spaces[bdf].buffer);
        var device = this.devices[bdf];

        if (!space) {
            return;
        }

        if (addr >= 0x10 && addr < 0x2C) {
            // Bochs bios
            dbg_log("Warning: PCI: Expected 32-bit write, got 16-bit (addr: " + h(addr) + ")");
            return;
        }

        dbg_assert(!(addr >= 0x30 && addr < 0x34),
            "PCI: Expected 32-bit write, got 16-bit (addr: " + h(addr) + ")");

        dbg_log("PCI writ16 dev=" + h(bdf >> 3, 2) + " (" + device.name + ") addr=" + h(addr, 4) +
            " value=" + h(written, 4), LOG_PCI);

        space[addr >>> 1] = written;
    };

    pci_write32(address: number, written: number) {
        dbg_assert((address & 3) === 0);

        var bdf = address >> 8 & 0xFFFF;
        var addr = address & 0xFF;

        var space = this.device_spaces[bdf];
        var device = this.devices[bdf];

        if (!space) {
            return;
        }

        if (addr >= 0x10 && addr < 0x28) {
            var bar_nr = addr - 0x10 >> 2;
            var bar = device.pci_bars[bar_nr];

            dbg_log("BAR" + bar_nr + " exists=" + (bar ? "y" : "n") + " changed to " +
                h(written >>> 0) + " dev=" + h(bdf >> 3, 2) + " (" + device.name + ") ", LOG_PCI);

            if (bar) {
                dbg_assert(!(bar.size & bar.size - 1), "bar size should be power of 2");

                var space_addr = addr >> 2;
                var type = space[space_addr] & 1;

                if ((written | 3 | bar.size - 1) === -1) // size check
                {
                    written = ~(bar.size - 1) | type;

                    if (type === 0) {
                        space[space_addr] = written;
                    }
                }
                else {
                    if (type === 0) {
                        // memory
                        var original_bar = bar.original_bar;

                        if ((written & ~0xF) !== (original_bar & ~0xF)) {
                            // seabios
                            dbg_log("Warning: Changing memory bar not supported, ignored", LOG_PCI);
                        }

                        // changing isn't supported yet, reset to default
                        space[space_addr] = original_bar;
                    }
                }

                if (type === 1) {
                    // io
                    dbg_assert(type === 1);

                    var from = space[space_addr] & ~1 & 0xFFFF;
                    var to = written & ~1 & 0xFFFF;
                    dbg_log("io bar changed from " + h(from >>> 0, 8) +
                        " to " + h(to >>> 0, 8) + " size=" + bar.size, LOG_PCI);
                    this.set_io_bars(bar, from, to);
                    space[space_addr] = written | 1;
                }
            }
            else {
                space[addr >> 2] = 0;
            }

            dbg_log("BAR effective value: " + h(space[addr >> 2] >>> 0), LOG_PCI);
        }
        else if (addr === 0x30) {
            dbg_log("PCI write rom address dev=" + h(bdf >> 3, 2) + " (" + device.name + ")" +
                " value=" + h(written >>> 0, 8), LOG_PCI);

            if (device.pci_rom_size) {
                if ((written | 0x7FF) === (0xFFFFFFFF | 0)) {
                    space[addr >> 2] = -device.pci_rom_size | 0;
                }
                else {
                    space[addr >> 2] = device.pci_rom_address | 0;
                }
            }
            else {
                space[addr >> 2] = 0;
            }
        }
        else if (addr === 0x04) {
            dbg_log("PCI write dev=" + h(bdf >> 3, 2) + " (" + device.name + ") addr=" + h(addr, 4) +
                " value=" + h(written >>> 0, 8), LOG_PCI);
        }
        else {
            dbg_log("PCI write dev=" + h(bdf >> 3, 2) + " (" + device.name + ") addr=" + h(addr, 4) +
                " value=" + h(written >>> 0, 8), LOG_PCI);
            space[addr >>> 2] = written;
        }
    };

    register_device(device: { pci_id: any; pci_space: any; pci_bars: any; name: any; }) {
        dbg_assert(device.pci_id !== undefined);
        dbg_assert(device.pci_space !== undefined);
        dbg_assert(device.pci_bars !== undefined);

        var device_id = device.pci_id;

        dbg_log("PCI register bdf=" + h(device_id) + " (" + device.name + ")", LOG_PCI);

        dbg_assert(!this.devices[device_id]);
        dbg_assert(device.pci_space.length >= 64);
        dbg_assert(device_id < this.devices.length);

        // convert bytewise notation from lspci to double words
        var space = new Int32Array(64);
        space.set(new Int32Array(new Uint8Array(device.pci_space).buffer));
        this.device_spaces[device_id] = space;
        this.devices[device_id] = device;

        var bar_space = space.slice(4, 10);

        for (var i = 0; i < device.pci_bars.length; i++) {
            var bar = device.pci_bars[i];

            if (!bar) {
                continue;
            }

            var bar_base = bar_space[i];
            var type = bar_base & 1;

            bar.original_bar = bar_base;
            bar.entries = [];

            if (type === 0) {
                // memory, not needed currently
            }
            else {
                dbg_assert(type === 1);
                var port = bar_base & ~1;

                for (var j = 0; j < bar.size; j++) {
                    bar.entries[j] = this.io.ports[port + j];
                }
            }
        }

        return space;
    };

    set_io_bars(bar: { size: any; entries: any[]; }, from: number, to: number) {
        var count = bar.size;
        dbg_log("Move io bars: from=" + h(from) + " to=" + h(to) + " count=" + count, LOG_PCI);

        var ports = this.io.ports;

        for (var i = 0; i < count; i++) {
            var old_entry = ports[from + i];

            if (from + i >= 0x1000) {
                ports[from + i] = this.io.create_empty_entry();
            }

            if (old_entry.read8 === this.io.empty_port_read8 &&
                old_entry.read16 === this.io.empty_port_read16 &&
                old_entry.read32 === this.io.empty_port_read32 &&
                old_entry.write8 === this.io.empty_port_write &&
                old_entry.write16 === this.io.empty_port_write &&
                old_entry.write32 === this.io.empty_port_write) {
                // happens when a device doesn't register its full range (currently ne2k and virtio)
                dbg_log("Warning: Bad IO bar: Source not mapped, port=" + h(from + i, 4), LOG_PCI);
            }

            var entry = bar.entries[i];
            var empty_entry = ports[to + i];
            dbg_assert(entry && empty_entry);

            if (to + i >= 0x1000) {
                ports[to + i] = entry;
            }

            if (empty_entry.read8 === this.io.empty_port_read8 ||
                empty_entry.read16 === this.io.empty_port_read16 ||
                empty_entry.read32 === this.io.empty_port_read32 ||
                empty_entry.write8 === this.io.empty_port_write ||
                empty_entry.write16 === this.io.empty_port_write ||
                empty_entry.write32 === this.io.empty_port_write) {
                // These can fail if the os maps an io port in multiple bars (indicating a bug)
                // XXX: Fails during restore_state
                dbg_log("Warning: Bad IO bar: Target already mapped, port=" + h(to + i, 4), LOG_PCI);
            }
        }
    };

    raise_irq(pci_id: number) {
        var space = this.device_spaces[pci_id];
        dbg_assert(space);

        var pin = (space[0x3C >>> 2] >> 8 & 0xFF) - 1;
        var device = (pci_id >> 3) - 1 & 0xFF;
        var parent_pin = pin + device & 3;
        var irq = this.isa_bridge_space8[0x60 + parent_pin];

        //dbg_log("PCI raise irq " + h(irq) + " dev=" + h(device, 2) +
        //        " (" + this.devices[pci_id].name + ")", LOG_PCI);
        this.cpu.device_raise_irq(irq);
    };

    lower_irq(pci_id: number) {
        var space = this.device_spaces[pci_id];
        dbg_assert(space);

        var pin = space[0x3C >>> 2] >> 8 & 0xFF;
        var device = pci_id >> 3 & 0xFF;
        var parent_pin = pin + device - 2 & 3;
        var irq = this.isa_bridge_space8[0x60 + parent_pin];

        //dbg_log("PCI lower irq " + h(irq) + " dev=" + h(device, 2) +
        //        " (" + this.devices[pci_id].name + ")", LOG_PCI);
        this.cpu.device_lower_irq(irq);
    };

}