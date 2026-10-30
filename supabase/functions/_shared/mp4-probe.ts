/**
 * Minimal MP4/MOV probe.
 *
 * Video Enhance must never take duration, resolution or frame rate from the
 * client payload: price, capability check and provider request all depend on
 * them. When the asset row does not carry verified values we measure them at
 * the source file itself, using ranged reads instead of downloading the whole
 * video.
 *
 * Only the boxes we actually need are parsed:
 *   moov > mvhd            duration / timescale
 *   moov > trak > tkhd     track dimensions
 *   moov > trak > mdia > mdhd + minf > stbl > stts   frame rate
 */

export interface ProbedVideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  container: string;
  sizeBytes: number;
  /**
   * Real video codec read from the sample description (`stsd`), e.g. `h264`,
   * `hevc`, `av1`. NEVER a MIME type — the container/MIME is a separate fact.
   */
  codec?: string;
  /** A track with handler `vide` (or dimensions) exists. */
  hasVideoTrack?: boolean;
  /** A track with handler `soun` exists. Listed in the container — not proof of audible content. */
  hasAudioTrack?: boolean;
}


export interface Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

const td = new TextDecoder();

function readBox(view: DataView, offset: number): Box | null {
  if (offset + 8 > view.byteLength) return null;
  let size = view.getUint32(offset);
  const type = td.decode(new Uint8Array(view.buffer, view.byteOffset + offset + 4, 4));
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > view.byteLength) return null;
    const hi = view.getUint32(offset + 8);
    const lo = view.getUint32(offset + 12);
    size = hi * 2 ** 32 + lo;
    headerSize = 16;
  } else if (size === 0) {
    size = view.byteLength - offset;
  }
  if (size < headerSize) return null;
  return { type, start: offset, headerSize, size };
}

function* children(view: DataView, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset < end) {
    const box = readBox(view, offset);
    if (!box) return;
    yield box;
    if (box.size <= 0) return;
    offset += box.size;
  }
}

function findBox(view: DataView, start: number, end: number, type: string): Box | null {
  for (const box of children(view, start, end)) {
    if (box.type === type) return box;
  }
  return null;
}

function parseMvhd(view: DataView, box: Box): { timescale: number; duration: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  if (version === 1) {
    const timescale = view.getUint32(p + 20);
    const hi = view.getUint32(p + 24);
    const lo = view.getUint32(p + 28);
    return { timescale, duration: hi * 2 ** 32 + lo };
  }
  return { timescale: view.getUint32(p + 12), duration: view.getUint32(p + 16) };
}

function parseTkhd(view: DataView, box: Box): { width: number; height: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  // tkhd layout:
  // v0: flags(3) + creation(4) + modification(4) + track_id(4) + reserved(4) +
  //     duration(4) + reserved(8) + layer(2) + alt_group(2) + volume(2) +
  //     reserved(2) + matrix(36) + width(4) + height(4)
  // v1: flags(3) + creation(8) + modification(8) + track_id(4) + reserved(4) +
  //     duration(8) + reserved(8) + layer(2) + alt_group(2) + volume(2) +
  //     reserved(2) + matrix(36) + width(4) + height(4)
  const base = version === 1 ? p + 88 : p + 76;
  const width = view.getUint32(base) / 65536;
  const height = view.getUint32(base + 4) / 65536;
  return { width: Math.round(width), height: Math.round(height) };
}

function parseMdhd(view: DataView, box: Box): { timescale: number; duration: number } {
  const p = box.start + box.headerSize;
  const version = view.getUint8(p);
  if (version === 1) {
    const timescale = view.getUint32(p + 20);
    const hi = view.getUint32(p + 24);
    const lo = view.getUint32(p + 28);
    return { timescale, duration: hi * 2 ** 32 + lo };
  }
  return { timescale: view.getUint32(p + 12), duration: view.getUint32(p + 16) };
}

function parseStts(view: DataView, box: Box): { samples: number; totalDelta: number } {
  const p = box.start + box.headerSize;
  const count = view.getUint32(p + 4);
  let samples = 0;
  let totalDelta = 0;
  for (let i = 0; i < count; i++) {
    const entry = p + 8 + i * 8;
    if (entry + 8 > box.start + box.size) break;
    const sampleCount = view.getUint32(entry);
    const sampleDelta = view.getUint32(entry + 4);
    samples += sampleCount;
    totalDelta += sampleCount * sampleDelta;
  }
  return { samples, totalDelta };
}

