import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { loadFont as loadEmoji } from "@remotion/google-fonts/NotoColorEmoji";
import { THEMES, type Theme } from "./themes";
import type { Post, SlideSpec, Format } from "./types";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "800"] });
const { fontFamily: emojiFamily } = loadEmoji();
const FONT = `${fontFamily}, ${emojiFamily}`;

// "Salad bill" from the ad plan: subtotal $178, tax 8.875%, tip 20%, total $229.40.
const ITEMS: { name: string; price: number; flag?: "bad" | "good" }[] = [
  { name: "Wagyu steak", price: 68, flag: "bad" },
  { name: "Cocktail", price: 16 },
  { name: "Cocktail", price: 16 },
  { name: "Cocktail", price: 16 },
  { name: "Pasta", price: 26 },
  { name: "Burger", price: 22 },
  { name: "Garden salad", price: 14, flag: "good" },
];

const SPLIT = [
  { who: "Salad", amt: 18.04, hi: true },
  { who: "Burger + cocktail", amt: 48.97 },
  { who: "Pasta + cocktail", amt: 54.13 },
  { who: "Wagyu + cocktail", amt: 108.26 },
];

const money = (n: number) => `$${n.toFixed(2)}`;

// Safe zones from the plan: 9:16 keeps text out of the top 250px, bottom 400px and right 120px
// (TikTok/Reels UI); the 4:5 feed carousel has no overlay, so it gets even padding.
const SAFE: Record<Format, React.CSSProperties> = {
  "9x16": { top: 250, bottom: 400, left: 80, right: 120 },
  "4x5": { top: 90, bottom: 90, left: 90, right: 90 },
};

// "**bold**" spans in copy get the theme's highlight treatment.
const Rich: React.FC<{ text: string; t: Theme }> = ({ text, t }) => (
  <>
    {text.split("**").map((part, i) =>
      i % 2 === 1 ? (
        <span
          key={i}
          style={
            t.marker
              ? { background: t.accent, color: t.markerInk, padding: "0 12px", borderRadius: 10, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }
              : { color: t.accent }
          }
        >
          {part}
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

const Paper: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: "#fffdf8",
      color: "hsl(30 30% 12%)",
      borderRadius: 24,
      boxShadow: "0 30px 80px rgba(40,25,5,0.22)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Receipt: React.FC<{ scale: number }> = ({ scale }) => (
  <Paper style={{ width: 760, padding: "44px 56px", fontFamily: "Courier New, monospace", transform: `rotate(-1.5deg) scale(${scale})` }}>
    <div style={{ textAlign: "center", fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>THE CORNER TABLE</div>
    <div style={{ textAlign: "center", fontSize: 26, color: "#8a7f70", marginBottom: 22 }}>table 12 · 4 guests</div>
    {ITEMS.map((it, i) => (
      <div
        key={i}
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 38,
          padding: "7px 14px",
          borderRadius: 40,
          border: it.flag ? `5px solid ${it.flag === "bad" ? "#d6453d" : "#2f8f5b"}` : "5px solid transparent",
          background: it.flag === "good" ? "rgba(47,143,91,0.10)" : "transparent",
        }}
      >
        <span>{it.name}</span>
        <span>{money(it.price)}</span>
      </div>
    ))}
    <div style={{ borderTop: "3px dashed #c9bfa8", margin: "20px 0 12px" }} />
    {[
      ["Subtotal", "$178.00"],
      ["Tax 8.875%", "$15.80"],
      ["Tip 20%", "$35.60"],
    ].map(([k, v]) => (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 32, color: "#8a7f70", padding: "2px 14px" }}>
        <span>{k}</span>
        <span>{v}</span>
      </div>
    ))}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 46, fontWeight: 700, padding: "10px 14px 0" }}>
      <span>TOTAL</span>
      <span>$229.40</span>
    </div>
  </Paper>
);

