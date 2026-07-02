// Parse a free-text location query ("Austin, TX", "78701", "Portland, ME")
// into a { state, city } pair usable by getAmi(). Fully offline — no geocode.
// Needed so the onboarding AMI survey computes eligibility against the user's
// actual metro/state instead of a hardcoded default.

// USPS ZIP prefix (first 3 digits) → state, encoded as inclusive ranges.
const ZIP3_RANGES: { lo: number; hi: number; state: string }[] = [
  { lo: 5,   hi: 5,   state: "NY" },
  { lo: 10,  hi: 27,  state: "MA" },
  { lo: 28,  hi: 29,  state: "RI" },
  { lo: 30,  hi: 38,  state: "NH" },
  { lo: 39,  hi: 49,  state: "ME" },
  { lo: 50,  hi: 59,  state: "VT" },
  { lo: 60,  hi: 69,  state: "CT" },
  { lo: 70,  hi: 89,  state: "NJ" },
  { lo: 100, hi: 149, state: "NY" },
  { lo: 150, hi: 196, state: "PA" },
  { lo: 197, hi: 199, state: "DE" },
  { lo: 200, hi: 205, state: "DC" },
  { lo: 206, hi: 219, state: "MD" },
  { lo: 220, hi: 246, state: "VA" },
  { lo: 247, hi: 268, state: "WV" },
  { lo: 270, hi: 289, state: "NC" },
  { lo: 290, hi: 299, state: "SC" },
  { lo: 300, hi: 319, state: "GA" },
  { lo: 320, hi: 349, state: "FL" },
  { lo: 350, hi: 369, state: "AL" },
  { lo: 370, hi: 385, state: "TN" },
  { lo: 386, hi: 397, state: "MS" },
  { lo: 398, hi: 399, state: "GA" },
  { lo: 400, hi: 427, state: "KY" },
  { lo: 430, hi: 459, state: "OH" },
  { lo: 460, hi: 479, state: "IN" },
  { lo: 480, hi: 499, state: "MI" },
  { lo: 500, hi: 528, state: "IA" },
  { lo: 530, hi: 549, state: "WI" },
  { lo: 550, hi: 567, state: "MN" },
  { lo: 570, hi: 577, state: "SD" },
  { lo: 580, hi: 588, state: "ND" },
  { lo: 590, hi: 599, state: "MT" },
  { lo: 600, hi: 629, state: "IL" },
  { lo: 630, hi: 658, state: "MO" },
  { lo: 660, hi: 679, state: "KS" },
  { lo: 680, hi: 693, state: "NE" },
  { lo: 700, hi: 714, state: "LA" },
  { lo: 716, hi: 729, state: "AR" },
  { lo: 730, hi: 749, state: "OK" },
  { lo: 750, hi: 799, state: "TX" },
  { lo: 800, hi: 816, state: "CO" },
  { lo: 820, hi: 831, state: "WY" },
  { lo: 832, hi: 838, state: "ID" },
  { lo: 840, hi: 847, state: "UT" },
  { lo: 850, hi: 865, state: "AZ" },
  { lo: 870, hi: 884, state: "NM" },
  { lo: 889, hi: 898, state: "NV" },
  { lo: 900, hi: 961, state: "CA" },
  { lo: 967, hi: 968, state: "HI" },
  { lo: 970, hi: 979, state: "OR" },
  { lo: 980, hi: 994, state: "WA" },
  { lo: 995, hi: 999, state: "AK" },
];

function stateFromZip(zip: string): string | undefined {
  const p = parseInt(zip.slice(0, 3), 10);
  if (Number.isNaN(p)) return undefined;
  return ZIP3_RANGES.find(r => p >= r.lo && p <= r.hi)?.state;
}

const STATE_ABBRS = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

const STATE_NAMES: Record<string, string> = {
  alabama:"AL", alaska:"AK", arizona:"AZ", arkansas:"AR", california:"CA",
  colorado:"CO", connecticut:"CT", delaware:"DE", florida:"FL", georgia:"GA",
  hawaii:"HI", idaho:"ID", illinois:"IL", indiana:"IN", iowa:"IA", kansas:"KS",
  kentucky:"KY", louisiana:"LA", maine:"ME", maryland:"MD", massachusetts:"MA",
  michigan:"MI", minnesota:"MN", mississippi:"MS", missouri:"MO", montana:"MT",
  nebraska:"NE", nevada:"NV", "new hampshire":"NH", "new jersey":"NJ",
  "new mexico":"NM", "new york":"NY", "north carolina":"NC", "north dakota":"ND",
  ohio:"OH", oklahoma:"OK", oregon:"OR", pennsylvania:"PA", "rhode island":"RI",
  "south carolina":"SC", "south dakota":"SD", tennessee:"TN", texas:"TX",
  utah:"UT", vermont:"VT", virginia:"VA", washington:"WA", "west virginia":"WV",
  wisconsin:"WI", wyoming:"WY", "district of columbia":"DC",
};

export interface ParsedLocation {
  state?: string;
  /** Original query text, passed through so getAmi can match metro overrides. */
  city?: string;
}

export function parseLocationForAmi(query: string): ParsedLocation {
  const q = query.trim();
  if (!q) return {};

  // Pure ZIP code
  if (/^\d{5}(-\d{4})?$/.test(q)) {
    return { state: stateFromZip(q) };
  }

  const lower = q.toLowerCase();

  // State abbreviation as a standalone token (e.g. "Austin, TX")
  let state: string | undefined;
  const tokens = lower.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    const up = tok.toUpperCase();
    if (STATE_ABBRS.has(up)) { state = up; break; }
  }

  // Full state name fallback (check longer names first)
  if (!state) {
    for (const name of Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)) {
      if (lower.includes(name)) { state = STATE_NAMES[name]; break; }
    }
  }

  // Pass the full query through as the city so getAmi can match metro overrides
  // (it normalizes and disambiguates, e.g. "Portland, ME" vs "Portland, OR").
  return { state, city: q };
}
