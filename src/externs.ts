var global: any = {};
var process: {
    versions: { [key: string]: string | undefined };
    env: { [key: string]: string | undefined; NODE_ENV?: "development" | "production" | "test" | undefined; DEBUG?: string | undefined; };
} = {
    versions: {},
    env: {}
};

/**
 * @param {string} name
 * @param {function()} processor
 */
var registerProcessor = function (name?: string, processor?: Function) { };

const sampleRate = 0;

var WabtModule = {
    readWasm: function (buf: any, opt: any) { },
    generateNames: function () { },
    applyNames: function () { },
    toText: function () { },
};
var cs = {
    Capstone: function () { },
    ARCH_X86: 0,
    MODE_16: 0,
    MODE_32: 0,
    disasm: { bytes: "", mnemonic: "", op_str: "", },
};

const LocalBuffer = {
    allocUnsafe: function (length: any) { },
};