/** Four-character sample entry codes mapped to the names people recognise. */
const CODEC_NAMES: Record<string, string> = {
  avc1: 'h264',
  avc3: 'h264',
  hvc1: 'hevc',
  hev1: 'hevc',
  av01: 'av1',
  vp09: 'vp9',
  vp08: 'vp8',
  mp4v: 'mpeg4',
  'ap4h': 'prores',
  apcn: 'prores',
};

export function codecNameFromSampleEntry(fourcc: string): string | undefined {
  return CODEC_NAMES[fourcc] ?? (fourcc.trim() ? fourcc.trim().toLowerCase() : undefined);
}

/**
 * First sample entry type of a `stsd` box — the real codec of the track.
 *
 * stsd is a FullBox: version(1) + flags(3), then entry_count(4), then the
 * sample entries, each a regular box whose type is the codec fourcc
 * (`avc1`, `hvc1`, …). Never reads past the stsd box: an empty or truncated
 * table yields `undefined` instead of the type of whatever box follows.
 */
export function parseStsdCodec(view: DataView, stsd: Box): string | undefined {
  const body = stsd.start + stsd.headerSize;
  const end = stsd.start + stsd.size;
  if (body + 8 > end) return undefined;
  const entryCount = view.getUint32(body + 4);
  if (entryCount === 0) return undefined;
  const first = body + 8;
  if (first + 8 > end) return undefined;
  const entry = readBox(view, first);
  if (!entry || entry.start + entry.size > end) return undefined;
  return codecNameFromSampleEntry(entry.type);
}

/** Parses a complete `moov` box. Returns `null` when it holds no video track. */
/** Handler type of a track (`vide`, `soun`, …) from moov > trak > mdia > hdlr. */
export function trackHandler(view: DataView, trak: Box): string | undefined {
  const mdia = findBox(view, trak.start + trak.headerSize, trak.start + trak.size, 'mdia');
  if (!mdia) return undefined;
  const hdlr = findBox(view, mdia.start + mdia.headerSize, mdia.start + mdia.size, 'hdlr');
  if (!hdlr) return undefined;
  const p = hdlr.start + hdlr.headerSize + 8; // version/flags(4) + pre_defined(4)
  if (p + 4 > hdlr.start + hdlr.size) return undefined;
  return td.decode(new Uint8Array(view.buffer, view.byteOffset + p, 4));
}

export function parseMoov(moov: Uint8Array, sizeBytes = 0, container = 'mp4'): ProbedVideoMetadata | null {
  const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const root = readBox(view, 0);
  if (!root || root.type !== 'moov') return null;

  const bodyStart = root.headerSize;
  const bodyEnd = Math.min(root.size, moov.byteLength);

  const mvhd = findBox(view, bodyStart, bodyEnd, 'mvhd');
  if (!mvhd) return null;
  const movie = parseMvhd(view, mvhd);
  const movieDuration = movie.timescale > 0 ? movie.duration / movie.timescale : 0;

  let hasAudioTrack = false;
  for (const t of children(view, bodyStart, bodyEnd)) if (t.type === 'trak' && trackHandler(view, t) === 'soun') hasAudioTrack = true;

  let best: ProbedVideoMetadata | null = null;
  for (const trak of children(view, bodyStart, bodyEnd)) {
    if (trak.type !== 'trak') continue;
    const trakStart = trak.start + trak.headerSize;
    const trakEnd = trak.start + trak.size;
    const tkhd = findBox(view, trakStart, trakEnd, 'tkhd');
    if (!tkhd) continue;
    const { width, height } = parseTkhd(view, tkhd);
    // Audio tracks report 0x0 — only video tracks carry dimensions.
    if (width <= 0 || height <= 0) continue;
    const handler = trackHandler(view, trak);
    if (handler && handler !== 'vide') continue;

    const mdia = findBox(view, trakStart, trakEnd, 'mdia');
    let fps = 0;
    let codec: string | undefined;
    let trackDuration = movieDuration;
    if (mdia) {
      const mdiaStart = mdia.start + mdia.headerSize;
      const mdiaEnd = mdia.start + mdia.size;
      const mdhd = findBox(view, mdiaStart, mdiaEnd, 'mdhd');
      const media = mdhd ? parseMdhd(view, mdhd) : null;
      if (media && media.timescale > 0) trackDuration = media.duration / media.timescale;

      const minf = findBox(view, mdiaStart, mdiaEnd, 'minf');
      const stbl = minf
        ? findBox(view, minf.start + minf.headerSize, minf.start + minf.size, 'stbl')
        : null;
      const stts = stbl
        ? findBox(view, stbl.start + stbl.headerSize, stbl.start + stbl.size, 'stts')
        : null;
      if (stts && media && media.timescale > 0) {
        const { samples, totalDelta } = parseStts(view, stts);
        if (samples > 0 && totalDelta > 0) fps = samples / (totalDelta / media.timescale);
      }
      const stsd = stbl
        ? findBox(view, stbl.start + stbl.headerSize, stbl.start + stbl.size, 'stsd')
        : null;
      if (stsd) codec = parseStsdCodec(view, stsd);
    }
    if (!fps && trackDuration > 0) fps = 0;

    const candidate: ProbedVideoMetadata = {
      durationSeconds: Number((trackDuration || movieDuration).toFixed(3)),
      width,
      height,
      fps: Number(fps.toFixed(3)),
      container,
      sizeBytes,
      codec,
      hasVideoTrack: true,
      hasAudioTrack,
    };

    if (!best || candidate.width * candidate.height > best.width * best.height) best = candidate;
  }
  return best;
}

