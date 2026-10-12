import React from "react";
import { Still } from "remotion";
import { Slide } from "./Slide";
import postsJson from "../posts.json";
import type { Format, Post } from "./types";

const posts = postsJson as Post[];

// TikTok photo mode / Reels at 9:16, Instagram feed carousel at 4:5 (plan: production specs).
const FORMATS: { id: Format; width: number; height: number }[] = [
  { id: "9x16", width: 1080, height: 1920 },
  { id: "4x5", width: 1080, height: 1350 },
];

// Composition id: "<slug>--<format>--<slide number>", parsed by render.mjs.
export const Root = () => (
  <>
    {posts.flatMap((post) =>
      FORMATS.flatMap((f) =>
        post.slides.map((_, i) => (
          <Still
            key={`${post.slug}-${f.id}-${i}`}
            id={`${post.slug}--${f.id}--${String(i + 1).padStart(2, "0")}`}
            component={Slide}
            width={f.width}
            height={f.height}
            defaultProps={{ post, index: i, format: f.id }}
          />
        )),
      ),
    )}
  </>
);
