# AI Production Stack for Divit Instagram/TikTok Ads (solo founder, October 2026)

Research date: 2026-10-10. About 20 tool calls (search plus fetch). **Source-quality warning:** almost every pricing roundup that ranks for these queries is a competitor's or affiliate's blog (Creatify, Higgsfield, Blotato, Wireflow, Shhots, AdRoast, eesel, and others). These are flagged inline as **[vendor/affiliate]**. I prefer official pages where I could fetch them. Prices change often. Treat every figure as "verify on the vendor page before you buy".

---

## 1. Slideshow/carousel generation, and which tools can auto-post TikTok photo mode

### Takeaway

For TikTok photo-mode slideshows driven by Claude Code, the cheapest option with the most control is code: render PNG slides yourself with Remotion stills or HTML-to-image, then post them through an audited posting layer such as Blotato. Volume ($29.99/mo) is the turnkey option. It has an MCP server and auto-posts slideshows to TikTok and Instagram. The TikTok Content Posting API supports photo posts natively, but your own unaudited app can only post privately, so in practice you need an already-audited third party.

### Cited Findings

- **Volume (tryvolume.app):** makes TikTok and Instagram slideshows for an app. In campaign mode it posts on a schedule with "no manual posting". It lists Claude, Claude Code, ChatGPT, Cursor and Codex as compatible and has a guide on "using the Volume MCP". Core is $29.99/mo (60 posts, 100 AI image credits). Pro is $69.99/mo (300 posts, 400 AI image credits). Both include unlimited accounts, and there is a 3-day free trial. The page never says "photo mode" outright, but its case study links to a TikTok photo post. It does not mention watermarks. — [Volume homepage](https://tryvolume.app/)
- **ReelFarm:** third-party listings conflict: $19/mo, $29/mo, or about $15 per video. I could not verify from the official site. — [aiagentstore listing](https://aiagentstore.ai/ai-agent/reelfarm); [toptool listing](https://www.toptool.app/en/product/reelfarm); [Fastlane alternatives page [vendor/competitor]](https://www.usefastlane.ai/alternatives/reelfarm-alternatives)
- **PostNitro (LinkedIn/IG carousel maker):** the official plans page lists Starter $15/mo, Creator $20/mo and Team $50/mo. Another version of the page shows Creator at $25. A third party lists a Free tier with 5 per month. — [PostNitro plans](https://postnitro.ai/plans); [PostNitro docs plans](https://postnitro.ai/docs/plans); [SocialRails](https://socialrails.com/blog/postnitro-pricing)
- **Remotion (code-driven video and stills from Claude Code):** the `remotion-dev/skills` repo (about 5.0k stars) installs with `npx skills add remotion-dev/skills`. It provides skills including `/remotion-best-practices`, `/remotion-create`, `/remotion-markup` (animation, layout, typography, audio), `/remotion-render`, `/remotion-docs` and captions. Claude Code is listed as a supported agent. The repo page shows no license. — [GitHub remotion-dev/skills](https://github.com/remotion-dev/skills)
- **Remotion license:** free for individuals and companies of up to 3 people, commercial use and automation included. Larger teams pay: "Creators" is $25/seat/mo, "Automators" is $0.01/render with a $100/mo minimum, and Enterprise starts at $500/mo. — [Remotion pricing](https://remotion.dev/pricing); [Remotion license FAQ](https://www.remotion.dev/docs/license/faq)
- **TikTok Content Posting API:** has a dedicated photo-post reference. Titles are limited to 90 UTF-16 runes and descriptions to 4,000. — [TikTok photo post reference](https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post). Photos are pulled from a URL only. — [Vorp Labs](https://vorplabs.com/agent-tools/tiktok-content-posting-api)
- **TikTok audit gate:** "all content posted by unaudited clients will be restricted to private viewing mode." Unaudited clients are capped at 5 posting users per 24 hours, and the posting account must be private. "Upload" mode instead drops a draft in the creator's inbox. — [TikTok Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines); [TikTok Content Posting get-started](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
- **Blotato** says its TikTok app is already audited, so its posts are public from the first call. This is a vendor claim. — [Blotato TikTok API page [vendor]](https://www.blotato.com/api/tiktok)

### Inferences

- **Code path:** Claude Code with the Remotion skills (or Playwright/Satori HTML-to-PNG) renders 1080x1920 slides. You then post them as a TikTok photo post through Blotato's API or MCP, or send them as a draft through Upload mode and publish by hand in the TikTok app, where you can also add trending sound. This costs $0 for Remotion (Divit is 3 people or fewer) plus the poster.
- Upload-to-inbox (draft) mode works without an audit for your own account and lets you add trending audio by hand. That matters because API-posted slideshows cannot pick trending sounds through the API (inferred; not verified in TikTok docs).
- Volume is worth a 3-day trial for "recreate viral slideshow formats". Its value is format discovery rather than rendering.

### Gaps

- **Canva** (Magic Studio, Bulk Create, Connect API, autopublish to TikTok photo mode) and **Figma**: not researched within the budget. Canva Bulk Create plus a CSV is a plausible no-code option. Unverified.
- ReelFarm's official pricing and whether it posts true photo mode: unverified.
- Whether Volume posts are true TikTok photo-mode carousels or videos: strongly suggested but not stated.
- Whether TikTok photo posts made through the API can attach music: not verified.

---

## 2. AI UGC/avatar video: price per video, realism, phone/app-screen handling, founder clone

### Takeaway

Arcads is the premium option, at roughly $11 per talking-actor video with a $110/mo floor. It now has an official MCP server and Claude skills, so Claude Code can drive it. HeyGen is the cheapest serious option with an avatar clone of yourself, at $29/mo Creator. MakeUGC is the reviewers' pick for product-in-hand or phone-holding shots. For an app, the most credible format is usually avatar hook, then cut to a real screen recording, rather than an avatar holding a phone. Realistic in-hand screen rendering is still unreliable.

### Cited Findings

- **Arcads pricing:** Arcads does not publish prices on its site. The official /pricing URL returned 404 on fetch. Third-party audits report Starter about $110/mo, Creator about $220/mo, and a custom or about $550 Pro tier that includes API access. Talking-actor videos bill at 800 credits per minute per actor, which works out to about $11 per video, and short clips are billed as a full minute. Reported discounts of about 30% bring Starter to about $77. — [Wireflow [affiliate-ish]](https://www.wireflow.ai/blog/arcads-pricing); [AdRoast](https://www.adroast.ai/blog/arcads-pricing); [eesel](https://www.eesel.ai/blog/arcads-ai-pricing); [Shhots [competitor]](https://shhots.ai/blog/arcads-vs-makeugc/)
- **Arcads Starter volume:** AdRoast says Starter gives about 10 talking-actor videos, not the advertised "up to 50", which only applies to cheaper models. — [AdRoast](https://www.adroast.ai/blog/arcads-pricing)
- **Arcads MCP and skills:** Arcads documents a hosted MCP server at `https://mcp.arcads.ai`, added under Claude Connectors. It needs an active subscription with credits. There is also an official skills plugin at `arcads-ai/skills` on GitHub. A third party (agent-media.ai) claimed in July 2026 that Arcads had no MCP. That conflicts with Arcads' own help center, which I trust more. — [Arcads help: Arcads MCP](https://intercom.help/arcads/en/articles/15655699-arcads-mcp); [connectmcp.arcads.ai](https://connectmcp.arcads.ai/); [agent-media.ai (conflicting) [competitor]](https://agent-media.ai/compare/arcads-mcp)
- **HeyGen (official page):** Free $0 (3 videos/mo, 1-min max, 1 custom avatar; watermark removal is not listed for Free). Creator $29/mo ($24 annual), 600 credits, 30-min max, watermark removal. Pro $49/mo, 1,000 credits. Business $149 + $20/seat, 1,500 credits, 5+ custom avatars. Credit use varies by model and length. Video Agent is a premium feature with a limited trial on Free. API pricing sits on a separate page. MCP is not mentioned on the pricing page. — [HeyGen pricing](https://www.heygen.com/pricing)
- **Creatify:** Starter is reported at $19 to $49/mo from a review and $39/mo for 100 credits from Creatify's own blog. One reviewer says a quality video can use about 20 credits, so roughly 5 videos/mo on Starter. — [Creatify blog [vendor]](https://creatify.ai/blog/the-8-best-ai-ugc-ad-tools-in-2026); [reloop review](https://reloop.so/blog/article/best-ai-ugc-generators-2026/); [admakeai](https://admakeai.com/blog/best-ai-ugc-video-tools)
- **MakeUGC:** priced at $29, $49 or $59/mo across sources (€49 to €119 with a €1 3-day trial). Sources agree it is the best fit for phone-held, product-in-hand video. — [Shhots [competitor]](https://shhots.ai/blog/best-ai-avatar-solutions-for-ugc-product-ads/); [techsy](https://techsy.io/en/blog/best-ai-avatar-generators-2026); [novoads](https://novoads.ai/en/blog/best-ai-video-ad-platforms)
- **Argil:** about $27 to $39/mo entry, trial only, positioned as "clone yourself" with a casual social-native style. — [presenc.ai](https://presenc.ai/research/best-ai-ugc-and-avatar-video-tools-2026); [Fliki [competitor]](https://fliki.ai/blog/heygen-alternatives)
- **HeyGen style:** reviewers say it looks less casual and less feed-native than UGC specialists. It is better for polished, multilingual presenter video. — [Fliki [competitor]](https://fliki.ai/blog/heygen-alternatives)

### Inferences

- **Founder clone:** HeyGen Creator ($29) or Argil (about $30) covers a digital twin. A founder-face clone is also more authentic for a bootstrapped app than stock actors.
- Arcads at about $11 per video is only worth it once a hook is proven and you want many actor variants. Budget-wise it breaks the $100 lean stack on its own.
- For "show the app", composite the real screen recording in Remotion (picture-in-picture or cutaway) rather than relying on avatar hand-and-phone renders.

### Gaps

- **UGCdrop:** no search results for the product or its MCP connector. Unverified and possibly a small or new product promoted through sponsored reels.
- **Synthesia, Captions/Mirage:** not researched within the budget.
- Exact HeyGen credit cost per minute of avatar video, HeyGen API pricing, and HeyGen MCP status: not verified.
- No independent Reddit realism comparisons were found. All realism claims come from review or vendor blogs.

---

## 3. Generative video for b-roll and skits: price per second and API access

### Takeaway

Sora 2's API is shut down (reported), so plan around Veo 3.1 (Lite is about $0.05/s; full quality with audio is about $0.40/s on fal), Kling 3 (about $0.11 to $0.28/s depending on source and audio) and Seedance 2.x (about $0.18 to $0.51/s depending on reseller and resolution). Kie.ai is the cheapest pay-as-you-go API reseller. Higgsfield is a subscription UI. Google Flow's 50 free daily credits make Veo 3.1 Lite or Fast experiments nearly free. LTX-2.x runs locally and is free for companies under $10M revenue.

### Cited Findings

- **Sora 2:** one September 2026 source says OpenAI announced on 2026-03-24 that the Videos API and all Sora 2 models would shut down on 2026-09-24. I found no primary OpenAI confirmation. — [teamday.ai](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026) (via search summary; treat as unverified)
- **Veo 3.1 on fal:** silent $0.20/s, with audio $0.40/s. Veo 3.1 Lite is reported from $0.05/s with audio. — [devtk.ai](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/); [teamday.ai](https://www.teamday.ai/blog/ai-api-pricing-comparison-2026)
- **Kling 3 Pro on fal:** one source gives $0.224/s (audio off) or $0.28/s (on). Another, from September 2026, gives $0.112/s or $0.168/s. The widely quoted $0.029/s is outdated. — [ofox.ai](https://ofox.ai/blog/fal-ai-alternatives-video-generation-api-2026/); [teamday.ai](https://www.teamday.ai/blog/ai-image-video-api-providers-comparison-2026)
- **Seedance 2.0:** fal 720p about $0.30/s (Fast i2v about $0.24/s). Replicate is reportedly cheaper at about $0.18/s. — [siray.ai [competitor]](https://blog.siray.ai/fal-ai-alternative-video-api-pricing/); [aifreeapi](https://www.aifreeapi.com/en/posts/seedance-2-vs-kling-3-vs-sora-2-vs-veo-3)
- **Kie.ai:** per-second billing with no subscription. Seedance 2.0 at 1080p is $0.51/s without video input and $0.31/s with it. Seedance 2.5 at 480p is $0.085/s. — [Blotato blog [vendor]](https://www.blotato.com/blog/higgsfield-pricing) / [seeddance.io](https://www.seeddance.io/blog/higgsfield-vs-seedance-2-5) (search summary)
- **Higgsfield:** plan prices conflict. Its own blog lists Starter $15 (200 credits) and Plus $49 (1,000 credits). Others list $9/$29/$79 tiers or $19/$47/$99 annual. Its own blog says an 8-second 720p Seedance 2.0 clip costs 36 credits (about $1.55), or 28 credits (about $1.20) on Fast. Subscription credits expire each billing cycle. — [Higgsfield blog [vendor]](https://higgsfield.ai/blog/seedance-2-0-pricing-2026); [vdobloom](https://vdobloom.com/blog/higgsfield-pricing/); [Creatify review [competitor]](<https://creatify.ai/blog/higgsfield-pricing-(2026)-plans-and-what-you-ll-actually-pay>)
- **Google Flow:** AI Pro $19.99/mo (1,000 Flow credits). Ultra tiers are $99.99 (10,000) and $199.99 (25,000). Veo 3.1 Lite costs 10 credits per 4/6/8-second generation (5 on Ultra), Fast costs 20 (10 on Ultra), and Quality costs 100. Every account gets 50 free Flow credits per day, with no rollover. — [magichour](https://magichour.ai/blog/google-flow); [toolcolumn](https://www.toolcolumn.com/pricing/google-flow-pricing); [mindstudio](https://www.mindstudio.ai/blog/google-flow-pricing-credits-tiers-explained)
- **Whisk:** Google discontinued it on 2026-04-30. Its capabilities moved into Flow (opt-in migration; assets do not transfer automatically). — [Google Workspace Updates (official)](https://workspaceupdates.googleblog.com/2026/03/whisk-is-moving-to-flow-on-april-30-2026.html)
- **LTX-2.x (Lightricks):** the weights are under the LTX-2.x Community License, free for commercial use by companies under $10M annual revenue. The LTX Desktop app is Apache 2.0. LTX-2.3 shipped in March 2026 with a local desktop editor. Blogs that call the weights "Apache 2.0" conflict with the official license page. — [LTX license (official)](https://ltx.io/model/license); [LTX Desktop](https://ltx.io/ltx-desktop); [Hugging Face Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5); [Wikipedia](<https://en.wikipedia.org/wiki/LTX_(text-to-video_model)>)

### Inferences

- A 5-second b-roll clip costs about $0.25 on Veo 3.1 Lite, about $0.60 to $1.40 on Kling 3, and about $1 to $2.50 on Seedance 2. With Flow's free daily credits, b-roll is a negligible cost line.
- For Claude Code automation, fal.ai or Replicate (official APIs and MCP servers exist in the ecosystem) or Kie.ai let you script generation. Higgsfield and Flow are mainly UIs.
- LTX locally needs a strong GPU. On a Mac it is likely impractical (inferred; not verified).

### Gaps

- Runway pricing was not researched.
- fal's official model pages were not fetched, so every per-second figure comes from aggregators.
- Commercial-rights terms for Kie.ai as a reseller (whether ByteDance/Google output terms pass through) were not verified.

---

## 4. Image generation for slide backgrounds and character consistency

### Takeaway

Nano Banana (the Gemini image line, now at 2.1 and Pro) is the cheapest via API: about $0.02 to $0.045 per image on Kie.ai for 2.1, and $0.09 to $0.12 for Pro. It is also the usual pick for keeping the same character across slides through reference images. Volume includes 100 to 400 image credits.

### Cited Findings

- **Nano Banana 2.1 on Kie.ai:** $0.02 (1K), $0.03 (2K), $0.045 (4K). — [ArgoLink Oct 2026](https://argolink.io/en/blog/nano-banana-2-1-api-pricing)
- **Nano Banana Pro on Kie.ai:** $0.09 for 1K/2K and $0.12 for 4K. On Higgsfield it costs 2 credits (4 at 4K). — [ArgoLink Oct 2026](https://argolink.io/en/blog/nano-banana-pro-api-pricing); [Blotato blog [vendor]](https://www.blotato.com/blog/higgsfield-pricing)

### Inferences

- For "relatable people" slideshow backgrounds (friends at dinner, a receipt on a table), Nano Banana via Kie or fal, called from a Claude Code script, costs pennies per slide.

### Gaps

- GPT image, Midjourney and Flux pricing, plus a direct character-consistency comparison: not researched within the budget.
- Midjourney still has no official public API as far as I know. Unverified for October 2026.

---

## 5. Voice and captions

### Takeaway

ElevenLabs Starter (about $6/mo, first month $1) includes a commercial license. Creator (about $22/mo) adds Professional Voice Cloning, which you would use for a founder voice. Avoid using CapCut as the source of ad assets: its June 2025 terms reportedly grant ByteDance a broad, perpetual, sublicensable licence to uploaded content. Captions can be burned in for free with the Remotion captions skill (Whisper-based) instead of Submagic.

### Cited Findings

- **ElevenLabs:** content generated during a paid subscription can be used commercially, indefinitely. Free-plan content cannot be used commercially and needs attribution. — [ElevenLabs help (official)](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform)
- **ElevenLabs pricing (official page):** Starter $6 (first month $1, includes a commercial license). Creator $22 (first month $11, includes Professional Voice Cloning). — [ElevenLabs pricing](https://elevenlabs.io/pricing)
- **ElevenLabs licensing:** files generated on Free and then upgraded have no stated retroactive license, so regenerate finals on a paid plan. Cloning a third party's voice needs documented consent. — [terms.law](https://terms.law/ai-output-rights/elevenlabs/); [oakgen](https://oakgen.ai/blog/elevenlabs-free-commercial-use)
- **CapCut:** a June 2025 ToS update reportedly grants an irrevocable, worldwide, royalty-free, transferable, sublicensable licence to user content that persists after deletion. These are secondary reports. I found no confirmation of the 2026 text. — [marketing4ecommerce](https://marketing4ecommerce.net/en/capcut-new-terms/); [Cakewalk forum](https://discuss.cakewalk.com/topic/88603-huge-warning-about-capcuts-new-terms-of-service/)
- **Blotato** Starter includes ElevenLabs AI voiceovers and AI captions. — [Blotato pricing](https://blotato.com/pricing)
- **Remotion skills** include a captions skill. — [GitHub remotion-dev/skills](https://github.com/remotion-dev/skills)

### Gaps

- Submagic and Captions.ai pricing: not researched.
- CapCut's current (2026) ToS text and its commercial-music and template licence limits: unverified. Note that CapCut template music is generally not cleared for ads (my prior knowledge; unverified for 2026).

---

## 6. App screen capture and mockups

### Takeaway

Use free native tooling: `xcrun simctl io booted recordVideo` on the iOS simulator and `adb shell screenrecord` on Android, then frame and animate the recordings in Remotion. Paid mockup tools are optional.

### Cited Findings

- Remotion skills cover multimedia handling (Mediabunny), compositions and rendering, which is enough to place a recording inside a device frame programmatically. — [GitHub remotion-dev/skills](https://github.com/remotion-dev/skills)

### Gaps

- Rotato and shots.so pricing and licensing: not researched. `simctl`/`adb` recording commands come from prior knowledge, not a fetched source in this session.
- The repo already has a `creating-app-store-screenshots` skill and simulator workflow (XcodeBuildMCP), which can likely be reused (inferred).

---

## 7. Scheduling and posting with an API

### Takeaway

Blotato Starter ($29/mo) is the best fit for Claude Code. It has an API and an MCP server and covers 9 platforms, including TikTok and Instagram (900 TikTok posts/mo). It also claims an audited TikTok app, so posts are public immediately. Going direct is possible on Instagram: the Graph API publishes carousels and Reels, capped at 50 posts per 24 hours, with a carousel counting as one post. Going direct on TikTok means passing TikTok's app audit before any post can be public.

### Cited Findings

- **Blotato:** Starter $29/mo (1,250 AI credits, 20 social accounts, up to 900 TikTok posts/mo, ElevenLabs voiceovers). Creator $97/mo (5,000 credits, 40 accounts). Agency $499/mo. 7-day trial, which excludes the API. API from Starter up. Has an MCP server. Covers 9 platforms. — [Blotato pricing](https://blotato.com/pricing)
- **Blotato TikTok app:** claimed to be audited, so posts are public from the first call. — [Blotato TikTok API [vendor]](https://www.blotato.com/api/tiktok)
- **Instagram Graph API:** 50 API-published posts per rolling 24 hours, enforced at `media_publish`. Carousels count as one post. Usage can be queried via `content_publishing_limit`. One older Meta page still says 100. — [Meta Content Publishing docs](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing); [IG User Content Publishing Limit](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit)
- **TikTok direct:** see section 1. An unaudited app can only make private posts, for at most 5 users per day.

### Gaps

- Buffer, Later and Post Bridge pricing and API/MCP status: not researched within the budget. Post Bridge is often cited as a cheap API-first poster. Unverified.
- Whether Blotato posts TikTok photo-mode carousels (rather than video) through its API was not stated on the pricing page.

---

## 8. AI labelling and watermarks (cross-cutting)

### Takeaway

Assume AI-generated assets will be labelled. Meta reads C2PA Content Credentials and labels AI content ("AI info"). TikTok has used C2PA to auto-label AI content since 2024. Free tiers (HeyGen Free) watermark output.

### Cited Findings

- TikTok committed to auto-labelling AI-generated content from other platforms using C2PA Content Credentials. — [NBC News 2024](https://www.nbcnews.com/tech/tech-news/tiktok-will-automatically-label-ai-generated-content-rcna151446); [TechCrunch 2024](https://techcrunch.com/2024/05/09/tiktok-automatically-label-ai-generated-content-created-other-platforms)
- Meta's labelling reportedly reads C2PA metadata from tools such as Photoshop, DALL-E, Firefly and Canva. Ad-side labelling reportedly became automatic in July 2026. These are blog claims, unverified. — [Coinis](https://coinis.com/blog/meta-ai-content-labeling-facebook-instagram-ads-2026); [Prizmad](https://prizmad.com/guides/ai-ad-disclosure-labels)
- TikTok Ads Manager reportedly needs a manual "AI disclosure" toggle for ads with AI elements. The sources conflict and this is unverified. — [SocialScaleHub](https://www.socialscalehub.com/academy/ai-content-disclosure-rules-2026-tiktok-instagram-youtube)
- Real footage exported through CapCut, Canva or Photoshop after one AI-assisted edit may inherit AI provenance markers and get labelled. — [Prizmad](https://prizmad.com/guides/ai-ad-disclosure-labels)

### Gaps

- Official Meta and TikTok 2026 ad-policy pages were not fetched. EU AI Act Article 50 (reportedly live 2026-08-02) is unverified.

---

## Recommended stacks (synthesis; inferences from the above)

### Lean stack, about $65 to $95/mo

| Need                                               | Tool                                                                              | Cost                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Slides and video assembly, captions, device frames | Remotion + remotion-dev/skills, driven by Claude Code                             | $0 (3 people or fewer) |
| Slide imagery                                      | Nano Banana 2.1 via Kie/fal API                                                   | about $2 to $5/mo      |
| B-roll                                             | Google Flow free 50 credits/day (Veo 3.1 Lite/Fast), occasional Kling/Veo via fal | $0 to $10              |
| Voiceover                                          | ElevenLabs Starter (commercial)                                                   | $6                     |
| Founder avatar clone                               | HeyGen Creator                                                                    | $29                    |
| Posting (TikTok public + IG, API/MCP)              | Blotato Starter                                                                   | $29                    |
| Screen capture                                     | simctl / adb                                                                      | $0                     |

Total: about $64 to $79/mo. Optionally swap in Volume Core ($29.99) to replace your own slideshow pipeline and get viral-format templates, though it overlaps with Blotato.

### Larger stack, about $250 to $350/mo

Lean stack, plus Arcads Starter (about $110, roughly 10 actor videos, MCP) or MakeUGC (about $49 to $59, for product-in-hand), plus Volume Pro ($69.99, 300 slideshow posts), plus ElevenLabs Creator ($22, Professional Voice Cloning of the founder), plus a fal/Kie video budget of about $30 to $50, plus Google AI Pro ($19.99, 1,000 Flow credits).

### Not recommended

- **CapCut** for final ad assets (ToS licence breadth; unverified for 2026).
- **Sora 2 API** (reported shut down 2026-09-24).
- **Whisk** (discontinued 2026-04-30).
- **Building your own TikTok posting app** before you have audit capacity: its posts are private-only.
