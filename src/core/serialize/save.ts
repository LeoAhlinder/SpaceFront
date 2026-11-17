import { CommandQueue } from "../commands/commandQueue";
import { PolarGrid } from "../grid/polarGrid";
import { RectGrid } from "../grid/rectGrid";
import { Rng } from "../math/rng";
import { FrontierHeap } from "../world/frontierHeap";
import type { World } from "../world/world";
import { hashWorld } from "./hash";

/**
 * Binary saves of the whole World (ARCHITECTURE.md §9).
 *
 * Layout: "SFSV" magic, u16 format version, u16 reserved, u32 header length,
 * the header (UTF-8 JSON chosen by the caller, e.g. the player id and the
 * replay log so far), then the world. The world is written as a tagged object
 * graph: numbers, strings, arrays (int arrays packed), plain objects, Maps,
 * Sets, typed arrays (raw bytes) and instances of the core classes below.
 * Shared references are written once and referred back to, so the graph
 * comes back with the same shape. The change log (`world.log`) is not state
 * and is never saved.
 *
 * Loading checks the format version and that the loaded world hashes to the
 * value stored at save time, so a corrupt or incompatible save fails loudly
 * instead of desyncing later.
 */
export const SAVE_FORMAT_VERSION = 1;

const MAGIC = [0x53, 0x46, 0x53, 0x56]; // "SFSV"

/** Classes that can appear in the World. Adding state of a new class means registering it. */
const CLASSES: Readonly<Record<string, { prototype: object }>> = {
  Rng,
  CommandQueue,
  RectGrid,
  PolarGrid,
  FrontierHeap,
};
const CLASS_NAMES = new Map<unknown, string>(
  Object.entries(CLASSES).map(([name, cls]) => [cls.prototype, name]),
);

const enum Tag {
  Undefined = 0,
  Null,
  False,
  True,
  Int,
  Float,
  String,
  Array,
  IntArray,
  Object,
  Map,
  Set,
  Typed,
  Instance,
  Ref,
}

const TYPED = [
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
] as const;

type TypedArray = InstanceType<(typeof TYPED)[number]>;

/** A save's header and the world it holds. */
export interface LoadedSave<Header> {
  readonly header: Header;
  readonly world: World;
}

/** What every save header carries besides the caller's own fields. */
interface StoredHeader {
  readonly tick: number;
  readonly hash: number;
  readonly data: unknown;
}

/** Writes the world and a caller-defined header (plain JSON) into one binary save. */
export function saveWorld(world: World, header: unknown): Uint8Array {
  const w = new Writer();
  const stored: StoredHeader = { tick: world.tick, hash: hashWorld(world), data: header };
  const headerBytes = utf8Encode(JSON.stringify(stored));
  for (const b of MAGIC) w.u8(b);
  w.u16(SAVE_FORMAT_VERSION);
  w.u16(0);
  w.u32(headerBytes.length);
  w.bytes(headerBytes);
  // The change log belongs to whoever listens to the world, not to the game.
  w.value({ ...world, log: null }, new Map());
  return w.finish();
}

/** Reads only the header of a save (for save lists), without decoding the world. */
export function readSaveHeader<Header>(bytes: Uint8Array): { tick: number; header: Header } {
  const r = new Reader(bytes);
  const stored = readStoredHeader(r);
  return { tick: stored.tick, header: stored.data as Header };
}

/**
 * Decodes a save made by `saveWorld`. Throws if it isn't a save, has another
 * format version, or doesn't reproduce the hash it was saved with.
 */
export function loadWorld<Header>(bytes: Uint8Array): LoadedSave<Header> {
  const r = new Reader(bytes);
  const stored = readStoredHeader(r);
  const world = r.value([]) as World;
  if (typeof world !== "object" || world === null || !Array.isArray(world.factions)) {
    throw new Error("Save holds no world");
  }
  if (world.tick !== stored.tick || hashWorld(world) !== stored.hash) {
    throw new Error("Save is damaged: the loaded world doesn't match its checksum");
  }
  return { header: stored.data as Header, world };
}

