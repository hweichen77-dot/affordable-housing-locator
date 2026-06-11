import { useState } from "react";
import type { SurveyAnswers, PopType, BedroomPref } from "../lib/surveyLogic";
import { computeSurveyResult, tierToFilterValue } from "../lib/surveyLogic";
import type { FilterState } from "../App";

const STORAGE_KEY = "housing-survey-v1";

export function hasSurveyCompleted(): boolean {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

export function saveSurvey(answers: SurveyAnswers): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); } catch { /* */ }
}

interface AmiSurveyProps {
  onComplete: (filters: Partial<FilterState>, locationQuery: string) => void;
  onSkip: () => void;
}

type Step = 1 | 2 | 3 | 4;

const HH_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

const INCOME_PRESETS = [
  { label: "Under $20k",  value: 18000 },
  { label: "$20–30k",     value: 25000 },
  { label: "$30–50k",     value: 40000 },
  { label: "$50–70k",     value: 60000 },
  { label: "$70–100k",    value: 85000 },
  { label: "$100–150k",   value: 125000 },
  { label: "Over $150k",  value: 160000 },
];

const POP_OPTIONS: { value: PopType; label: string }[] = [
  { value: "",         label: "General / Any" },
  { value: "Family",   label: "Family with children" },
  { value: "Elderly",  label: "Senior (62+)" },
  { value: "Disabled", label: "Accessibility needs" },
];

const BR_OPTIONS: { value: BedroomPref; label: string }[] = [
  { value: "",  label: "Flexible" },
  { value: "0", label: "Studio" },
  { value: "1", label: "1 Bedroom" },
  { value: "2", label: "2 Bedrooms" },
  { value: "3", label: "3 Bedrooms" },
  { value: "4", label: "4+ Bedrooms" },
];

const TIER_PROGRAMS: Record<string, { programs: string[]; tip: string }> = {
  ELI: {
    programs: [
      "Public Housing (HUD direct subsidy)",
      "Emergency Housing Vouchers (EHV)",
      "HUD-VASH (veterans)",
      "Permanent Supportive Housing",
      "Section 8 / Housing Choice Voucher (priority)",
    ],
    tip: "You're in the highest-priority income bracket. Seek a housing counselor — you may qualify for direct rental assistance.",
  },
  VLI: {
    programs: [
      "Section 8 / Housing Choice Vouchers",
      "LIHTC apartments (50% & 60% AMI tiers)",
      "HOME program rentals",
      "HUD-assisted multifamily",
      "Most city affordable housing programs",
    ],
    tip: "Most LIHTC affordable housing is available to you. Apply to multiple properties — waitlists can be long.",
  },
  LI: {
    programs: [
      "LIHTC apartments (60% & 80% AMI tiers)",
      "Workforce housing programs",
      "HOME program rentals",
      "City/county affordable housing programs",
      "Inclusionary units in market-rate buildings",
    ],
    tip: "You qualify for the most common type of affordable housing (LIHTC 60%). Prioritize properties marked 'Low Income'.",
  },
  Moderate: {
    programs: [
      "LIHTC 80–120% AMI units (less common)",
      "City moderate-income programs",
      "Inclusionary affordable units",
      "Below-market-rate (BMR) programs",
    ],
    tip: "Fewer programs target moderate income. Look for inclusionary units in market-rate buildings and city BMR programs.",
  },
  AboveAMI: {
    programs: [
      "Market-rate housing",
      "Employer housing assistance programs",
      "Some workforce housing in high-cost metros",
    ],
    tip: "Most subsidized programs have income limits you exceed. You may still qualify for some workforce programs in high-cost metros like San Francisco or New York.",
  },
};

function fmt$(n: number): string {
  return "$" + n.toLocaleString();
}

