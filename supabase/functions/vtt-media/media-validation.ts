import { imageInfo } from "./image-validation.ts";
/** Detect the container signature rather than trusting an extension or declared MIME. SVG/HTML are rejected. */
export function mediaInfo(bytes: Uint8Array): {
  mime: string;
  width: number | null;
  height: number | null;
} {
  if (bytes.length < 16) throw Error("Media file is incomplete");
  const text = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  if (text(0, 4) === "RIFF" && text(8, 12) === "WAVE" && bytes.length >= 44)
    return { mime: "audio/wav", width: null, height: null };
  if (
    text(0, 4) === "OggS" &&
    bytes[4] === 0 &&
    (text(0, 256).includes("OpusHead") || text(0, 256).includes("vorbis"))
  )
    return { mime: "audio/ogg", width: null, height: null };
  let offset = 0;
  if (text(0, 3) === "ID3") {
    if (bytes[3] > 4 || bytes.slice(6, 10).some((n) => n > 127))
      throw Error("Invalid MP3 ID3 header");
    offset =
      10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
    if (bytes[5] & 16) offset += 10;
  }
  if (
    offset + 4 < bytes.length &&
    bytes[offset] === 255 &&
    (bytes[offset + 1] & 0xe0) === 0xe0 &&
    (bytes[offset + 1] & 6) !== 0 &&
    (bytes[offset + 2] & 0xf0) !== 0 &&
    (bytes[offset + 2] & 0xf0) !== 0xf0 &&
    (bytes[offset + 2] & 12) !== 12
  )
    return { mime: "audio/mpeg", width: null, height: null };
  return imageInfo(bytes);
}
