/**
 * Pure-JS MD5 implementation (RFC 1321).
 *
 * Used for the Content-MD5 header required by S3 DeleteObjects.
 * Web Crypto API does not support MD5, so we implement it directly —
 * this works in Node.js, Cloudflare Workers, Vercel Edge, and Deno.
 *
 * @param content - UTF-8 string to hash
 * @returns Base64-encoded MD5 digest
 */
export function md5Base64(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const len = bytes.length;
  const msgBits = len * 8;

  // Pad to 56 mod 64 bytes, then append 8-byte little-endian bit length
  const padLen = ((55 - len) % 64 + 64) % 64 + 1;
  const padded = new Uint8Array(len + padLen + 8);
  padded.set(bytes);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(len + padLen, msgBits >>> 0, true);
  dv.setUint32(len + padLen + 4, Math.floor(msgBits / 0x100000000), true);

  // Initial hash state (RFC 1321 §3.3)
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  // Precomputed: T[i] = floor(2^32 * |sin(i+1)|)  (RFC 1321 §3.4)
  // prettier-ignore
  const T = new Uint32Array([
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ]);

  // Per-round shift amounts (RFC 1321 §3.4)
  // prettier-ignore
  const S = [
     7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
     5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
     4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
     6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
  ];

  // Process 64-byte chunks
  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = dv.getUint32(offset + i * 4, true);
    }

    let aa = a, bb = b, cc = c, dd = d;

    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) {
        f = (b & c) | (~b & d); // F
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c); // G
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;           // H
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);        // I
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + M[g] + T[i]) | 0;
      b = (b + ((sum << S[i]) | (sum >>> (32 - S[i])))) | 0;
      a = tmp;
    }

    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }

  // Encode 128-bit little-endian digest as base64
  const digest = new Uint8Array(16);
  const rdv = new DataView(digest.buffer);
  rdv.setUint32(0, a, true);
  rdv.setUint32(4, b, true);
  rdv.setUint32(8, c, true);
  rdv.setUint32(12, d, true);

  let binary = "";
  for (let i = 0; i < 16; i++) binary += String.fromCharCode(digest[i]);
  return btoa(binary);
}
