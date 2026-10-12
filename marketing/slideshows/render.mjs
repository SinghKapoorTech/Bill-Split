// Renders every slide of every post to marketing/assets/slideshows/<slug>/<format>/slide-NN.png
// and writes each post's caption.txt. Usage: npm run render [-- <slug-filter>]
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, "../assets/slideshows");
const filter = process.argv[2] ?? "";

const posts = JSON.parse(readFileSync(path.join(here, "posts.json"), "utf8"));
for (const post of posts) {
  if (!post.slug.includes(filter)) continue;
  mkdirSync(path.join(outRoot, post.slug), { recursive: true });
  writeFileSync(path.join(outRoot, post.slug, "caption.txt"), `${post.caption}\n`);
}

const serveUrl = await bundle({ entryPoint: path.join(here, "src/index.ts") });
const comps = (await getCompositions(serveUrl)).filter((c) => c.id.includes(filter));

for (const comp of comps) {
  const [slug, format, n] = comp.id.split("--");
  const dir = path.join(outRoot, slug, format);
  mkdirSync(dir, { recursive: true });
  await renderStill({ composition: comp, serveUrl, output: path.join(dir, `slide-${n}.png`) });
  console.log(`${slug}/${format}/slide-${n}.png`);
}
