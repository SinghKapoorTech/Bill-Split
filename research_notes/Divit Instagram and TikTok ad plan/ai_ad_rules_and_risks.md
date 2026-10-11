# AI-Generated Ads on Meta and TikTok: Rules, Disclosure, and Account Risk for Divit (US, as of Oct 2026)

Research date: 2026-10-10. Not legal advice. Many sources are law-firm or vendor blogs, and each is flagged where it applies. Primary platform pages should be re-checked before launch.

## 1. Meta and TikTok rules on AI-generated content in ads (labels, synthetic people, deceptive testimonials)

### Takeaway

Neither platform bans AI-generated ads. Both run label systems: the TikTok ad toggle "This ad contains AI-generated content", and Meta's "AI info" label, which Meta adds automatically for its own gen-AI tools and when it detects C2PA metadata. Both prohibit using a real person's likeness without consent and anything framed as a fake real-customer testimonial. TikTok's ad-level disclosure for realistic AI content is effectively mandatory as of mid-2026. On Meta, mandatory self-disclosure is formally limited to political and social-issue ads, and for commercial ads the label is informational.

### Cited Findings

- **TikTok, ad toggle:** Ads Manager has a "This ad contains AI-generated content" control for creative that is fully AI-generated or significantly AI-modified. When it is on, a persistent disclosure shows at the bottom of the in-feed ad for its full duration. The toggle cannot be turned off after submission unless the asset changes. Duplicating a campaign resets it to unchecked, so it has to be re-enabled on every new or duplicated campaign. — [CineRads, TikTok AI content policy 2026](https://www.cinerads.com/blog/tiktok-ai-content-policy) (vendor blog that cites [TikTok Business Help Center: add disclaimers](https://ads.tiktok.com/help/article/add-disclaimers-to-ads))
- **TikTok, effective date:** Several agency blogs say TikTok updated its advertising policies around July 21, 2026 to require disclosure labels on AI-generated ad content. Another source cites a community guidelines section effective Sept 13, 2025, with an update on Sept 24, 2026. The dates conflict and none were confirmed against a TikTok primary page. — [CommonThread](https://commonthreadco.com/blogs/coachs-corner/tiktok-ai-ad-disclosure-rules-ecommerce-2026); [Stellar Search](https://www.stellarsearch.co.uk/insight/tiktoks-ai-ad-disclosure-rules-are-live-what-brands-running-ai-creative-need-to-do-now); [CineRads, disclosure comparison](https://www.cinerads.com/blog/ai-ad-disclosure-requirements)
- **TikTok, what needs a label:** Realistic people or scenes a viewer could believe are real need the label. That covers photorealistic AI humans, face swaps, AI voices that impersonate real people, and photorealistic synthetic scenes. AI-written scripts or captions, clearly stylized or cartoon visuals, minor edits, and slideshows built from real product photos generally do not. — [CineRads](https://www.cinerads.com/blog/tiktok-ai-content-policy)
- **TikTok, C2PA auto-labelling:** TikTok scans uploads for C2PA Content Credentials and labels content automatically when it finds them. It has done so since May 9, 2024, and launched the creator AIGC label on Sept 19, 2023. — [CineRads](https://www.cinerads.com/blog/tiktok-ai-content-policy); [TikTok Newsroom (cited)](https://newsroom.tiktok.com/en-us/partnering-with-our-industry-to-advance-ai-transparency-and-literacy); [Billo](https://billo.app/blog/ai-labeling/)
- **TikTok, prohibited even with a label:** Synthetic likeness of minors, synthetic likeness of a private adult without permission, fake authoritative sources such as fabricated news broadcasts, and false public-figure endorsements. Purpose-built AI avatars or spokespeople are acceptable, but faking a named "real customer" testimonial is described as deceptive and prohibited. — [CineRads](https://www.cinerads.com/blog/tiktok-ai-content-policy) citing [TikTok Community Guidelines, Integrity and Authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity)
- **TikTok, enforcement ladder:** For unlabelled realistic AIGC the steps reportedly run TikTok-applied label, then removal, then account restrictions or strikes. Prohibited likeness use can mean immediate removal and account action. — [CineRads](https://www.cinerads.com/blog/tiktok-ai-content-policy) (single vendor source)
- **TikTok, enforcement gaps:** A March 2026 piece argues TikTok's AI-label enforcement is failing in practice, though its examples were organic posts. — [AInauten](https://news.ainauten.com/markdown/tiktoks-policy-for-ai-ads-isnt-working)
- **Meta, "AI info" label:** Meta labels ads automatically when its own gen-AI ad tools create or significantly edit an image or video (Background Generation, Image Generation, Add Animation). It also detects third-party gen-AI content through industry signals such as C2PA. The label appears in "About this ad" via the three-dot menu, and some sources say it can sit next to "Sponsored". — [Social Media Today](https://socialmediatoday.com/news/meta-adds-updated-disclosure-tags-for-ai-generated-ads/824658); [Marketing Dive](https://marketingdive.com/news/sociable-meta-adds-updated-disclosure-tags-for-ai-generated-ads/824833); [ContentGrip](https://www.contentgrip.com/meta-ai-ad-labels/)
- **Meta, automated detection:** Automatic AI-info labelling of AI images and video in ads reportedly started June 1, 2026. Routine edits such as resizing or colour correction are not labelled. Self-disclosure of photorealistic AI is mandatory only for social-issue, election, and political ads, where repeated non-disclosure hurts account standing. For other ads the label is informational. — [The Keyword, Meta ad account bans 2026 (Jul 23, 2026)](https://www.thekeyword.co/learn/meta-ad-account-bans-2026); [Browser Media](https://browsermedia.agency/blog/ai-disclosure-in-ads-what-you-need-to-know/) (the June 1, 2026 date is not confirmed against Meta's own docs)
- **Meta and TikTok rules differ:** Neither platform has announced a universal policy of rejecting every unlabelled commercial AI ad. — [TechWyse](https://www.techwyse.com/news/industry-news/google-meta-ai-ad-disclosure-labels)

### Inferences

- For Divit, any photorealistic AI avatar ad on TikTok should have the AIGC toggle on, re-checked on every duplicated campaign. On Meta, voluntary disclosure in the creative (for example "AI-generated actor" on screen) is the conservative choice, partly because NY law separately requires it (see section 2).
- AI-written slideshows built from real app screenshots probably need no platform label. The rules target realistic synthetic depictions, not AI-written text.
- The real danger is not the "AI" part. It is an avatar framed as a real customer giving a first-person testimonial. That conflicts with the TikTok and Meta deceptive-practices rules and with the FTC (section 2).

### Gaps

- I could not fetch Meta's primary Transparency Center and Advertising Standards pages on AI and on "manipulated media" in commercial ads, so I have not seen the exact current wording.
- The exact effective date of TikTok's ad-level AI disclosure requirement is unconfirmed (July 2026 vs earlier). The figures conflict.
- I did not find TikTok's specific rules for its own Symphony digital avatars as used in ads.

## 2. FTC fake-reviews rule, Endorsement Guides, AI avatars as "users", and state law (NY synthetic performer)

### Takeaway

An AI avatar saying "I use Divit and it saved my group trip" is very likely a prohibited fake testimonial under 16 CFR Part 465. The testimonial would come from someone who does not exist and has no experience of the product. It is also deceptive under the Endorsement Guides. Civil penalties reached about $51,744 per violation as of 2024, and the FTC adjusts that figure for inflation each year. New York's synthetic performer law (GBL § 396-b, effective June 9, 2026) separately requires a conspicuous disclosure in any ad with an AI-generated human performer. AI avatars are lawful when framed as spokespeople or actors, labelled, and making only substantiated product claims, never personal-experience claims.

### Cited Findings

- **16 CFR Part 465 (Trade Regulation Rule on Consumer Reviews and Testimonials):** Announced Aug 14, 2024, effective Oct 2024. It prohibits creating, buying, or disseminating reviews or testimonials that misrepresent that the reviewer exists or has actual experience, where the business knew or should have known (§ 465.2(a)). Coverage explicitly reaches AI-generated personas and fictional people. — [Fenwick](https://www.fenwick.com/insights/publications/the-ftc-cracks-down-on-fake-reviews-with-new-rule); [Goodwin](https://www.goodwinlaw.com/en/insights/blogs/2024/08/ftc-publishes-new-rule-banning-fake-reviews-and-testimonials); [Olshan](https://olshanlaw.com/Advertising-Law-Blog/FTC-Publishes-New-Rule-Covering-Fake-Reviews-and-Testimonials)
- **Other prohibitions in the rule:** Incentives conditioned on a particular sentiment (§ 465.4) are banned. Neutral review-for-discount requests are allowed. Undisclosed insider reviews are banned, and so is knowingly buying or selling fake followers or views for commercial purposes. — [Consumer Finance Monitor](https://www.consumerfinancemonitor.com/2024/08/20/ftc-issues-final-rule-to-fight-fake-product-reviews/); [etcentric](https://www.etcentric.org/ftc-rule-prohibiting-fake-and-paid-reviews-goes-into-effect/)
- **Penalties:** Up to $51,744 per violation (2024 figure) for knowing violations. The FTC can seek civil penalties in court and consumer redress. — [etcentric](https://www.etcentric.org/ftc-rule-prohibiting-fake-and-paid-reviews-goes-into-effect/); [Fenwick](https://www.fenwick.com/insights/publications/the-ftc-cracks-down-on-fake-reviews-with-new-rule) (the current inflation-adjusted figure was not verified)
- **Endorsement Guides (16 CFR Part 255, revised mid-2023):** The definition of "endorser" now covers virtual influencers, fabricated endorsers, and non-existent entities. Virtual influencers are not deceptive in themselves. Endorsements must reflect honest opinions or experience, though, and an endorser cannot claim to have used a product they have not used. Commentators conclude an AI persona cannot have personal experience, so framing it as having tried or loved a product is deceptive on its face. Material connections must be disclosed, claims must be substantiated, and everyone in the marketing chain shares responsibility. — [InfoLawGroup (Aug 2023)](https://www.infolawgroup.com/insights/2023/8/11/virtual-influencers-are-now-officially-regulated-endorsersunless-theyre-spokespersons); [BakerHostetler](https://www.bakerlaw.com/insights/updated-ftc-endorsement-guides-hold-virtual-influencers-to-actual-standards/); [Revision Legal](https://revisionlegal.com/internet-law/virtual-influencer-ftc-compliance-guide/)
- **Spokesperson vs endorser:** InfoLawGroup's headline ("regulated endorsers... unless they're spokespersons") points to the distinction. An avatar presented as the brand's spokesperson delivering brand claims is treated differently from one posing as an independent user. — [InfoLawGroup](https://www.infolawgroup.com/insights/2023/8/11/virtual-influencers-are-now-officially-regulated-endorsersunless-theyre-spokespersons)
- **NY GBL § 396-b (synthetic performers):** Signed Dec 11, 2025 (S.8420-A/A.8887-B), effective June 9, 2026. A "synthetic performer" is a digitally created asset, made with gen AI or software, that is intended to look like a human performance and is not recognizable as any identifiable real performer. An advertiser with actual knowledge that one appears in an ad must conspicuously disclose it. Penalties are $1,000 for a first violation and $5,000 for each later one. Exemptions cover audio-only ads, AI used solely for translation, expressive-work ads, and media publishers (platforms are not liable). "Conspicuous" is undefined. — [Cooley (Jan 29, 2026)](https://www.cooley.com/news/insight/2026/2026-01-29-new-york-enacts-synthetic-performer-disclosure-law-for-advertisements-including-those-using-generative-ai); [Hunton](https://www.hunton.com/privacy-and-information-security-law/new-york-enacts-law-regulating-the-use-of-ai-generated-synthetic-performers-in-advertising); [Reed Smith](https://www.reedsmith.com/our-insights/blogs/viewpoints/102n129/fake-performer-real-penalty-what-advertisers-need-to-know-before-june-9/); [Skadden](https://www.skadden.com/insights/publications/2026/01/two-newly-enacted-new-york-laws-will-regulate)
- **Open questions in the NY law:** It is unclear whether background extras or partial performers (such as a hand) are covered. — [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/ny-synthetic-performer-law-goes-into-effect)

### Inferences

- Script rule for Divit: an avatar may say "Divit scans your receipt and builds the Venmo requests for you" (a product demo or spokesperson claim). It must not say "I've used Divit for every dinner this year" or "this saved my friendship", and must not be captioned like a customer review.
- AI voice-over alone in an audio-only ad is exempt from the NY law, but a video with an AI human on screen is not. Ads on Meta and TikTok cannot practically be geo-excluded from NY at the creative level, so a conspicuous on-screen "AI-generated performer" disclosure on every avatar ad is the cheapest compliance path.
- Claims about money (for example "never chase friends for money again", or savings figures) need substantiation whether a human or an AI says them.

### Gaps

- Whether NY § 396-b reaches out-of-state advertisers whose ads are shown in NY is not addressed in the sources reviewed. This needs counsel.
- I found no FTC enforcement action yet under Part 465 specifically about AI avatar video testimonials. The analysis relies on the rule text and law-firm commentary.
- Other state AI-ad disclosure laws (CA, etc.) were not researched within this budget.
- The current inflation-adjusted Part 465 penalty amount was not verified on ftc.gov.

## 3. Ad category issues for a finance-adjacent app, and using the "Venmo" name and logo

### Takeaway

Meta's Financial Products and Services special ad category has been mandatory for US financial campaigns since Jan 14, 2025, and third-party summaries say it includes "payment services". An app built around Venmo payment requests may get classified into it. That brings restricted targeting (no age, gender, or ZIP targeting, no lookalikes) and rejection if the category is not declared. TikTok's US financial-services policy lists funds exchange or management, loans, and crypto, but does not explicitly name P2P or payment-request tools. If TikTok treats Divit as financial, it requires licensing and 18+ targeting. Using the Venmo logo in marketing requires PayPal/Venmo's prior written approval. Plain-text factual mentions are lower risk but still carry trademark-confusion risk.

### Cited Findings

- **Meta, category is mandatory:** Since Jan 14, 2025, US-based advertisers, or those reaching US audiences, must use the FINANCIAL_PRODUCTS_SERVICES special ad category for financial products and services campaigns, or ads may be rejected. It replaced the CREDIT category, and the two cannot be combined. The docs were last updated May 21, 2026. — [Meta Marketing API: Special Ad Categories](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category)
- **Meta, scope:** Everything in the old Credit category plus insurance, bank accounts, investment services, and payment services. — [Elevar](https://getelevar.com/news/meta-financial-products-services-ads-category/); [Data Axle](https://www.data-axle.com/resources/blog/meta-special-ad-categories-rules/)
- **Meta, targeting limits:** Restricted options include age, gender, ZIP or postal code, exclusion targeting, lookalike audiences, and saved audiences. — [Data Axle](https://www.data-axle.com/resources/blog/meta-special-ad-categories-rules/); [Zag Interactive](https://www.zaginteractive.com/insights/january-2025/2025-changes-for-meta-ads)
- **TikTok, US financial services (page last updated Sept 2026):** Allowed categories include crypto, "the exchange, management, or investment of funds, such as fiat or virtual", loans, NFTs, and virtual currencies. Requirements are licensing by local or regional authorities, disclosures (with possible requests for regulator accreditation evidence), and 18+ targeting. The prohibited list includes payday loans, credit repair, get-rich-quick schemes, and unaccredited digital banks. Payments, P2P, and fintech apps are not explicitly addressed. — [TikTok Ads Policy: Financial Services](https://ads.tiktok.com/help/article/tiktok-ads-policy-financial-services)
- **TikTok, branded content:** A third-party summary says financial products may require prior written authorization from TikTok for branded content. — [ConductAtlas summary of TikTok Branded Content Policy](https://conductatlas.com/platform/tiktok-ads/tiktok-branded-content-policy/restricted-content-pre-authorization-requirement/)
- **Venmo brand kit:** Do not alter the wordmark. Never place the logo inline in text, and use plain text when mentioning Venmo in a sentence. The V monogram is reserved for Venmo's social identity. — [Venmo brand page](https://venmo.com/about/brand)
- **Venmo merchant guidelines (2022):** The Venmo button and acceptance mark are for checkout flows, not marketing. The logo may appear in marketing only with Venmo's prior review and written approval each time, and permission is revocable. — [Venmo Merchant Integration Guidelines (Braintree PDF, 01/2022)](https://developer.paypal.com/braintree/files/venmo-merchant-integration-guidelines_011922.pdf)
- **Venmo user agreement:** Venmo trademarks may not be copied, imitated, modified, or used without prior written consent. — [ConductAtlas (tracker, unofficial)](https://conductatlas.com/platform/venmo/venmo-user-agreement/provision/CA-P-024499/venmo-trademarks-may-not-be-copied-or-modified/)
- **PayPal enforces the mark:** PayPal pursued the lending app "Lenmo" in 2019 over likely confusion with VENMO, for which it holds six federal registrations. — [Heitner Legal](https://heitnerlegal.com/2019/07/09/venmo-is-not-cool-with-the-idea-of-being-able-to-lenmo-money/)

### Inferences

- Divit does not hold or move money. It generates Venmo request deep links. It is still plausible that Meta's classifier or reviewers treat "split bills / get paid back via Venmo" as payment services. Running ads in the Financial Products and Services category from the start avoids rejections and the account-strike risk of misclassification, at the cost of demographic targeting. A cautious founder could test one non-category campaign that leads with "AI receipt scanner / split the check", but rejections count against account health.
- Ad copy should use "Venmo" only as plain-text factual compatibility ("sends Venmo requests"), with no Venmo logo, colours, or "V", and no wording implying partnership or endorsement. Showing the real Venmo app screen in a demo is a grey zone and needs counsel or PayPal approval.
- On TikTok, Divit probably falls outside the licensed financial categories. If a reviewer flags it as financial, though, 18+ targeting and possible licensing questions follow. Targeting 18+ anyway is a cheap hedge.

### Gaps

- I could not fetch Meta's own Business Help Center definition of "payment services" for the category, or Meta's financial-advertiser verification requirements (the Jon Loomer page returned 403). It is unconfirmed whether a P2P request generator qualifies.
- No primary source was found on nominative fair use of "Venmo" in competitor or complementary-app ads. Needs counsel.

## 4. Music and sound rules for ads and business-account organic posts

### Takeaway

On TikTok, business accounts may only use the Commercial Music Library (CML) for both organic and paid content. The general library is not cleared for brands. On Meta, use the Meta Sound Collection or licensed or AI-generated royalty-free audio. Trending copyrighted songs are not cleared for brand use.

### Cited Findings

- **TikTok CML access:** Free for any TikTok Business Account. General Music Library songs are not pre-cleared for commercial content, defined as any content posted by a brand or business. Using the general library through a personal account to promote a business risks copyright infringement. — [TikTok Business blog: Audio Library](https://ads.tiktok.com/business/zh/blog/audio-library-royalty-free-music); [Social Media Today](https://www.socialmediatoday.com/news/tiktok-changes-rules-on-music-usage-by-businesses/577734/); [Soundstripe](https://www.soundstripe.com/blogs/why-can-i-only-use-commercial-sounds-on-tiktok)
- **TikTok CML scope:** CML tracks are pre-cleared for both organic and paid TikTok content. Catalog size figures conflict: 600k+ per TikTok, 1M to 1.5M per third parties. Clearance is TikTok-specific and should not be assumed to cover other platforms. Brands can license tracks outside the CML themselves. — [House of Marketers](https://houseofmarketers.com/tiktoks-royalty-free-music-library-for-ad-content-600k-songs/); [Sonilo](https://sonilo.com/ai-music/royalty-free-music-for-tiktok); [Stack Influence](https://stackinfluence.com/blog/find-royalty-free-commercial-music-for-tiktok)

### Inferences

- Do not reuse a TikTok CML track in Instagram or Facebook ads exported from the same edit unless its licence covers that use. Rights-cleared stock music or AI-generated music with a commercial licence, used across both platforms, is simpler.
- Running Divit's organic accounts as personal or creator accounts to get trending sounds would itself be a copyright and policy risk for brand content.

### Gaps

- I did not find a primary source for Meta's rules on business accounts using licensed music in Reels or ads (Meta Sound Collection vs restricted music for business profiles) within the tool budget.
- AI-music tool licences (Suno, Udio, etc.) for commercial ad use were not researched.

## 5. Account safety: Meta ad-account bans 2025-2026, Marketing API, AI agents running ads, TikTok new accounts

### Takeaway

Reports of a 2026 wave of Meta ad-account disables are widespread but mostly vendor-sourced, and there is no official Meta statement of a "ban wave". The best-documented risk factors are unvetted personal tokens pasted into AI tools, scripted write calls that exceed Meta's rate limits (new limits from May 5, 2026), retry loops, payment anomalies, and missing 2FA. A Claude-Code-driven Marketing API setup is feasible through a properly reviewed Meta app with a system-user token, but write access should stay human-approved and rate-limited. Meta disables can become permanent after 6 months without reinstatement.

### Cited Findings

- **Meta restriction tiers and triggers:** Tiers run daily spend limits, then loss of payment features, then loss of some ad features, then loss of all advertising. Stated triggers include "unusual or high-risk activity", compromised assets, failing 2FA requirements, and unusual payments or high failed or disputed payment rates. A policy disablement still ineligible for reinstatement after 6 months means permanent loss and forfeiture of prepaid funds where lawful. Appeals go through Meta Business Support Home, and only admins can request review. — [The Keyword (Jul 23, 2026), summarizing Meta docs](https://www.thekeyword.co/learn/meta-ad-account-bans-2026)
- **New Meta rate limits (May 5, 2026):** Maximum of 4 ad-set budget changes per hour and 10 spending-limit changes per day. Writes cost 3 rate-limit points and reads 1. — [The Keyword](https://www.thekeyword.co/learn/meta-ad-account-bans-2026)
- **Reported disables after connecting AI tools:** Advertisers report disables days after connecting third-party AI tools, including high-spend long-running accounts. Vendors attribute these to unsupervised write access, no pacing, and immediate retries, and to tools that have users paste developer-dashboard tokens, bypassing app review. A cap of 100 mutations per second per app per ad account is also cited. — [Porter Metrics](https://portermetrics.com/en/tutorial/meta-ads-ban/); [GoMarble](https://www.gomarble.ai/blog/will-connecting-ai-tools-to-meta-ads-get-you-banned-in-2026); [Blend AI](https://blend-ai.com/mcp/learn/will-mcp-suspend-meta-ads-account) (all vendors with a commercial interest, and the causal claims are unverified)
- **Even veterans get caught:** Meta-ads educator Jon Loomer wrote on June 24, 2026 about being caught by "Meta's broken system" after 15 years. — [Jon Loomer pubcast](https://pubcast.jonloomer.com/15-years-in-metas-broken-system-finally-came-for-me/)
- **Meta moving review to AI:** A July 2026 report says Meta is shifting most content and ad review to automated AI moderation by 2027. — via search summary, [The Keyword](https://www.thekeyword.co/learn/meta-ad-account-bans-2026) / [Shopifreaks](https://www.shopifreaks.com/meta-denies-knowingly-running-ads-promoting-child-sexual-abuse-on-instagram-after-a-bbc-investigation-found-them-in-india/) (secondary)
- **Marketing API access:** "Ads Management Standard Access" was renamed "Marketing API Access Tier", effective May 4, 2026, with existing access preserved. — [Meta for Developers blog](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- **System users:** System-user tokens need the app to have standard access or a Meta allow-listing, plus App Review and business verification where applicable. System-user tokens do not expire, while long-lived user tokens last about 60 days. Standard tier reportedly allows 1 system user plus 1 admin system user (secondary). — [Meta: System Users overview](https://developers.facebook.com/docs/business-management-apis/system-users/overview); [Stitchflow](https://www.stitchflow.com/user-management/meta-ads/api)
- **AI ad labelling is not a ban:** An AI-labelled ad is not a banned ad. — [Porter Metrics](https://portermetrics.com/en/tutorial/meta-ads-ban/); [The Keyword](https://www.thekeyword.co/learn/meta-ad-account-bans-2026)

### Inferences

- Safe setup for Divit: verified Meta Business Manager, 2FA on every admin, a second human admin as backup, and a stable card with no failed payments. Start manually in Ads Manager at small daily budgets before any automation. The ad account should be at least a few weeks old with clean spend before a tool touches it.
- If Claude Code drives the Marketing API, use the founder's own Meta app with a system-user token from his own Business Manager, not a pasted personal token or an unknown third-party MCP. Keep it read-only by default and have every write (create, edit budget) proposed and approved by the founder. Build in hard client-side caps well under the 4-per-hour budget-edit and 10-per-day spend-limit limits, with exponential backoff and no retry on policy errors.
- Never auto-resubmit rejected ads. Repeated rejections, especially in the financial category or for deceptive AI testimonials, are the most likely path to account restriction.

### Gaps

- No official Meta statement confirming or explaining a 2025-2026 "ban wave" was found. All causal analysis is vendor-sourced.
- I found no primary source on TikTok Ads Manager restrictions for new accounts (spend thresholds, review of first ads, business verification) within the tool budget.
- Meta's exact "safe" initial spend levels are undocumented, and only anecdotal guidance exists.
- I did not verify whether Meta has launched an official first-party ads MCP or agent API in 2026.

## 6. High-volume organic posting (5-7 slideshows/day), unoriginal content, duplicates, and multiple accounts

### Takeaway

High volume is not prohibited on either platform. Both demote unoriginal or reposted content from recommendations: Instagram extended this to photos and carousels on Apr 30, 2026, and TikTok makes such content FYF-ineligible. Original AI slideshows made for Divit are "original". Re-uploading the same assets across several accounts, or reposting others' content, risks recommendation ineligibility, and coordinated multi-account behaviour risks spam or fake-engagement enforcement.

### Cited Findings

- **Instagram originality policy (Apr 30, 2026):** Accounts that mostly repost others' photos and carousels become ineligible for recommendations to non-followers, extending the earlier Reels policy. Mosseri said "If most of what you post to Instagram is someone else's content, your account is no longer going to be recommendable." Adding your own commentary, collabs, or credited native reposts is acceptable. — [Tubefilter (Apr 30, 2026)](https://tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator); [PetaPixel (Apr 30, 2026)](https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/)
- **Unconfirmed thresholds:** A rolling 30-day window, a "10 reposts in 30 days" trigger, and "one-third" ratios appear in marketing blogs without official confirmation. — [Planoly](https://planoly.com/blog/instagram-updates-its-original-content-policy); [Sociallyin](https://sociallyin.com/blog/instagram-algorithm-update-repost/)
- **TikTok unoriginal content:** Unoriginal and low-quality content is pushed away from the For You feed, and content re-uploaded from other platforms can be detected and made FYF-ineligible but stays searchable. — [Online Optimism](https://onlineoptimism.com/blog/updates-tiktoks-community-guidelines); [TSPA reproduction of TikTok guidelines](https://www.tspa.org/tiktok.com/)
- **TikTok fake engagement:** Guidelines prohibit manipulating the platform, including services that artificially boost engagement or trick the recommendation system. — [ToS Tracker](https://tostracker.app/document/tiktok-community)
- **TikTok repeat FYF violations:** Accounts that repeatedly post FYF-ineligible content may become temporarily ineligible for recommendation. The first violation is a warning strike. — [Communicate Online](https://communicateonline.me/news/tiktok-introduces-new-measures-for-safer-content-creation-and-sharing/)
- **FTC on fake followers and views:** Knowingly buying fake followers or views for commercial purposes is prohibited by 16 CFR Part 465. — [Goodwin](https://www.goodwinlaw.com/en/insights/blogs/2024/08/ftc-publishes-new-rule-banning-fake-reviews-and-testimonials)

### Inferences

- 5-7 original slideshows a day on one TikTok and one IG account is within norms. The risk is low quality and near-duplicate templating, which may be read as low-quality or unoriginal, more than raw volume. Vary hooks, images, and structure, and avoid watermarked cross-posts (TikTok-watermarked videos on IG, and the reverse).
- A "farm" of several accounts posting the same slideshows is the pattern most likely to trip unoriginal-content and spam systems. Buying engagement to seed it is also an FTC issue.
- AI slideshows using photorealistic AI people may need TikTok's AIGC label even organically. Text-on-screenshot slideshows do not.

### Gaps

- I found no primary TikTok or Meta source with explicit numeric posting-frequency limits, or official multiple-account rules for brands, within the tool budget.
- Whether TikTok auto-detects and down-ranks AI-templated slideshow formats specifically is unconfirmed.
