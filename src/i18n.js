// On-screen words (English only).
// The brand works as a word: the score is the player's TOTAL ("TOTAL 82 diyas lit"), the last stretch is the
// TOTAL rush, a full sky triangle is Totally lit. A handful of places, each one natural English.
export const S = {
  greet: 'Happy Diwali', tagline: 'Light the diyas and win exciting gifts', seconds: 'You have 30 seconds!', go: "Let's GO!",
  hint: 'Drag to move your flame', lit: 'diyas lit', win: 'You win', none: 'Better luck next time',
  noneLine: 'Thank you for lighting up the gali', collect: 'Show this screen to your promoter', next: 'Next player',
  prizes: { pack: '1 Pack', sticks3: '3 Sticks', sticks2: '2 Sticks', stick1: '1 Stick' },
  flame: ['', 'Flame up!', 'Blazing!', 'Mahajyoti!'], loading: 'Lighting the gali', paused: 'Paused', resume: 'Resume', rotate: 'Turn your phone upright to play',
  full: 'Totally lit!',
  fireMeter: 'Fire', fireOn: 'On fire ×2', fire: 'On fire!', rush: 'TOTAL RUSH!', close: 'Close!', combo: 'combo', dodge: 'Dodge the crackers!',
  how1: 'Swipe to light the diyas', how2: 'Light many in a row: On Fire ×2', how3: 'Dodge the firecrackers',
  best: n => `Best TOTAL today: ${n} — beat it!`, newBest: 'Best TOTAL today!',
  given: 'Prize given', givenDone: 'Given ✓', stamp: t => `✓ Prize given · ${t}`, stallLabel: c => `Stall ${c}`,
  promoTitle: 'Promoter tools', pStall: 'Stall code', pCaps: 'Daily prize limits', pCapsNote: 'Leave blank for no limit. When a prize has run out for the day, the next prize down is given.',
  pExport: 'Export results', pReset: 'Clear today', pTips: 'Setup tips', pClose: 'Done', pResetAsk: 'Clear all of today’s results on this phone?',
  pStats: { plays: 'Plays today', avg: 'Average score', best: 'Best score', none: 'No prize', given: 'given', capped: 'Moved down by a limit' },
  pCapLabels: { pack: 'Packs per day', sticks3: '3-stick prizes per day', sticks2: '2-stick prizes per day', stick1: '1-stick prizes per day' },
};
