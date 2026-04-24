import sharp from "sharp";
import path from "path";
import fs from "fs";

const LOGO_SVG = path.resolve("public/assets/logo.svg");
const OUTPUT_DIR = path.resolve("public");
const BACKGROUND = { r: 46, g: 53, b: 57, alpha: 1 }; // #2E3539

const targets = [
  { file: "icons/icon-192x192.png", size: 192 },
  { file: "icons/icon-512x512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "favicon-16x16.png", size: 16 },
];

async function main() {
  // Ensure the icons subdirectory exists
  const iconsDir = path.join(OUTPUT_DIR, "icons");
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
    console.log("Created directory: public/icons/");
  }

  for (const { file, size } of targets) {
    await sharp(LOGO_SVG)
      .resize(size, size, { fit: "contain", background: BACKGROUND })
      .flatten({ background: BACKGROUND })
      .png()
      .toFile(path.join(OUTPUT_DIR, file));
    console.log(`Generated ${file}`);
  }

  console.log("All PWA icons generated successfully.");
}

main().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
