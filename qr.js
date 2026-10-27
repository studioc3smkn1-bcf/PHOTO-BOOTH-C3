/* Pembuat QR code kecil (tanpa pustaka luar). Mode byte, level koreksi M, versi 1-12.
   Pemakaian: var svg = QR.toSvg("https://contoh.com/halaman", { size: 320 }); */
(function (root) {
  "use strict";

  // Tabel standar QR (urutan level: L, M, Q, H). Indeks = nomor versi.
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16]
  ];
  var FORMAT_BITS = [1, 0, 3, 2];
  var MAX_VERSION = 12;

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, ecl) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];
  }

  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [], i, j;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function addEccAndInterleave(data, ver, ecl) {
    var numBlocks = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var numShort = numBlocks - raw % numBlocks;
    var shortLen = Math.floor(raw / numBlocks);
    var blocks = [], div = rsDivisor(eccLen), i, k = 0;
    for (i = 0; i < numBlocks; i++) {
      var datLen = shortLen - eccLen + (i < numShort ? 0 : 1);
      var dat = data.slice(k, k + datLen); k += datLen;
      var ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  function utf8(text) {
    var s = unescape(encodeURIComponent(text)), out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function buildMatrix(ver, ecl, codewords) {
    var size = ver * 4 + 17, m = [], f = [], i, j;
    for (i = 0; i < size; i++) { m.push(new Array(size).fill(false)); f.push(new Array(size).fill(false)); }
    function setFn(x, y, dark) { m[y][x] = dark; f[y][x] = true; }

    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

    var pos = [];
    if (ver > 1) {
      var n = Math.floor(ver / 7) + 2;
      var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      pos = [6];
      for (var p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    }
    for (i = 0; i < pos.length; i++) for (j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) {
        setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    function formatBits(mask) {
      var data = (FORMAT_BITS[ecl] << 3) | mask, rem = data, k;
      for (k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      for (k = 0; k <= 5; k++) setFn(8, k, bit(bits, k));
      setFn(8, 7, bit(bits, 6)); setFn(8, 8, bit(bits, 7)); setFn(7, 8, bit(bits, 8));
      for (k = 9; k < 15; k++) setFn(14 - k, 8, bit(bits, k));
      for (k = 0; k < 8; k++) setFn(size - 1 - k, 8, bit(bits, k));
      for (k = 8; k < 15; k++) setFn(8, size - 15 + k, bit(bits, k));
      setFn(8, size - 8, true);
    }
    formatBits(0);
    if (ver >= 7) {
      var rem = ver, k;
      for (k = 0; k < 12; k++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (k = 0; k < 18; k++) {
        var a = size - 11 + k % 3, b = Math.floor(k / 3);
        setFn(a, b, bit(vb, k)); setFn(b, a, bit(vb, k));
      }
    }

    // taruh data
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
          if (!f[y][x] && idx < codewords.length * 8) {
            m[y][x] = bit(codewords[idx >>> 3], 7 - (idx & 7));
            idx++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var inv;
        switch (mask) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = x * y % 2 + x * y % 3 === 0; break;
          case 6: inv = (x * y % 2 + x * y % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + x * y % 3) % 2 === 0;
        }
        if (!f[y][x] && inv) m[y][x] = !m[y][x];
      }
    }
    function countPattern(str, pat) {
      var c = 0, at = str.indexOf(pat);
      while (at !== -1) { c++; at = str.indexOf(pat, at + 1); }
      return c;
    }
    function penalty() {
      var r = 0, x, y, run, col, dark = 0, lines = [], cols = [];
      for (y = 0; y < size; y++) {
        run = 0; col = false;
        var rowStr = "";
        for (x = 0; x < size; x++) {
          rowStr += m[y][x] ? "1" : "0";
          if (m[y][x]) dark++;
          if (m[y][x] === col) { run++; if (run === 5) r += 3; else if (run > 5) r++; } else { col = m[y][x]; run = 1; }
        }
        lines.push(rowStr);
      }
      for (x = 0; x < size; x++) {
        run = 0; col = false;
        var colStr = "";
        for (y = 0; y < size; y++) {
          colStr += m[y][x] ? "1" : "0";
          if (m[y][x] === col) { run++; if (run === 5) r += 3; else if (run > 5) r++; } else { col = m[y][x]; run = 1; }
        }
        cols.push(colStr);
      }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) r += 3;
      }
      lines.concat(cols).forEach(function (s) {
        r += countPattern(s, "10111010000") * 40 + countPattern(s, "00001011101") * 40;
      });
      var total = size * size;
      r += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return r;
    }

    var best = 0, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(mask); formatBits(mask);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = mask; }
      applyMask(mask);
    }
    applyMask(best); formatBits(best);
    return m;
  }

  // Hasil: matriks true/false (true = kotak gelap)
  function encode(text) {
    var ecl = 1, bytes = utf8(text), ver, cap;
    for (ver = 1; ver <= MAX_VERSION; ver++) {
      cap = dataCodewords(ver, ecl) * 8;
      var ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > MAX_VERSION) throw new Error("Teks terlalu panjang untuk QR");
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4); push(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });
    push(0, Math.min(4, cap - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0; for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }
    return buildMatrix(ver, ecl, addEccAndInterleave(data, ver, ecl));
  }

  // SVG hitam-putih dengan bingkai kosong 4 kotak
  function toSvg(text, opts) {
    opts = opts || {};
    var m = encode(text), n = m.length, q = 4, d = "";
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      if (m[y][x]) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z";
    }
    var s = n + q * 2, px = opts.size || 320;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" width="' + px + '" height="' + px +
      '" shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || "QR code") + '">' +
      '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  root.QR = { encode: encode, toSvg: toSvg };
})(typeof window !== "undefined" ? window : module.exports);
