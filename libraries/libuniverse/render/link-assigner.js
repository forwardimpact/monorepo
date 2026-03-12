/**
 * Link Assigner — deterministic cross-link assignment between entities.
 *
 * Assigns drugs to projects, platforms to projects, people to events/courses,
 * and builds all cross-entity relationships using seeded random for
 * reproducibility.
 *
 * @module libuniverse/render/link-assigner
 */

import { createSeededRNG } from '../engine/rng.js'

/**
 * @typedef {object} LinkedEntities
 * @property {object[]} drugs
 * @property {object[]} platforms
 * @property {object[]} projects - enriched with drug/platform/people links
 * @property {object[]} courses - enriched with prereqs, attendees, platform/drug links
 * @property {object[]} events - enriched with organizer, attendees, about links
 * @property {object[]} blogPosts - enriched with author, about, mentions
 */

/**
 * Assign cross-links between all entity types deterministically.
 * @param {object} params
 * @param {object[]} params.drugs
 * @param {object[]} params.platforms
 * @param {object[]} params.projects
 * @param {object[]} params.people
 * @param {object[]} params.teams
 * @param {object[]} params.departments
 * @param {string} params.domain
 * @param {number} params.courseCount
 * @param {number} params.eventCount
 * @param {number} params.blogCount
 * @param {string[]} [params.articleTopics=[]]
 * @param {number} [params.seed=42]
 * @returns {LinkedEntities}
 */
