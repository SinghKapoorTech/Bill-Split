# AI-Cost-Driven and Usage-Based Monetization for Divit (credits, passes, capped subscriptions) — research as of 2026-10-10

Context from the Divit codebase (read locally, not a web source):

- `functions/src/index.ts:308` — `analyzeBill` calls **`gemini-2.5-flash-lite`** with one image (base64 inline) plus a ~250-token text prompt, and asks for plain JSON (restaurantName, items[], subtotal, tax, tip, total). No `mediaResolution`, no `responseSchema`, no `maxOutputTokens` set.
- `shared/monetizationLimits.ts:25` — `FREE_SCANS_PER_MONTH_DEFAULT = 2`, which Remote Config (`free_scans_per_month`) can override. `functions/src/index.ts` already has a monthly scan quota, with the paywall copy "Upgrade to Pro for unlimited scanning", plus an abuse limiter of 30 scans/hour. Enforcement can run "dark" (log-only).

## Q1. Cost per receipt scan with current Gemini models, and alternatives

### Takeaway

At current list prices, one Divit scan costs about **$0.0003–$0.0006 on Gemini 2.5 Flash-Lite**, the model in production now. That is roughly **$0.34–$0.60 per 1,000 scans**. Even the dearest sensible Flash model, Gemini 3.8 Flash at its 2026 price, costs about **$2.50 per 1,000 scans**. AI cost per scan is a rounding error next to the App Store / Play commission on any purchase, so it does not justify a credits or token model on cost grounds.

### Cited Findings