async function rangeFetch(url: string, start: number, end: number, f: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await f(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) throw new Error(`range read failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Measures a remote MP4/MOV. Scans the top-level box list to locate `moov`
 * (which can sit at the end of the file) and reads only that box.
 */
export async function probeRemoteVideo(url: string, f: typeof fetch = fetch): Promise<ProbedVideoMetadata> {
  const head = await f(url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`source not reachable: ${head.status}`);
  const sizeBytes = Number(head.headers.get('content-length') ?? 0);
  const contentType = head.headers.get('content-type') ?? '';
  const container = contentType.includes('quicktime') ? 'mov' : 'mp4';
  if (!sizeBytes) throw new Error('source has no content-length');

  let offset = 0;
  for (let guard = 0; guard < 64 && offset < sizeBytes; guard++) {
    const header = await rangeFetch(url, offset, Math.min(offset + 15, sizeBytes - 1), f);
    if (header.byteLength < 8) break;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const box = readBox(view, 0);
    if (!box) break;
    if (box.type === 'moov') {
      const moov = await rangeFetch(url, offset, Math.min(offset + box.size - 1, sizeBytes - 1), f);
      const parsed = parseMoov(moov, sizeBytes, container);
      if (!parsed) throw new Error('no video track found');
      return parsed;
    }
    offset += box.size;
  }

  // moov is often at the end of the file; scan backwards from the end.
  const tailStart = Math.max(0, sizeBytes - 1024 * 1024);
  const tail = await rangeFetch(url, tailStart, sizeBytes - 1, f);
  for (let guard = 0, tailOffset = tail.byteLength - 1; guard < 64 && tailOffset >= 8; guard++) {
    // Search backwards for the 'moov' type signature.
    let idx = -1;
    for (let i = tailOffset - 4; i >= 0; i--) {
      if (tail[i] === 0x6d && tail[i + 1] === 0x6f && tail[i + 2] === 0x6f && tail[i + 3] === 0x76) {
        idx = i;
        break;
      }
    }
    if (idx < 0) break;
    const boxOffsetInTail = idx - 4;
    if (boxOffsetInTail < 0) break;
    const sizeView = new DataView(tail.buffer, tail.byteOffset + boxOffsetInTail, 4);
    const boxSize = sizeView.getUint32(0);
    if (boxSize < 8 || boxOffsetInTail + boxSize > tail.byteLength) {
      tailOffset = boxOffsetInTail;
      continue;
    }
    const moov = tail.subarray(boxOffsetInTail, boxOffsetInTail + boxSize);
    const parsed = parseMoov(moov, sizeBytes, container);
    if (parsed) return parsed;
    tailOffset = boxOffsetInTail;
  }

  throw new Error('moov box not found');
}
