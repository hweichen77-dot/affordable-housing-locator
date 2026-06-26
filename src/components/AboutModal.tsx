import { useEffect, useRef } from "react";

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);

    const modal = modalRef.current;
    if (modal) {
      const focusable = modal.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      first?.focus();

      const trap = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      };
      document.addEventListener("keydown", trap);
      return () => {
        window.removeEventListener("keydown", handleKey);
        document.removeEventListener("keydown", trap);
      };
    }
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="modal-content about-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="about-modal-title" className="modal-title">Affordable Housing Locator</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close about dialog"
          >✕</button>
        </div>

        <div className="modal-body">
          <section className="about-section">
            <h3>The Problem</h3>
            <ul className="about-list">
              <li>Over <strong>40 million Americans</strong> pay more than they can afford for rent</li>
              <li>National median rent rose <strong>30%+ since 2020</strong></li>
              <li>Affordable housing waitlists can span <strong>months to years</strong></li>
              <li>Eligible programs are fragmented across dozens of agencies — hard to find</li>
            </ul>
          </section>

          <section className="about-section">
            <h3>What This App Does</h3>
            <p>Search <strong>50,000+ federally funded affordable housing properties</strong> across all 50 states. Filter by income level, bedroom size, and household type. Get HUD-regulated rent estimates for every unit type.</p>
            <ul className="about-list">
              <li><strong>San Jose, CA:</strong> Detailed local data from City of San Jose GeoHub</li>
              <li><strong>All other cities:</strong> HUD Low-Income Housing Tax Credit (LIHTC) 2024 database</li>
            </ul>
          </section>

          <section className="about-section">
            <h3>Understanding Income Limits (AMI)</h3>
            <p><strong>Area Median Income (AMI)</strong> is the midpoint household income for your metro area, set annually by HUD. Affordable housing programs use AMI to determine eligibility and rent.</p>
            <div className="ami-legend">
              <div className="ami-row">
                <span className="ami-dot" style={{ background: "var(--tier-eli)" }} />
                <span><strong>ELI</strong> — Extremely Low Income: up to 30% AMI</span>
              </div>
              <div className="ami-row">
                <span className="ami-dot" style={{ background: "var(--tier-vli)" }} />
                <span><strong>VLI</strong> — Very Low Income: up to 50% AMI</span>
              </div>
              <div className="ami-row">
                <span className="ami-dot" style={{ background: "var(--tier-li)" }} />
                <span><strong>LI</strong> — Low Income: up to 80% AMI</span>
              </div>
              <div className="ami-row">
                <span className="ami-dot" style={{ background: "var(--tier-mod)" }} />
                <span><strong>Moderate</strong> — up to 120% AMI</span>
              </div>
            </div>
            <p className="about-note">By federal law, LIHTC rents are capped at 30% of the income limit — ensuring housing stays affordable.</p>
          </section>

          <section className="about-section">
            <h3>How to Apply</h3>
            <ol className="about-list">
              <li>Search your city and use the income calculator to find programs you qualify for</li>
              <li>Contact properties directly about open waitlists — apply to several at once</li>
              <li>Gather documents: photo ID, Social Security cards, proof of income, bank statements, rental history</li>
              <li>Submit and follow up periodically — waitlists move faster than expected</li>
              <li>Use the status buttons on each property (Interested / Applied / Waitlisted) to track where you are</li>
            </ol>
            <p className="about-note">
              Need local help?{" "}
              <a
                className="about-link"
                href="https://www.hud.gov/program_offices/public_indian_housing/pha/contacts"
                target="_blank"
                rel="noopener noreferrer"
              >Find your local Public Housing Authority ↗</a>
            </p>
          </section>

          <section className="about-section">
            <h3>Data Sources</h3>
            <ul className="about-list">
              <li>
                <a className="about-link" href="https://data.sanjoseca.gov" target="_blank" rel="noopener noreferrer">City of San Jose GeoHub</a>
                {" "}— local affordable housing inventory
              </li>
              <li>
                <a className="about-link" href="https://www.huduser.gov/portal/datasets/lihtc.html" target="_blank" rel="noopener noreferrer">HUD National LIHTC Database (2024)</a>
                {" "}— 50,000+ properties nationwide
              </li>
              <li>
                <a className="about-link" href="https://www.huduser.gov/portal/datasets/il.html" target="_blank" rel="noopener noreferrer">HUD FY2024 Income Limits</a>
                {" "}— AMI and rent calculations
              </li>
              <li>
                <a className="about-link" href="https://nominatim.openstreetmap.org" target="_blank" rel="noopener noreferrer">OpenStreetMap / Nominatim</a>
                {" "}— geocoding
              </li>
            </ul>
          </section>

          <section className="about-section">
            <h3>Keyboard Shortcuts</h3>
            <div className="shortcut-grid">
              <kbd>/</kbd><span>Focus search</span>
              <kbd>?</kbd><span>Open this guide</span>
              <kbd>↑ ↓</kbd><span>Navigate results</span>
              <kbd>Esc</kbd><span>Back / close</span>
            </div>
          </section>

          <div className="about-footer">
            Built for the <strong>Congressional App Challenge</strong> · Open source · Data updated 2024
          </div>
        </div>
      </div>
    </div>
  );
}
