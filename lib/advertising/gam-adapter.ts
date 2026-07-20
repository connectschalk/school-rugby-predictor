/**
 * Future Google Ad Manager / GPT adapter placeholder.
 *
 * Do NOT load googletag or GPT scripts until Nova supplies:
 * - GAM network code
 * - ad unit paths
 * - approved sizes & size mappings
 * - refresh rules
 * - targeting keys
 * - consent / POPIA requirements
 *
 * When ready, implement `defineAndDisplaySlot` here and wire `GamAdProvider`
 * in `lib/advertising/ad-provider.ts` so `<AdSlot />` call sites stay unchanged.
 *
 * See docs/nova-gam-integration.md.
 */

export type GamSlotDefinition = {
  unitPath: string
  sizes: Array<[number, number] | 'fluid'>
  divId: string
  targeting?: Record<string, string>
}

/**
 * Placeholder — real GPT integration will:
 * 1. Ensure googletag is present after consent
 * 2. googletag.cmd.push(() => { defineSlot(...).addService(pubads()); ... })
 * 3. Apply sizeMapping for mobile/desktop
 * 4. Set page-level and slot-level targeting (never PII)
 * 5. enableServices + display
 */
export function defineAndDisplayGamSlot(def: GamSlotDefinition): void {
  void def
  if (process.env.NODE_ENV !== 'production') {
    console.info(
      '[nova-gam] Gam adapter stub — not loading GPT. Provide network + units before enabling.'
    )
  }
}

export function destroyGamSlots(): void {
  // Future: googletag.destroySlots()
}
