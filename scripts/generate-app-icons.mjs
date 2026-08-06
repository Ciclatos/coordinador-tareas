import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const appDir = path.join(process.cwd(), "src", "app");

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#124f3d"/>
  <path d="M151 76h145l72 72v242c0 25-20 46-46 46H151c-25 0-46-21-46-46V122c0-25 21-46 46-46Z" fill="#fffdf8"/>
  <path d="M296 76v54c0 16 13 29 29 29h43" fill="#dcece5"/>
  <path d="M296 76l72 72h-43c-16 0-29-13-29-29V76Z" fill="#c8e1d7"/>
  <path d="M158 204h126M158 255h105M158 306h74" fill="none" stroke="#79a396" stroke-width="22" stroke-linecap="round"/>
  <circle cx="344" cy="344" r="91" fill="#f4d894" stroke="#fffdf8" stroke-width="18"/>
  <path d="m298 345 31 31 63-73" fill="none" stroke="#124f3d" stroke-width="29" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const compactFaviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#124f3d"/>
  <path d="M18 9h21l10 10v33c0 3-3 6-6 6H18c-3 0-6-3-6-6V15c0-3 3-6 6-6Z" fill="#fffdf8"/>
  <path d="M39 9v10h10" fill="#c8e1d7"/>
  <path d="m23 38 8 8 17-20" fill="none" stroke="#e5b84f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function createIco(images) {
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = headerSize;
  images.forEach(({ size, buffer }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(buffer.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, ...images.map(({ buffer }) => buffer)]);
}

await mkdir(appDir, { recursive: true });
const source = Buffer.from(iconSvg);
await writeFile(path.join(appDir, "icon.png"), await sharp(source).resize(512, 512).png().toBuffer());
await writeFile(path.join(appDir, "apple-icon.png"), await sharp(source).resize(180, 180).png().toBuffer());

const faviconImages = await Promise.all(
  [16, 32, 48].map(async (size) => ({
    size,
    buffer: await sharp(size === 16 ? Buffer.from(compactFaviconSvg) : source)
      .resize(size, size)
      .png()
      .toBuffer(),
  })),
);
await writeFile(path.join(appDir, "favicon.ico"), createIco(faviconImages));

console.log("Generated favicon.ico, icon.png and apple-icon.png");
