/**
 * Enricher — Pass 2 LLM enrichment of prose blocks.
 *
 * Finds all elements with `data-enrich` attributes in Pass 1 HTML,
 * calls ProseEngine to generate rich prose with inline microdata,
 * and replaces placeholder content.
 *
 * @module libuniverse/render/enricher
 */

import { createLogger } from '@forwardimpact/libtelemetry'

const log = createLogger('universe')

/**
 * Regex to find data-enrich blocks and their content.
 * Matches: <div ... data-enrich="key"> ... </div>
 */
const ENRICH_PATTERN = /(<div[^>]+data-enrich="([^"]+)"[^>]*>)([\s\S]*?)(<\/div>)/g

/**
 * Build entity context for enrichment from linked entities.
 * @param {string} enrichKey
 * @param {object} linked - LinkedEntities from link-assigner
 * @returns {{ entityType: string, entityName: string, mentionTargets: object[] } | null}
 */
function buildEnrichContext(enrichKey, linked) {
  const [type, ...rest] = enrichKey.split('_')
  const id = rest.join('_')

  switch (type) {
    case 'project': {
      const proj = linked.projects.find(p => p.id === id)
      if (!proj) return null
      const mentions = [
        ...proj.drugLinks.map(d => ({ type: 'Drug', name: d.name, iri: d.iri })),
        ...proj.platformLinks.map(p => ({ type: 'SoftwareApplication', name: p.name, iri: p.iri })),
        ...proj.members.slice(0, 3).map(m => ({ type: 'Person', name: m.name, iri: m.iri })),
      ]
      return { entityType: 'Project', entityName: proj.name, mentionTargets: mentions }
    }
    case 'platform': {
      const plat = linked.platforms.find(p => p.id === id)
      if (!plat) return null
      const deps = plat.dependencies || []
      const depPlatforms = deps.map(d =>
        linked.platforms.find(p => p.id === (typeof d === 'string' ? d : d.id))
      ).filter(Boolean)
      const mentions = [
        ...depPlatforms.map(p => ({ type: 'SoftwareApplication', name: p.name, iri: p.iri })),
        ...(plat.projectLinks || []).slice(0, 2).map(p => ({ type: 'Project', name: p.name, iri: p.iri })),
        ...(plat.drugLinks || []).slice(0, 2).map(d => ({ type: 'Drug', name: d.name, iri: d.iri })),
      ]
      return { entityType: 'SoftwareApplication', entityName: plat.name, mentionTargets: mentions }
    }
    case 'drug': {
      const drug = linked.drugs.find(d => d.id === id)
      if (!drug) return null
      const mentions = [
        ...(drug.projectLinks || []).slice(0, 2).map(p => ({ type: 'Project', name: p.name, iri: p.iri })),
        ...(drug.platformLinks || []).slice(0, 2).map(p => ({ type: 'SoftwareApplication', name: p.name, iri: p.iri })),
      ]
      if (drug.parentDrug) {
        const parent = linked.drugs.find(d => d.id === drug.parentDrug)
        if (parent) mentions.push({ type: 'Drug', name: parent.name, iri: parent.iri })
      }
      return { entityType: 'Drug', entityName: drug.name, mentionTargets: mentions }
    }
    case 'course': {
      const course = linked.courses.find(c => c.id === id)
      if (!course) return null
      const mentions = [
        ...(course.platformLink ? [{ type: 'SoftwareApplication', name: course.platformLink.name, iri: course.platformLink.iri }] : []),
        ...(course.drugLink ? [{ type: 'Drug', name: course.drugLink.name, iri: course.drugLink.iri }] : []),
        ...course.attendees.slice(0, 2).map(a => ({ type: 'Person', name: a.name, iri: a.iri })),
      ]
      return { entityType: 'Course', entityName: course.title, mentionTargets: mentions }
    }
    case 'event': {
      const idx = parseInt(id, 10) - 1
      const event = linked.events[idx]
      if (!event) return null
      const mentions = [
        { type: 'Person', name: event.organizer.name, iri: event.organizer.iri },
        ...event.aboutProjects.slice(0, 2).map(p => ({ type: 'Project', name: p.name, iri: p.iri })),
        ...event.aboutDrugs.slice(0, 2).map(d => ({ type: 'Drug', name: d.name, iri: d.iri })),
        ...event.attendees.slice(0, 2).map(a => ({ type: 'Person', name: a.name, iri: a.iri })),
      ]
      return { entityType: 'Event', entityName: event.title, mentionTargets: mentions }
    }
    case 'blog': {
      const idx = parseInt(id, 10) - 1
      const post = linked.blogPosts[idx]
      if (!post) return null
      const mentions = [
        ...post.aboutDrugs.slice(0, 2).map(d => ({ type: 'Drug', name: d.name, iri: d.iri })),
        ...post.aboutPlatforms.slice(0, 2).map(p => ({ type: 'SoftwareApplication', name: p.name, iri: p.iri })),
        ...post.mentionsPeople.slice(0, 3).map(p => ({ type: 'Person', name: p.name, iri: p.iri })),
      ]
      return { entityType: 'BlogPosting', entityName: post.headline, mentionTargets: mentions }
    }
    case 'article': {
      const article = linked.articles?.find(a => a.topic === id)
      if (!article) return null
      const mentions = [
        ...(article.drugLinks || []).slice(0, 2).map(d => ({ type: 'Drug', name: d.name, iri: d.iri })),
        ...(article.platformLinks || []).slice(0, 2).map(p => ({ type: 'SoftwareApplication', name: p.name, iri: p.iri })),
        ...(article.projectLinks || []).slice(0, 2).map(p => ({ type: 'Project', name: p.name, iri: p.iri })),
        ...(article.authorLinks || []).slice(0, 2).map(a => ({ type: 'Person', name: a.name, iri: a.iri })),
      ]
      return { entityType: 'ScholarlyArticle', entityName: article.title, mentionTargets: mentions }
    }
    default:
      return null
  }
}

