// Clean fixture: generic process.env access that must NOT trip the BYOK
// scanner — no @anthropic-ai import and no ANTHROPIC_-prefixed env name.
// Guards against the over-broad `} = process.env` regex regressing.
const { PORT, HOST } = process.env;
const region = process.env.AWS_REGION;
export const cfg = { PORT, HOST, region };