**Gemini API list prices (paid tier, USD per 1M tokens; the page was last updated 2026-10-09)** — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
| Model | Input (text/image) | Output | Batch in / out | Notes |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite (**Divit's current model**) | $0.10 | $0.40 | $0.05 / $0.20 | Has a free tier |
| Gemini 2.5 Flash | $0.30 | $2.50 | $0.15 / $1.25 | |
| Gemini 3.1 Flash-Lite | $0.25 | $1.50 | $0.125 / $0.75 | |
| Gemini 3.5 Flash-Lite | $0.30 | $2.50 | $0.15 / $1.25 | |
| Gemini 3.8 Flash (and 3.6 Flash) | $0.75 through 2026, **$1.50 from 2027-01-01** | $3.75 through 2026, **$7.50 from 2027** | half of standard | Price **doubles on 1 Jan 2027** |
| Gemini 3 Flash Preview | $0.50 | $3.00 | | Now labelled "legacy" |
| Gemini 3.1 Pro Preview | $2.00 | $12.00 | | No free tier; overkill for receipts |

- Image tokens on the tiling models (2.5 family): an image with both sides ≤384 px costs 258 tokens. Larger images are cut into tiles, each 258 tokens. Crop unit = floor(min(w,h)/1.5). Google's worked example is 960×540 → 6 tiles ≈ 1,548 tokens — [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- Gemini 3 models fix the image cost with `media_resolution`: low 280, medium 560, high 1,120 (this is the default when unspecified), ultra_high 2,240 tokens per image. **For OCR Google recommends `medium` (560)**: quality "typically saturates at medium", and `high` "rarely improves OCR results for standard documents" — [Gemini media resolution](https://ai.google.dev/gemini-api/docs/media-resolution)
- Batch mode costs 50% less, but it is asynchronous, so it doesn't suit an interactive scan — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

**Bundled OCR+extraction vendors, for comparison:** Upstage receipt key-information extraction is $0.05/page — [Upstage pricing](https://www.upstage.ai/pricing). Mindee is $0.10/page — [Mindee](https://www.mindee.com/l/receipt). Databricks AI Parse gives a directional $0.70–$1.05 per 1k pages, discounted through 2026-06-30 — [Databricks AI Functions](https://www.databricks.com/product/pricing/ai-functions)

**On-device OCR:** ML Kit on-device text recognition is free, works offline and keeps images on the device. Google names receipts as a use case. The on-device recognizer is limited to Latin-based scripts — [Firebase ML Kit text recognition](https://firebase.google.com/docs/ml-kit/recognize-text); [ML Kit](https://developers.google.cn/ml-kit)

### Cost arithmetic (my estimates; the assumptions are stated)

Assumptions:

- Prompt text ≈ 250 tokens.
- Image on the 2.5 family: a typical phone photo 3024×4032 → crop unit 2016 → ⌈1.5⌉×⌈2⌉ = 4 tiles × 258 = **1,032 tokens**, using Google's tiling formula. I did not check whether Divit's client downsizes images before upload.
- Image on the Gemini 3.x family: `medium` = 560 tokens.
- Output: JSON for about 15 line items ≈ 300–500 tokens. 500 is the planning figure.

| Model                                             | Input tokens                 | Output tokens              | Cost/scan     | Per 1,000 scans |
| ------------------------------------------------- | ---------------------------- | -------------------------- | ------------- | --------------- |
| **2.5 Flash-Lite (current)**                      | 1,282 × $0.10/1M = $0.000128 | 500 × $0.40/1M = $0.000200 | **$0.00033**  | **$0.33**       |
| 2.5 Flash-Lite, worst case (2,000 in / 1,000 out) | $0.000200                    | $0.000400                  | $0.00060      | $0.60           |
| 2.5 Flash                                         | 1,282 × $0.30 = $0.000385    | 500 × $2.50 = $0.00125     | $0.00164      | $1.64           |
| 3.1 Flash-Lite (medium res)                       | 810 × $0.25 = $0.000203      | 500 × $1.50 = $0.00075     | $0.00095      | $0.95           |
| 3.5 Flash-Lite (medium res)                       | 810 × $0.30 = $0.000243      | 500 × $2.50 = $0.00125     | $0.00149      | $1.49           |
| 3.8 Flash, 2026 price (medium res)                | 810 × $0.75 = $0.000608      | 500 × $3.75 = $0.001875    | $0.00248      | $2.48           |
| 3.8 Flash, 2027 price                             | 810 × $1.50 = $0.001215      | 500 × $7.50 = $0.00375     | $0.00497      | $4.97           |
| 3.8 Flash at default `high` res (1,120 img)       | 1,370 × $0.75 = $0.00103     | $0.001875                  | $0.00290      | $2.90           |
| Upstage / Mindee (bundled vendors)                | —                            | —                          | $0.05 / $0.10 | $50 / $100      |

Per-user cost at current settings on 2.5 Flash-Lite:

- A heavy user doing 50 scans/month: 50 × $0.00033 = **$0.017/month**, or about $0.20/year.
- A pathological user at the 30/hour abuse cap, sustained 8 h/day for 30 days (7,200 scans): about $2.40/month. This is the realistic worst case that the abuse limiter bounds.
- Compare the store commission on a $2.99 purchase: 15% = $0.45, 30% = $0.90. **The commission on one sale buys about 1,350–2,700 Flash-Lite scans.**

### Inferences

- AI inference cost does not constrain Divit's pricing. Any usage cap is a **conversion lever**, not cost recovery. Framing "credits because AI is expensive" would be inaccurate and could read as nickel-and-diming.
- Cheapest quality-preserving moves, if cost ever matters:
  - Stay on 2.5 Flash-Lite, or move to 3.1 Flash-Lite with `media_resolution: medium`.
  - Downscale images on the client (to about 1,024–1,536 px on the long side) before upload. This also cuts upload bandwidth and Cloud Function payload size.
  - Set `responseMimeType: application/json` with a schema, and set `maxOutputTokens`, so output stays bounded.
  - Avoid the default `high` image resolution on Gemini 3 models.
- A hybrid of on-device ML Kit OCR followed by a text-only LLM call would cut input tokens further, to about 300–600 text tokens. The absolute saving is fractions of a cent per 1,000 scans, so it isn't worth the engineering cost or the accuracy risk: ML Kit loses layout, the LLM loses the visual columns, and only Latin scripts are supported. Its real benefits are offline use and privacy, not cost.
- Divit's free cap of 2 scans/month is very tight relative to cost. Competitors give 25/month free (Expensify; see Q2). The cap only makes sense as a conversion choice.
- Price risk: Google's newest Flash tier doubles on 2027-01-01. Pin the model ID, and re-check pricing before upgrading models.

### Gaps

- I did not measure real token usage for Divit receipts. `usageMetadata` from the Gemini response (promptTokenCount, candidatesTokenCount, thoughtsTokenCount) should be logged, shape-only, to confirm the estimates.
- Whether 2.5 Flash's "thinking" tokens are on by default and billed as output was not verified this session. If they are, 2.5 Flash per-scan cost could rise several-fold. This does not affect Flash-Lite at the defaults Divit uses, per my understanding, which is also unverified.
- Cloud Functions, Storage and egress costs per scan were not researched. They are likely of the same order as or larger than the Gemini cost at Flash-Lite prices.
- Vertex AI pricing was not separately fetched. The developer API page notes that "prices may differ on Gemini Enterprise Agent Platform".

## Q2. Consumer apps selling AI credits/tokens (mechanics, pricing, reception)

### Takeaway

Credit packs work best when each use produces a **discrete, high-perceived-value output with a real marginal cost**, like AI avatars or image generation. Even there, users dislike paying both a subscription and per-pack fees. Receipt-scanning and expense apps overwhelmingly use **free monthly scan allowances plus a subscription**, not credits.

### Cited Findings

- **Lensa (Magic Avatars):**
  - Avatars are sold as one-off packs through the app store on top of the subscription.
  - Reported prices: $3.99 for 50 / $5.99 for 100 / $7.99 for 200 — [Growthtribe](https://growthtribe.io/blog/everything-you-need-to-know-about-the-lensa-ai-app). Another source gives $3.99 for 50 to subscribers and $7.99 to non-subscribers, with 100/200 packs at $11.99/$15.99 and a 50% discount for subscribers — [ForestVPN blog](https://forestvpn.com/blog/guide/unveiling-lensa-ai-artistry-controversies-and-privacy-tips). Kapwing confirms the $7.99 / $3.99 split and notes Lensa changed prices at least once — [Kapwing](https://www.kapwing.com/resources/the-instagram-ai-photo-trend-how-to-use-lensa/).
  - A 2026 review lists $1.99/50 and $3.99/100 for subscribers — [Plisio](https://plisio.net/ai/lensa-ai). Prices conflict across sources and dates, and Plisio and Kapwing have commercial interests.
  - The free trial does not include packs — [Growthtribe](https://growthtribe.io/blog/everything-you-need-to-know-about-the-lensa-ai-app).
  - User complaint: Lensa "bills the subscription and the avatars separately", which feels like paying twice — [Plisio](https://plisio.net/ai/lensa-ai). Broader backlash covered artists' signatures appearing in outputs — [Creative Bloq](https://www.creativebloq.com/news/lensa-ai).
- **Expensify SmartScan:**
  - Most sources report **25 free SmartScans/month**, with unlimited scans on paid plans. Paid plans are about $5–$9 per user per month (CostBench, last verified 2026-04-24) — [CostBench](https://costbench.com/software/expense-management/expensify/free-plan); [ERP Research](https://erpresearch.com/erp-add-ons/expense-management/expensify); [TrustRadius](https://web-v2.prod.trustradius.com/products/expensify/pricing).
  - One aggregator claims a $0.20 overage per extra scan. This is unconfirmed — [search summary of aggregator sites, e.g., SaaS Price Pulse](https://www.saaspricepulse.com/tools/expensify).
  - One site contradicts the others with "unlimited SmartScans" on the free Track plan — [mybesh](https://mybesh.com/tool/expensify).
- **Splitwise:**
  - Receipt OCR/itemization is a **Pro-only** feature, with no free scan allowance found. Pro costs about $4.99/month or $29.99–$39.99/year in the US — [Splitwise App Store listing](https://apps.apple.com/app/splitwise-bill-splitter/id458023433); [Finny blog (competitor)](https://getfinny.app/blog/splitwise-pricing-2026).
  - The free plan instead caps daily expense entries, reportedly about 3–5/day. The figure is unofficial and comes from a competitor blog — [Finny](https://getfinny.app/blog/best-splitwise-alternatives-2026); [IT Voice](https://www.itvoice.in/splitwise-has-introduced-restrictions-on-the-number-of-free-expenses-users-can-add).
- **RevenueCat virtual currency:**
  - RevenueCat now supports virtual currencies (credits, coins, tokens) for all users. They can be granted by a consumable (e.g., a 500-credit pack) or by a subscription (e.g., 500 credits/month), and unused currency can be set to expire automatically at the end of a cycle — [RevenueCat blog](https://www.revenuecat.com/blog/company/revenuecat-virtual-currency); [RevenueCat AI virtual-currency tutorial](https://www.revenuecat.com/blog/engineering/how-to-monetize-your-ai-app-with-virtual-currencies).
  - "Virtual items" (tickets/passes bought with currency) are not natively supported. The workaround is one currency per item, with a cap of 100 currencies per project — [RevenueCat FAQ](https://www.revenuecat.com/docs/offerings/virtual-currency/faq/virtual-items).
- **Industry trend:**
  - RevenueCat's State of Subscription Apps 2025 (2024 data, more than 75k apps, more than $10B in transactions): **35% of apps mix subscriptions with consumables or lifetime purchases**, led by Gaming (61.7%) and Social & Lifestyle (39.4%).
  - AI apps earn about $0.63 per install at 60 days versus a $0.31 median, but **do not convert better**.
  - 30% of annual subscribers cancel within the first month.
  - Sources: [RevenueCat SOSA 2025](https://revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch); [Subscription Insider](https://subscriptioninsider.com/article-type/news/revenuecats-state-of-subscription-apps-2025-report-ais-dominance-retention-challenges-and-the-shift-away-from-pure-subscriptions); [TechRepublic](https://www.techrepublic.com/article/news-apps-revenue-developers/).

### Inferences

- Divit's closest analogues are Expensify (free monthly allowance plus a subscription) and Splitwise (scan behind Pro). Neither sells scan credits.
- A credit wallet adds friction at the moment of highest intent: the user is at the table with the receipt. It also adds a balance UI, server-side ledgering and refund edge cases.
- If anything consumable is sold, the cleaner form is a "scan pack" or "event unlock", not abstract tokens.
- For Divit, Apple's no-expiry rule on purchased credits (Q4) also means sold credits become a permanent liability.

### Gaps

- Remini's current pricing and mechanics were not researched in this session.
- AI chat-app credit models were not researched.
- I found no conversion or retention data comparing credit-pack and subscription models specifically for receipt or expense apps.

## Q3. Per-event / per-trip pass models

### Takeaway

Per-event pricing is proven where the **event is the product and has a clear end**, as with wedding photo apps at $39–$99 per event. Among bill splitters, small-ticket event unlocks (about $1.99) exist but are rare and mostly sit alongside a subscription. Banana Split is the clearest live example.

### Cited Findings

- **Banana Split – Bill & Expenses** (iOS, 4.5★ from 212 ratings) — [App Store listing](https://apps.apple.com/us/app/-/id497258676):
  - In-app purchases include **"Unlock this event" $1.99**, **"Weekly pass" $1.99**, "Share event – 5 credits" $2.99, Premium Monthly $1.99, Premium Yearly $11.99, "Split expenses Pro" $17.99 (likely a lifetime unlock; inferred, not stated), "Premium – 2 people" $15.99, "Premium – 4 people" $24.99, and a "Friends/Family plan" $39.99.
  - The listing does not say whether one person's unlock covers all participants.
- **Trip Splitter:** a one-time $1.99 paid app with unlimited participants. The Lite version caps splitting at 2 participants until an IAP upgrade — [Trip Splitter](https://apps.apple.com/app/id374395458); [Trip Splitter Lite](https://apps.apple.com/us/app/trip-splitter-lite/id417029244).
- **Trispend:** a monthly plan plus **$19.99 lifetime** — [AppsHunter listing](https://appshunter.io/ios/app/trispend-split-trip-expenses/id6752214370).
- **Spliti:** a Premium subscription unlocks unlimited events/trips, and the core stays free — [App Store](https://apps.apple.com/ca/app/spliti/id6749490603).
- **Kululu (wedding/event photo sharing), priced per event:**
  - Plus is **$39/event** (500 uploads, 3 months of storage). Pro is **$99/event** (unlimited uploads, 1 year). Business plans are $99/month.
  - Free-tier limits conflict between sources (50 vs 100 uploads, a 24 h vs 3 h window).
  - Mostly competitor-sourced, so treat with caution — [Knipsmig Kululu pricing](https://knipsmig.com/kululu-pricing); [Wedibox vs Kululu](https://www.wedibox.com/compare/kululu).

### Inferences

- An "Event Pass" for Divit (unlimited scans plus premium features for one event, bought by the organizer) maps onto a real pattern.
- At $1.99–$4.99 it sits in Banana Split's range, far below wedding apps, because a dinner or trip split is lower-stakes than a wedding gallery.
- A pass suits the many users who split bills only a few times a year (trips, bachelor parties) and won't subscribe.
- Risk: a pass cannibalizes subscribers if it is priced too close to the monthly subscription. Common practice is to price the pass at or above one month of the subscription so the subscription is the better deal for repeat users. This is an inference, not sourced data.

### Gaps

- No verified conversion data comparing pass and subscription in bill-splitting apps.
- I could not confirm Tricount/bunq monetization details in this session.
- The Guest's pricing was not found.

## Q4. App Store / Google Play rules for consumables and non-renewing subscriptions; RevenueCat support

### Takeaway

On iOS, **purchased credits may not expire**, and restorable purchases need a restore mechanism. Auto-renewing subscriptions must last at least 7 days and provide ongoing value. Gifting is allowed.

A time-boxed **Event/Trip Pass** fits a **non-renewing subscription**, where the app controls the duration and it must be restorable across devices. A **per-event permanent unlock** fits a consumable that the backend records against the event. RevenueCat supports all of these, but the backend must ledger consumables.

### Cited Findings

- Apple **3.1.1**:
  - Features must be unlocked via IAP.
  - "Any credits or in-game currencies purchased via in-app purchase **may not expire**, and you should make sure you have a restore mechanism for any restorable in-app purchases."
  - "Apps may enable **gifting** of items that are eligible for in-app purchase to others. Such gifts may only be refunded to the original purchaser and may not be exchanged."
  - Source: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apple **3.1.2**:
  - Auto-renewable subscriptions must provide "ongoing value", last **at least seven days**, and work across all the user's devices.
  - "Subscriptions **may include consumable credits** … and you may offer subscriptions that include access to discounted consumable goods."
  - Before asking for a subscription, clearly describe what the user gets.
  - Do not take away primary functionality that existing users already paid for when switching to subscriptions.
  - Source: [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apple IAP types: consumable, non-consumable, auto-renewable, non-renewing subscription. Family Sharing applies only to auto-renewables and non-consumables. Apps must include a restore mechanism for restorable IAPs, and `currentEntitlements` is used on reinstall or device change — [Apple In-App Purchase](https://developer.apple.com/in-app-purchase/).
- The following details come from the same fetch but are summarized from Apple's general StoreKit docs, not quoted from that page, so they need confirming:
  - Non-renewing subscriptions: the **app defines and enforces the expiry** and must make them restorable/available across devices.
  - Consumables: not restored by StoreKit once consumed, so the balance must be tracked server-side.
- Google Play:
  - Virtual currency sold in-app must use Play Billing, and in-app pricing must match the Play billing UI — [Play Console Payments policy help](https://support.google.com/googleplay/android-developer/answer/9858738); [Play billing help](https://support.google.com/googleplay/android-developer/answer/10281818).
  - Purchased virtual currency "must only be used within the app … for which they were purchased" — same sources.
  - **I found no Google Play text on whether purchased currency may expire.**
- RevenueCat:
  - Consumables are tracked in `CustomerInfo`, but RevenueCat **does not track whether you granted the right amount**. Use the backend and `NON_RENEWING_PURCHASE` webhooks, or RevenueCat's virtual currency feature.
  - A consumable attached to an entitlement stays unlocked forever, so don't use consumables for time-limited entitlements.
  - Non-consumables are recommended for lifetime unlocks. On Android they need SDK 7.11.0 or later; earlier SDKs consume all IAPs.
  - Non-renewing subscriptions are supported on iOS and Android.
  - Refunds of one-time purchases require platform server notifications.
  - Sources: [RevenueCat non-subscription purchases docs](https://www.revenuecat.com/docs/platform-resources/non-subscriptions); [RevenueCat virtual currency](https://www.revenuecat.com/blog/company/revenuecat-virtual-currency) (which supports auto-expiry of currency **granted by subscriptions**).

### Inferences

- Do not sell expiring scan credits on iOS. Credits that come with a subscription ("20 scans/month included") can reset each cycle, because they were not purchased standalone. Apple 3.1.2 explicitly allows subscriptions to include consumable credits. Treating included credits as resettable is my reading; it is not explicitly stated.
- Mapping options for an Event Pass:
  - (a) A **consumable "Event Unlock"**: the Cloud Function verifies the purchase via RevenueCat webhook and writes `events/{id}.unlockedBy/unlockedAt`. The unlock is permanent for that event, so nothing expires and nothing needs restoring, because the state lives on the event doc server-side. This is the simplest and most compliant option.
  - (b) A **non-renewing subscription** "Trip Pass, 30 days": an account-level entitlement. Divit must compute the expiry and support restore. More work.
- Divit already ledgers server-side (Firestore plus Cloud Functions), so option (a) fits the architecture.

### Gaps

- No Google Play rule on consumable expiry was found. Google Play's refund window details for in-app items were not verified from Google's own pages.
- Apple's exact non-renewing subscription text (StoreKit docs) was summarized by the fetch tool, not quoted directly.

## Q5. Lifetime purchases when there is an ongoing per-use AI cost

### Takeaway

At Divit's per-scan cost (about $0.0003), a lifetime unlock is economically safe. Even 1,000 scans per lifetime user costs about $0.33 on Flash-Lite. The real risks are model price increases and abuse, both of which can be bounded with a fair-use cap and the existing 30/hour limiter.

### Cited Findings

- Lifetime options in comparable apps: Trispend Pro Lifetime $19.99 — [AppsHunter](https://appshunter.io/ios/app/trispend-split-trip-expenses/id6752214370). Banana Split "Split expenses Pro" $17.99 is likely a lifetime unlock (inferred) — [App Store](https://apps.apple.com/us/app/-/id497258676). Trip Splitter is a $1.99 one-time purchase — [App Store](https://apps.apple.com/app/id374395458).
- 35% of apps now combine subscriptions with consumables or lifetime purchases — [RevenueCat SOSA 2025](https://revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch).
- Google's newest Flash prices double on 2027-01-01, a live example of model price risk — [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
- Apple: don't take away functionality that existing users paid for — [App Store Review Guidelines 3.1.2](https://developer.apple.com/app-store/review/guidelines/).

### Inferences

- Break-even math: a $19.99 lifetime purchase nets about $17 after a 15% small-business commission. At $0.00033 per scan, that funds about 51,000 Flash-Lite scans. At the 2027 3.8 Flash price ($0.005 per scan) it funds about 3,400 scans, still decades of normal use (about 5–10 scans/month).
- Main pitfall: once sold, a lifetime unlock is locked in by Apple 3.1.2's "don't take away paid functionality". The terms should therefore say "fair use, up to N scans/day" from day one, and the model choice should stay cheap.

### Gaps

- No source data on lifetime-plan uptake or cannibalization in bill-splitting apps.

## Q6. Group-payment dynamics ("the organizer pays")

### Takeaway

Divit's structure lets **one payer unlock for many**: one organizer creates the event, others join via a link without downloading the app. This argues for **event-scoped unlocks paid by the organizer** rather than per-user credits. Apple explicitly permits gifting, and per-event/per-group tiers already exist in the category.

### Cited Findings

- Banana Split sells event-scoped and group-sized products ("Unlock this event", "Share event – 5 credits", "Premium – 2/4 people", "Friends/Family plan $39.99") — [App Store](https://apps.apple.com/us/app/-/id497258676).
- Wedding photo apps charge the host per event, and guests participate free with no app download — [Knipsmig Kululu pricing](https://knipsmig.com/kululu-pricing); [Viallo blog](https://www.viallo.app/blog/photo-apps-guests-no-app-download).
- Apple allows gifting of IAP-eligible items, refundable only to the original purchaser — [App Store Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/).
- Family Sharing covers only auto-renewables and non-consumables, not consumables — [Apple In-App Purchase](https://developer.apple.com/in-app-purchase/).

### Inferences

- Per-user credits are a poor fit for groups: whoever holds the phone at the restaurant pays for a benefit shared by everyone. An event unlock bought by the organizer or any member is cleaner and matches how the cost is incurred: one receipt is one scan, regardless of group size.
- Implementation fit: write the unlock onto `events/{eventId}` server-side, so scans by any member inside that event bypass the personal quota. Firestore rules must keep clients from writing the unlock field. This needs the same "test the security property" discipline as the rest of the repo.
- Pitfall: refunds. If the purchaser refunds, the event unlock should be revoked through a RevenueCat refund webhook, which requires platform server notifications.

### Gaps

- No quantitative data on organizer-pays conversion versus individual subscriptions in splitting apps.