/**
 * Build the LLM prompt for enriching a prose block.
 * @param {object} ctx - Context from buildEnrichContext
 * @param {string} placeholder - Current placeholder text
 * @param {string} domain - Universe domain for IRI constraint
 * @returns {object[]} Messages array for ProseEngine.generateStructured
 */
function buildEnrichMessages(ctx, placeholder, domain) {
  const mentionList = ctx.mentionTargets.map(m =>
    `- ${m.type}: ${m.name} (${m.iri})`
  ).join('\n')

  const system = `You are a technical writer producing HTML content with Schema.org microdata for a pharmaceutical company knowledge base.
Output only the inner HTML content — no wrapper tags, no markdown fences.
Write 300-500 words of detailed, rich prose across multiple paragraphs. Mention entities using inline Schema.org microdata spans.
Only use the exact IRIs provided. Do not invent new IRIs. All itemid values must start with "https://${domain}/id/".`

  const user = `Rewrite this text block for a ${ctx.entityType} document about "${ctx.entityName}".

Current text: "${placeholder}"

Write 300-500 words of detailed prose across 3-5 paragraphs. Naturally mention these entities using Schema.org microdata:

${mentionList}

Use this pattern for inline mentions:
<span itemprop="mentions" itemscope itemtype="https://schema.org/{{type}}" itemid="{{iri}}"><span itemprop="name">{{name}}</span></span>

Output only the HTML content for the block — no wrapper tags.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Strip or sanitize itemid attributes that don't match the universe domain.
 * @param {string} html
 * @param {string} domain
 * @returns {string}
 */
function stripOffDomainIris(html, domain) {
  const prefix = `https://${domain}/id/`
  return html.replace(
    /(<[^>]*?)\s+itemscope\s+itemtype="[^"]*"\s+itemid="([^"]*)"/g,
    (match, before, iri) => {
      if (iri.startsWith(prefix)) return match
      return before
    },
  ).replace(
    /(<[^>]*?)\s+itemid="([^"]*)"\s+itemscope\s+itemtype="[^"]*"/g,
    (match, before, iri) => {
      if (iri.startsWith(prefix)) return match
      return before
    },
  ).replace(
    /(<[^>]*?)\s+itemid="([^"]*)"/g,
    (match, before, iri) => {
      if (iri.startsWith(prefix)) return match
      return before
    },
  )
}

/**
 * Close any unclosed HTML tags in LLM-generated prose.
 * Tracks open/close tags and appends missing closing tags.
 * @param {string} html
 * @returns {string}
 */
function balanceTags(html) {
  const VOID = new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'])
  const stack = []
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g
  let m
  while ((m = tagRe.exec(html)) !== null) {
    const full = m[0]
    const tag = m[1].toLowerCase()
    if (VOID.has(tag) || full.endsWith('/>')) continue
    if (full.startsWith('</')) {
      const idx = stack.lastIndexOf(tag)
      if (idx !== -1) stack.splice(idx, 1)
    } else {
      stack.push(tag)
    }
  }
  let suffix = ''
  for (let i = stack.length - 1; i >= 0; i--) {
    suffix += `</${stack[i]}>`
  }
  return html + suffix
}

/**
 * Enrich all prose blocks in HTML documents via LLM.
 * @param {Map<string, string>} htmlFiles - filename → HTML content from Pass 1
 * @param {object} linked - LinkedEntities from link-assigner
 * @param {import('../engine/prose.js').ProseEngine} proseEngine
 * @returns {Promise<Map<string, string>>} filename → enriched HTML content
 */
export async function enrichDocuments(htmlFiles, linked, proseEngine, domain) {
  const enriched = new Map()
  let totalBlocks = 0
  let enrichedBlocks = 0

  for (const [filename, html] of htmlFiles) {
    let result = html
    const matches = [...html.matchAll(ENRICH_PATTERN)]
    totalBlocks += matches.length

    for (const match of matches) {
      const [, openTag, enrichKey, content, closeTag] = match
      const ctx = buildEnrichContext(enrichKey, linked)
      if (!ctx) continue

      const placeholder = content.replace(/<[^>]+>/g, '').trim()
      const messages = buildEnrichMessages(ctx, placeholder, domain)
      let prose = await proseEngine.generateStructured(`enrich_${enrichKey}`, messages)

      if (prose) {
        if (domain) prose = stripOffDomainIris(prose, domain)
        prose = balanceTags(prose)
        const cleanOpen = openTag.replace(/\s*data-enrich="[^"]*"/, '')
        result = result.replace(match[0], `${cleanOpen}\n      ${prose}\n    ${closeTag}`)
        enrichedBlocks++
      }
    }

    enriched.set(filename, result)
  }

  log.info('enricher', `Enriched ${enrichedBlocks}/${totalBlocks} prose blocks`)
  return enriched
}
