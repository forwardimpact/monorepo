# Entity Ontology

Domain: `https://{{domain}}`

## Organizations

{{#orgs}}
- [{{name}}]({{{iri}}})
{{/orgs}}

## Departments

{{#departments}}
- [{{name}}]({{{iri}}})
{{/departments}}

## Teams

{{#teams}}
- [{{name}}]({{{iri}}})
{{/teams}}

## People

{{#people}}
- [{{name}}]({{{iri}}}) — {{discipline}} {{level}}
{{/people}}
{{#hasMore}}
- ... and {{moreCount}} more
{{/hasMore}}

## Projects

{{#projects}}
- [{{name}}]({{{iri}}})
{{/projects}}