export function assignLinks({
  drugs, platforms, projects, people, teams, departments,
  domain, courseCount, eventCount, blogCount, articleTopics = [], seed = 42,
}) {
  const rng = createSeededRNG(seed + 1000)
  const base = `https://${domain}`

  // --- Project linking ---
  const linkedProjects = projects.map(proj => {
    const projectTeams = teams.filter(t => proj.teams.includes(t.id))
    const projectPeople = people.filter(p => projectTeams.some(t => t.id === p.team_id))
    const leader = projectPeople.find(p => p.is_manager) || rng.pick(projectPeople)
    const members = rng.shuffle(projectPeople).slice(0, Math.min(8, projectPeople.length))

    // Assign drugs to drug/platform projects
    const drugLinks = proj.type === 'drug'
      ? [drugs.find(d => d.id === proj.id) || rng.pick(drugs)]
      : [rng.pick(drugs)]
    const platformLinks = proj.type === 'platform'
      ? [platforms.find(p => p.id === proj.id) || rng.pick(platforms)]
      : rng.shuffle(platforms).slice(0, 2)
    const deptLinks = [...new Set(projectTeams.map(t => t.department))]
      .map(dId => departments.find(d => d.id === dId))
      .filter(Boolean)

    return {
      ...proj,
      iri: `${base}/id/project/${proj.id}`,
      leader,
      members,
      drugLinks,
      platformLinks,
      departmentLinks: deptLinks,
    }
  })

  // --- Course linking ---
  const COURSE_CATALOG = [
    { id: 'PHARM-101', title: 'Introduction to Drug Discovery', category: 'Drug Discovery' },
    { id: 'PHARM-201', title: 'Clinical Data Management', category: 'Clinical' },
    { id: 'PHARM-301', title: 'Advanced Pharmacology', category: 'Drug Discovery' },
    { id: 'GMP-101', title: 'GMP Compliance Essentials', category: 'Manufacturing' },
    { id: 'GMP-201', title: 'GMP Advanced Practices', category: 'Manufacturing' },
    { id: 'STAT-101', title: 'Pharmaceutical Statistics', category: 'Analytics' },
    { id: 'STAT-201', title: 'Biostatistics for Trials', category: 'Analytics' },
    { id: 'BIO-101', title: 'Molecular Biology Fundamentals', category: 'Genomics' },
    { id: 'BIO-201', title: 'Genomics and Sequencing', category: 'Genomics' },
    { id: 'REG-101', title: 'Regulatory Submissions', category: 'Regulatory' },
    { id: 'DATA-101', title: 'Data Engineering for Pharma', category: 'Data Infrastructure' },
    { id: 'DATA-201', title: 'Machine Learning Pipelines', category: 'AI/ML' },
    { id: 'AI-101', title: 'AI in Drug Development', category: 'AI/ML' },
    { id: 'QA-101', title: 'Quality Assurance Methods', category: 'Quality' },
    { id: 'SEC-101', title: 'Cloud Infrastructure Security', category: 'Security' },
  ]

  const coursesToGenerate = Math.min(courseCount, COURSE_CATALOG.length)
  const linkedCourses = COURSE_CATALOG.slice(0, coursesToGenerate).map((course, i) => {
    // Build prerequisite chains: 201 courses require 101 in same category
    const prereqs = []
    if (course.id.includes('201')) {
      const base101 = COURSE_CATALOG.find(c =>
        c.id.includes('101') && c.category === course.category)
      if (base101) prereqs.push(base101.id)
    }
    if (course.id.includes('301')) {
      const base201 = COURSE_CATALOG.find(c =>
        c.id.includes('201') && c.category === course.category)
      if (base201) prereqs.push(base201.id)
    }

    // Assign platform and drug links by category
    const relatedPlatforms = platforms.filter(p => p.category === course.category)
    const platformLink = relatedPlatforms.length > 0 ? rng.pick(relatedPlatforms) : rng.pick(platforms)
    const drugLink = rng.pick(drugs)

    // Assign attendees
    const attendees = rng.shuffle(people).slice(0, rng.randomInt(3, 8))

    return {
      ...course, index: i + 1,
      iri: `${base}/id/course/${course.id}`,
      prerequisites: prereqs,
      prerequisiteIris: prereqs.map(pid => `${base}/id/course/${pid}`),
      platformLink,
      drugLink,
      attendees,
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
      orgName: 'BioNova',
      orgIri: `${base}/org/headquarters`,
    }
  })

  // --- Event linking ---
  const EVENT_CATALOG = [
    'Engineering All-Hands',
    'Tech Talk: AI in Pharma',
    'Hackathon 2025',
    'Architecture Review Board',
    'Sprint Demo Day',
    'Drug Discovery Symposium',
    'Compliance Training Day',
    'Platform Migration Workshop',
    'Data Science Summit',
    'Security Awareness Week',
  ]
  const eventsToGenerate = Math.min(eventCount, EVENT_CATALOG.length)
  const linkedEvents = Array.from({ length: eventsToGenerate }, (_, i) => {
    const organizer = rng.pick(people.filter(p => p.is_manager))
    const attendees = rng.shuffle(people).slice(0, rng.randomInt(5, 15))
    const aboutProjects = rng.shuffle(linkedProjects).slice(0, rng.randomInt(1, 3))
    const aboutDrugs = rng.shuffle(drugs).slice(0, rng.randomInt(0, 2))
    const aboutPlatforms = rng.shuffle(platforms).slice(0, rng.randomInt(1, 2))

    return {
      index: i + 1,
      title: EVENT_CATALOG[i % EVENT_CATALOG.length],
      iri: `${base}/id/event/event-${i + 1}`,
      organizer,
      attendees,
      aboutProjects,
      aboutDrugs,
      aboutPlatforms,
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-15`,
      location: 'Cambridge, MA',
      eventStatus: 'EventScheduled',
    }
  })

  // --- Blog post linking ---
  const BLOG_TOPICS = [
    'AI-Driven Drug Discovery at BioNova',
    'Our Journey to Cloud-Native Infrastructure',
    'Building a Culture of Engineering Excellence',
    'How We Scaled Our Clinical Data Pipeline',
    'Machine Learning in Pharmaceutical Manufacturing',
    'Security Best Practices for Life Sciences',
    'Developer Experience: What We Learned',
    'The Future of Genomics Technology',
    'Cross-Functional Collaboration in Drug Development',
    'Real-World Evidence and Data Analytics',
    'Platform Engineering at Scale',
    'Regulatory Technology Innovation',
    'Quality Engineering in a GMP Environment',
    'Data Mesh Architecture for Pharma',
    'Open Source in Pharmaceutical R&D',
  ]

  const linkedBlogPosts = Array.from({ length: blogCount }, (_, i) => {
    const author = rng.pick(people)
    const aboutDrugs = rng.shuffle(drugs).slice(0, rng.randomInt(1, 3))
    const aboutPlatforms = rng.shuffle(platforms).slice(0, rng.randomInt(1, 3))
    const aboutProjects = rng.shuffle(linkedProjects).slice(0, rng.randomInt(0, 2))
    const mentionsPeople = rng.shuffle(people.filter(p => p.id !== author.id)).slice(0, rng.randomInt(1, 4))

    const keywords = [
      ...aboutDrugs.map(d => d.name),
      ...aboutPlatforms.map(p => p.name),
    ]

    return {
      index: i + 1,
      headline: BLOG_TOPICS[i % BLOG_TOPICS.length],
      iri: `${base}/id/blog/blog-${i + 1}`,
      identifier: `BLOG-2025-${String(i + 1).padStart(3, '0')}`,
      author,
      aboutDrugs,
      aboutPlatforms,
      aboutProjects,
      mentionsPeople,
      keywords: keywords.join(', '),
      date: `2025-${String(Math.floor(i / 2) + 1).padStart(2, '0')}-${String(10 + (i % 20)).padStart(2, '0')}`,
    }
  })

  // --- Article linking ---
  const TOPIC_ENTITY_MAP = {
    clinical: { drugFilter: d => ['oncora', 'cardioguard', 'immunex-pro'].includes(d.id), platformCategory: 'Clinical' },
    data_ai: { drugFilter: () => true, platformCategory: 'AI/ML' },
    drug_discovery: { drugFilter: () => true, platformCategory: 'Drug Discovery' },
    manufacturing: { drugFilter: d => ['genova-rna', 'dermashield'].includes(d.id), platformCategory: 'Manufacturing' },
  }

  const linkedArticles = articleTopics.map((topic, i) => {
    const topicTitle = topic.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const mapping = TOPIC_ENTITY_MAP[topic] || { drugFilter: () => true, platformCategory: null }

    const drugLinks = drugs.filter(mapping.drugFilter).slice(0, 3)
    const platformLinks = mapping.platformCategory
      ? platforms.filter(p => p.category === mapping.platformCategory).slice(0, 3)
      : rng.shuffle(platforms).slice(0, 3)
    const projectLinks = rng.shuffle(linkedProjects).slice(0, 2)
    const authorLinks = rng.shuffle(people).slice(0, 2)

    return {
      topic,
      title: topicTitle,
      iri: `${base}/id/article/${topic}`,
      identifier: `ART-${topic.toUpperCase().replace(/_/g, '-')}-001`,
      author: authorLinks[0],
      authorLinks,
      drugLinks,
      platformLinks,
      projectLinks,
      keywords: [...drugLinks.map(d => d.name), ...platformLinks.map(p => p.name)].join(', '),
      date: `2025-${String((i % 12) + 1).padStart(2, '0')}-01`,
    }
  })

  return {
    drugs,
    platforms,
    projects: linkedProjects,
    courses: linkedCourses,
    events: linkedEvents,
    blogPosts: linkedBlogPosts,
    articles: linkedArticles,
  }
}