const Body: React.FC<{ s: SlideSpec; t: Theme; format: Format }> = ({ s, t, format }) => {
  switch (s.kind) {
    case "hook":
      return (
        <>
          {s.emoji && <div style={{ fontSize: 150, marginBottom: 30 }}>{s.emoji}</div>}
          {s.kicker && (
            <div style={{ fontSize: 44, fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: 3, marginBottom: 26 }}>
              {s.kicker}
            </div>
          )}
          <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.08 }}>
            <Rich text={s.text} t={t} />
          </div>
        </>
      );
    case "statement":
      return (
        <>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.1 }}>
            <Rich text={s.text} t={t} />
          </div>
          {s.stamp && (
            <div
              style={{
                alignSelf: "flex-start",
                marginTop: 60,
                fontSize: 120,
                fontWeight: 800,
                color: "#d6453d",
                border: "12px solid #d6453d",
                borderRadius: 24,
                padding: "6px 40px",
                transform: "rotate(-7deg)",
                letterSpacing: 6,
              }}
            >
              {s.stamp}
            </div>
          )}
          {s.sub && <div style={{ fontSize: 46, color: t.muted, marginTop: 44, lineHeight: 1.3 }}>{s.sub}</div>}
        </>
      );
    case "receipt":
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 72, fontWeight: 800, marginBottom: format === "4x5" ? 0 : 40 }}>{s.title}</div>
          <Receipt scale={format === "4x5" ? 0.86 : 1} />
        </div>
      );
    case "split":
      return (
        <>
          <div style={{ fontSize: 96, fontWeight: 800 }}>{s.title}</div>
          {s.sub && <div style={{ fontSize: 42, color: t.muted, marginBottom: 50 }}>{s.sub}</div>}
          <Paper style={{ padding: "50px 50px 20px" }}>
            {SPLIT.map((p) => (
              <div key={p.who} style={{ marginBottom: 34 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 44, fontWeight: 600, marginBottom: 10, color: p.hi ? "#2f8f5b" : "hsl(30 30% 12%)" }}>
                  <span>{p.who}</span>
                  <span>{money(p.amt)}</span>
                </div>
                <div style={{ height: 30, borderRadius: 15, background: "hsl(40 25% 89%)" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(p.amt / 108.26) * 100}%`,
                      borderRadius: 15,
                      background: p.hi ? "#2f8f5b" : "linear-gradient(90deg, hsl(42 65% 40%), hsl(42 65% 55%))",
                    }}
                  />
                </div>
              </div>
            ))}
          </Paper>
        </>
      );
    case "rule":
      return (
        <>
          <div style={{ fontSize: 260, fontWeight: 800, color: t.accent, lineHeight: 1 }}>{s.n}.</div>
          <div style={{ fontSize: 88, fontWeight: 800, lineHeight: 1.12, marginTop: 30 }}>
            <Rich text={s.text} t={t} />
          </div>
          {s.sub && <div style={{ fontSize: 48, color: t.muted, marginTop: 40 }}>{s.sub}</div>}
        </>
      );
    case "archetype":
      return (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
            <div
              style={{
                width: 130,
                height: 130,
                borderRadius: 65,
                background: t.ink,
                color: t.bg,
                fontSize: 76,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {s.n}
            </div>
            <div style={{ fontSize: 150 }}>{s.emoji}</div>
          </div>
          <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.1, marginTop: 50 }}>{s.text}</div>
          {s.sub && <div style={{ fontSize: 58, fontWeight: 600, marginTop: 30, opacity: 0.7 }}>({s.sub})</div>}
        </>
      );
    case "versus":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
          {[s.left, s.right].map((side, i) => (
            <React.Fragment key={i}>
              {i === 1 && <div style={{ fontSize: 64, fontWeight: 800, textAlign: "center", color: t.accent }}>vs.</div>}
              <Paper style={{ padding: "44px 50px", display: "flex", alignItems: "center", gap: 40 }}>
                <div style={{ fontSize: 140 }}>{side.emoji}</div>
                <div>
                  <div style={{ fontSize: 42, color: "#8a7f70", fontWeight: 600 }}>{side.label}</div>
                  <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{side.item}</div>
                </div>
              </Paper>
            </React.Fragment>
          ))}
        </div>
      );
    case "cta":
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <Img src={staticFile("divit-icon.png")} style={{ width: 220, height: 220, borderRadius: 52, boxShadow: "0 24px 60px rgba(40,25,5,0.30)" }} />
          <div style={{ fontSize: 120, fontWeight: 800, marginTop: 30, color: t.brand }}>Divit</div>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.15, marginTop: 20 }}>{s.line}</div>
          <div style={{ marginTop: 56, background: t.ink, color: t.bg, fontSize: 48, fontWeight: 600, padding: "28px 60px", borderRadius: 999 }}>
            Free on iOS &amp; Android
          </div>
          <div style={{ fontSize: 42, marginTop: 30, color: t.muted }}>Link in bio</div>
        </div>
      );
  }
};

export const Slide: React.FC<{ post: Post; index: number; format: Format }> = ({ post, index, format }) => {
  const base = THEMES[post.theme];
  const t = base.cycle ? { ...base, bg: base.cycle[index % base.cycle.length] } : base;
  const s = post.slides[index];
  // Plan rule: numbers not from a real bill are captioned "example bill"; the CTA slide carries none.
  const showExample = post.exampleBill && s.kind !== "cta" && s.kind !== "hook";
  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: t.bg, color: t.ink }}>
      {t.glow && <AbsoluteFill style={{ background: t.glow }} />}
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", justifyContent: "center", ...SAFE[format] }}>
        <Body s={s} t={t} format={format} />
      </div>
      {showExample && (
        <div style={{ position: "absolute", ...SAFE[format], bottom: undefined, fontSize: 28, fontWeight: 600, letterSpacing: 2, color: t.muted }}>
          EXAMPLE BILL
        </div>
      )}
    </AbsoluteFill>
  );
};
