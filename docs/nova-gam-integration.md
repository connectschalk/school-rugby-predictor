# Nova News — Google Ad Manager (GAM) integration guide

This document describes the **mock advertising architecture** shipped for the Nova Advertising Demo Mode, and how to replace mock creatives with real Google Ad Manager / Google Publisher Tag (GPT) inventory later.

**Do not enable production GAM tags until Nova supplies network code, ad unit paths, approved sizes, refresh rules, targeting keys, a test campaign, and consent requirements.**

## Current mock-ad architecture

| Layer | Location | Role |
| --- | --- | --- |
| Demo activation | `lib/nova-demo.ts` | Env + query-param gates |
| Placement catalogue | `lib/advertising/placements.ts` | IDs, sizes, sales notes, demo creatives |
| Provider interface | `lib/advertising/ad-provider.ts` | `MockAdProvider` today; `GamAdProvider` stub |
| GPT stub | `lib/advertising/gam-adapter.ts` | Placeholder for `defineSlot` / display |
| UI | `components/advertising/*` | `<AdSlot />`, mock creatives, sticky, inventory panel |
| Analytics prep | `lib/analytics/events.ts` | Safe `dataLayer` push (no PII) |

Pages call `<AdSlot placement="…" context={{…}} />`. When demo mode is off, slots render nothing and have negligible impact.

### Mock vs future GAM

- **Mock:** HTML/CSS components, demo disclosure labels, IntersectionObserver `ad_slot_viewed` events for sales demos only.
- **GAM:** Real impressions/clicks come from GAM reporting. Remove or gate the demo observer; do not double-count impressions.

## Placement IDs

| Placement ID | Suggested GAM unit path |
| --- | --- |
| `nova_predictor_home_takeover` | `/nova_news/predictor/home_takeover` |
| `nova_predictor_competition_sponsor` | `/nova_news/predictor/competition_sponsor` |
| `nova_predictor_fixture_inline` | `/nova_news/predictor/fixture_inline` |
| `nova_predictor_leaderboard_sponsor` | `/nova_news/predictor/leaderboard_sponsor` |
| `nova_predictor_results_inline` | `/nova_news/predictor/results_inline` |
| `nova_predictor_mobile_sticky` | `/nova_news/predictor/mobile_sticky` |
| `nova_predictor_sponsored_match` | `/nova_news/predictor/sponsored_match` |
| `nova_predictor_regional_demo` | `/nova_news/predictor/regional_demo` |

## Suggested GAM ad unit hierarchy

```
/{network_code}/nova_news/predictor/home_takeover
/{network_code}/nova_news/predictor/competition_sponsor
/{network_code}/nova_news/predictor/fixture_inline
/{network_code}/nova_news/predictor/leaderboard_sponsor
/{network_code}/nova_news/predictor/results_inline
/{network_code}/nova_news/predictor/mobile_sticky
/{network_code}/nova_news/predictor/sponsored_match
/{network_code}/nova_news/predictor/regional_demo
```

Naming convention: `nova_news` → product area → placement slug matching the catalogue `gamPlacementName`.

## Where GPT / GAM scripts would load

1. Load GPT **only after** consent management confirms advertising / personalised ads are allowed (POPIA + Nova policy).
2. Prefer a single shared loader (e.g. in a client `GamBootstrap` component) gated by env + consent — never on the default NextPlay production build until Nova is ready.
3. Implement slot definition in `lib/advertising/gam-adapter.ts` and switch `getAdProvider()` to `GamAdProvider` in `lib/advertising/ad-provider.ts`.
4. Keep `<AdSlot />` call sites unchanged.

## Responsive size mappings

Use GPT `sizeMapping()` for each placement:

- Homepage takeover: desktop `[[970,250],[970,90],[728,90]]` → mobile `[[320,100],[320,50]]`
- Fixture / results inline: desktop `[[728,90],'fluid']` → mobile `[[320,100],'fluid']`
- Sponsor strips: often fixed creatives; may not use open auction sizes
- Mobile sticky: mobile-only `[[320,50]]`; do not define desktop

Reserve slot height in CSS (already done via placement `reservedHeight*`) to limit CLS.

## Consent management

- Do **not** load personalised advertising before consent.
- Do **not** auto-opt users into marketing.
- Existing NextPlay consent behaviour must remain unchanged until legal review.
- Nova marketing consent, privacy notices, remarketing, and personalised advertising require **separate legal and POPIA review**.

## Targeting keys (non-PII)

Safe examples:

- `competition_slug`
- `page_type` (`landing` | `predict` | `fixtures` | `leaderboard` | …)
- `region` (demo geo packages — only approved keys)
- `device` (`mobile` | `desktop`)
- `logged_in` (`true` | `false`) — boolean only, never user id/email

**Never** pass email, name, phone, prediction text, or other PII into GAM targeting or GA4/GTM events.

## Impressions and clicks

| Source | Use |
| --- | --- |
| GAM | Billable impressions, viewability, ad clicks, fill |
| GA4 / GTM (`lib/analytics/events.ts`) | Product engagement: registration, predictions, leaderboard views, sponsor CTAs |

Demo `ad_slot_viewed` (50% visible ≥ 1s, once per slot instance) is **not** a substitute for GAM viewability.

## Refresh policy

Demo fixture inline may refresh after meaningful filter/navigation changes, at most once per 30 seconds, and only when in viewport. **Real refresh rules must be approved against Nova’s GAM policy and Google requirements** before enabling GPT refresh.

## Testing process (suggested)

1. Enable demo mode locally: `NEXT_PUBLIC_NOVA_AD_DEMO=true` or `?novaDemo=1`.
2. Walk `/admin/advertising-demo` inventory + demo guide.
3. When Nova provides a **test** network / campaign: point `GamAdProvider` at test units only.
4. Verify consent gating, size mapping, CLS, mobile sticky vs bottom nav, and that no PII appears in network payloads.
5. Only then promote to production with Nova sign-off.

## Required from Nova before live GAM

- [ ] GAM network code
- [ ] Ad unit paths (or confirmation of hierarchy above)
- [ ] Approved sizes per placement
- [ ] Refresh rules
- [ ] Targeting keys whitelist
- [ ] Test campaign
- [ ] Consent / CMP requirements and privacy notice updates
- [ ] Brand assets (approved Nova logo) if replacing text placeholder

## Security reminders

- Never expose Supabase service-role credentials.
- Keep creatives component-based (no untrusted HTML injection).
- Do not weaken RLS or admin route protection for demos.
