# Make the receipt reveal Divit's ad

Divit should grow on Instagram and TikTok with an **organic-first engine of faceless photo-mode slideshows and short real-screen demos built around one visual: a long receipt turning into "you owe $18.04, he owes $108.26."** Paid spend should come in only behind posts that have already won organically, as TikTok Spark Ads and Meta ads, at a test budget of roughly **$350–$800 over 10 days**. The economics force that order. Freemium subscription apps earn a median of only **$0.38 per install by Day 60**, while US finance-app installs cost **$3.50–$20** ([RevenueCat](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026); [SEMNexus](https://semnexus.com/cpi-benchmarks-app-category-platform-2026)). Paid installs cannot pay back on their own, so paid has to amplify posts that are already working. Competitors leave the obvious lane open. Splitwise, the only incumbent visibly spending on Meta, runs about 19 **static lifestyle images pushing a 30%-off Pro deal, and none of them show a receipt scan**. Splitwise has no TikTok account. The single biggest bill-split video found, about **9.1M views**, is a creator filming a real restaurant dinner, not a brand ad ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=194000797330861); [TikTok](https://www.tiktok.com/@brandonbee03/video/7653261365762624798)). The owner can make nearly all of this himself with Claude Code, Remotion and a posting API for about **$40–$70 a month**. The one thing AI must never make is a fake customer: an AI avatar saying "I use Divit" breaks the FTC's fake-testimonial rule, and since June 2026 New York law requires a conspicuous label on any ad with an AI-generated human performer. His saved reels got the tactics broadly right (slideshows first, copy winning formats, pay only behind proven posts). They got safety wrong on Meta API tokens, fake-feeling avatars and several sponsored tools, and parts are already out of date (Google Whisk was discontinued in April 2026). Labels used below: **[E]** means evidence from a cited source; **[I]** means my inference or recommendation. All growth case studies are self-reported.

## Slideshows and creator dinners win, and competitors barely show the product

The best-documented organic format for indie subscription apps in 2025–2026 is the **faceless photo-mode slideshow, posted at high volume, with one instantly legible visual hook tied to one feature** [E]. The workout tracker Stronger reportedly reached $100K MRR and 82M views a month from **two-slide** TikToks: a selfie-style cover, then an app-feature slide ([Social Growth Engineers](https://www.socialgrowthengineers.com/100k-mrr-with-faceless-slideshows)). Scrolly reportedly posted **6,535 slideshows in about a year** for 671M views ([Thread Reader](https://threadreaderapp.com/thread/1830617819802992989)). A solo 18-year-old founder used slideshows to test hooks before building features and added paid ads only later ([Stork.ai](https://www.stork.ai/blog/how-one-18-year-old-built-a-60k-app-with-5-tools)). Two caveats limit how far these stories transfer. Every figure is unaudited, often from newsletters that sell growth programs. And most of these apps use hard paywalls, which convert about **10.7% of trials to paid versus 2.1% for freemium** ([RevenueCat](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)). Read them as proof the format can work, not as a forecast. No platform has published 2026 data ranking slideshows against talking-head, screen-recording or skit formats. The strongest hard data point favors narrative: in AppsFlyer's study of 1.1M creatives, **storytelling hooks took only 6% of spend in social apps but had the best Day-7 retention, 8.4%** ([AppsFlyer](https://www.appsflyer.com/company/newsroom/pr/ai-emotion-creative-trends/)).

The owner knew of slideshows and UGC. The ad libraries show more variety than that, though mostly from small budgets testing briefly. The table below lists every competitor ad type found on 2026-10-10.

| Ad type seen                                           | Who runs it                      | What it looks like                                                                                                                                                                                                                                                                                                             | Signal of success                                                                                                  |
| ------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Static lifestyle image with a discount                 | Splitwise                        | Stock photos (kitchen, beach, dinner) with UI cards; "$59.99 → $41.99, 30% OFF your first year"; a strikethrough list ("'I'll get the next one'", "Saving receipts") ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=194000797330861)) | One creative live about 8 weeks; newer ones flagged "Low impression count"                                         |
| "Free group expense app" install ad                    | Tricount (bunq)                  | Holiday copy, Install Now, one video; nothing about AI or receipts ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=tricount&search_type=keyword_unordered))                                                                                                               | EU burst Aug 21 to Sep 17, 2026                                                                                    |
| Feature-launch video with a relatable line             | Call It Even                     | "No more 'wait… who got the guac?' Snap a photo… tax + tip split themselves" ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=callitevenapp&search_type=keyword_unordered))                                                                                                | Ran hours to 7 days, so a test                                                                                     |
| Engagement bait / tag-a-friend                         | Call It Even                     | "Tag your sign. Then tag the Gemini who still owes you"                                                                                                                                                                                                                                                                        | Ran 3 days                                                                                                         |
| Unequal-order fairness hook                            | Ryt Bank (Malaysia)              | "One person orders iced water. One person adds squid. Somehow everyone pays the same. 😭" then AI receipt split ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=%22split%20the%20bill%22%20receipt&search_type=keyword_unordered))                                        | Active since Aug 27, 2026                                                                                          |
| Group-trip utility                                     | Money Buddy, Xpense Flow         | "Split the bill on group trips without the group-chat math"; Christmas-trip seasonal                                                                                                                                                                                                                                           | Money Buddy ran about 10.5 weeks, the longest small-app run found                                                  |
| Roommate awkwardness                                   | LetsSettle, SplitHome, PaidUp    | "Without the awkward 'Bro, how much was it?'"                                                                                                                                                                                                                                                                                  | Brand TikToks get 1–4 likes ([TikTok discover](https://www.tiktok.com/discover/app-for-splitting-bills-roommates)) |
| Creator filming a real restaurant dinner               | @brandonbee03 for "Split Mobile" | Friend group at a tagged LA restaurant with the app as the punchline: **958K likes, 166.6K saves, 104.2K shares**, about 9.1M views ([TikTok](https://www.tiktok.com/@brandonbee03/video/7653261365762624798))                                                                                                                 | The only viral bill-split asset found                                                                              |
| Batches of short punchy video hooks (adjacent finance) | Rocket Money                     | 17 of 25 ads were video, all refreshed on one day: "Don't get roasted. Download Rocket Money." ([Meta Ad Library](https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=%22Rocket%20Money%22&search_type=keyword_exact_phrase))                                                                  | Large ongoing batches                                                                                              |
| Tech-news creator take                                 | @akad_technology, Stephen Robles | "Apple just made an entire category of apps redundant" about iOS 27 Wallet split ([TikTok discover](https://www.tiktok.com/discover/app-for-splitting-payments))                                                                                                                                                               | Low engagement, but a threat narrative                                                                             |

Three conclusions follow. First, **nobody runs a real video demo of receipt scan, then item assignment, then Venmo request** in paid ads [E]. The AI apps with scan copy ran for days, and Splitwise only shows stock imagery. Second, the format that broke out is **social and in-restaurant, not utilitarian**. Its saves and shares rival its likes, which suggests viewers forward it to their group chat ("use this next time") [I]. Brand-account roommate skits get single-digit likes [E]. Third, Divit's sharpest positioning sits between two pressures. Splitwise is actively advertising Pro, so its users are being reminded of its free-tier limit, which its help center states as **"up to 4 expenses each day"** ([Splitwise KB](https://kb.splitwise.com/pro/what-is-splitwise-pro)). Apple's iOS 27 split also scans and prorates tax and tip, but **only in the US and only when everyone involved uses Apple Cash** ([Tom's Guide](https://www.tomsguide.com/phones/iphones/ios-27-will-reportedly-offer-bill-splitting-in-apple-wallet-heres-how-it-will-work)). Divit should therefore lean on what Apple's split lacks [I]: Venmo, friends on Android or the web who join from a link without downloading anything, multi-receipt trips, and running balances.

## Freemium math makes paid an amplifier, not an engine

The arithmetic decides the sequence [I, built on E inputs]. An annual subscriber nets about **$29.74** after Apple's 15% small-business commission. RevenueCat's median trial-to-paid rate is **42.5% for 17–32-day trials** and **25.5% for trials under 4 days** ([RevenueCat](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)). Divit's 14-day trial falls between those bands, so assume about 35%. That makes a trial start worth about **$10 in first-year revenue**. Freemium download-to-trial rates run in the single digits (4.3–8.9% in secondary write-ups of the same report, [ARPU Brothers](https://arpubrothers.com/blog/revenuecat-subscription-app-report-2026/)). A $4 install therefore buys a trial for roughly $45–$90. Paid installs lose money in year one unless they ride on posts that also bring cheap organic installs, or unless each paying organizer pulls in invitees. That invitee loop is real for Divit, because friends open a share link, but it has not been measured. This is why the plan treats paid as a **multiplier on organic winners**, and why the main paid KPI is **blended cost per trial start**, not CPI.

Both platforms have folded campaign setup into AI-automated single flows. TikTok merged manual and Smart+ into one flow with full, partial or no automation ([TikTok Help](https://ads.tiktok.com/resources/help/article/about-updates-to-smart-plus?lang=en)). Smart+ App Campaigns shift budget toward the best creative automatically ([TikTok Help](https://ads.tiktok.com/resources/help/article/about-smart-plus-app-campaigns?lang=en)). Meta stopped new legacy Advantage+ App Campaign creation in Q1 2026 in favor of a unified Advantage+ structure ([PPC Land](https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/)). The owner's job therefore shifts from targeting to **feeding the machine conceptually distinct creatives**. Meta's Andromeda retrieval engine reportedly treats near-duplicate variants as one ad, so ten color swaps count for less than four genuinely different angles ([Meta Engineering](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/); [Segwise](https://segwise.ai/blog/meta-andromeda-update-creative-strategy-2026)). The cheapest way in is to boost what already won. TikTok **Spark Ads** run an existing organic post as an ad ([TikTok Help](https://ads.tiktok.com/resources/help/article/spark-ads-creation-guide)). Meta **Partnership ads**, which run through a creator's handle, average **19% lower CPA and 13% higher CTR** by Meta's own figures ([eMarketer](https://www.emarketer.com/content/meta-expands-partnership-ads-turn-creator-content-performance)).

Several budget mechanics constrain a small test. TikTok's help center says to raise a budget by **no more than 40% per change, with at least 2 days between changes**, during learning ([TikTok Help](https://ads.tiktok.com/resources/help/article/budget)). Vendors report a **$20/day ad-group and $50/day campaign minimum**, and about 50 conversions per ad group per week to exit learning ([Stackmatix](https://stackmatix.com/blog/tiktok-ads-minimum-budget-guide)). At Divit's budget, that means **optimizing for installs or registrations first**, since 50 trial starts a week is unaffordable [I]. Benchmarks to judge against are TikTok app-install CPM of about **$10–13** and CTR of **0.5–1.5% typical, above 2% excellent** ([Lebesgue](https://lebesgue.io/tiktok-ads/tiktok-ads-benchmarks); [Influee](https://influee.co/gb/blog/tiktok-ads-benchmarks)). One Meta-specific trap matters. Since January 2025, US financial products and services campaigns must use Meta's **Financial Products and Services special ad category**. Third-party summaries say it covers "payment services", and it removes age, gender, ZIP and lookalike targeting ([Meta Marketing API](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category); [Data Axle](https://www.data-axle.com/resources/blog/meta-special-ad-categories-rules/)). Divit never holds money, but "get paid back on Venmo" could be read as payments. Declaring the category up front costs little, because Advantage+ targets broadly anyway, and it avoids rejections that damage account health [I].

## AI can make almost everything, but not a fake customer

Neither platform bans AI ads. Both label them. TikTok Ads Manager has a **"This ad contains AI-generated content" toggle** for realistic synthetic people or scenes. It shows a persistent disclosure, and it **resets to unchecked whenever a campaign is duplicated** ([CineRads, citing TikTok's help center](https://www.cinerads.com/blog/tiktok-ai-content-policy)). TikTok has auto-labelled uploads carrying C2PA metadata since 2024 ([TechCrunch](https://techcrunch.com/2024/05/09/tiktok-automatically-label-ai-generated-content-created-other-platforms)). Meta adds an "AI info" label to content made with its own tools or detected through industry signals ([Social Media Today](https://socialmediatoday.com/news/meta-adds-updated-disclosure-tags-for-ai-generated-ads/824658)). For commercial ads that label is informational, not a ban ([The Keyword](https://www.thekeyword.co/learn/meta-ad-account-bans-2026)). AI-written captions and slideshows built from real app screenshots generally need no label. Photorealistic AI people do.

The legal line sits elsewhere, and it is sharp. The FTC's **Consumer Reviews and Testimonials Rule (16 CFR Part 465)** prohibits testimonials that misrepresent that the reviewer exists or has actually used the product, and commentators read it as explicitly reaching AI personas. Penalties reached **about $51,744 per violation** as of 2024 ([Fenwick](https://www.fenwick.com/insights/publications/the-ftc-cracks-down-on-fake-reviews-with-new-rule); [etcentric](https://www.etcentric.org/ftc-rule-prohibiting-fake-and-paid-reviews-goes-into-effect/)). The revised Endorsement Guides treat virtual influencers as endorsers who cannot claim experience they do not have. They draw a distinction for **spokespersons** who deliver brand claims rather than pose as independent users ([InfoLawGroup](https://www.infolawgroup.com/insights/2023/8/11/virtual-influencers-are-now-officially-regulated-endorsersunless-theyre-spokespersons)). New York's **GBL § 396-b, effective June 9, 2026**, requires a conspicuous disclosure in any ad featuring a "synthetic performer", meaning an AI-generated human not recognizable as a real person. Penalties are $1,000 for a first violation and $5,000 for each repeat ([Cooley](https://www.cooley.com/news/insight/2026/2026-01-29-new-york-enacts-synthetic-performer-disclosure-law-for-advertisements-including-those-using-generative-ai)). Feed ads cannot practically be fenced out of New York, so **every ad with an AI person carries an on-screen label** [I].

Three more rules shape the creative. **Venmo** asks that its name appear only as plain text in sentences and that its logo not be used in marketing without prior written approval. PayPal has enforced the mark before ([Venmo brand](https://venmo.com/about/brand); [Braintree guidelines](https://developer.paypal.com/braintree/files/venmo-merchant-integration-guidelines_011922.pdf); [Heitner Legal](https://heitnerlegal.com/2019/07/09/venmo-is-not-cool-with-the-idea-of-being-able-to-lenmo-money/)). So "sends Venmo requests" is fine, while Venmo blue, the "V" and filmed Venmo app screens are not [I]. **Music** on a TikTok business account is limited to the **Commercial Music Library**, for organic and paid posts alike. Trending songs are not cleared for brands, and using a personal account to get them is itself a copyright risk ([TikTok Business](https://ads.tiktok.com/business/zh/blog/audio-library-royalty-free-music); [Soundstripe](https://www.soundstripe.com/blogs/why-can-i-only-use-commercial-sounds-on-tiktok)). **Originality** now applies to carousels too. Since April 30, 2026, Instagram makes accounts that mostly repost others' photos and carousels ineligible for recommendation ([Tubefilter](https://tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator)). TikTok pulls unoriginal re-uploads from the For You feed ([Online Optimism](https://onlineoptimism.com/blog/updates-tiktoks-community-guidelines)). High volume is allowed. Duplicated content across an account farm is the risky part.

The table below is the working rule for any AI avatar or clone.

|               | Allowed: labelled AI spokesperson                                                                                                                                               | Forbidden: fake testimonial                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Framing       | "Divit's AI spokesperson" or "AI-generated presenter" on screen for the whole ad; TikTok AIGC toggle on                                                                         | Avatar presented as a customer, friend or reviewer, or captioned "real review"                                        |
| Script voice  | Second or third person, product facts: "Divit reads every line of the receipt and splits tax and tip by what each person ordered."                                              | First-person experience: "I use Divit every weekend", "this saved my friendship", "my group finally stopped fighting" |
| Claims        | Only things the app demonstrably does, shown in a real screen recording                                                                                                         | Invented outcomes, savings figures or star ratings; "thousands of users love it" without data                         |
| Visuals       | Avatar hook (2–3 s), then a cut to the real Divit screen recording                                                                                                              | Avatar "holding a phone" with a rendered fake UI, or fake group-chat "proof" presented as real                        |
| Founder clone | Owner's own HeyGen/Argil twin saying true things about himself ("I built Divit because I was always the friend who fronted the bill"), labelled "AI version of the founder" [I] | Owner's twin claiming experiences he did not have, or any clone of another real person without consent                |
| Comparisons   | Dated, sourced facts: "Splitwise free: up to 4 expenses/day (Oct 2026)"                                                                                                         | Unsourced digs or implied endorsement by Venmo or Apple                                                               |

## The saved reels were mostly right on tactics and wrong on safety

The owner's saved reels anticipated the core playbook, but they are sponsored, hype-prone and partly out of date. The table weighs each lesson against the research. Reel figures are unverified throughout.

| Reel lesson (cluster)                                                                                                                                                                                               | Verdict                                                          | What the research says                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Faceless slideshows first, CTA on the last slide, 5–7 a day (L: [DVKRKF9CUTr](https://www.instagram.com/reel/DVKRKF9CUTr/), [DWmVfaZCSKb](https://www.instagram.com/reel/DWmVfaZCSKb/))                             | **Confirmed, with a caveat**                                     | The slideshow case studies point the same way (Stronger, Scrolly, AbMax), though all are self-reported. Volume is within platform norms, but near-duplicate templates and cross-account reposts risk unoriginal-content demotion ([Tubefilter](https://tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator)). "20k downloads in 2 weeks" is unverifiable.                                                                                                                                                                                             |
| Copy formats that already work, e.g. ≥5x views vs followers; Volume MCP recreates a viral post (L: [DePROqCxXPW](https://www.instagram.com/reel/DePROqCxXPW/))                                                      | **Updated**                                                      | Copy the _structure_, never the assets. Volume exists, at $29.99/mo with an MCP server ([Volume](https://tryvolume.app/)), but the reel was a Volume promo. Trending audio can't be copied on a business account; brands mimic the trend's format with licensed sound ([Planoly](https://planoly.com/blog/commercially-licensed-vs-trending-sounds-what-can-brands-use)).                                                                                                                                                                                                                         |
| Micro-influencers (5–10k followers, $30–60/post), then paid only behind viral posts (L: [DVW6vhEkRnM](https://www.instagram.com/reel/DVW6vhEkRnM/))                                                                 | **Confirmed in direction, price unverified**                     | The 9.1M-view restaurant video and Meta's 19%-lower-CPA Partnership ads support creators. The $30–60 price wasn't verified. Paid creator posts need clear #ad disclosure under the Endorsement Guides ([BakerHostetler](https://www.bakerlaw.com/insights/updated-ftc-endorsement-guides-hold-virtual-influencers-to-actual-standards/)).                                                                                                                                                                                                                                                         |
| Claude Code runs Meta ads via Graph API Explorer token or system user; give it the card (A: [DUoTdgPEq9Z](https://www.instagram.com/reel/DUoTdgPEq9Z/), [DeOWRLjkbVS](https://www.instagram.com/reel/DeOWRLjkbVS/)) | **Contradicted on the quick route; system-user route confirmed** | System-user tokens through a reviewed app and verified Business Manager are the documented path ([Meta docs](https://developers.facebook.com/docs/business-management-apis/system-users/overview)). Pasted dev tokens and unsupervised write access are the pattern vendors tie to disables ([Porter Metrics](https://portermetrics.com/en/tutorial/meta-ads-ban/)). New limits from May 5, 2026: **4 ad-set budget changes per hour, 10 spend-limit changes per day** ([The Keyword](https://www.thekeyword.co/learn/meta-ad-account-bans-2026)). Keep Claude read-only and approve every write. |
| A Meta "ban wave" is underway; publish the app and verify the business (A: [DWe3rtfiSa8](https://www.instagram.com/reel/DWe3rtfiSa8/))                                                                              | **Partly confirmed**                                             | Disables are widely reported, and even 15-year veteran Jon Loomer was caught ([Jon Loomer](https://pubcast.jonloomer.com/15-years-in-metas-broken-system-finally-came-for-me/)). But Meta has not confirmed a "ban wave", and the reel's "prevents 95%" is unsourced. A disable not reinstated within 6 months becomes permanent. Pipeboard is unverified.                                                                                                                                                                                                                                        |
| `ads plan` / `/ads` skills build a 12-week strategy (A: [DVAIIB4CdPr](https://www.instagram.com/reel/DVAIIB4CdPr/), [DXMxSz1CjPP](https://www.instagram.com/reel/DXMxSz1CjPP/))                                     | **Updated**                                                      | Fine for brainstorming. But Meta retired legacy Advantage+ App Campaign creation in Q1 2026 ([PPC Land](https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/)), so generated campaign structures may be stale. Unvetted skills also run with the agent's permissions.                                                                                                                                                                                                                                                                                                   |
| MiroFish simulates a crowd of AI customers reacting to an ad or price (D: [DeEIg9kOyzI](https://www.instagram.com/reel/DeEIg9kOyzI/), [DdLFB_SjoEy](https://www.instagram.com/reel/DdLFB_SjoEy/))                   | **Unvalidated**                                                  | The research found no evidence either way, and one reel itself says "not a prediction machine… a cheap first argument." Use it at most as a free pre-filter on the hook bank, never to pick budgets. Real posts get real signal within 48 hours for almost nothing.                                                                                                                                                                                                                                                                                                                               |
| Remotion + Claude Code makes videos (H: [DT7BGMDjXSv](https://www.instagram.com/reel/DT7BGMDjXSv/))                                                                                                                 | **Confirmed**                                                    | `remotion-dev/skills` (about 5.0k stars) installs with `npx skills add remotion-dev/skills` ([GitHub](https://github.com/remotion-dev/skills)). Remotion is **free for companies of up to 3 people**, commercial use included ([Remotion pricing](https://remotion.dev/pricing)).                                                                                                                                                                                                                                                                                                                 |
| Whisk → Flow → ezgif recipe ([DUXqv2eCMxC](https://www.instagram.com/reel/DUXqv2eCMxC/))                                                                                                                            | **Outdated**                                                     | Google **discontinued Whisk on April 30, 2026**; its features moved into Flow, which gives every account 50 free credits a day ([Google Workspace Updates](https://workspaceupdates.googleblog.com/2026/03/whisk-is-moving-to-flow-on-april-30-2026.html); [magichour](https://magichour.ai/blog/google-flow)).                                                                                                                                                                                                                                                                                   |
| Arcads skill for UGC; UGCdrop MCP; Higgsfield "cheapest"; Kie cheaper (H)                                                                                                                                           | **Mixed**                                                        | The Arcads MCP is confirmed by Arcads' help center, at roughly **$11 per talking-actor video and about $110/mo minimum** ([Arcads help](https://intercom.help/arcads/en/articles/15655699-arcads-mcp); [AdRoast](https://www.adroast.ai/blog/arcads-pricing)). UGCdrop returned no search results. Higgsfield pricing conflicts across sources and its credits expire monthly ([Higgsfield blog](https://higgsfield.ai/blog/seedance-2-0-pricing-2026)). Kie is the cheapest pay-as-you-go option for images ([ArgoLink](https://argolink.io/en/blog/nano-banana-2-1-api-pricing)).               |
| LTX-2 free local video (#ad, [DUdd0gnAahG](https://www.instagram.com/reel/DUdd0gnAahG/))                                                                                                                            | **Updated**                                                      | Free for companies under $10M revenue under its community license, not Apache 2.0 as blogs claim ([LTX license](https://ltx.io/model/license)). It targets NVIDIA GPUs, so it is likely impractical on the owner's Mac [I].                                                                                                                                                                                                                                                                                                                                                                       |
| "FTC $51k per violation per day" for undisclosed AI (red flag, [DZs7mU3RJKE](https://www.instagram.com/reel/DZs7mU3RJKE/))                                                                                          | **Mis-framed**                                                   | The ~$51,744 (2024) penalty attaches to fake reviews and testimonials under Part 465, not to undisclosed AI as such. The AI-performer disclosure duty comes from New York's law ($1k/$5k) and from platform labels.                                                                                                                                                                                                                                                                                                                                                                               |
| Sponsored tool picks: HeyGen, Blotato, Volume, Higgsfield, Kie, LTX (red flags)                                                                                                                                     | **Bias noted**                                                   | This plan still recommends Blotato and HeyGen, but on their official pricing pages ([Blotato](https://blotato.com/pricing); [HeyGen](https://www.heygen.com/pricing)), not on the reels' word. Trial each before paying.                                                                                                                                                                                                                                                                                                                                                                          |

The reels were thinnest on the creator-at-restaurant format, the Venmo trademark limits, Meta's financial ad category, music licensing and the New York law. Those are where a solo founder is most likely to get hurt.

## The plan

### Formats, ranked for Divit

| Rank | Format                                                                                            | Role                                          | Why                                                                                   | Basis                     |
| ---- | ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------- |
| 1    | **Photo-mode slideshow / IG carousel** (2–6 slides; real receipt photo plus real app screenshots) | Organic engine; best winners become Spark ads | Best-documented indie format; cheapest; usually needs no AI label                     | E (case studies) + I      |
| 2    | **Real-screen "receipt race" demo** (9:16, 10–15 s)                                               | Organic plus the main paid ad                 | White space: no competitor shows the scan, the split and the Venmo request working    | E (gap) + I (performance) |
| 3    | **Founder storytelling / POV** (owner on camera, or his labelled twin)                            | Organic, plus paid variety for Andromeda      | Storytelling hooks have the best Day-7 retention (8.4%)                               | E                         |
| 4    | **Micro-creator restaurant video → Partnership / Spark ad**                                       | Phase 3 amplifier                             | The only viral bill-split asset is this format; Partnership ads average 19% lower CPA | E                         |
| 5    | **Labelled AI-spokesperson hook + screen-recording cutaway**                                      | Extra paid concepts once hooks are proven     | Fast angle variety; compliant if labelled                                             | I                         |
| 6    | **Static image** (receipt vs. totals, one line of copy)                                           | Cheap Meta Advantage+ filler                  | What Splitwise runs; low effort                                                       | E (competitor use)        |
| 7    | **Fully AI-generated skit** (Veo/Kling)                                                           | B-roll only                                   | Needs a label, uncanny risk, adds little to a UI-driven product                       | I                         |

### Positioning and the hook bank

Every ad should express one of five angles. They are written to avoid what Apple and Splitwise already cover [I].

| Angle                                          | Hook examples (value in the first 3 s)                                                                                                                       | Proof shown                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **Fairness** (itemized + proportional tax/tip) | "I ordered a $14 salad. We split evenly. I paid $57.35." / "Splitting evenly is a tax on the friend who only had water." / "Who ordered the $68 wagyu?"      | Even-split vs. Divit totals             |
| **Speed at the table**                         | "Server's back in 60 seconds. 6 people. 23 items." / "Venmo requests sent before the card machine came back."                                                | Real timer on screen                    |
| **The friend who fronts the bill**             | "POV: you put the $412 dinner on your card. It's day 9." / "Tag the friend who still owes you from August."                                                  | Requests sent from one tap              |
| **Group trips** (multi-receipt events)         | "9 people. 14 receipts. Nashville. Zero money fights." / "Make the trip group before the trip, not after."                                                   | Event with many receipts, one settle-up |
| **Works for your whole group**                 | "Your friend with the Android can finally pay you back." / "No app download for your friends. Just a link." / "Free to start, no daily expense cap." | Share link opening in a browser         |

### Top scripts

The illustrative numbers below are internally consistent. Subtotal $178, tax 8.875% = $15.80, tip 20% = $35.60, total $229.40. The even split is $57.35 each. Divit's split: salad $18.04, wagyu + cocktail $108.26, pasta + cocktail $54.13, burger + cocktail $48.97. Caption each post "example bill" [I].

**Script 1, "The salad tax" (TikTok photo mode + IG carousel, 6 slides, 1080×1920).** Slide 1, over the owner's own real dinner-table photo: "I ordered a $14 salad. We 'split evenly.' I paid $57.35." Slide 2, receipt close-up with lines circled: "Wagyu $68. Three cocktails. My salad: $14." Slide 3, big type: "Even split: $57.35 each. What I actually owed: $18.04." Slide 4, Divit screenshot of items with faces tapped: "Snap the receipt. Tap who had what." Slide 5, totals screen: "Tax and tip split by what you ordered, not by headcount." Slide 6, CTA over the app: "Venmo requests in one tap. Free: Divit (link in bio)." Caption: "the salad friend deserves justice 🥗 #splitthebill #friendsgiving". Sound: CML track. No AI label is needed, because the photos and screens are real [I].

**Script 2, "Receipt race" (12–15 s video, primary paid creative).** 0–2 s: a real long receipt slaps onto a restaurant table; text: "6 people. 23 items. Server's back in 60 sec." 2–5 s: phone snaps it, and the real screen recording shows items populating (label "2x speed" if sped up). 5–9 s: quick taps put faces on items. 9–12 s: per-person totals with tax and tip. 12–15 s: "Request on Venmo" taps, timer freezes at the real time, end card "Divit. Scan. Tap. Paid back." Optional ElevenLabs voiceover: "Scan it, tap who had what, done." Make three distinct cuts for Andromeda: a dinner version, a bar-tab version and a brunch version with different people counts and hooks [I].

**Script 3, "The friend who fronts the bill" (20–30 s founder story, storytelling hook).** Owner on camera, phone propped up, kitchen-table lighting. 0–3 s: "Every friend group has one person who puts the whole dinner on their card. For six years that was me." 3–12 s: "Then comes 'I'll Venmo you tonight', and nine days later you're doing tax math on a napkin." 12–22 s: cut to screen recording: "So I built Divit. Scan the receipt, tap who had what, and it splits tax and tip by what everyone actually ordered." 22–30 s: "Your friends pay from a link, even the Android one. It's free. Divit." A twin version from HeyGen can reuse this script word for word, because the experience is the owner's own; it must carry "AI version of the founder" on screen and the TikTok AIGC toggle [I]. An AI-spokesperson variant must drop every first-person line: "If you're the friend who always fronts the bill, Divit splits it by what everyone ordered…"

**Script 4, "Trip ledger" (5-slide slideshow, timed 2–3 weeks before trip moments).** Slide 1: "9 of us. Nashville bachelorette. $3,840. Zero money fights." Slide 2: a pile of real receipts or a Notes-app list of expenses. Slide 3: Divit event screen with many receipts. Slide 4: running balances, "who owes who, across every receipt". Slide 5: "Friends join from a link, no download. Make the trip group before you leave. Divit." Only use a real trip's figures, or caption "example trip".

Further angles for volume: the Friendsgiving potluck/host split, "5 unwritten rules of splitting the bill" (listicle, CTA last; the reel-L format), "tag the friend who still owes you" (engagement bait, unproven), and a dated, sourced anti-cap slide ("Splitwise free: up to 4 expenses a day. Divit: no daily expense cap."), checked against Splitwise's KB on the day it is posted.

Ten slideshow types and eight video ideas, with partner-ready copy and a pre-post checklist, are in **Creative brief for the ad builder** below.

### AI tool stack and monthly cost

Prices come from vendor pages and aggregators as of October 2026. Verify each before buying.

| Need                                            | Lean (~$40–70/mo)                                                                                                                 | Larger (~$250–350/mo)                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Slides, video assembly, device frames, captions | Remotion + `remotion-dev/skills` via Claude Code: **$0** ([Remotion](https://remotion.dev/pricing))                               | Same                                                       |
| App screens                                     | iOS simulator / `adb` screen recording + the repo's existing screenshot skill: $0                                                 | Same                                                       |
| Backgrounds (only when no real photo exists)    | Nano Banana 2.1 via Kie, about $0.02–0.045/image: **~$2–5** ([ArgoLink](https://argolink.io/en/blog/nano-banana-2-1-api-pricing)) | Plus Google AI Pro, $19.99 (1,000 Flow credits)            |
| B-roll                                          | Google Flow's 50 free credits/day: $0                                                                                             | fal/Kie Veo or Kling budget, ~$30–50                       |
| Voiceover                                       | ElevenLabs Starter, **$6** (commercial licence) ([ElevenLabs](https://elevenlabs.io/pricing))                                     | ElevenLabs Creator, $22 (clone the owner's voice)          |
| Founder twin                                    | Optional: HeyGen Creator, **$29** ([HeyGen](https://www.heygen.com/pricing))                                                      | HeyGen Creator, $29                                        |
| AI actors                                       | none                                                                                                                              | Arcads Starter, ~$110 (~10 videos, MCP) or MakeUGC ~$49–59 |
| Posting to TikTok + IG by API/MCP               | Blotato Starter, **$29** (claims an audited TikTok app; MCP) ([Blotato](https://blotato.com/pricing))                             | Plus Volume Pro, $69.99, for viral-format discovery        |
| Music                                           | TikTok CML (free); a commercially licensed track for cross-platform cuts                                                          | Same                                                       |
| **Total excluding ad spend**                    | **~$37 without the twin, ~$66 with it**                                                                                           | **~$300–350**                                              |

Avoid three things: CapCut for final ad assets (secondary reports say its 2025 terms grant a broad, perpetual licence to uploads, [marketing4ecommerce](https://marketing4ecommerce.net/en/capcut-new-terms/)); the Sora 2 API (reported shut down in September 2026; unconfirmed); and building a custom TikTok posting app, because unaudited apps can only post privately ([TikTok developers](https://developers.tiktok.com/docs/en/content-sharing-guidelines)). The larger stack is only worth buying once one paid concept has hit its scale threshold.

### Production workflow run with Claude Code

The workflow lives in a `marketing/` folder of the repo and runs as one small, repeatable loop [I]. **(1) Hook bank:** a `hooks.csv` with angle, hook, format, status and result. Claude drafts 20 hooks per angle and the owner keeps the 5 that sound like him. **(2) Slide copy:** Claude writes each post as a small JSON file (slides, captions, hashtags, CTA). **(3) Assets:** the owner's own photos of real receipts and dinners come first, since real images are more credible and need no label. Simulator screenshots come from a seeded demo bill using the salad numbers above. Nano Banana backgrounds fill gaps only. **(4) Render:** a Remotion composition renders 1080×1920 PNG slides and MP4 demos, with screen recordings framed in a device and captions burned in. **(5) Compliance lint:** before anything is queued, Claude checks the copy for first-person claims spoken by an AI person, a missing AI label, Venmo logo or colours, unsourced comparisons, and money claims the app can't show. **(6) Post:** through the Blotato MCP, scheduled; or as a TikTok draft to the inbox when the owner wants to add a CML sound by hand. Blotato's photo-mode support is unconfirmed, so test it on the first post. **(7) Measure:** each Monday the owner exports TikTok and Instagram analytics, and Claude ranks posts by views relative to the account median and by save+share rate, then updates `hooks.csv`. **(8) Paid:** the owner builds campaigns by hand in Ads Manager from a Claude-written spec. Any Marketing API connection comes later, through his own reviewed Meta app with a system-user token, read-only by default, with every write proposed by Claude and approved by him, and client-side caps well below Meta's limits.

### Organic first, then paid amplification

| Phase                      | Spend                                                                                                                                                                                                               | What happens                                                                                                               | Move on when                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Organic test** (4 weeks) | $0 media                                                                                                                                                                                                            | 1 TikTok + 1 Instagram brand account; 2–3 slideshows/day plus 2 demo videos/week, cross-posted natively without watermarks | 3+ posts beat the threshold below              |
| **Paid test** (10 days)    | Lean: TikTok Spark only, one campaign at the $50/day minimum on the top 3 organic posts = **~$500**. Fuller: add Meta at **$20–30/day** on Advantage+ (financial category) with 4 distinct concepts = **~$700–800** | Optimize for install/registration, not trial                                                                               | Thresholds below                               |
| **Scale**                  | Raise budget ≤40% every 2+ days ([TikTok Help](https://ads.tiktok.com/resources/help/article/budget)); weekly cap set by blended cost per trial                                                                     | Feed 3–5 new distinct concepts/week; add a micro-creator Partnership test                                                  | Blended cost per trial stays under the ceiling |

Thresholds [I; the benchmarks are E where cited]:

| Signal         | Winner / scale                                                                                                          | Kill / retire                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Organic post   | ≥3x the account's trailing 14-day median views **and** save+share rate ≥1% (the viral restaurant video ran ~1.8% saves) | —                                                                               |
| Organic format | —                                                                                                                       | 10 posts in a row below the median                                              |
| Paid ad, early | CTR ≥1% after 3,000 impressions                                                                                         | CTR <0.5% after 3,000 impressions (bottom of the TikTok typical band)           |
| Paid ad, cost  | Cost per install ≤$4 over 3 consecutive days                                                                            | No installs after spend = 3x target CPI (~$12), or CPI >$8 after $60            |
| Business       | Scale while blended cost per trial start ≤ **$15** (allowing for unmeasured invitee installs)                           | Pause all paid if blended cost per trial >$30 for a week, and return to organic |

The $15 ceiling sits above the ~$10 first-year value of a trial on purpose. It bets on invitee growth and multi-year renewals. Tighten it once RevenueCat shows Divit's real trial-to-paid rate and renewal behavior.

### Weekly cadence (one small task per day, 30–90 minutes)

| Day | Single task                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- |
| Mon | Pull last week's analytics; Claude ranks winners; mark them in `hooks.csv`                                    |
| Tue | Batch-write and render 7 slideshows from the top 2 angles plus 1 new angle                                    |
| Wed | Record one real-screen demo or founder video; render in Remotion                                              |
| Thu | Run the compliance lint and schedule the week's posts in Blotato                                              |
| Fri | Paid check (from Phase 2 on): apply kill/scale thresholds, at most one budget change                          |
| Sat | Reply to comments; turn the best comment into next week's hook (reply-to-comment videos are cheap and native) |
| Sun | Off, or refresh the seasonal calendar                                                                         |

### Phased timeline in small steps

Today is October 10, 2026. Friendsgiving and Thanksgiving (November 26) and New Year's trips are the next demand moments. Creative should land 2–3 weeks before each [I]. Each step is one sitting.

| Week                                 | Step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phase 0: setup (Oct 12–18)**       | 1. Create TikTok Business and Instagram professional accounts named Divit, with the same bio and a divit-bill.com link. 2. Verify Meta Business Manager; turn on 2FA; add a backup admin; attach a card that won't fail. 3. Create the TikTok Ads account (no spend yet). 4. Install the Remotion skills; have Claude scaffold `marketing/` with one slide template. 5. Seed a demo bill with the salad numbers and capture simulator screenshots. 6. Write `hooks.csv` (25 hooks across 5 angles). 7. Start the Blotato trial; post one test slideshow to confirm photo mode works. 8. Confirm install attribution exists (Meta and TikTok app events or an MMP) so paid can be measured; if not, it becomes a separate engineering task. |
| **Phase 1: organic (Oct 19–Nov 15)** | 9. Post Script 1 and two variants. 10. Record and post Script 2 (dinner cut). 11. Record Script 3 on camera. 12. Daily slideshows following the weekly cadence. 13. From Nov 2: Friendsgiving and host-split slideshows. 14. Weekly review; retire losing formats. 15. Optional: try the HeyGen twin on Script 3 with labels, and compare against the real-face version.                                                                                                                                                                                                                                                                                                                                                                   |
| **Phase 2: paid test (Nov 16–29)**   | 16. Spark-boost the top 3 organic posts at $50/day. 17. Optional: Meta Advantage+ campaign in the financial category with 4 distinct concepts at $20–30/day. 18. Daily threshold check; first scale-or-kill call on day 4. 19. Write up results: CPI, cost per trial, best angle.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Phase 3: holidays (Dec)**          | 20. NYE-trip and holiday-dinner creative from the winning angle. 21. Scale only the concepts that passed the thresholds; otherwise pause paid while Q4 auctions run (Q4 CPM inflation is an unsourced industry assumption). 22. Contact 3 food or travel micro-creators for a disclosed restaurant-dinner post in the brandonbee03 format; plan Partnership ads for January.                                                                                                                                                                                                                                                                                                                                                               |
| **Phase 4: spring trips (Jan–Mar)**  | 23. Spring-break and bachelorette trip-ledger series. 24. Move up to the larger stack only if a paid concept held under $15 per trial for 2+ weeks. 25. Only then consider a read-only Claude Marketing API reporting connection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Creative brief for the ad builder

This section is written so a partner can build the ads without having been part of the research. It covers production specs, ten slideshow types with ready-to-use copy, eight video ad ideas, UGC ad types (starting with a three-ad AI-presenter test), the exact images and videos to create for each (sources, AI prompts and per-ad shot lists), where the download call-to-action goes in every format, and a pre-post checklist. Every feature named here exists in the app today: receipt scan, tap who had what, proportional tax and tip, itemized Venmo requests, share links that friends open without downloading, group trips with many receipts, recurring bills, and Airbnb "Split by Night". All numbers are internally consistent examples. Caption them "example bill" unless they come from a real bill [I].

### Production specs

| Item | Spec |
| --- | --- |
| Size | TikTok photo mode and Reels: 1080×1920 (9:16). Instagram feed carousel: 1080×1350 (4:5). Export both from the same template |
| Safe zone | Keep text out of the top ~250 px and bottom ~400 px (TikTok UI and captions cover them) and ~120 px on the right (buttons) |
| Text | Big type, at most ~12 words per slide; the hook slide at most ~10 words. One idea per slide |
| Slide count | 4–7. The hook goes on slide 1; Divit appears no earlier than the middle; the CTA is the last slide |
| Imagery | Real receipts, real dinner tables and real app screens first. AI backgrounds only as filler. Never an AI person presented as a real customer |
| Brand | Divit logo or wordmark only on the CTA slide. Organic slideshows should feel native, not like ads |
| CTA slide | "Divit — free on iOS & Android" + one benefit line. Link in bio for organic posts |
| Music | TikTok Commercial Music Library only on the business account; a licensed track for Instagram |

### Slideshow types

Each type is a reusable template. Rotate them so Meta's Andromeda system sees genuinely different concepts, not near-duplicates [E: what_works notes].

**Type 1: "The points play" (money hack).** This is the owner's idea, tightened. The hook promises a payoff, the middle slides show the steps, and Divit is the step that makes it work. The honest twist: you are not overcharging anyone. You front the bill, keep the card points, and everyone pays exactly their share.

| Slide | Copy | Visual |
| --- | --- | --- |
| 1 | "I always pick up the check. My friends think I'm generous." | Hand putting a card on a restaurant check presenter (no card logo) |
| 2 | "Step 1: Put the whole $412 dinner on my card." | Long receipt on the table |
| 3 | "Step 2: 4x points on dining = 1,648 points." | Close-up of the total, "+1,648 pts" overlay |
| 4 | "Step 3: Snap the receipt. Divit splits it by what everyone actually ordered, tax and tip included." | Divit scan screen |
| 5 | "Step 4: Itemized Venmo requests go out before we leave the table." | Divit request screen |
| 6 | "Everyone pays their exact share. I keep the points. ✈️" + CTA | Divit CTA card |

Hook variants for slide 1, so each can be tested as its own post:
- "How to make money off your friends (legally)". This is the owner's original. Strong for organic, but use one of the others for paid ads (see the note below).
- "Why I always grab the check"
- "My friends think I'm generous. I'm farming points."
- "The dinner-bill hack my friends haven't figured out"
- "I flew to Miami on my friends' dinners"
- "Stop letting your friends put the bill on their card"

Caption: "Points rates vary by card. Example numbers. Not financial advice." The math: $412 × 4 = 1,648 points, worth roughly $16–$33 at common 1–2¢ valuations. Say "points", not dollars, unless the owner states a real redemption. Paid-ad note [I]: Meta and TikTok scrutinise "make money" and earnings-style claims, and Divit may sit in a financial ad category. Keep "make money off your friends" for organic posts. For paid, boost the "Why I always grab the check" or "I'm farming points" versions.

**Type 1b: a serial version.** "Day 1 of earning a free flight from my friends' dinners", with a running points tally on each post. Series give people a reason to follow. **Only run it if the owner actually does it and the tally is real.**

**Type 2: "The salad tax" (fairness reveal).** This is Script 1 in the plan. The hook is an unfair even split, the reveal is the fair number. Hook variants:
- "I ordered a $14 salad. We split evenly. I paid $57.35."
- "Splitting evenly is a tax on the friend who only had water."
- "Your friend who orders wagyu loves 'let's just split it'."
- "I did the math on our last dinner. I've been overpaying for years."

**Type 3: "Guess the split" (quiz).**

| Slide | Copy |
| --- | --- |
| 1 | "4 friends. $229.40 bill. Guess what the salad person owes 👇" |
| 2 | The receipt (wagyu $68, salad $14, pasta, burger, 3 cocktails, tax, 20% tip) |
| 3 | "Even split says $57.35. Wrong." |
| 4 | "Tax and tip should follow what you ordered." |
| 5 | "Salad: $18.04. Wagyu + cocktail: $108.26." (Divit totals screen) |
| 6 | "Divit does this from a photo of the receipt." + CTA |

Comment bait: "What did you guess?" This needs real reply effort. The Saturday task in the weekly cadence covers it.

**Type 4: "Types of friends when the check comes" (relatable archetypes).** One archetype per slide, with a dinner-table photo or illustration:
- "The 'I'll Venmo you tonight' (it's been 3 weeks)"
- "The 'let's just split it evenly' (ordered 3 cocktails)"
- "The calculator guy (it's been 11 minutes)"
- "The one who 'forgot their wallet'"
- "The one who fronts the bill and quietly suffers"

Last slide: "Be the friend with Divit. Snap, tap, everyone's paid." Caption: "Tag the friend who's #2."

**Type 5: "Unwritten rules of splitting the bill" (listicle; the faceless-slideshow format from the reels).**
1. "Whoever orders the bottle doesn't get to say 'split evenly'"
2. "Tax and tip get split by what you ordered, not by headcount"
3. "The person who fronted it should be paid back before the Uber arrives"
4. "Nobody argues with an itemized request"
5. "Your friend without the app still has to pay" (share link, no download)

CTA: "Divit does rules 2–5 for you."

**Type 6: "Napkin math vs. Divit" (before/after).** Left or first slide: a messy calculator, a group chat of "wait what do I owe", a 14-minute timer. Right or next slide: the Divit totals screen, "38 seconds". Hooks:
- "How my friends split the bill vs. how I do"
- "2019 me vs. 2026 me at the end of dinner"

**Type 7: "The trip ledger" (story).** This is Script 4, timed 2–3 weeks before trip moments: Friendsgiving, New Year's, spring break, bachelor and bachelorette trips, summer. Hooks:
- "9 of us. Nashville. $3,840. Zero money fights. Here's how."
- "Make the trip group BEFORE the trip, not after."
- "Every group trip has a 'who paid for gas' fight. Not ours."

Show an event with many receipts and one settle-up screen.

**Type 8: "Left the Airbnb early" (Split by Night).**

| Slide | Copy |
| --- | --- |
| 1 | "I left the Airbnb 2 days early. Why am I paying for 4 nights?" |
| 2 | "$1,200 house. 4 friends. 4 nights. I stayed 2." |
| 3 | "Even split: $300 each." |
| 4 | "Split by night: I owe $171.43. Everyone else $342.86." (Divit Airbnb review screen) |
| 5 | "Divit splits the house by who stayed which nights." + CTA |

The math: 14 person-nights, $1,200 ÷ 14 = $85.71 per person-night. Re-capture the screen from the real app so it matches. If the app treats cleaning or service fees differently, use the app's numbers, not these.

**Type 9: "Roommate auto-pilot" (recurring bills).** Hooks:
- "Things I stopped texting my roommates about: rent, wifi, Netflix, electric."
- "POV: rent splits itself on the 1st and nobody has to ask."

Slides show recurring bills (Quick, Detailed or Airbnb types) and the monthly request. Time this for back-to-school and lease season (August–September), and for New Year's resolutions.

**Type 10: "Hot take" (debate).** One bold statement on slide 1, two or three supporting slides, then Divit. Hooks:
- "Splitting the bill evenly is the most unfair thing friends do. Agree?"
- "If you round up when you Venmo, you're the problem."
- "The person who puts it on their card should get paid back first. Not negotiable."

Comments are the goal. Reply to the best ones with Type 4 or Type 2 posts.

Lower-priority extras: a "group chat screenshot" story (an illustrated "I'll send it tonight 🙏" thread, captioned or styled as a dramatization, never presented as real customers' messages), and a "build in public" founder slideshow ("I'm building a bill-split app alone. Day 12. Here's what users asked for").

### Video ad ideas

| # | Idea | Length | Beat sheet | Who / what is on camera | Best for |
| --- | --- | --- | --- | --- | --- |
| V1 | **"I got this."** (points play as a skit) | 12–20 s | Check arrives, owner slaps his card down, "I got it." Friends: "wait, really?" Smash cut: Divit sends itemized Venmo requests. Owner to camera: "You didn't think I was *paying*, right? Points." End card | Owner + real friends (written consent) | Organic, then a Spark ad |
| V2 | **Receipt race** (Script 2) | 12–15 s | Long receipt, scan, tap faces, totals, requests, timer freezes at the real time | Hands + real screen recording | Main paid ad |
| V3 | **"Calculator vs. Divit"** split-screen race | 10–15 s | Left: a friend with the phone calculator and a napkin. Right: Divit. Same receipt, same start. Divit finishes; the left side is still on "wait, is tip before or after tax?" | Two phones, or one person playing both sides | Paid variety |
| V4 | **"Nobody argues with an itemized Venmo request."** | 8–12 s | Close-up of the Venmo request note: "Wagyu ($68.00), cocktail (split 2 ways)…" Text: "Receipts don't lie." Then show how it was made | Screen recording only | Organic + paid; works without a face |
| V5 | **Founder story** (Script 3) | 20–30 s | "Every group has one person who fronts the bill. For six years that was me…" | Owner, or his HeyGen twin **labelled "AI version of the founder"** | Organic, then paid; the storytelling hook |
| V6 | **Green-screen explainer** | 15–25 s | Owner in front of the receipt or Divit screens: "Here's why your even split is overcharging the salad friend" | Owner (CapCut is fine for drafts; render finals in Remotion) | Organic |
| V7 | **"Left the Airbnb early" mini-skit** | 10–15 s | Friend packs a bag on day 2: "Still paying for 4 nights?" Cut to Divit Split by Night; their share drops on screen | Real people, or a labelled AI spokesperson cutaway | Trip seasons |
| V8 | **Labelled AI spokesperson "Bill-splitting 101"** | 15–20 s | An on-screen "AI presenter" states product facts only ("Divit splits tax and tip by what each person ordered") over screen recordings. Never "I use Divit" | Arcads or HeyGen actor + conspicuous "AI-generated presenter" label | Extra paid concepts after Phase 2 |

Build V2 and V1 first: V2 is the paid workhorse and V1 the most shareable. V4 is the cheapest to build, since it needs no people at all.

### UGC ad types

UGC ("user-generated content") means phone-shot, person-to-camera video that looks like a post, not an ad. The table shows each kind, whether the plan uses it, and the rules. Start with **AI presenters** (owner's call, 2026-10-10) to learn what an AI-only ad can do, then add the real-person types.

| UGC type | Use it? | Rules | Cost |
| --- | --- | --- | --- |
| **AI presenter (stock AI actor)** | ✅ **Start here** | Persistent "AI-generated presenter" label; product facts only; app screen recordings ≥50% of runtime | AI tool subscription |
| **AI voiceover over screens** (no face) | ✅ Yes | An AI voice reading facts over real app footage. Usually no person label is needed; still turn on the platform's AI toggle if anything is realistic | ~$6/mo voice tool |
| **Founder on camera** | ✅ Yes | The owner can say "I built this, I use it". True first-person claims are fine | $0 |
| **Founder AI twin** | ⚠️ Optional | Label "AI version of the founder"; only say what the real founder would truthfully say | AI tool subscription |
| **Real friends at real dinners** | ✅ Yes | Written consent from everyone on camera | $0 |
| **Real users** (asked to film their next split) | ✅ Yes | Any perk (free Pro year) counts as payment, so the post needs "#ad" or a paid-partnership label | Pro codes |
| **Micro-creators** (5–10k followers) | ✅ Phase 3 | Paid-partnership label; creator must genuinely use the app before talking about it | ~$30–60/post |
| **AI actor posing as a customer** ("I use Divit", "saved my friend group") | ❌ Never | Very likely an illegal fake testimonial (FTC 16 CFR Part 465); New York requires labels on AI performers | — |
| **AI "street interview" or AI reaction faces** presented as real people | ❌ Never | Same problem: fabricated opinions from people who don't exist | — |

#### AI presenter: what is AI and what isn't

| Part | Made by | Notes |
| --- | --- | --- |
| Presenter face + voice | AI avatar tool. Options: HeyGen Creator ~$29/mo (cheapest; reviewers say slightly "studio"); Arcads ~$110/mo (most UGC-looking; no public pricing); MakeUGC ~$29–59/mo (best phone-in-hand selfie style); Creatify ~$39/mo. Partner picks one and checks the price on the vendor's page | Stock AI actor, never a clone of a real person without consent |
| App footage | Real screen recordings of the app | **Never AI-generated app screens.** Fake UI misrepresents the product |
| Backgrounds / b-roll | AI images or clips (Nano Banana; Veo via Google Flow) | Only behind text or as short cutaways |
| Captions, label, end card | Editor of choice (Remotion, or any editor except CapCut for finals) | One template reused across ads |

#### AI presenter test, round 1: three ads, one variable

- **The only variable is the angle.** Same presenter, framing, length (~18 s), label, end card and CTA.
- **Ads:** A = Fairness ("salad tax"), B = Points play, C = Airbnb "Split by Night".
- **Measure (organic first, same posting window):** 3-second view rate, average watch time, save+share rate, profile taps. Winner = ≥3x the account's median views **and** ≥1% save+share.
- **Round 2:** keep the winning angle; test presenter style (casual phone selfie vs. studio) or the hook line. Then take the winner into the paid test.

**Script A: Fairness / "salad tax" (~18 s)**

| Time | Presenter says | On screen |
| --- | --- | --- |
| 0–3 s | "If you ordered a salad and split the bill evenly, you just overpaid." | Presenter, medium close-up. Text: **"Even split = you overpay"** |
| 3–7 s | "Four people, two-twenty-nine forty. An even split is fifty-seven thirty-five each." | Cutaway: receipt still (A1), total circled. "$229.40 ÷ 4 = $57.35" |
| 7–12 s | "Divit reads the receipt from a photo, you tap who had what, and tax and tip follow what each person ordered." | Cutaway: screen recording (A6): scan → items → tap faces |
| 12–15 s | "The salad comes out to eighteen-oh-four." | Cutaway: totals screen. **"$57.35 → $18.04"** |
| 15–18 s | "Divit. Free to download on iPhone and Android." | End card (A20): "Stop paying the salad tax", badges, "Link in bio" |

Caption: "Splitting evenly is a tax on the salad friend 🥗 Example bill. Divit is free to download, link in bio."

**Script B: Points play (~18 s)**

| Time | Presenter says | On screen |
| --- | --- | --- |
| 0–3 s | "Here's why some people always offer to pick up the check." | Presenter. **"Why they always grab the check"** |
| 3–7 s | "Put a four-hundred-twelve-dollar dinner on a 4x dining card, and that's over sixteen hundred points." | Cutaway: check-presenter image (A2 or AI) + "+1,648 pts" counter |
| 7–12 s | "Then Divit scans the receipt and splits it by what everyone actually ordered, tax and tip included." | Cutaway: A6 scan → totals |
| 12–15 s | "Itemized Venmo requests go out right from the table. Everyone pays their share." | Cutaway: A7 itemized request (plain text, no Venmo logo) |
| 15–18 s | "Divit. Free to download on iPhone and Android." | End card: "Front the bill. Keep the points.", badges, "Link in bio" |

Caption: "Points rates vary by card. Example numbers. Not financial advice. Divit is free to download, link in bio." The presenter describes what *people* do, not what *they* do. That keeps it an explainer, not a testimonial.

**Script C: Airbnb "Split by Night" (~18 s)**

| Time | Presenter says | On screen |
| --- | --- | --- |
| 0–3 s | "Leaving the Airbnb two days early? You shouldn't pay for four nights." | Presenter. **"Left early? Don't pay for 4 nights"** |
| 3–7 s | "A twelve-hundred-dollar house, four friends, four nights. Even split: three hundred each." | Cutaway: lake-house background (A15). "$1,200 ÷ 4 = $300" |
| 7–12 s | "Divit splits the house by night, so you only pay for the nights you stayed." | Cutaway: A10 Split by Night assign step |
| 12–15 s | "Two nights out of four comes to one-seventy-one forty-three." | Cutaway: A10 review screen. **"$300 → $171.43"** |
| 15–18 s | "Divit. Free to download on iPhone and Android." | End card: "Split the house by night", badges, "Link in bio" |

Caption: "Who's paying for nights they weren't there? 🏡 Example trip. Divit is free to download, link in bio." Capture the real Split by Night screen first. If the app's number differs (e.g. fees handled differently), change the script to match the app.

#### More AI-presenter and UGC-style ideas

| Idea | Format | Hook / beat | Type |
| --- | --- | --- | --- |
| **"3 bill-splitting mistakes"** | AI presenter, listicle, 20–25 s | "Three ways your friend group splits the bill wrong. Number two costs the most." Each mistake → a Divit screen | AI presenter |
| **"Explain it like I'm 5"** | AI presenter + whiteboard-style text | "Why tax and tip should be split by what you ordered, in 15 seconds" | AI presenter |
| **Presenter reacts to a receipt** | Green-screen: AI presenter in front of a real long receipt | "Six people, twenty-three items. Let's split this in under a minute." Cut to the A6 race with a timer | AI presenter |
| **Answer a real comment** | AI presenter or AI voice, reply-to-comment format | Pin a real viewer question ("does it work if my friend has Android?") → answer with A8 share-link footage | AI presenter / voice |
| **"Did you know" fact drop** | AI voiceover only over app screens, 8–12 s | "Your friends don't need the app to pay you back." → A8 | AI voice |
| **Myth vs. fact** | AI presenter, split text | "Myth: splitting evenly is fair. Fact: …" → salad numbers | AI presenter |
| **Roommate explainer** | AI presenter | "Rent, wifi, Netflix. Set it once and the split repeats every month." → A11 | AI presenter |
| **Trip checklist** | AI presenter, seasonal (2–3 weeks before trips) | "Before your group trip: one, make the trip group in Divit…" → A9 | AI presenter |
| **Founder "why I built this"** | Founder on camera (or labelled twin) | Script 3 / V5 | Founder |
| **"Film your next dinner split"** | Real users or friends, phone at the table | Brief them: show the receipt, the scan, the totals, everyone's reaction. Disclose any perk | Real UGC |
| **Creator dinner** | Micro-creator, restaurant table | Copy the structure of the viral dinner video, not its assets: group orders, check arrives, Divit settles it. Paid-partnership label | Creator UGC |

#### AI presenter rules (the partner checks every video)

1. A persistent, readable on-screen label: **"AI-generated presenter"** (top-left, whole video).
2. The presenter states **product facts only**. Never "I use", "I love", "my friends and I", or any personal experience.
3. Real app screen recordings cover **≥50% of the runtime**.
4. The "AI-generated content" toggle is on in TikTok (organic and Ads Manager; re-check after duplicating a campaign). Meta may add its own "AI info" label automatically.
5. Venmo appears in plain text only: no logo, no Venmo colours.
6. Numbers come from the seeded demo bills; caption "Example bill/trip".
7. One hard download CTA: the presenter's last line + the end card for the last 2–3 s.

### Images and videos to create

The partner builds a reusable **asset library** once, then assembles every ad from it. Each asset gets one of three sources, in this order of preference:
- **REAL:** a phone photo or video the owner or partner shoots. Most credible, and needs no AI label.
- **SCREEN:** a capture from the real app, iOS simulator or Android emulator, using the seeded demo bills below.
- **AI:** generated with Nano Banana (images) or Veo/Kling via Google Flow (video clips). Only for backgrounds, b-roll and illustrations, never a person presented as a real customer. Turn TikTok's AI-generated content toggle on for any realistic AI image or clip [E: rules notes].

**Shooting rules for REAL assets.** Use a vertical 9:16 phone camera in natural, slightly imperfect light; native-looking beats polished. Keep restaurant names, card numbers, card-issuer logos and the faces of people who haven't consented out of frame, or blur them. Shoot 4K/60fps where possible, so it can be slowed down or cropped. Keep 2–3 seconds of still "handle" before and after each action.

**Seed these demo bills in the app before capturing screens.** All numbers match the copy in the brief:

| Demo bill | Contents | Used by |
| --- | --- | --- |
| "Salad bill" | 4 people. Wagyu $68, salad $14, pasta, burger, 3 cocktails; subtotal $178, tax 8.875%, tip 20%, total $229.40 | Types 2, 3, 6; V2, V3, V4 |
| "Points dinner" | 6 people, total $412 | Type 1; V1 |
| "Nashville trip" event | 9 people, 14 receipts, total $3,840 | Type 7 |
| "Lake house" Airbnb | $1,200, 4 nights, 4 people, one stays nights 1–2 only | Type 8; V7 |
| "Apartment" recurring | Rent, wifi, Netflix, electric; 3 roommates; monthly | Type 9 |

Use believable first names and initials (Alex, Priya, Jordan, Sam). Don't use real friends' Venmo handles.

#### Asset library (build once, reuse everywhere)

| ID | Asset | Source | How to make it |
| --- | --- | --- | --- |
| A1 | Long real restaurant receipt, flat on a table, top-down | REAL | Ask for an itemized copy at dinner. Shoot on a wood or marble table, top-down, 3 lighting variants. Blur the restaurant name |
| A2 | Hand placing a card on a check presenter | REAL | Plain or covered card (no issuer logo). Photo + a 3 s video |
| A3 | Dinner-table spread, mid-meal, no faces (or consenting friends) | REAL | Plates, drinks, phones on the table; 45° angle. 5–10 photos from different dinners |
| A4 | Group at the table laughing, faces visible | REAL | Only friends who've said yes in writing. Fallback: an AI illustration, not a photoreal AI group |
| A5 | Phone scanning the receipt (over-the-shoulder) | REAL + SCREEN | Film the phone camera pointed at A1, then replace the phone screen with the real scan recording in Remotion (device-frame composite) |
| A6 | App screen recordings: scan → items populate → tap faces → totals → "Request on Venmo" | SCREEN | Simulator screen recording of each demo bill. One continuous take per flow, plus each step as a separate clip. Also export stills of every screen |
| A7 | Itemized Venmo request note close-up | SCREEN | Capture the request screen showing the itemized note (e.g. "Wagyu ($68.00), cocktail (split 2 ways)…"). Use the in-app preview, not the Venmo logo or branding |
| A8 | Share link opening in a mobile browser (no download) | SCREEN | Record opening a share link in Safari or Chrome on a second device or simulator |
| A9 | Event screen with many receipts + settle-up | SCREEN | From the "Nashville trip" event |
| A10 | Airbnb "Split by Night" assign and review screens | SCREEN | From the "Lake house" bill |
| A11 | Recurring bills list + monthly request | SCREEN | From the "Apartment" bill |
| A12 | Device mockups of key screens | SCREEN | Remotion device frame (or shots.so) on brand-colour and blurred-restaurant backgrounds |
| A13 | Messy "napkin math" | REAL | A pen on a real napkin with crossed-out sums; a phone calculator mid-calculation |
| A14 | Group-chat style screens ("what do I owe?", "I'll Venmo you tonight 🙏") | AI/design | Build in Figma or Remotion as an obviously illustrated chat. No real names or photos; caption as a dramatization |
| A15 | Mood backgrounds: dim restaurant bokeh, airport gate, Airbnb living room, apartment kitchen | AI (or stock with commercial licence) | Nano Banana. Prompts below. Used blurred behind text only |
| A16 | Friend-archetype illustrations (5) | AI | Consistent flat-illustration style, clearly not photos. Prompts below |
| A17 | Founder talking-head (3–5 takes per script) | REAL | Owner, phone propped at eye level, window light, kitchen or table setting; lav or AirPods mic |
| A18 | Founder AI twin clips (optional) | AI | HeyGen, trained on A17 footage; on-screen label "AI version of the founder" |
| A19 | Timer overlays, "+1,648 pts" counter, price strike-throughs, circle-highlights | Motion (Remotion) | Template components, reused across ads |
| A20 | CTA end card (9:16 and 4:5) | Design | Divit logo, "Free on iOS & Android", App Store/Play badges per Apple and Google guidelines, one benefit line |

**AI prompt starters** (Nano Banana or Veo; generate 4 variants and keep the most natural):
- A15 restaurant: *"Vertical 9:16 photo, dim cozy restaurant at night, warm bokeh lights, empty table edge in foreground, shallow depth of field, shot on iPhone, no people, no text, no logos."*
- A15 trip: *"Vertical 9:16 photo of a rented lake house living room at golden hour, luggage by the door, casual and lived-in, no people, no text."*
- A16 archetypes: *"Flat vector illustration, bold outlines, pastel palette, a young adult at a dinner table nervously holding a calculator, plain background, consistent character style, no text."* (Repeat per archetype: wallet-forgetter, 3-cocktail evenly-splitter, "I'll Venmo you", the quiet bill-fronter.)
- B-roll (Veo or Kling via Flow, 4–6 s): *"Vertical slow push-in on a long paper receipt sliding across a restaurant table, warm light, shallow focus, realistic, no people, no readable text."* Use real A1 footage instead whenever possible.

**Never generate:** photoreal people as diners or customers, fake app screens (always capture the real app), card-issuer, Venmo, Apple or Splitwise logos, or real restaurant branding.

#### Shot list per slideshow

| Type | Slide-by-slide images |
| --- | --- |
| 1 Points play | 1: A2 (card on check). 2: A1 receipt with the total circled (A19). 3: A1 crop on the total + "+1,648 pts" overlay (A19). 4: A6 still of the scan screen in device frame (A12). 5: A7 itemized request still. 6: A20 end card over A3 |
| 1b Free-flight series | 1: A15 airport gate background + "Day N" big type + running points tally (A19). 2–4: that night's real A1/A3 photos. 5: A6/A7 still. 6: A20 |
| 2 Salad tax | 1: A3 table photo with a salad visible. 2: A1 with wagyu, cocktails and salad lines circled. 3: plain brand-colour slide, big "$57.35" struck through → "$18.04". 4: A6 tap-faces still. 5: A6 totals still. 6: A20 |
| 3 Guess the split | 1: A1 blurred behind big question text. 2: A1 sharp, full receipt. 3: brand slide "$57.35" with a red ✗. 4: A15 restaurant background + text. 5: A6 totals still (salad bill). 6: A20 |
| 4 Friend types | 1: A4 (consenting group) or A15 + title text. 2–6: one A16 illustration per archetype, caption text on top. 7: A6 totals still + A20 |
| 5 Unwritten rules | 1: A3 table photo + title. 2–6: A15 backgrounds (or A3 variants), one rule each in big type; rule 4 uses A7; rule 5 uses A8. 7: A20 |
| 6 Napkin math vs. Divit | 1: A13 napkin + calculator, "14 min" timer overlay. 2: A14 confused group-chat screen. 3: A6 totals still with "38 sec" (real timing). 4: A20 |
| 7 Trip ledger | 1: A15 trip background or real trip photo + headline. 2: REAL pile of receipts or an expenses note. 3: A9 event with many receipts. 4: A9 balances. 5: A8 share link + A20 |
| 8 Airbnb early | 1: REAL or AI (A15) packed bag by a door. 2: A15 lake house + the numbers. 3: brand slide "$300 each". 4: A10 Split by Night review screen. 5: A20 |
| 9 Roommates | 1: A15 apartment kitchen + headline. 2: brand slide with a crossed-out text-message list (rent, wifi, Netflix, electric). 3: A11 recurring list. 4: A11 monthly request. 5: A20 |
| 10 Hot take | 1: bold type on plain brand colour (no photo, so it reads like a statement). 2–3: A3/A1 supporting photos. 4: A6 totals still. 5: A20 |

#### Shot list per video ad

| Ad | Clips to film or generate | Edit notes |
| --- | --- | --- |
| V1 "I got this." | (a) REAL wide shot of the table as the check arrives. (b) A2 card slap, slow motion. (c) REAL reaction from 1–2 consenting friends. (d) A6 requests-sent clip. (e) A17 owner to camera, "You didn't think I was *paying*, right? Points." | Hard smash cut at (d). Big-text captions throughout. Add "+points" counter (A19) on (e). A20 end card. 12–20 s |
| V2 Receipt race | (a) A1 receipt slapping onto the table, top-down. (b) A5 phone scanning. (c) A6 continuous flow. (d) A19 timer overlay | Timer runs on screen the whole time and freezes at the real time; label "2x" if sped up. Make 3 cuts: dinner, trip (A9), roommates (A11) |
| V3 Calculator vs. Divit | (a) REAL left side: hands with a calculator app + napkin (A13). (b) A6 on the right with the same receipt. (c) A19 split-screen frame + timers | Both start on the same frame. The left side ends on "is tip before or after tax?" text |
| V4 Itemized request | (a) A7 slow zoom on the note. (b) A6 reverse-reveal: totals → tap faces → scan | Text "Receipts don't lie." No face needed. 8–12 s |
| V5 Founder story | (a) A17 talking-head takes. (b) A6/A8 cutaways every 3–4 s. (c) Optional A18 twin version | Cut to the screen on every product claim. Label the twin. 20–30 s |
| V6 Green screen | (a) A17 owner against a plain wall. (b) A1/A6/A10 stills as the background | Composite in Remotion (CapCut fine for drafts only) |
| V7 Airbnb skit | (a) REAL friend packing a bag on day 2 (or A15 bag shot, no person). (b) A10 Split by Night flow. (c) A19 share drops from $300 to $171.43 | 10–15 s. If an AI spokesperson is used, add the label |
| V8 AI presenter | (a) Arcads/HeyGen actor, script is product facts only. (b) A6 cutaways covering ≥50% of runtime | Persistent "AI-generated presenter" label on screen. No first-person usage claims |

**Minimum library before the first post:** A1, A2, A3, A6 (salad bill), A7, A12, A19 and A20. That one batch covers Types 1, 2, 3 and 10 and videos V2 and V4. Shoot A1–A3 at one real dinner, and capture A6/A7 in one simulator session [I].

### Where the download CTA goes

Every asset has a call to action (CTA) that tells people to download the app, but how loudly depends on where it runs. Organic posts should feel native, so the hard CTA comes only at the end. Paid ads can push earlier, because the platform adds a clickable button anyway [I]. Organic TikTok and Instagram captions can't hold clickable links, so organic CTAs point to the **link in bio** [E: platform behaviour; verify current rules for TikTok bio links on business accounts].

**One download link everywhere.** Today the app has two separate store links: App Store `apps.apple.com/app/id6760331853` and Google Play `play.google.com/store/apps/details?id=com.singhkapoortech.divit`. Before launch, set up **one smart link**, e.g. `divit-bill.com/get`, that sends iPhones to the App Store, Android phones to Google Play, and desktops to the web app. Tag it per channel (`?src=tiktok`, `?src=ig`, `?src=creator-name`) so downloads can be traced back to the post that drove them. That's one small code task for the owner (a redirect page), done before Phase 1 [I].

#### CTA wording bank

| Strength | Use for | Lines |
| --- | --- | --- |
| Hard | Last slide, end card, paid ads | "Download Divit — free on iOS & Android" · "Get Divit free. Link in bio." · "Snap. Tap. Paid back. Download Divit." |
| Benefit-led | Last slide when the post was about a specific feature | "Try it on your next dinner — Divit is free" · "Make the trip group before you leave. Get Divit." · "Split the Airbnb by night. Download Divit." |
| Soft | Middle slides, captions, comment replies | "(the app is Divit)" · "I use Divit for this" (**owner only**, never an AI person) · "Divit, link in bio" |
| Engagement | Caption add-on, alongside the download CTA, never replacing it | "Tag the friend who owes you" · "Send this to your group chat before the next dinner" |

Keep "free" accurate. Splitting is free, but the free plan caps AI receipt scans per month (2 at the time of writing; check the live cap before posting), and Pro is a paid upgrade. "Free to download" and "free to start" are always true. Plain "free" is fine for splitting claims. Never say "unlimited free scans" [I: matches the current paywall].

#### Placement by format

| Format | Where the CTA appears | What it says |
| --- | --- | --- |
| **Slideshow** (all types) | **Last slide = hard CTA** (A20 end card: Divit logo, App Store + Google Play badges, one benefit line, "Link in bio"). The middle slide where Divit first appears names it softly ("Divit splits it by…"). Slide 1 never has a CTA | Hard + benefit line matching the post |
| **Slideshow caption** | First line repeats the hook. **Last line = CTA**: "Download Divit free — link in bio 📲" + 3–5 hashtags | Hard |
| **Video, organic** | (1) Product name in a text overlay the first time the app is on screen. (2) **Last 2–3 s = A20 end card** + voiceover "Download Divit, link in bio". (3) Pinned comment: "Divit — free on iOS & Android, link in bio" | Soft then hard |
| **Video, paid** (Spark / Meta) | (1) Platform **CTA button set to "Download" / "Install now"**, linking to the smart link (or the store directly in app-install campaigns). (2) Brand or "Download" text overlay **from ~3 s**, once the hook has landed. (3) **End card for the last 2–3 s**. (4) Ad copy: first line hook, second line "Free on iOS & Android" | Hard, repeated |
| **Founder video** (V5) | Owner says it at the end in his own words: "It's free, it's called Divit, link's in my bio." Plus the end card | Hard, spoken |
| **AI presenter** (V8) | End card only, and the presenter says it as a fact: "Divit is free on iOS and Android." Never "I downloaded it" | Hard, factual |
| **Instagram carousel** | Last card = CTA. Also add the smart link to the **Stories link sticker** when the post is shared to Stories | Hard |
| **Profile bio** (both platforms) | "Split any bill from a photo of the receipt 🧾 Free ↓" + the smart link | Always on |
| **Comments** | Reply to "what app is this?" with "Divit! Free on iOS & Android, link in bio". Pin the best one | Soft |
| **Creator posts** (Phase 3) | The creator says the app name on camera and puts "#ad" or a paid-partnership label up front; their bio or Stories carry the tagged link (`?src=creator-name`) | Hard + disclosed |

#### CTA per slideshow type (last slide)

| Type | Last-slide CTA |
| --- | --- |
| 1 Points play | "Front the bill. Keep the points. Get paid back with Divit. Free — link in bio." |
| 1b Free-flight series | "Follow for Day N+1. Divit is how I get paid back — link in bio." |
| 2 Salad tax | "Stop paying the salad tax. Download Divit free." |
| 3 Guess the split | "Divit does this from one photo. Free on iOS & Android." |
| 4 Friend types | "Be the friend with Divit. Free — link in bio." |
| 5 Unwritten rules | "Divit follows rules 2–5 for you. Download free." |
| 6 Napkin math | "38 seconds, not 14 minutes. Get Divit free." |
| 7 Trip ledger | "Make the trip group before you leave. Divit — free, friends join from a link." |
| 8 Airbnb early | "Split the house by night. Download Divit." |
| 9 Roommates | "Set it once. Rent splits itself. Get Divit free." |
| 10 Hot take | "Settle it fairly. Divit — link in bio." (plus "Agree or disagree? 👇" in the caption) |

Video end cards follow the same rule: one line matching the ad's angle, the badges, and "Free on iOS & Android". In V2, the end card is the timer freezing, then "Download Divit" [I].

**CTA rules for the partner:**
- Exactly **one** hard CTA per asset, on the final slide or the final 2–3 seconds; paid videos may also carry an overlay from ~3 s.
- Use the official App Store and Google Play badges unaltered, per Apple's and Google's badge guidelines.
- Never put a Venmo logo next to the CTA.
- Never use urgency the app doesn't have ("only today", "limited spots").

### Checklist before anything is posted (the partner runs it on every asset)

- [ ] No AI person says or implies they're a real user ("I use", "I love", "my friends and I"). Every AI person is conspicuously labelled (FTC Part 465; New York synthetic-performer law). Realistic AI content gets TikTok's AIGC toggle, re-checked after every campaign duplicate.
- [ ] Venmo appears as plain text only. No Venmo or PayPal logo, colours or "partner" wording. The same goes for Apple, Splitwise and card issuers: no logos, no named card products.
- [ ] Every number is from a real bill or captioned "example". Speed claims ("38 seconds") match a real, unedited timing, or the clip is labelled "2x speed".
- [ ] Comparisons to Splitwise are dated and sourced ("Splitwise free: up to 4 expenses/day, Oct 2026") and re-checked on the day of posting.
- [ ] The points angle says "points", carries "Points rates vary by card. Not financial advice." in the caption, and avoids earnings promises in paid versions.
- [ ] Real friends shown on camera have given consent (a text saying "yes, you can use this in an ad" is the minimum).
- [ ] Music comes from TikTok's Commercial Music Library or another licensed source. No trending sounds on the business account.
- [ ] No watermark from another app (CapCut or TikTok) on Instagram posts.
- [ ] There's exactly one hard download CTA (last slide or final 2–3 s), it points to the tagged smart link, and the badges are official and unaltered.
- [ ] The app screens match the current build: same prices, same "Split by Night" screen, no stale UI.

## Open risks and unknowns

The biggest unknown is whether any of this works for a **freemium, invite-driven** app. Every slideshow success story is self-reported, comes from hard-paywall apps, and has unknown survivorship bias. No bill-splitting or fintech slideshow case study exists. Whether Divit lands in Meta's financial ad category, and whether TikTok treats it as financial (licensing, 18+ targeting), is unconfirmed. So is whether showing Venmo screens counts as nominative fair use. Both need either a cautious default (category on, no Venmo visuals) or counsel. Apple's iOS 27 split could erode the single-dinner pitch faster than expected. The New York law's reach over out-of-state advertisers, the exact start date of TikTok's AI-ad disclosure rule, and Meta's June 2026 auto-labelling date all rest on law-firm and vendor blogs. Several tool facts are unverified: whether Blotato posts true photo-mode carousels, whether Photo Mode posts can run as Spark ads inside Smart+, the Sora 2 shutdown, CapCut's current terms, and the $30–60 micro-creator price. Measurement is unresearched. The research did not cover attribution, the iOS app-tracking limits or SKAN, and paid optimization is blind without app events. Store availability and in-app purchases must also be live before paid traffic arrives. Finally, Divit's real trial-to-paid rate for a 14-day annual trial, and its invitee-to-organizer conversion, are unknown. They set the true cost-per-trial ceiling. MiroFish-style simulated audiences remain unvalidated.

## Conclusion

The research changes the question from "slideshows or UGC?" to "which single visual proves the product in two seconds, and how many honest variations of it can one person ship?" For Divit, that visual is the receipt-to-totals reveal. It is underused because every competitor sells the category ("track who owes who") instead of showing the moment. The same fact that makes Divit easy to market with AI also limits it. The product is a real screen doing real math, so the most persuasive and most compliant assets are real photos and real screen recordings, with AI doing the scripting, rendering, variation and posting rather than playing the customer.

The non-obvious implication is that the most important early metric is not CPI or views. It is the save+share rate on dinner-table content, because shares into group chats are both the organic distribution channel and the invitee loop that freemium economics depend on. If those shares turn into organizers who start their own splits, paid amplification can carry a cost per trial above first-year revenue. If they don't, no ad budget will fix the math, and the right move is to keep Divit's growth organic and cheap.
