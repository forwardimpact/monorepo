/**
 * HTML renderer helpers — enrichment functions and FAQ data.
 *
 * Extracted from html.js to reduce file length.
 *
 * @module libuniverse/render/html-helpers
 */

export const FAQ_QUESTIONS = [
  "What is pharmaceutical engineering and what does it involve?",
  "How does computational chemistry accelerate drug discovery?",
  "What are the key phases of clinical trial development?",
  "How does GMP compliance affect manufacturing processes?",
  "What role does data science play in pharmaceutical R&D?",
  "How are biomarkers used in drug development?",
  "What is the drug approval process and how long does it take?",
  "How does continuous manufacturing differ from batch processing?",
  "What are the main challenges in scaling up drug production?",
  "How do platform engineering teams support drug discovery?",
  "What regulatory frameworks govern pharmaceutical development?",
  "How is AI being used in drug candidate screening?",
  "What quality control measures ensure drug safety?",
  "How does real-world evidence complement clinical trials?",
  "What are the key considerations for biologics manufacturing?",
  "How do cross-functional teams collaborate in drug development?",
  "What is the role of process analytical technology in manufacturing?",
  "How are digital twins used in pharmaceutical engineering?",
  "What sustainability practices are used in drug manufacturing?",
  "How does pharmacovigilance work after drug approval?",
  "What are the differences between small molecule and biologic drugs?",
  "How do adaptive trial designs improve clinical development?",
  "What is the role of observability in manufacturing systems?",
  "How are cloud platforms used in pharmaceutical data management?",
  "What are the key challenges in supply chain management for pharma?",
  "How does formulation science affect drug delivery?",
  "What are the best practices for laboratory data management?",
  "How do engineering teams handle regulatory submission preparation?",
  "What is the role of DevOps in pharmaceutical software systems?",
  "How are patient-reported outcomes used in clinical development?",
  "What are the principles of quality by design in drug manufacturing?",
  "How does risk management apply to pharmaceutical engineering?",
  "What emerging technologies are transforming drug development?",
  "How do companies manage intellectual property in pharma R&D?",
  "What role does environmental monitoring play in GMP facilities?",
];

/**
 * Enrich platforms with reverse links from projects and drugs.
 * @param {object} linked
 * @returns {object[]}
 */
export function enrichPlatformsWithLinks(linked) {
  return linked.platforms.map((plat) => {
    const depObjects = (plat.dependencies || [])
      .map((depId) => linked.platforms.find((p) => p.id === depId))
      .filter(Boolean);

    const projectLinks = linked.projects
      .filter((proj) => proj.platformLinks.some((pl) => pl.id === plat.id))
      .slice(0, 3);

    const drugLinks = linked.drugs
      .filter(
        (d) =>
          d.platformLinks && d.platformLinks.some((pl) => pl.id === plat.id),
      )
      .slice(0, 2);

    return {
      ...plat,
      dependencies: depObjects,
      projectLinks,
      drugLinks,
    };
  });
}

/**
 * Enrich drugs with reverse links from projects, platforms, events.
 * @param {object} linked
 * @returns {object[]}
 */
export function enrichDrugsWithLinks(linked) {
  const base = linked.drugs[0]?.iri?.replace(/\/id\/drug\/.*/, "") || "";

  return linked.drugs.map((drug) => {
    const projectLinks = linked.projects
      .filter((proj) => proj.drugLinks.some((dl) => dl.id === drug.id))
      .slice(0, 3);

    const platformIds = new Set();
    for (const proj of projectLinks) {
      for (const pl of proj.platformLinks) platformIds.add(pl.id);
    }
    const platformLinks = linked.platforms
      .filter((p) => platformIds.has(p.id))
      .slice(0, 3);

    const eventLinks = linked.events
      .filter((e) => e.aboutDrugs.some((d) => d.id === drug.id))
      .slice(0, 2);

    const parentDrugIri = drug.parentDrug
      ? `${base}/id/drug/${drug.parentDrug}`
      : null;

    return {
      ...drug,
      projectLinks,
      platformLinks,
      eventLinks,
      parentDrugIri,
    };
  });
}
