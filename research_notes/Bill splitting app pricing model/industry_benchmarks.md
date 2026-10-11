# Industry Benchmarks: Mobile App Monetization Models (2025–2026), Applied to a Small Utility/Finance App (Divit)

Context: Divit is a bill-splitting app with AI receipt scanning. Current plan: free tier with 2 AI scans/month and 2 active groups, Pro at $4.99/mo or $34.99/yr, via RevenueCat.

Source labels used below:

- **RC SOSA 2026**: RevenueCat State of Subscription Apps 2026. 115,000+ apps, $16B+ revenue, 1B+ transactions. Mostly mobile and B2C.
- **RC SOSA 2025**: RevenueCat State of Subscription Apps 2025. 75,000+ apps, $10B+ revenue.
- **Adapty 2026**: Adapty State of In-App Subscriptions 2026. About 16,000 apps, about $3B revenue. Mostly 2025 activity.
- **Adapty 2025**: Adapty State of In-App Subscriptions 2025. 11,000+ apps, $1.9B revenue. App Store data from 2024–2025. Reports **averages**, not medians.
- Several RC SOSA 2026 figures come from RevenueCat's own blog and from SaaStr's summary. I did not read the full PDF (338 pages).

## 1. Hard paywall vs freemium: conversion, revenue per install, retention

### Takeaway

Across all categories, hard paywalls convert about 5x better than freemium (median 10.7% vs 2.1%). They earn about 8x more revenue per install by Day 60 ($3.09 vs $0.38). One-year retention of annual subscribers is about the same (27% vs 28%). The hard-paywall advantage shrank between 2025 and 2026, while freemium stayed flat.

### Cited Findings

