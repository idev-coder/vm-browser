// globals.d.ts

// Custom global variable
declare var DEBUG: boolean;

// Browser APIs
declare var window: Window & typeof globalThis;
declare var navigator: Navigator;
declare var location: Location;
declare var document: Document;
declare var console: Console;
declare var crypto: Crypto;
declare function alert(message?: any): void;
declare var performance: Performance;
declare var URL: typeof URL;
declare var WebAssembly: typeof WebAssembly;

// Timers
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): number;
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): number;
declare function clearTimeout(handle?: number): void;
declare function clearInterval(handle?: number): void;
declare function requestAnimationFrame(callback: FrameRequestCallback): number;
declare function cancelAnimationFrame(handle: number): void;

// Node/Binary/Data APIs
declare var Buffer: typeof Buffer;
declare var FileReader: typeof FileReader;
declare var TextEncoder: typeof TextEncoder;
declare var TextDecoder: typeof TextDecoder;

// Fetch / Network APIs
declare function fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
declare var Headers: typeof Headers;
declare var Response: typeof Response;
declare var WebSocket: typeof WebSocket;
declare var Blob: typeof Blob;
declare var File: typeof File;
declare var XMLHttpRequest: typeof XMLHttpRequest;
declare var URLSearchParams: typeof URLSearchParams;

// Canvas/Image APIs
declare var ImageData: typeof ImageData;
declare var Image: typeof HTMLImageElement;
declare var OffscreenCanvas: typeof OffscreenCanvas;
declare var BroadcastChannel: typeof BroadcastChannel;

// Audio APIs
declare var AudioContext: typeof AudioContext;
declare var AudioWorkletProcessor: typeof AudioWorkletProcessor;
declare var webkitAudioContext: typeof AudioContext;
declare var AudioWorkletNode: typeof AudioWorkletNode;

// Web Worker APIs
declare var Worker: typeof Worker;
declare function postMessage(message: any, targetOrigin?: string, transfer?: Transferable[]): void;
declare function importScripts(...urls: string[]): void;

// Process (Node.js-style global)
declare var process: {
  versions: {
    [key: string]: string | undefined
  };
  env: {
    [key: string]: string | undefined;
    NODE_ENV?: "development" | "production" | "test";
    DEBUG?: string;
  };
};
