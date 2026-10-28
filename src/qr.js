/* The QR code of an invite, drawn here so no library travels with the page.

   It is the standard symbol in byte mode at the medium level of correction,
   the smallest version that holds the text, after the reference algorithm of
   the QR Code generator library by Project Nayuki (MIT licence): the codewords
   with their Reed-Solomon blocks, interleaved, laid out between the finder,
   timing and alignment patterns, masked by the pattern that scores lowest,
   then the format and version bits. The drawing is an SVG of one path. */
(function (root) {
  'use strict';

  /* Medium correction, versions 1 to 40: the codewords of correction per
     block, and the count of blocks. */
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  var FORMAT_M = 0;   /* the two bits of the medium level */

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function rawModules(ver) {
    var n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }

  function dataCodewords(ver) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * BLOCKS[ver];
  }

  /* ---- Reed-Solomon over GF(256), the polynomial 0x11D ---- */

  function mul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function divisor(degree) {
    var out = [];
    for (var i = 0; i < degree - 1; i++) out.push(0);
    out.push(1);
    var r = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < out.length; j++) {
        out[j] = mul(out[j], r);
        if (j + 1 < out.length) out[j] ^= out[j + 1];
      }
      r = mul(r, 0x02);
    }
    return out;
  }

  function remainder(data, div) {
    var out = div.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ out.shift();
      out.push(0);
      div.forEach(function (coef, i) { out[i] ^= mul(coef, factor); });
    });
    return out;
  }

  /* ---- the codewords ---- */

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(text));
    var s = unescape(encodeURIComponent(text));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes) {
    var ver = 0;
    for (var v = 1; v <= 40; v++) {
      var countBits = v <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('the text is too long for a QR code');
    var bits = [];
    function put(value, len) { for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    return { ver: ver, data: interleave(ver, data) };
  }

  function interleave(ver, data) {
    var numBlocks = BLOCKS[ver];
    var eccLen = ECC_PER_BLOCK[ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var shortBlocks = numBlocks - raw % numBlocks;
    var shortLen = Math.floor(raw / numBlocks);
    var div = divisor(eccLen);
    var blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = remainder(dat, div);
      if (i < shortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var out = [];
    for (var c = 0; c < blocks[0].length; c++) {
      blocks.forEach(function (b, j) {
        if (c !== shortLen - eccLen || j >= shortBlocks) out.push(b[c]);
      });
    }
    return out;
  }

  /* ---- the symbol ---- */

  function Symbol(ver) {
    this.ver = ver;
    this.size = ver * 4 + 17;
    this.dark = [];
    this.fixed = [];
    for (var y = 0; y < this.size; y++) {
      this.dark.push(new Array(this.size).fill(false));
      this.fixed.push(new Array(this.size).fill(false));
    }
  }

  Symbol.prototype.set = function (x, y, dark) {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  };

  Symbol.prototype.alignments = function () {
    var ver = this.ver;
    if (ver === 1) return [];
    var count = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2;
    var out = [6];
    for (var pos = this.size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
    return out;
  };

  Symbol.prototype.patterns = function () {
    var size = this.size;
    var self = this;
    for (var i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          var x = c[0] + dx, y = c[1] + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) self.set(x, y, d !== 2 && d !== 4);
        }
      }
    });
    var pos = this.alignments();
    var last = pos.length - 1;
    pos.forEach(function (a, i) {
      pos.forEach(function (b, j) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) self.set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      });
    });
    this.format(0);
    this.version();
  };

  Symbol.prototype.format = function (mask) {
    var data = (FORMAT_M << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    var size = this.size;
    for (var a = 0; a <= 5; a++) this.set(8, a, bit(bits, a));
    this.set(8, 7, bit(bits, 6));
    this.set(8, 8, bit(bits, 7));
    this.set(7, 8, bit(bits, 8));
    for (var b = 9; b < 15; b++) this.set(14 - b, 8, bit(bits, b));
    for (var c = 0; c < 8; c++) this.set(size - 1 - c, 8, bit(bits, c));
    for (var d = 8; d < 15; d++) this.set(8, size - 15 + d, bit(bits, d));
    this.set(8, size - 8, true);
  };

  Symbol.prototype.version = function () {
    if (this.ver < 7) return;
    var rem = this.ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (this.ver << 12) | rem;
    for (var k = 0; k < 18; k++) {
      var on = bit(bits, k);
      var a = this.size - 11 + k % 3, b = Math.floor(k / 3);
      this.set(a, b, on);
      this.set(b, a, on);
    }
  };

  Symbol.prototype.place = function (data) {
    var size = this.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var up = ((right + 1) & 2) === 0;
          var y = up ? size - 1 - vert : vert;
          if (!this.fixed[y][x] && i < data.length * 8) {
            this.dark[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  function masked(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
  }

  Symbol.prototype.mask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        if (!this.fixed[y][x] && masked(mask, x, y)) this.dark[y][x] = !this.dark[y][x];
      }
    }
  };

  /* The penalty of a mask: long runs of one colour, two by two blocks, and
     a balance far from half dark. The finder-like rule is left out: every
     mask is a valid symbol, the score only picks the easiest one to read. */
  Symbol.prototype.penalty = function () {
    var size = this.size, d = this.dark, score = 0, darkCount = 0;
    for (var y = 0; y < size; y++) {
      for (var pass = 0; pass < 2; pass++) {
        var run = 1;
        for (var x = 1; x < size; x++) {
          var a = pass ? d[x][y] : d[y][x];
          var b = pass ? d[x - 1][y] : d[y][x - 1];
          if (a === b) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
        }
      }
      for (var x2 = 0; x2 < size; x2++) {
        if (d[y][x2]) darkCount++;
        if (y + 1 < size && x2 + 1 < size && d[y][x2] === d[y][x2 + 1] && d[y][x2] === d[y + 1][x2] && d[y][x2] === d[y + 1][x2 + 1]) score += 3;
      }
    }
    var total = size * size;
    score += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;
    return score;
  };

  function encode(text) {
    var cw = codewords(utf8(String(text)));
    var sym = new Symbol(cw.ver);
    sym.patterns();
    sym.place(cw.data);
    var best = -1, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      sym.mask(m);
      sym.format(m);
      var score = sym.penalty();
      if (score < bestScore) { best = m; bestScore = score; }
      sym.mask(m);
    }
    sym.mask(best);
    sym.format(best);
    return { size: sym.size, version: cw.ver, dark: sym.dark };
  }

  /* One path of dark squares on a light ground, with the quiet zone of four
     modules the standard asks for. */
  function svg(text, opts) {
    var q = encode(text);
    var border = 4;
    var dim = q.size + border * 2;
    var d = '';
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.dark[y][x]) d += 'M' + (x + border) + ',' + (y + border) + 'h1v1h-1z';
      }
    }
    var label = (opts && opts.label) ? ' role="img" aria-label="' + String(opts.label).replace(/"/g, '&quot;') + '"' : ' aria-hidden="true"';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges"' + label + '>' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  root.SheetQR = { encode: encode, svg: svg };
})(typeof window !== 'undefined' ? window : this);
