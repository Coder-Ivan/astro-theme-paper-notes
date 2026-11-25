function tiffOrientation(data) {
  if (data.length < 20 || !data.subarray(0, 6).equals(Buffer.from('Exif\0\0'))) return 1;
  const tiff = data.subarray(6);
  const little = tiff.toString('ascii', 0, 2) === 'II';
  if (!little && tiff.toString('ascii', 0, 2) !== 'MM') return 1;
  const u16 = offset => little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = offset => little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (u16(2) !== 42) return 1;
  const dir = u32(4);
  if (dir + 2 > tiff.length) return 1;
  const count = u16(dir);
  for (let i = 0; i < count; i++) {
    const pos = dir + 2 + i * 12;
    if (pos + 12 > tiff.length) break;
    if (u16(pos) === 274 && u16(pos + 2) === 3 && u32(pos + 4) === 1) {
      const orientation = u16(pos + 8);
      return orientation >= 1 && orientation <= 8 ? orientation : 1;
    }
  }
  return 1;
}

function orientationMarker(orientation) {
  // Whitelist one TIFF entry so portrait photos retain their orientation.
  const marker = Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010001000000000000', 'hex');
  marker.writeUInt16BE(orientation, 28);
  return marker;
}

function jpegImage(data) {
  let pos = 2;
  let changed = false;
  const result = [data.subarray(0, 2)];
  while (pos < data.length) {
    const start = pos;
    if (data[pos] !== 255) throw new Error('JPEG 图像段无效。');
    while (data[pos] === 255) pos++;
    const marker = data[pos++];
    if (marker === 0xd9) {
      result.push(data.subarray(start, pos));
      // MPO and motion photos may append secondary images with more metadata.
      return changed || pos !== data.length ? Buffer.concat(result) : data;
    }
    const size = pos + 2 <= data.length ? data.readUInt16BE(pos) : 0;
    if (size < 2 || pos + size > data.length) throw new Error('JPEG 图像段不完整。');
    const payload = data.subarray(pos + 2, pos + size);
    const isMpf = marker === 0xe2 && payload.toString('ascii', 0, 4) === 'MPF\0';
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe || isMpf) {
      changed = true;
      const orientation = marker === 0xe1 ? tiffOrientation(payload) : 1;
      if (orientation !== 1) result.push(orientationMarker(orientation));
    } else {
      result.push(data.subarray(start, pos + size));
    }
    pos += size;
    if (marker !== 0xda) continue;
    const pixels = pos;
    while (pos < data.length) {
      const mark = data.indexOf(255, pos);
      if (mark === -1) throw new Error('JPEG 图像数据不完整。');
      pos = mark + 1;
      while (data[pos] === 255) pos++;
      if (data[pos] === 0 || (data[pos] >= 0xd0 && data[pos] <= 0xd7)) { pos++; continue; }
      pos = mark;
      break;
    }
    result.push(data.subarray(pixels, pos));
  }
  throw new Error('JPEG 图像没有结束标记。');
}

export function stripPhotoLocation(data) {
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) return jpegImage(data);
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    const result = [data.subarray(0, 8)];
    let changed = false;
    for (let pos = 8; pos < data.length;) {
      if (pos + 12 > data.length) throw new Error('PNG 图像段不完整。');
      const end = pos + data.readUInt32BE(pos) + 12;
      if (end > data.length) throw new Error('PNG 图像段不完整。');
      const tag = data.toString('ascii', pos + 4, pos + 8);
      if (['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(tag)) changed = true;
      else result.push(data.subarray(pos, end));
      pos = end;
    }
    return changed ? Buffer.concat(result) : data;
  }
  return data;
}
