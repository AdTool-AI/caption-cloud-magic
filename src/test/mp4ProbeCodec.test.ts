import { describe, expect, it } from 'vitest';

import {
  codecNameFromSampleEntry,
  parseMoov,
  parseStsdCodec,
} from '../../supabase/functions/_shared/mp4-probe.ts';

/**
 * Synthetic `moov` boxes, byte-exact per ISO 14496-12, so the codec parser is
 * proven on real box layouts — not on strings.
 */

const enc = new TextEncoder();

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}
function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}
function box(type: string, ...payloads: (number[] | Uint8Array)[]): Uint8Array {
  const body = payloads.flatMap((p) => Array.from(p));
  const out = new Uint8Array(8 + body.length);
  out.set(u32(out.length), 0);
  out.set(enc.encode(type), 4);
  out.set(body, 8);
  return out;
}
const zeros = (n: number) => new Array<number>(n).fill(0);

/** mvhd v0: version/flags, creation, modification, timescale, duration, rest. */
function mvhd(timescale: number, duration: number) {
  return box('mvhd', zeros(4), zeros(4), zeros(4), u32(timescale), u32(duration), zeros(80));
}
/** tkhd v0: width/height at byte 76 of the body as 16.16 fixed point. */
function tkhd(width: number, height: number) {
  return box('tkhd', zeros(76), u32(width << 16), u32(height << 16));
}
/** mdhd v0: timescale at +12, duration at +16. */
function mdhd(timescale: number, duration: number) {
  return box('mdhd', zeros(12), u32(timescale), u32(duration), zeros(4));
}
function stts(entries: [count: number, delta: number][]) {
  return box('stts', zeros(4), u32(entries.length), ...entries.map(([c, d]) => [...u32(c), ...u32(d)]));
}
/** stsd: version/flags, entry_count, then sample entries (each a box). */
function stsd(entryCount: number, ...entries: Uint8Array[]) {
  return box('stsd', zeros(4), u32(entryCount), ...entries);
}
/** A visual sample entry — 78 bytes of body per spec; content is irrelevant here. */
function sampleEntry(fourcc: string) {
  return box(fourcc, zeros(78));
}

function videoTrack(sampleEntryType: string, opts: { entryCount?: number; trailingBox?: Uint8Array } = {}) {
  const entryCount = opts.entryCount ?? 1;
  const stblChildren = [
    stsd(entryCount, ...(entryCount > 0 ? [sampleEntry(sampleEntryType)] : [])),
    ...(opts.trailingBox ? [opts.trailingBox] : []),
    stts([[240, 1000]]), // 240 frames, 1000 ticks each
  ];
  const stbl = box('stbl', ...stblChildren);
  const minf = box('minf', stbl);
  const mdia = box('mdia', mdhd(24_000, 240_000), minf);
  return box('trak', tkhd(1080, 1920), mdia);
}

function moov(track: Uint8Array) {
  return box('moov', mvhd(1000, 10_000), track);
}

describe('mp4 probe — codec from the stsd sample entry', () => {
  it('avc1 -> h264 with the dimensions, fps and duration of the track', () => {
    const meta = parseMoov(moov(videoTrack('avc1')), 1234, 'mp4')!;
    expect(meta.codec).toBe('h264');
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    expect(meta.fps).toBeCloseTo(24, 3);
    expect(meta.durationSeconds).toBeCloseTo(10, 3);
    expect(meta.container).toBe('mp4');
    expect(meta.sizeBytes).toBe(1234);
  });

  it('hvc1 and hev1 -> hevc', () => {
    expect(parseMoov(moov(videoTrack('hvc1')))!.codec).toBe('hevc');
    expect(parseMoov(moov(videoTrack('hev1')))!.codec).toBe('hevc');
  });

  it('avc3 -> h264, av01 -> av1, unknown fourcc passes through lower-cased', () => {
    expect(parseMoov(moov(videoTrack('avc3')))!.codec).toBe('h264');
    expect(parseMoov(moov(videoTrack('av01')))!.codec).toBe('av1');
    expect(parseMoov(moov(videoTrack('XyZw')))!.codec).toBe('xyzw');
    expect(codecNameFromSampleEntry('   ')).toBeUndefined();
  });

  it('keeps codec separate from container / MIME', () => {
    const mov = parseMoov(moov(videoTrack('hvc1')), 0, 'mov')!;
    expect(mov.container).toBe('mov');
    expect(mov.codec).toBe('hevc');
    expect(mov.codec).not.toMatch(/^video\//);
    expect(mov.codec).not.toBe(mov.container);
  });

  it('an empty sample table yields no codec — never the type of the following box', () => {
    // entry_count = 0 and a `free` box directly behind the stsd header
    const track = videoTrack('avc1', { entryCount: 0, trailingBox: box('free', zeros(4)) });
    const meta = parseMoov(moov(track))!;
    expect(meta.codec).toBeUndefined();
    expect(meta.width).toBe(1080);
  });

  it('parseStsdCodec never reads past a truncated stsd', () => {
    // stsd claims one entry but has no room for an entry header
    const truncated = box('stsd', zeros(4), u32(1));
    const followedBy = box('avc1', zeros(78));
    const buf = new Uint8Array(truncated.length + followedBy.length);
    buf.set(truncated, 0);
    buf.set(followedBy, truncated.length);
    const view = new DataView(buf.buffer);
    expect(
      parseStsdCodec(view, { type: 'stsd', start: 0, headerSize: 8, size: truncated.length }),
    ).toBeUndefined();
  });
});

describe('mp4 probe — audio/video tracks from hdlr', () => {
  const hdlr = (h: string) => box('hdlr', zeros(8), Array.from(enc.encode(h)), zeros(12));
  const audioTrak = box('trak', tkhd(0, 0), box('mdia', mdhd(48_000, 1_440_000), hdlr('soun')));
  const videoTrak = box('trak', tkhd(1080, 1920), box('mdia', mdhd(24_000, 720_000), hdlr('vide'), box('minf', box('stbl', stsd(1, sampleEntry('avc1')), stts([[720, 1000]])))));
  it('reports both tracks', () => {
    const m = parseMoov(box('moov', mvhd(1000, 30_000), videoTrak, audioTrak))!;
    expect(m.hasVideoTrack).toBe(true); expect(m.hasAudioTrack).toBe(true);
    expect(m.durationSeconds).toBeCloseTo(30, 3); expect(m.width).toBe(1080);
  });
  it('video only → no audio', () => {
    expect(parseMoov(box('moov', mvhd(1000, 30_000), videoTrak))!.hasAudioTrack).toBe(false);
  });
});
