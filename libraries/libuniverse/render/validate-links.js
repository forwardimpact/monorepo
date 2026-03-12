/**
 * Link Validator — validates IRI consistency and link density.
 *
 * Checks that generated HTML files contain valid cross-file IRI links
 * and that every entity meets minimum link density requirements.
 *
 * @module libuniverse/render/validate-links
 */

/**
 * Validate linked entities for IRI consistency and density.
 * @param {import('./link-assigner.js').LinkedEntities} linked
 * @param {string} domain
 * @returns {{ passed: boolean, checks: object[] }}
 */
export function validateLinks(linked, domain) {
  const checks = [
    checkIriNamespace(linked, domain),
    checkProjectLinkDensity(linked),
    checkCourseLinkDensity(linked),
    checkEventLinkDensity(linked),
    checkBlogLinkDensity(linked),
    checkPlatformDAG(linked),
    checkDrugDerivatives(linked),
    checkCoursePrerequisites(linked),
  ]

  const failures = checks.filter(c => !c.passed)
  return {
    passed: failures.length === 0,
    total: checks.length,
    failures: failures.length,
    checks,
  }
}

/**
 * Check all IRIs use the correct domain namespace.
 */
function checkIriNamespace(linked, domain) {
  const prefix = `https://${domain}/id/`
  const errors = []

  for (const proj of linked.projects) {
    if (!proj.iri.startsWith(prefix)) {
      errors.push(`Project ${proj.id}: IRI ${proj.iri} doesn't match domain`)
    }
  }
  for (const drug of linked.drugs) {
    if (!drug.iri.startsWith(prefix)) {
      errors.push(`Drug ${drug.id}: IRI ${drug.iri} doesn't match domain`)
    }
  }
  for (const plat of linked.platforms) {
    if (!plat.iri.startsWith(prefix)) {
      errors.push(`Platform ${plat.id}: IRI ${plat.iri} doesn't match domain`)
    }
  }

  return {
    name: 'iri_namespace',
    passed: errors.length === 0,
    message: errors.length === 0
      ? 'All IRIs use consistent namespace'
      : `${errors.length} IRI namespace violations: ${errors[0]}`,
  }
}

/**
 * Check every project has at least 2 cross-file links.
 */
function checkProjectLinkDensity(linked) {
  const sparse = linked.projects.filter(proj => {
    const linkCount = (proj.drugLinks?.length || 0)
      + (proj.platformLinks?.length || 0)
      + (proj.members?.length || 0)
    return linkCount < 2
  })

  return {
    name: 'project_link_density',
    passed: sparse.length === 0,
    message: sparse.length === 0
      ? 'All projects have ≥2 cross-file links'
      : `${sparse.length} projects have <2 cross-file links`,
  }
}

/**
 * Check every course has at least 2 cross-file links.
 */
function checkCourseLinkDensity(linked) {
  const sparse = linked.courses.filter(course => {
    const linkCount = (course.prerequisiteIris?.length || 0)
      + (course.platformLink ? 1 : 0)
      + (course.drugLink ? 1 : 0)
      + (course.attendees?.length || 0)
    return linkCount < 2
  })

  return {
    name: 'course_link_density',
    passed: sparse.length === 0,
    message: sparse.length === 0
      ? 'All courses have ≥2 cross-file links'
      : `${sparse.length} courses have <2 cross-file links`,
  }
}

/**
 * Check every event has at least 2 cross-file links.
 */
function checkEventLinkDensity(linked) {
  const sparse = linked.events.filter(event => {
    const linkCount = 1 // organizer
      + (event.attendees?.length || 0)
      + (event.aboutProjects?.length || 0)
      + (event.aboutDrugs?.length || 0)
      + (event.aboutPlatforms?.length || 0)
    return linkCount < 2
  })

  return {
    name: 'event_link_density',
    passed: sparse.length === 0,
    message: sparse.length === 0
      ? 'All events have ≥2 cross-file links'
      : `${sparse.length} events have <2 cross-file links`,
  }
}

/**
 * Check every blog post has at least 2 cross-file links.
 */
function checkBlogLinkDensity(linked) {
  const sparse = linked.blogPosts.filter(post => {
    const linkCount = 1 // author
      + (post.aboutDrugs?.length || 0)
      + (post.aboutPlatforms?.length || 0)
      + (post.aboutProjects?.length || 0)
      + (post.mentionsPeople?.length || 0)
    return linkCount < 2
  })

  return {
    name: 'blog_link_density',
    passed: sparse.length === 0,
    message: sparse.length === 0
      ? 'All blog posts have ≥2 cross-file links'
      : `${sparse.length} blog posts have <2 cross-file links`,
  }
}

