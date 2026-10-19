/** Seed lore for EarthQuest. Replace with real game content; ingestion splits on blank lines. */
export const SEED_LORE = `
The village of Emberfall sits at the foot of the Shattered Spine, a mountain range split open by the Great Quake two centuries ago.

Elder Maren is the keeper of Emberfall. She lost her left hand in the Quake and refuses to speak of how. She distrusts anyone who carries iron from the deep mines.

The Quake released the Hollow Wyrms from under the earth. They avoid firelight, which is why every door in Emberfall holds a lit lantern through the night.

Moonsilver is the only metal that harms a Hollow Wyrm. It is mined at Pale Reach, three days north, and traders who bring it are given free lodging in the village.

The Cartographers' Guild sells maps of the Spine. Their maps are accurate except for the Weeping Pass, which they deliberately draw wrong to keep travelers away.

Travelers who lie to Elder Maren are never turned away, but she stops sharing what she knows and answers only in short, cold sentences.
`;

export function chunkLore(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
}
