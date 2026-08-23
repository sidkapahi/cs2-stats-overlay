// Minimal, dependency-free ZIP writer using the "store" (no compression) method.
// This is enough to bundle a handful of small text files (HTML + README) into a
// valid .zip the browser can download — compression would add a library for no
// real benefit at this size.

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
const u32 = (n: number) =>
  new Uint8Array([
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ]);

export interface ZipEntry {
  name: string;
  /** UTF-8 text content. */
  data: string;
}

/** Packs the given text entries into a single stored (uncompressed) .zip Blob. */
export function createZip(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  // Fixed DOS timestamp of 1980-01-01 00:00 — the files' content is what matters,
  // not a modification time, and a constant keeps the output deterministic.
  const dosTime = u16(0);
  const dosDate = u16(0x0021);
  const utf8Flag = u16(0x0800); // filenames are UTF-8

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.data);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const local = concat([
      u32(0x04034b50), // local file header signature
      u16(20), // version needed to extract
      utf8Flag,
      u16(0), // compression method: 0 = store
      dosTime,
      dosDate,
      u32(crc),
      u32(size), // compressed size
      u32(size), // uncompressed size
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
      dataBytes,
    ]);
    localParts.push(local);

    const central = concat([
      u32(0x02014b50), // central directory header signature
      u16(20), // version made by
      u16(20), // version needed to extract
      utf8Flag,
      u16(0), // compression method
      dosTime,
      dosDate,
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra field length
      u16(0), // file comment length
      u16(0), // disk number start
      u16(0), // internal file attributes
      u32(0), // external file attributes
      u32(offset), // relative offset of local header
      nameBytes,
    ]);
    centralParts.push(central);

    offset += local.length;
  }

  const centralData = concat(centralParts);
  const end = concat([
    u32(0x06054b50), // end of central directory signature
    u16(0), // number of this disk
    u16(0), // disk with central directory
    u16(entries.length), // entries on this disk
    u16(entries.length), // total entries
    u32(centralData.length),
    u32(offset), // offset of central directory
    u16(0), // comment length
  ]);

  const bytes = concat([...localParts, centralData, end]);
  // Cast around the DOM lib typing Uint8Array as generic over ArrayBufferLike;
  // a plain Uint8Array is a valid BlobPart at runtime.
  return new Blob([bytes as BlobPart], { type: 'application/zip' });
}