export function AmiSurvey({ onComplete, onSkip }: AmiSurveyProps) {
  const [step, setStep] = useState<Step>(1);
  const [hhSize, setHhSize] = useState(1);
  const [incomePreset, setIncomePreset] = useState<number | null>(null);
  const [incomeCustom, setIncomeCustom] = useState("");
  const [popType, setPopType] = useState<PopType>("");
  const [brPref, setBrPref] = useState<BedroomPref>("");
  const [locationQuery, setLocationQuery] = useState("");

  const annualIncome = incomeCustom
    ? (parseFloat(incomeCustom.replace(/[^0-9.]/g, "")) || 0)
    : (incomePreset ?? 0);

  const answers: SurveyAnswers = {
    householdSize: hhSize,
    annualIncome,
    populationType: popType,
    bedroomPref: brPref,
    locationQuery,
  };

  const result = annualIncome > 0
    ? computeSurveyResult(answers)
    : null;

  const handleComplete = () => {
    saveSurvey(answers);
    const filterPatch: Partial<FilterState> = {
      householdSize: hhSize,
      householdIncome: annualIncome,
      populationType: popType,
      bedroomSize: brPref,
      ...(result ? { incomeTier: tierToFilterValue(result.tier) } : {}),
      sortBy: locationQuery ? "match" : "name",
    };
    onComplete(filterPatch, locationQuery.trim());
  };

  const canNext1 = annualIncome > 0;

  return (
    <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <div className="survey-modal">
        {/* Header */}
        <div className="survey-header">
          <div className="survey-step-dots">
            {([1, 2, 3, 4] as Step[]).map(s => (
              <span key={s} className={`survey-dot${step === s ? " active" : step > s ? " done" : ""}`} />
            ))}
          </div>
          <button className="survey-skip-btn" onClick={onSkip} aria-label="Skip survey">
            Skip
          </button>
        </div>

        {/* Step 1: Household + income */}
        {step === 1 && (
          <div className="survey-step">
            <h2 id="survey-title" className="survey-title">Tell us about your household</h2>
            <p className="survey-sub">We'll filter housing you actually qualify for based on your income.</p>

            {/* AMI education callout */}
            <div className="survey-ami-callout">
              <div className="survey-ami-callout-title">
                <span>📊</span> Why your income matters
              </div>
              <p>
                Affordable housing uses <strong>AMI (Area Median Income)</strong> — the middle income
                for your metro area — to set eligibility limits. Most affordable apartments require
                income below a set % of AMI.
              </p>
              <div className="survey-ami-tier-pills">
                <span className="survey-tier-pill tier-eli">≤30% AMI: Emergency/Public</span>
                <span className="survey-tier-pill tier-vli">≤50% AMI: Section 8</span>
                <span className="survey-tier-pill tier-li">≤60% AMI: Most LIHTC</span>
                <span className="survey-tier-pill tier-mod">≤80% AMI: Workforce</span>
              </div>
              <p>
                The lower your % AMI, the more programs you qualify for and the lower your rent.
                Your household size also matters — limits adjust for larger families.
              </p>
            </div>

            <div className="survey-field">
              <label className="survey-label">Household size</label>
              <div className="survey-btn-grid">
                {HH_SIZES.map(n => (
                  <button
                    key={n}
                    className={`survey-sel-btn${hhSize === n ? " selected" : ""}`}
                    onClick={() => setHhSize(n)}
                    type="button"
                  >
                    {n === 8 ? "8+" : n}
                  </button>
                ))}
              </div>
            </div>

            <div className="survey-field">
              <label className="survey-label">
                Annual household income
                <span className="survey-label-hint"> (gross, before taxes)</span>
              </label>
              <div className="survey-income-presets">
                {INCOME_PRESETS.map(({ label, value }) => (
                  <button
                    key={label}
                    className={`survey-sel-btn survey-income-btn${incomePreset === value && !incomeCustom ? " selected" : ""}`}
                    onClick={() => { setIncomePreset(value); setIncomeCustom(""); }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="survey-income-custom-row">
                <span className="survey-income-or">or enter exact amount:</span>
                <div className="survey-income-input-wrap">
                  <span className="survey-income-prefix">$</span>
                  <input
                    className="survey-income-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 54000"
                    value={incomeCustom}
                    onChange={e => { setIncomeCustom(e.target.value); setIncomePreset(null); }}
                    aria-label="Enter exact annual income"
                  />
                </div>
              </div>
            </div>

            {/* Live AMI tier preview */}
            {result && (
              <div
                className="survey-live-tier"
                style={{ "--tier-color": result.color } as React.CSSProperties}
              >
                <div className="survey-live-tier-left">
                  <div className="survey-live-tier-label">Your estimated AMI tier</div>
                  <div className="survey-live-tier-pct">{result.amiPct}% AMI</div>
                </div>
                <div className="survey-live-tier-right">
                  <div className="survey-live-tier-name">{result.label}</div>
                  <div className="survey-live-tier-desc">{result.description}</div>
                </div>
              </div>
            )}

            <div className="survey-actions">
              <button
                className="survey-next-btn"
                onClick={() => setStep(2)}
                disabled={!canNext1}
                type="button"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Housing needs */}
        {step === 2 && (
          <div className="survey-step">
            <h2 className="survey-title">Your housing needs</h2>
            <p className="survey-sub">Help us match you with relevant properties.</p>

            <div className="survey-field">
              <label className="survey-label">Who is in your household?</label>
              <div className="survey-pop-grid">
                {POP_OPTIONS.map(({ value, label }) => (
                  <button
                    key={label}
                    className={`survey-pop-btn${popType === value ? " selected" : ""}`}
                    onClick={() => setPopType(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="survey-field">
              <label className="survey-label">Bedrooms needed</label>
              <div className="survey-btn-grid survey-br-grid">
                {BR_OPTIONS.map(({ value, label }) => (
                  <button
                    key={label}
                    className={`survey-sel-btn${brPref === value ? " selected" : ""}`}
                    onClick={() => setBrPref(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="survey-actions survey-actions-two">
              <button className="survey-back-btn" onClick={() => setStep(1)} type="button">← Back</button>
              <button className="survey-next-btn" onClick={() => setStep(3)} type="button">Next →</button>
            </div>
          </div>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <div className="survey-step">
            <h2 className="survey-title">Where are you looking?</h2>
            <p className="survey-sub">Enter a city or ZIP code to get personalized suggestions. You can also search later.</p>

            <div className="survey-field">
              <label className="survey-label">City or ZIP code <span className="survey-optional">(optional)</span></label>
              <input
                className="survey-location-input"
                type="text"
                placeholder="e.g. Austin, TX  or  78701"
                value={locationQuery}
                onChange={e => setLocationQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") setStep(4); }}
                aria-label="Enter city or ZIP code"
                autoFocus
              />
            </div>

            <div className="survey-actions survey-actions-two">
              <button className="survey-back-btn" onClick={() => setStep(2)} type="button">← Back</button>
              <button className="survey-next-btn" onClick={() => setStep(4)} type="button">
                {locationQuery.trim() ? "Next →" : "Skip →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && (
          <div className="survey-step survey-results">
            <h2 className="survey-title">Your housing profile</h2>

            {result ? (
              <>
                <div className="survey-tier-card" style={{ "--tier-color": result.color } as React.CSSProperties}>
                  <div className="survey-tier-label">{result.label}</div>
                  <div className="survey-tier-pct">{result.amiPct}% of area median income</div>
                  <p className="survey-tier-desc">{result.description}</p>
                </div>

                <div className="survey-summary">
                  <div className="survey-summary-row">
                    <span>Household</span>
                    <strong>{hhSize} {hhSize === 1 ? "person" : "people"}</strong>
                  </div>
                  <div className="survey-summary-row">
                    <span>Income</span>
                    <strong>{fmt$(annualIncome)}/yr</strong>
                  </div>
                  {brPref && (
                    <div className="survey-summary-row">
                      <span>Bedrooms</span>
                      <strong>{BR_OPTIONS.find(b => b.value === brPref)?.label}</strong>
                    </div>
                  )}
                  {popType && (
                    <div className="survey-summary-row">
                      <span>Type</span>
                      <strong>{POP_OPTIONS.find(p => p.value === popType)?.label}</strong>
                    </div>
                  )}
                  {locationQuery && (
                    <div className="survey-summary-row">
                      <span>Location</span>
                      <strong>{locationQuery}</strong>
                    </div>
                  )}
                </div>

                {/* Programs you qualify for */}
                {TIER_PROGRAMS[result.tier] && (
                  <div className="survey-programs-section">
                    <div className="survey-programs-title">Programs you likely qualify for</div>
                    <div className="survey-programs">
                      {TIER_PROGRAMS[result.tier].programs.map(prog => (
                        <div className="survey-program-item" key={prog}>
                          <span className="survey-program-bullet">✓</span>
                          <span>{prog}</span>
                        </div>
                      ))}
                    </div>
                    <div className="survey-program-tip">{TIER_PROGRAMS[result.tier].tip}</div>
                  </div>
                )}

                {/* What AMI means in dollars */}
                <div className="survey-ami-note">
                  <strong>What does {result.amiPct}% AMI mean?</strong>
                  <p>
                    At {result.amiPct}% of the area median income, your household earns{" "}
                    {result.amiPct < 100 ? "below" : "above"} the midpoint for your metro.
                    {result.amiPct <= 60 && " This puts you in range for most LIHTC affordable housing."}
                    {result.amiPct > 60 && result.amiPct <= 80 && " You qualify for workforce housing and some LIHTC properties."}
                    {result.amiPct > 80 && " Look for moderate-income and inclusionary affordable programs."}
                  </p>
                </div>
              </>
            ) : (
              <p className="survey-sub">Your filters have been saved.</p>
            )}

            <div className="survey-actions survey-actions-two">
              <button className="survey-back-btn" onClick={() => setStep(3)} type="button">← Back</button>
              <button className="survey-complete-btn" onClick={handleComplete} type="button">
                {locationQuery.trim() ? "Find housing for me →" : "Find housing near me →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