- RC SOSA 2026: median Day-35 conversion was 10.7% with a hard paywall vs 2.1% with freemium, about 5x. In 2025 the hard-paywall figure was 12.1%; freemium was 2.1% in both years. — [RevenueCat blog, SOSA 2026 benchmarks](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
  - Note: RevenueCat calls this metric "trial-to-paid" in the text but labels the chart "download-to-paid." SaaStr reports it as download-to-paid. It is most likely install-to-paid.
- RC SOSA 2026: the top 10% of hard-paywall apps reach 38.7% download-to-paid. — [SaaStr summary of SOSA 2026](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- RC SOSA 2026: revenue per install was $2.32 (hard) vs $0.27 (freemium) at Day 14, and $3.09 vs $0.38 at Day 60, about 8x. The source doesn't say whether these are medians or means. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/); [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- RC SOSA 2026: one-year retention of yearly subscribers was 27% (hard paywall) vs 28% (freemium). RevenueCat calls the difference "statistically negligible." — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- RC SOSA 2026: in North America, Day-60 revenue per install is $0.55 and download-to-paid is 2.8%. In IN/SEA the figures are $0.11 and 0.7%. These are all-model blended figures. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- RC SOSA 2025: overall median revenue per install after 60 days was $0.31. — [RevenueCat SOSA 2025 launch post](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md)
- Adapty 2025: "In most categories, direct paywalls lead to higher conversion than trials." The report doesn't break out freemium separately. — [Adapty 2025 in 10 minutes](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- A Superwall vendor case study says a VPN app moved from a freemium paywall with a rewarded ad to a hard paywall. Conversion went from 0.08% to 1.2% and revenue rose 158%. This is a single self-reported anecdote. — [Superwall, existing apps](https://superwall.com/solutions/by-stage/existing-apps)
- Freemium still makes sense when free users drive word of mouth or network effects. This is commentary on the report, not a measured figure. — [Admiral Media](https://admiral.media/app-paywall-optimization/)

### Inferences

- Divit is inherently viral: every bill pulls in non-paying participants through share links. That is the network-effect case where commentators say freemium still pays off, even though the headline numbers favor hard paywalls. A hard paywall would also block the invited friends who drive installs.
- At the freemium median of 2.1% and roughly $0.38 revenue per install by Day 60, 10,000 installs would bring in about $3,800 in 60 days. North America runs higher. This is a rough planning anchor only, because the figure blends all categories.
- The hard-paywall Day-60 revenue per install is likely not achievable for Divit. Usage is infrequent and social, and most installs come from invited participants, not intent-driven search.

### Gaps

- I found no hard-paywall vs freemium split for Utilities, Finance, or Productivity specifically.
- Install-to-trial rates by paywall type were not published in the accessible summaries.

## 2. Free trial length effects (3/7/14/30 days)

### Takeaway

Longer trials convert and renew materially better. Trials of 17–32 days have a median trial-to-paid of 42.5%, vs 25.5% for trials of 4 days or less. Trial users also renew much better than no-trial buyers on monthly plans. Even so, the share of short trials is growing.

### Cited Findings

- RC SOSA 2026: median trial-to-paid was 42.5% for 17–32 day trials and 25.5% for trials of 4 days or less. The share of trials that are 4 days or less rose from 42.1% to 46.5%. — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- RC SOSA 2025: 17–32 day trials had the highest median conversion, 45.7%. This comes from a secondary summary. — [SaaStr trial-length article](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days)
- RevenueCat trial-length study, trial starts August 2025–July 2026. Trial-to-paid by trial length:

  | Plan    | ≤4 days | 5–9 days | 10–16 days | 17–32 days |
  | ------- | ------- | -------- | ---------- | ---------- |
  | Monthly | 39.6%   | 45.9%    | 46.6%      | 43.7%      |
  | Annual  | 24%     | 33%      | 43%        | 44.6%      |
  | Weekly  | 22.3%   | 24.3%    | –          | –          |

  — [RevenueCat, free trial length](https://www.revenuecat.com/blog/growth/free-trial-length.md)

- Same study, first renewal among payers:

  | Plan    | No trial | ≤4 days | 5–9 days | 10–16 days | 17–32 days |
  | ------- | -------- | ------- | -------- | ---------- | ---------- |
  | Monthly | 49.5%    | 54.2%   | 62.8%    | 72.0%      | 77.5%      |
  | Annual  | 26.6%    | 18.3%   | 25.3%    | 36.4%      | 47.5%      |

  — [RevenueCat, free trial length](https://www.revenuecat.com/blog/growth/free-trial-length.md)

- Same study, AI apps on monthly plans: conversion peaks at 10–16 days (38.5%) and drops at 17–32 days (31.8%). On annual plans, AI-app conversion is 23.3% at 5–9 days and 33.8% at 10–16 days. — [RevenueCat, free trial length](https://www.revenuecat.com/blog/growth/free-trial-length.md)
- RC SOSA 2026: 55.4% of cancellations of 3-day trials happen on Day 0, and 84% by Day 1. For other lengths, the Day-0 share is 39.8% (7-day), 35.7% (14-day), and 31% (30-day). About 50% of paid conversions happen on Day 0. — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026); [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- Adapty 2026: install-to-trial is 13.8% and trial-to-paid is 26.2%. The page labels these both as Utilities weekly and as the global benchmark, so the attribution is ambiguous. About 90% of trial starts happen on Day 0. — [Adapty, Utilities benchmarks](https://adapty.io/blog/utilities-app-subscription-benchmarks/)
- Adapty 2025: install-to-trial is "below 12% in most cases." Trial users have up to 64% higher LTV. For weekly plans, a trial raises Day-30 retention from 23% to 42%. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- Adapty 2026: trial users retain 1.4–1.7x better than direct buyers. — [Adapty Utilities benchmarks](https://adapty.io/blog/utilities-app-subscription-benchmarks/)
- Benchmark sources disagree on the overall median trial-to-paid rate: Adapty cites about 25.6%, and another table cites 34.8%. — [Airbridge](https://www.airbridge.io/en/blog/why-subscription-app-get-installs-no-paid-subscribers) (secondary)

### Inferences

- A bill-splitter is used episodically, perhaps one dinner or trip every few weeks. A 3-day or 7-day trial will often expire before the user has a second bill to split, so it would not show the value of Pro. The data favors 10–16 days or longer, especially for annual plans.
- Divit's plan is freemium with no trial. For an annual plan with no trial, first renewal is 26.6%. With a 17–32 day trial it is 47.5%, which suggests adding an optional trial on the annual plan.

### Gaps

- I found no trial-length data split by Finance or Utilities category.
- I found no data on trials specifically in low-frequency-use apps. The inference above rests on general renewal data plus Divit's usage pattern.

## 3. Category benchmarks and prices (Utilities, Finance, Productivity)

### Takeaway

The cross-category median annual price was $34.80 in 2026, so Divit's $34.99/yr sits right at it. Utilities is dominated by weekly plans (74% of revenue) and has strong trial LTV. I found no finance-specific benchmarks.

### Cited Findings

- RC SOSA 2026: median annual price was $34.80, up from $31.60. Typical price bands are $4.99–$6.99 weekly, $7.99–$9.99 monthly, and $29.99–$39.99 annual. North America's annual price is $39.99 and IN/SEA's is $18.32. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- RC SOSA 2026: realized LTV per payer after Year 1 is $62.19 for high-priced apps vs $10.69 for low-priced apps. Monthly-level LTV is $35.89 vs $6.67. Download-to-trial is 8.9% for high-priced apps vs 4.4% for low-priced apps. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- Adapty 2026 global medians, all categories: $7.48 weekly, $12.99 monthly, $38.42 annual. — [Adapty Utilities benchmarks](https://adapty.io/blog/utilities-app-subscription-benchmarks/)
- Adapty 2025 averages: US $15.2 monthly and $44.6 annual; Europe $13.3 monthly and $42 annual. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- Adapty 2026, Utilities:
  - Weekly share of revenue was 74% in 2025, up from 49% in 2023.
  - Trial adoption was 84.7%, up from 78.0%.
  - First-renewal retention is 58.1% (global 59.2%).
  - One-year retention on annual plans is 22.1%.
  - Average 12-month LTV is $46.30 across all plans and $68.90 for trial subscribers.
  - Median 12-month LTV per install is $1.09.
  - Discount usage is 1.2%.
  - European Utilities annual prices rose 70.5% over two years.

  — [Adapty Utilities benchmarks](https://adapty.io/blog/utilities-app-subscription-benchmarks/)

- Adapty 2025: weekly plans earn more than 50% of revenue in Productivity, Utilities, and Photo & Video. 12-month LTV on weekly plans is $58.4 for Utilities and $53.2 for Productivity. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- RC SOSA 2026: median time to $1K MRR is 113 days for business apps. Within two years of launch, 17.3% of new apps reach $1K MRR and 4.6% reach $10K MRR. Apps launched in 2025 or later earn 3% of subscription revenue. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)

### Inferences

- Divit's $4.99/mo is well below the RC monthly band ($7.99–$9.99) and the Adapty median ($12.99). Its $34.99/yr is at the median.
- The annual plan works out to $2.92/mo, a 42% discount vs monthly. That is a steep gap, and it will push most buyers to annual.
- RC data says higher-priced apps earn about 6x LTV per payer, so there is room to test a higher monthly price.
- Weekly plans dominate Utilities, but that pattern comes from "scanner/cleaner" style apps. It is a poor fit for a social, trust-dependent finance app.

### Gaps

- I found no Finance-category medians for price, conversion, or retention in the accessible 2025–2026 summaries. They may be in the full RC PDF.
- Productivity-specific absolute prices were not found.
- The overall annual vs monthly subscriber mix was not found. Only Adapty's weekly revenue share is available.

## 4. Retention, cancellations, refunds

### Takeaway

Most annual subscribers churn within a year, and much of that churn happens in Month 1. Refunds are low single digits. Billing failures cause a large share of Android cancellations.

### Cited Findings

- RC SOSA 2026: about 72% of annual subscribers cancel in Year 1, up from about 56% in 2025. Month 1 accounts for 35% of annual cancellations. Mid-year monthly cancellations run 3–10%, with a spike in Month 12. — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- RC SOSA 2025: "Nearly 30% of annual subscriptions are canceled in the first month." Cheap annual plans keep up to 36% of users after a year, while high-priced monthly plans keep 6.7%. — [RC SOSA 2025 launch](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md)
- RC SOSA 2026: involuntary (billing) cancellations are 31% of cancellations on Google Play and 14% on the App Store. — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- Adapty 2025 refund rates (averages): 4.2% on annual plans, the highest, and 2.6% on weekly plans. By region, refunds are above 3% in the US and LATAM and about 2.3% in Europe and MEA. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- Adapty 2025 retention (averages):
  - Weekly: 65% cancel within 30 days, and about 5% remain at 1 year.
  - Monthly: 43% are retained at Day 90 and 17% at 1 year.

  — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)

### Inferences

- If Divit uses Capacitor on Android, it should enable Google Play grace periods and account hold through RevenueCat, given the 31% involuntary churn share.
- Divit's $34.99 annual plan is in the "cheap annual" bracket that RC 2025 associates with the best one-year retention (up to 36%).

### Gaps

- Refund rates by category were not found.

## 5. Hybrid monetization, consumables/credits, lifetime, and AI apps

### Takeaway

About 35% of apps now mix subscriptions with consumables or lifetime purchases, and one-time and lifetime purchases are a growing share of revenue. AI apps earn more per payer but churn faster. I found no published figure that isolates the revenue uplift from adding credit packs to a subscription.

### Cited Findings

- RC SOSA 2025: "35% of apps now mix subscriptions with consumables or lifetime purchases." Adoption is 61.7% in Gaming and 39.4% in Social & Lifestyle. — [RC SOSA 2025 launch](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md)
- Adapty 2026: one-time and lifetime purchases were 10.3% of market-wide revenue in 2025, up from 6.4% in 2023. — [Adapty Utilities benchmarks](https://adapty.io/blog/utilities-app-subscription-benchmarks/)
- Adapty 2025: one-time purchases rose 6%, while long-term plans, including lifetime, "lost ground." This partly conflicts with the Adapty 2026 figure above, which may reflect differing definitions. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)
- RC SOSA 2026, AI apps:
  - Median Year-1 realized LTV is $30.16 vs $21.37 for non-AI apps, a 41% premium.
  - AI monthly plans have 36% worse 12-month retention. Coverage elsewhere says AI apps churn "30% faster."

  — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026); [ppc.land](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)

- RC SOSA 2025: AI apps' median Day-60 revenue per install was above $0.63, vs a $0.31 overall median. AI apps "don't convert any better" but earn more per subscriber. — [RC SOSA 2025 launch](https://www.revenuecat.com/blog/company/the-state-of-subscription-apps-2025-launch.md)
- RevenueCat (Thomas Petit, Feb 2026) gives the rationale for hybrid models qualitatively but publishes no adoption or uplift numbers. The idea is that a subscription anchors access while heavy usage is capped, metered, or sold separately. — [RevenueCat, AI hybrid monetization](https://www.revenuecat.com/blog/growth/ai-hybrid-monetization)
- RevenueCat now supports virtual currency natively. Developers can sell credit packs and grant credits as part of subscriptions on iOS, Android, and web. — [RevenueCat virtual currency announcement](https://www.revenuecat.com/blog/company/revenuecat-virtual-currency)

### Inferences

- Divit's AI scanning has a marginal Gemini cost per scan, which suits a hybrid model. Pro could include a generous scan allowance, and both free and Pro users could buy small scan packs. That would let occasional users, such as someone splitting one trip per year, pay without subscribing. RevenueCat's virtual-currency feature fits this setup.
- A lifetime option may suit a low-frequency utility whose users dislike subscriptions. No quantitative uplift data was found to support this.

### Gaps

- I found no published A/B or cohort data showing that subscription plus credits earns more than subscription alone.
- I found no lifetime-purchase conversion or cannibalization benchmarks.

## 6. Reverse trials and free trials for infrequently used apps

### Takeaway

I found no published mobile-app reverse-trial dataset. The evidence comes from B2B SaaS and secondary claims, and it says reverse trials beat freemium but trail standard free trials.

### Cited Findings

- A ChartMogul-based SaaS analysis found that 50% of trial-to-paid conversions happen within 7 days, 70% within 14 days, 90% within the first month, and about 3% in months 3–6. It argues that reverse trials add later conversion moments, such as feature gates and usage limits. The data is B2B SaaS. — [Kyle Poyar, Substack note](https://substack.com/@kylepoyar/note/c-126702743)
- About 4% of software companies use a reverse trial. — [Kyle Poyar, Substack note](https://substack.com/@kylepoyar/note/c-126702743)
- A compilation claims a "+38% lift over freemium" from reverse trials and attributes it to Amplitude. I could not verify it against a primary source, so treat it as unreliable. — [Voxbooster](https://voxbooster.com/blog/free-trial-conversion-statistics-2026)
- Reverse trials "are typically better than Freemium models" but "fall short when compared to Free Trials." This is qualitative. — [ITMAGINATION](https://www.itmagination.com/blog/reverse-trials-a-new-approach-to-user-engagement-and-conversion)
- RC SOSA 2026: freemium apps "continue to convert well into Week 6 and beyond." This supports gating later in the user's lifecycle for freemium apps. — [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)

### Inferences

- In practice, a reverse trial for Divit could be "first N scans or the first group/trip fully unlocked, then the free limits apply." It would expose AI scanning value right away without asking for a card. Since there's no mobile data, Divit should treat it as an experiment, for example through RevenueCat Experiments.

### Gaps

- I found no mobile reverse-trial conversion data from RevenueCat, Adapty, or Superwall.
- I found no trial data split by app usage frequency.

## 7. Paywall placement and onboarding paywalls (Superwall, Purchasely, Adapty)

### Takeaway

Conversion happens early: about 50% of paid conversions happen on Day 0. Paywall vendors publish anecdotes rather than representative placement benchmarks.

### Cited Findings

- About 50% of paid conversions happen on Day 0, and more than 60% within one week. — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/); [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- Superwall case studies (vendor-reported):
  - Adding a 60%-discounted annual plan next to monthly raised proceeds per user by 80% and trial conversion by 22%.
  - A timeline-style paywall increased LTV by 50%.

  — [Superwall](https://superwall.com/solutions/by-stage/existing-apps)

- Adapty 2025: paywalls with three plans tend to drive stronger LTV. Teams running 50+ paywall experiments often grow revenue "up to 100x." Both claims are qualitative or vendor-framed. — [Adapty 2025](https://adapty.io/blog/state-of-in-app-subscriptions-2025-in-10-minutes/)

### Inferences

- For Divit, the moment that matters is probably the first receipt scan, or hitting a limit, rather than onboarding. Many users arrive from a shared bill link with no buying intent, so a paywall in onboarding would be shown to the wrong audience.

### Gaps

- I found no Purchasely or Appfigures/Sensor Tower placement benchmarks in this pass.
- Superwall publishes no aggregate benchmarks, only case studies.

## 8. Store commissions and US web checkout after the 2025 rulings

### Takeaway

Apple charges 15% under its Small Business Program for developers under $1M in proceeds. Since April 30, 2025, US apps can link to web checkout with no Apple commission, but the Ninth Circuit (December 2025) allowed Apple to seek a cost-based fee that has not yet been set. Google began collecting fees on US external payments from October 1, 2026. Web checkout is currently a small share of revenue (3.2% globally).

### Cited Findings

- Apple Small Business Program: 15% commission for developers with up to $1M in post-commission proceeds in the prior calendar year. Eligibility is reassessed annually. The program started January 1, 2021. — [Business Wire (Apple announcement)](https://www.businesswire.com/news/home/20201118005376/en/Apple-Announces-App-Store-Small-Business-Program)
- April 2025: Judge Gonzalez Rogers barred Apple from charging fees on US link-out purchases, ending the prior 27% fee, and found willful non-compliance. — [MediaNama](https://www.medianama.com/2025/05/223-us-court-permanent-injunction-apple-app-store-commissions-external-purchases/)
- December 11, 2025: the Ninth Circuit largely affirmed contempt. It vacated the complete commission ban and remanded for a commission "more reasonably tied to Apple's actual costs," likely below 27%. On June 30, 2026, the Supreme Court granted cert on a narrow contempt question, with a decision expected in 2027. As of August 3, 2026, US link-outs are allowed and Apple collects no commission on them. — [Frankfurt Kurnit (FKKS), Aug 3 2026](https://technologylaw.fkks.com/post/102mp7y/update-your-app-external-purchase-developments-for-apple-google)
- One outlet reported Apple proposing a 15% external-purchase fee. I did not read the article, so this is unverified. — [ETV Bharat](https://www.etvbharat.com/en/technology/epic-games-app-store-battle-vs-google-vs-apple-update-enn26081402735)
- Google, after the Epic settlement:
  - Starting October 1, 2026, US developers offering external payment must report transactions and pay service fees. Google announced this on July 22, 2026.
  - The Play Billing billing-fee component is 5% in the US, UK, and EEA.

  — [FKKS](https://technologylaw.fkks.com/post/102mp7y/update-your-app-external-purchase-developments-for-apple-google)

- Secondary reporting on Google's external fees:
  - 10% for auto-renewing subscriptions and 20% for other digital content, with 10% on the first $1M for eligible developers.
  - The external-content-links program reportedly adds a per-install fee of $2.85 for apps and $3.65 for games when a download happens within 24 hours of the click.

  These figures are unverified against Google's help center. — [PaymentsJournal](https://www.paymentsjournal.com/google-cuts-app-store-fees-opens-up-external-payments/); [Notebookcheck](https://www.notebookcheck.net/Google-cuts-Play-Store-fees-as-Epic-settlement-reshapes-Android-app-payments.1243278.0.html)

- RC SOSA 2026: web revenue is 3.2% of revenue globally and 4.9% in North America. 41% of the largest apps (Tier 5) have web revenue, vs 1.3% of the smallest (Tier 1). — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)

### Inferences

- For Divit, in-app purchase at 15% (Apple Small Business Program) is the baseline. A US web-checkout link, for example Stripe through RevenueCat Web Billing, would save roughly 15% minus about 3% in card fees. That is about 12 points, and conversion friction may cost more than that.
- Apple's future cost-based fee is unknown, and Google now charges on external payments. The savings are therefore uncertain, so web checkout is a low priority for a solo developer at small scale.
- Divit already has a web app at divit-bill.com, so a web paywall for web users is a natural fit regardless.

### Gaps

- Google's exact current US rate card was not confirmed from a primary Google source. The FKKS article notes the rate card is published as an image.
- The standard Google Play subscription commission (commonly 15%) was not re-sourced in this pass.
- Apple's eventual cost-based link-out fee is still undetermined.

## 9. Onboarding alongside the payment structure: paywall placement, time-to-value, account walls, trial presentation, viral/multi-user apps, first-run flow

### Takeaway
Day 0 dominates conversion. About 89% of trial starts and about 50% of paid conversions happen on the first day, so the first session needs a monetization moment. For a viral, low-frequency app, that moment should come at the first "aha", meaning the first successful scan or split, not before the user has done anything. Apple's guideline 5.1.1(v) and evidence on delayed sign-up support "use first, account later." Invited participants should never hit a paywall: Calendly and Partiful monetize the host and keep invitees friction-free. Apple has been rejecting free-trial toggle paywalls since January 2026, so use a timeline or reminder paywall with the trial attached to a specific plan.

### Cited Findings

#### Onboarding vs contextual paywall, and the Day-0 share
- Adapty: 89.4% of trial starts happen on Day 0, holding at 87–90% across all regions. If a user misses that first session, the chance they ever start a trial drops to 11%. Onboarding paywalls with a trial convert at 1.78% on average, the highest of any placement. Adapty defines this per onboarding view, not per user. Source is Adapty's State of In-App Subscriptions, page updated July 22, 2026. — [Adapty, personalize onboarding and paywalls](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/); [Adapty onboarding metrics definition](https://adapty.io/docs/onboarding-metrics)
- Adapty claims that "roughly 80% of subscription revenue comes from the first paywall shown after onboarding" (Jan 2026 blog, per search summary). This is a vendor claim that I did not verify independently. — [Adapty, onboarding vs tutorials](https://adapty.io/blog/markdown/mobile-app-onboarding-vs-tutorials.md)
- RC SOSA 2026: about 50% of paid conversions happen on Day 0, and more than 60% within the first week. Freemium apps "continue to convert well into Week 6 and beyond." — [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/); [RevenueCat blog](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)
- RevenueCat paywall guide (Dec 2024):
  - At Mojo, the onboarding paywall drives about 50% of trial starts.
  - An app-open campaign paywall brought in 15% of new iOS revenue.
  - At Avast, a persistent "Upgrade" button added 10–20% revenue, net of cannibalization.
  - FitnessAI moved its paywall before onboarding, which put the paywall in front of 50% more users and roughly doubled install-to-trial. Trial-to-paid held, so revenue doubled.
  - RevenueCat recommends combining onboarding, contextual (feature or limit gates), buy-now, and campaign paywalls.
  
  — [RevenueCat, guide to mobile paywalls](https://www.revenuecat.com/blog/growth/guide-to-mobile-paywalls-subscription-apps.md)
- A glossary gives indicative ranges of 5–12% conversion for onboarding paywalls and 8–20% for contextual feature-gate paywalls. No dataset is cited, so this is weak evidence. — [mwm.ai paywall glossary](https://mwm.ai/glossary/paywall)
- A blog attributes to "RevenueCat 2025" a 12% median conversion for contextual, capability-based paywalls vs 2% for freemium. I could not verify this against RevenueCat, and it likely conflates the hard-paywall figure. — [DEV Community](https://dev.to/paywallpro/why-top-ai-apps-convert-at-12-while-most-struggle-at-2-7j)
- Airbridge argues that showing the paywall before user motivation peaks is a major conversion killer. This is qualitative. — [Airbridge, onboarding before the paywall](https://www.airbridge.io/en/blog/5-steps-app-onboarding-before-the-paywall)
- Adapty: structural changes (placement, trial, plan structure) carry roughly 2x the LTV win rate of visual-only paywall changes. Teams that run experiments earn up to 40x more. — [Adapty](https://adapty.io/blog/how-to-personalize-onboarding-and-paywalls-in-your-mobile-app/)

#### Time-to-value and account-wall placement
- Apple guideline 5.1.1(v): "If your app doesn't include significant account-based features, let people use it without a login." Apps also "may not require users to enter personal information to function, except when directly relevant to the core functionality." — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- A Localytics study, cited secondhand by Rownd, found that apps allowing users to delay registration had 28% more retained users than apps forcing registration up front. I could not find the original study, and Rownd sells authentication. — [Rownd](https://rownd.io/blog/why-you-should-delay-authentication-onboarding-in-your-app)
- Guest-mode conversion of 40–60% vs 15–30% for a hard sign-up gate appears in an onboarding "skill" document with no traceable source. Treat it as unverified. — [onboarding-optimization skill](https://tessl.io/registry/skills/github/Eronred/aso-skills/onboarding-optimization)

#### Trial presentation: reminders, timelines, toggles, Apple 3.1.2
- Blinkist's "honest" timeline paywall showed the 7-day trial as full access today, a reminder on day 5, and a charge on day 7, with a reminder opt-in. Reported results were 23% more trial starts, 55% fewer customer complaints, and notification opt-in rising from 6% to 74%. Sources disagree on whether the 4% figure is lower cancellation or higher retention. — [UX Planet (Blinkist author)](https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b); [B2B Pricing Insights](https://b2bpricinginsights.substack.com/p/4-min-read-how-blinkists-new-paywall)
- Apple and toggle paywalls:
  - In mid-January 2026, Apple began rejecting iOS paywalls that have a free-trial on/off toggle, citing 3.1.2 and calling them "confusing and misleading." No official policy text was published. Toggles still work on Google Play and the web.
  - In the recommended pattern, the trial is attached to a specific plan in a multi-plan selector. Flo Health is the example, with a 14-day trial plan, updated April 23, 2026.
  - In a Fits A/B test, a toggle paywall beat a Blinkist-style paywall by 19% on ARPU. Most of that lift came from visual hierarchy (normalized annual price, a "Most Popular" badge, a larger annual card), not the toggle itself.
  
  — [RevenueCat, RIP toggle paywall](https://www.revenuecat.com/blog/growth/rip-toggle-paywall.md); [Adapty, toggle paywall rejected](https://adapty.io/blog/your-toggle-paywall-is-about-to-get-rejected/)
- Apple 3.1.2(c): "Before asking a customer to subscribe, you should clearly describe what the user will get for the price," and comply with Schedule 2 of the Developer Program License Agreement. — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apple 3.1.2(a) requires subscriptions to provide ongoing value and to last at least 7 days. Free trials are configured in App Store Connect. — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Developers report 3.1.2(c) rejections when the trial or intro offer is shown "more clearly and conspicuously than the billed amount." — [Apple Developer Forums thread](https://developer.apple.com/forums/thread/841626)
- Apple 3.1.2(a): users must get what they paid for without extra tasks such as posting on social media or uploading contacts. Under 3.2.2(x), apps must not force ratings or reviews to unlock functionality. — [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

#### Viral/multi-user apps: invitees free, organizer monetized
- Calendly: only the sender needs an account. The invitee experiences the product, sees the brand, and can sign up for free afterward. This invite loop kept CAC near zero. The sources are AI-generated analyses on Sacra plus OpenView. — [OpenView, SaaS viral loops](https://openviewpartners.com/blog/saas-product-viral-loop/); [Sacra, Calendly](https://sacra.com/c/calendly)
- Partiful:
  - Guests RSVP by link with no app or account. Invites are free for hosts and guests.
  - Revenue comes from optional host-side commerce (Group Order with a flat $5 delivery fee via Instacart).
  - By contrast, Evite charges hosts $17.99–$99.99 by guest count. Free invites "win the top of the funnel."
  
  — [Sacra, Partiful](https://sacra.com/research/partiful)
- Splitwise, the direct competitor:
  - Free users hit a daily expense cap, about 3–5 per day and not officially published, introduced around December 2023.
  - Pro is about $4.99/mo or $39.99/yr in the US, and about $5/$40 in another report.
  - Pro includes receipt scanning, itemization, charts, and currency conversion. Free keeps unlimited groups, standard splits, and debt simplification, with ads.
  - The sources are a competitor blog and news, so treat them as approximate.
  
  — [Finny, Splitwise pricing 2026](https://getfinny.app/blog/splitwise-pricing-2026); [ITVoice](https://www.itvoice.in/splitwise-has-introduced-restrictions-on-the-number-of-free-expenses-users-can-add)

#### First-run flow length, personalization, permissions
- Across 129 onboarding flows, the median is 11 screens and the mean is 13.9. The 25th percentile is 6 screens and the 75th is 17. By category, Productivity is about 11.5, Health & Fitness is 20.5 (quiz-driven), and News is 8. The dataset counts screens only and reports no conversion effect. — [Lazyweb, average onboarding screens 2026](https://www.lazyweb.com/research/average-onboarding-screens-2026)
- 63% of 65 sampled apps show a custom priming screen before the iOS notification prompt (48% on the stricter count). — [Lazyweb, priming screens](https://www.lazyweb.com/research/percent-apps-priming-screen-before-ios-notification-prompt.md)
- An academic study of Apple's ATT prompt found that a priming page did not significantly change opt-in, and if anything appeared to reduce it. This is the most rigorous evidence found, and it cuts against "priming always helps." — [Pomona ATT tech report](https://ebac2018.sites.pomona.edu/docs/ETAA21-ATT-techreport.pdf)
- Push opt-in averages 67.5% overall and 54% on iOS. The source's "priming gives 2–3x" claim is unsourced. — [Plotline](https://www.plotline.so/blog/how-to-improve-push-notification-opt-in-rates)

### Inferences
- **Recommended Divit first-run flow.** This synthesizes the sources above; it has not been tested.
  1. Keep it to 2–3 value screens at most. Divit has no quiz-driven personalization, so it can sit below the median of 11.
  2. Go straight to "Scan a receipt" or "Add items manually," with guest mode allowed.
  3. Ask for camera permission only when the user taps Scan, with a one-line explanation.
  4. Show the AI scan result. This is the aha moment.
  5. Ask for an account or sign-in only when the user needs to save, share, or send Venmo requests. Users get value first, and Apple 5.1.1(v) is satisfied.
  6. Show a soft Pro upsell after the first successful split, which is still on Day 0. It should be dismissible and use a plan-attached trial on the annual plan, with Blinkist-style timeline copy.
  7. Show contextual paywalls when the user hits the 3rd scan of the month or the 3rd active group.
  8. Ask for notification permission after the first share, framed as "know when friends pay you."
- **Where to place the paywall.** A blocking onboarding paywall suits intent-driven installs, such as fitness apps. Many Divit installs come from invite links with no purchase intent. Pairing a Day-0 soft upsell after the aha with contextual limit-gates fits both the Adapty Day-0 data and the network-effect argument for keeping freemium.
- **Invited participants must never see a paywall.** This covers viewing a bill, claiming items, and paying. Pro limits should apply only to the organizer, meaning bill or group owner actions such as AI scans and creating groups. Calendly and Partiful both monetize the host and keep invitees free. Splitwise caps everyone's expense entries and draws complaints, which competitors use against it in marketing.
- **Divit's pricing next to Splitwise.** Divit's $4.99/$34.99 slightly undercuts Splitwise Pro ($4.99/$39.99). AI receipt scanning is a Pro feature at Splitwise, so gating scans is consistent with what the market already accepts.
- **Trial disclosure on iOS.** Don't use a toggle. Show the billed amount at least as prominently as "free trial," state the trial length and the charge date, and offer a reminder notification before the charge. The reminder also gives a reason for the notification permission.

### Gaps
- I found no rigorous, public A/B data comparing onboarding vs contextual vs hybrid placement on the same app population. Only vendor case studies and unsourced ranges exist.
- I found no Appcues or Purchasely placement benchmarks in this pass.
- The delayed-registration evidence (Localytics, 28%) is only available secondhand. Guest-mode conversion figures are unverified.
- I found no published data on paywall exposure for invited participants in group or bill-split apps. The "host pays" principle rests on case analysis of Calendly and Partiful, not on measured experiments.
- I found no controlled evidence that the number of onboarding screens or personalization questions affects conversion in utility apps.