function readStoredHeader(r: Reader): StoredHeader {
  for (const b of MAGIC) if (r.u8() !== b) throw new Error("Not a SpaceFront save");
  const version = r.u16();
  if (version !== SAVE_FORMAT_VERSION) {
    throw new Error(
      `Save format ${version} isn't supported (this version reads ${SAVE_FORMAT_VERSION})`,
    );
  }
  r.u16();
  const length = r.u32();
  const stored = JSON.parse(utf8Decode(r.bytes(length))) as StoredHeader;
  if (typeof stored.tick !== "number" || typeof stored.hash !== "number") {
    throw new Error("Save header is damaged");
  }
  return stored;
}

class Writer {
  private buf = new Uint8Array(1 << 16);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.pos++] = v;
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v, true);
    this.pos += 2;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v, true);
    this.pos += 4;
  }

  i32(v: number): void {
    this.ensure(4);
    this.view.setInt32(this.pos, v, true);
    this.pos += 4;
  }

  f64(v: number): void {
    this.ensure(8);
    this.view.setFloat64(this.pos, v, true);
    this.pos += 8;
  }

  bytes(b: Uint8Array): void {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  string(s: string): void {
    const b = utf8Encode(s);
    this.u32(b.length);
    this.bytes(b);
  }

  /** Writes any value; `seen` maps objects already written to their reference index. */
  value(v: unknown, seen: Map<object, number>): void {
    if (v === undefined) return this.u8(Tag.Undefined);
    if (v === null) return this.u8(Tag.Null);
    if (v === false) return this.u8(Tag.False);
    if (v === true) return this.u8(Tag.True);
    if (typeof v === "number") {
      if (isInt32(v)) {
        this.u8(Tag.Int);
        this.i32(v);
      } else {
        this.u8(Tag.Float);
        this.f64(v);
      }
      return;
    }
    if (typeof v === "string") {
      this.u8(Tag.String);
      this.string(v);
      return;
    }
    if (typeof v !== "object") throw new Error(`Can't save a ${typeof v}`);
    const ref = seen.get(v);
    if (ref !== undefined) {
      this.u8(Tag.Ref);
      this.u32(ref);
      return;
    }
    seen.set(v, seen.size);
    if (Array.isArray(v)) {
      if (v.length > 0 && v.every(isInt32)) {
        this.u8(Tag.IntArray);
        this.u32(v.length);
        for (const n of v) this.i32(n);
        return;
      }
      this.u8(Tag.Array);
      this.u32(v.length);
      for (const item of v) this.value(item, seen);
      return;
    }
    if (ArrayBuffer.isView(v)) {
      const kind = TYPED.findIndex((T) => v instanceof T);
      if (kind < 0) throw new Error("Can't save this kind of typed array");
      const t = v as TypedArray;
      this.u8(Tag.Typed);
      this.u8(kind);
      this.u32(t.length);
      this.bytes(new Uint8Array(t.buffer, t.byteOffset, t.byteLength));
      return;
    }
    if (v instanceof Map) {
      this.u8(Tag.Map);
      this.u32(v.size);
      for (const [key, item] of v) {
        this.value(key, seen);
        this.value(item, seen);
      }
      return;
    }
    if (v instanceof Set) {
      this.u8(Tag.Set);
      this.u32(v.size);
      for (const item of v) this.value(item, seen);
      return;
    }
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) {
      this.u8(Tag.Object);
    } else {
      const name = CLASS_NAMES.get(proto);
      if (name === undefined) throw new Error("Can't save an instance of an unregistered class");
      this.u8(Tag.Instance);
      this.string(name);
    }
    this.fields(v as Record<string, unknown>, seen);
  }

  private fields(obj: Record<string, unknown>, seen: Map<object, number>): void {
    const keys = Object.keys(obj);
    this.u32(keys.length);
    for (const key of keys) {
      this.string(key);
      this.value(obj[key], seen);
    }
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

class Reader {
  private readonly view: DataView;
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private need(n: number): void {
    if (this.pos + n > this.buf.length) throw new Error("Save is cut short");
  }

  u8(): number {
    this.need(1);
    return this.buf[this.pos++]!;
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.need(n);
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }

  string(): string {
    return utf8Decode(this.bytes(this.u32()));
  }

  /** Reads any value; `refs` lists objects in the order they were first written. */
  value(refs: unknown[]): unknown {
    const tag = this.u8() as Tag;
    switch (tag) {
      case Tag.Undefined:
        return undefined;
      case Tag.Null:
        return null;
      case Tag.False:
        return false;
      case Tag.True:
        return true;
      case Tag.Int:
        return this.i32();
      case Tag.Float:
        return this.f64();
      case Tag.String:
        return this.string();
      case Tag.Ref: {
        const index = this.u32();
        if (index >= refs.length) throw new Error("Save has a broken reference");
        return refs[index];
      }
      case Tag.Array: {
        const n = this.u32();
        const out: unknown[] = [];
        refs.push(out);
        for (let i = 0; i < n; i++) out.push(this.value(refs));
        return out;
      }
      case Tag.IntArray: {
        const n = this.u32();
        const out: number[] = new Array<number>(n);
        refs.push(out);
        for (let i = 0; i < n; i++) out[i] = this.i32();
        return out;
      }
      case Tag.Typed: {
        const T = TYPED[this.u8()];
        if (!T) throw new Error("Save has an unknown typed array");
        const length = this.u32();
        const raw = this.bytes(length * T.BYTES_PER_ELEMENT);
        // Copy into fresh, aligned memory.
        const out = new T(length);
        new Uint8Array(out.buffer).set(raw);
        refs.push(out);
        return out;
      }
      case Tag.Map: {
        const n = this.u32();
        const out = new Map<unknown, unknown>();
        refs.push(out);
        for (let i = 0; i < n; i++) {
          const key = this.value(refs);
          out.set(key, this.value(refs));
        }
        return out;
      }
      case Tag.Set: {
        const n = this.u32();
        const out = new Set<unknown>();
        refs.push(out);
        for (let i = 0; i < n; i++) out.add(this.value(refs));
        return out;
      }
      case Tag.Object:
        return this.fields({}, refs);
      case Tag.Instance: {
        const cls = CLASSES[this.string()];
        if (!cls) throw new Error("Save holds an unknown kind of object");
        return this.fields(Object.create(cls.prototype) as Record<string, unknown>, refs);
      }
      default:
        throw new Error(`Save has an unknown value tag ${String(tag)}`);
    }
  }

  private fields(out: Record<string, unknown>, refs: unknown[]): Record<string, unknown> {
    refs.push(out);
    const n = this.u32();
    for (let i = 0; i < n; i++) {
      const key = this.string();
      out[key] = this.value(refs);
    }
    return out;
  }
}

function isInt32(v: unknown): v is number {
  return typeof v === "number" && (v | 0) === v && !Object.is(v, -0);
}

/** UTF-8 by hand, so core needs no platform text APIs. */
function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return Uint8Array.from(out);
}

function utf8Decode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length;) {
    const c = b[i++]!;
    let code: number;
    if (c < 0x80) code = c;
    else if (c < 0xe0) code = ((c & 31) << 6) | (b[i++]! & 63);
    else if (c < 0xf0) code = ((c & 15) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    else {
      code = ((c & 7) << 18) | ((b[i++]! & 63) << 12) | ((b[i++]! & 63) << 6) | (b[i++]! & 63);
    }
    s += String.fromCodePoint(code);
  }
  return s;
}