/**
 * Check platform dependencies form a DAG (no cycles).
 */
function checkPlatformDAG(linked) {
  const platformMap = new Map(linked.platforms.map(p => [p.id, p]))
  const visited = new Set()
  const stack = new Set()
  let cycle = null

  function dfs(id) {
    if (stack.has(id)) { cycle = id; return true }
    if (visited.has(id)) return false
    visited.add(id)
    stack.add(id)

    const plat = platformMap.get(id)
    if (plat) {
      const deps = (plat.dependencies || []).map(d => typeof d === 'string' ? d : d.id)
      for (const dep of deps) {
        if (dfs(dep)) return true
      }
    }

    stack.delete(id)
    return false
  }

  for (const plat of linked.platforms) {
    if (dfs(plat.id)) break
  }

  return {
    name: 'platform_dag',
    passed: !cycle,
    message: cycle
      ? `Platform dependency cycle detected at: ${cycle}`
      : 'Platform dependencies form a valid DAG',
  }
}

/**
 * Check drug derivative references point to valid parent drugs.
 */
function checkDrugDerivatives(linked) {
  const drugIds = new Set(linked.drugs.map(d => d.id))
  const errors = linked.drugs
    .filter(d => d.parentDrug && !drugIds.has(d.parentDrug))
    .map(d => `${d.id} references unknown parent ${d.parentDrug}`)

  return {
    name: 'drug_derivatives',
    passed: errors.length === 0,
    message: errors.length === 0
      ? 'All drug derivative references are valid'
      : `${errors.length} invalid derivative references`,
  }
}

/**
 * Check course prerequisite references point to valid courses.
 */
function checkCoursePrerequisites(linked) {
  const courseIds = new Set(linked.courses.map(c => c.id))
  const errors = []
  for (const course of linked.courses) {
    for (const prereq of course.prerequisites || []) {
      if (!courseIds.has(prereq)) {
        errors.push(`${course.id} references unknown prerequisite ${prereq}`)
      }
    }
  }

  return {
    name: 'course_prerequisites',
    passed: errors.length === 0,
    message: errors.length === 0
      ? 'All course prerequisite references are valid'
      : `${errors.length} invalid prerequisite references`,
  }
}

/**
 * Validate rendered HTML files for IRI consistency.
 * @param {Map<string, string>} htmlFiles - filename → HTML content
 * @param {string} domain
 * @returns {{ passed: boolean, checks: object[] }}
 */
export function validateHTML(htmlFiles, domain) {
  const checks = [
    checkEnrichedIriNamespace(htmlFiles, domain),
    checkOrphanedLinks(htmlFiles),
  ]

  const failures = checks.filter(c => !c.passed)
  return {
    passed: failures.length === 0,
    total: checks.length,
    failures: failures.length,
    checks,
  }
}

/**
 * Scan all HTML for itemid values outside the universe domain.
 */
function checkEnrichedIriNamespace(htmlFiles, domain) {
  const errors = []
  const ITEMID_RE = /itemid="([^"]*)"/g

  for (const [filename, html] of htmlFiles) {
    for (const match of html.matchAll(ITEMID_RE)) {
      const iri = match[1]
      if (!iri.startsWith(`https://${domain}/`)) {
        errors.push(`${filename}: off-domain IRI ${iri}`)
      }
    }
  }

  return {
    name: 'enriched_iri_namespace',
    passed: errors.length === 0,
    message: errors.length === 0
      ? 'All HTML itemid values use domain namespace'
      : `${errors.length} off-domain IRIs: ${errors[0]}`,
  }
}

/**
 * Check that link href targets appear as itemid values somewhere in the corpus.
 */
function checkOrphanedLinks(htmlFiles) {
  const allItemIds = new Set()
  const allHrefs = []
  const ITEMID_RE = /itemid="([^"]*)"/g
  const LINK_HREF_RE = /<link[^>]+href="([^"]*)"/g

  for (const [, html] of htmlFiles) {
    for (const m of html.matchAll(ITEMID_RE)) allItemIds.add(m[1])
  }
  for (const [filename, html] of htmlFiles) {
    for (const m of html.matchAll(LINK_HREF_RE)) {
      const href = m[1]
      // Skip relative URLs — only check IRI references against itemid corpus
      if (!href.startsWith('https://')) continue
      if (!allItemIds.has(href)) {
        allHrefs.push(`${filename}: link href ${href} not found as any itemid`)
      }
    }
  }

  return {
    name: 'orphaned_links',
    passed: allHrefs.length === 0,
    message: allHrefs.length === 0
      ? 'All link hrefs match existing itemid values'
      : `${allHrefs.length} orphaned link hrefs: ${allHrefs[0]}`,
  }
}
