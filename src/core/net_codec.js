/**
 * MÃ HÓA NHỊ PHÂN GÓI TRẠNG THÁI XE (dùng chung máy chủ Node & trình duyệt)
 * Máy chủ gom trạng thái mọi xe đã thay đổi trong 1 nhịp (50 ms) thành 1 gói nhị phân cho từng máy nhận.
 *
 * Gói SNAP (little-endian):
 *   u8 loại (=1) | u8 phiên bản (=1) | f64 mốc thời gian (ms, đồng hồ máy chủ) | u16 số xe
 *   mỗi xe: u8 số hiệu | u8 mặt nạ trường | u8 cờ | i16 lệch thời gian so với mốc (ms)
 *           rồi các trường có bit trong mặt nạ, theo thứ tự:
 *           x i32 | z i32 | b i16 | a u16 | e i16 | s i16 | h u16 | f u8
 *           và nếu cờ bit2: loại đạn u8 (mã trong AMMO; 255 = chuỗi tự do: u8 độ dài + UTF-8)
 *   cờ: bit0 = xe đã khuất tầm nhìn (không có toạ độ) | bit1 = trạng thái đầy đủ | bit2 = có loại đạn
 * Giá trị các trường giữ nguyên dạng lượng tử hóa của NetGameSync.quantize (x, z: 0.1 đv; b: 0.001 rad; a, e, s: 0.1; h: máu x100).
 */
const NetCodec = (() => {
  const MSG_SNAP = 1, VERSION = 1;
  const AMMO = ['', 'NORMAL', 'AP', 'HE', 'CLUSTER', 'RPG', 'ANTI_TANK_MISSILE', 'GATLING_BULLET', 'INCENDIARY', 'SCOUT_BULLET', 'CLUSTER_SUBMUNITION'];
  const AMMO_CODE = new Map(AMMO.map((a, i) => [a, i]));
  // [tên trường, kiểu, số byte, min, max]
  const FIELDS = [
    ['x', 'i32', 4, -2147483648, 2147483647], ['z', 'i32', 4, -2147483648, 2147483647],
    ['b', 'i16', 2, -32768, 32767], ['a', 'u16', 2, 0, 65535], ['e', 'i16', 2, -32768, 32767],
    ['s', 'i16', 2, -32768, 32767], ['h', 'u16', 2, 0, 65535], ['f', 'u8', 1, 0, 255]
  ];
  const clampI = (v, lo, hi) => { v = Math.round(Number(v) || 0); return v < lo ? lo : v > hi ? hi : v; };
  const te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  /**
   * entries: [{ i, hid?, full?, ts?, q?: { x, z, b, a, e, s, h, f, m } }] — chỉ các trường có trong q được ghi.
   * Trả về Uint8Array.
   */
  function encodeSnap(baseTs, entries) {
    // tính kích thước trước
    let size = 12;
    const extra = [];
    for (const e of entries) {
      size += 5;
      if (e.hid || !e.q) { extra.push(null); continue; }
      for (const F of FIELDS) if (e.q[F[0]] !== undefined) size += F[2];
      let ammo = null;
      if (e.q.m !== undefined) {
        const c = AMMO_CODE.get(e.q.m);
        if (c !== undefined) { ammo = { c }; size += 1; }
        else { const bytes = te ? te.encode(String(e.q.m).slice(0, 40)) : Buffer.from(String(e.q.m).slice(0, 40)); ammo = { c: 255, bytes }; size += 2 + bytes.length; }
      }
      extra.push(ammo);
    }
    const buf = new Uint8Array(size), dv = new DataView(buf.buffer);
    let o = 0;
    dv.setUint8(o, MSG_SNAP); dv.setUint8(o + 1, VERSION); dv.setFloat64(o + 2, baseTs, true); dv.setUint16(o + 10, entries.length, true); o = 12;
    entries.forEach((e, k) => {
      let mask = 0, flags = 0;
      if (e.hid || !e.q) flags |= 1;
      else FIELDS.forEach((F, bit) => { if (e.q[F[0]] !== undefined) mask |= 1 << bit; });
      if (e.full) flags |= 2;
      const ammo = extra[k];
      if (ammo) flags |= 4;
      dv.setUint8(o, e.i); dv.setUint8(o + 1, mask); dv.setUint8(o + 2, flags);
      dv.setInt16(o + 3, clampI((e.ts !== undefined ? e.ts : baseTs) - baseTs, -32768, 32767), true);
      o += 5;
      if (flags & 1) return;
      for (const F of FIELDS) {
        const v = e.q[F[0]];
        if (v === undefined) continue;
        const n = clampI(v, F[3], F[4]);
        switch (F[1]) {
          case 'i32': dv.setInt32(o, n, true); break;
          case 'i16': dv.setInt16(o, n, true); break;
          case 'u16': dv.setUint16(o, n, true); break;
          default: dv.setUint8(o, n);
        }
        o += F[2];
      }
      if (ammo) {
        dv.setUint8(o++, ammo.c);
        if (ammo.c === 255) { dv.setUint8(o++, ammo.bytes.length); buf.set(ammo.bytes, o); o += ammo.bytes.length; }
      }
    });
    return buf;
  }

  /** ArrayBuffer | Uint8Array -> { type: 'SNAP', baseTs, u: [{ i, hid, full, ts, q }] } | null */
  function decode(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (u8.length < 12) return null;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint8(0) !== MSG_SNAP || dv.getUint8(1) !== VERSION) return null;
    const baseTs = dv.getFloat64(2, true), n = dv.getUint16(10, true), u = [];
    let o = 12;
    try {
      for (let k = 0; k < n; k++) {
        const i = dv.getUint8(o), mask = dv.getUint8(o + 1), flags = dv.getUint8(o + 2), ts = baseTs + dv.getInt16(o + 3, true);
        o += 5;
        const e = { i, hid: !!(flags & 1), full: !!(flags & 2), ts };
        if (!e.hid) {
          const q = {};
          FIELDS.forEach((F, bit) => {
            if (!(mask & (1 << bit))) return;
            switch (F[1]) {
              case 'i32': q[F[0]] = dv.getInt32(o, true); break;
              case 'i16': q[F[0]] = dv.getInt16(o, true); break;
              case 'u16': q[F[0]] = dv.getUint16(o, true); break;
              default: q[F[0]] = dv.getUint8(o);
            }
            o += F[2];
          });
          if (flags & 4) {
            const c = dv.getUint8(o++);
            if (c === 255) { const len = dv.getUint8(o++); q.m = td ? td.decode(u8.subarray(o, o + len)) : String.fromCharCode.apply(null, u8.subarray(o, o + len)); o += len; }
            else q.m = AMMO[c] !== undefined ? AMMO[c] : '';
          }
          e.q = q;
        }
        u.push(e);
      }
    } catch (err) { return null; }   // gói cụt / hỏng
    return { type: 'SNAP', baseTs, u };
  }

  return { encodeSnap, decode, AMMO };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NetCodec;
else if (typeof window !== 'undefined') window.NetCodec = NetCodec;
