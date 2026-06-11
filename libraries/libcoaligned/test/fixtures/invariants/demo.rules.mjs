// Minimal rule module exercising the loader contract: a default export of
// `{ name, build, rules }` whose subjects come from `build`.

export default {
  name: "demo",

  build: async () => ({
    subjects: {
      thing: [
        { path: "/repo/a.txt", count: 3 },
        { path: "/repo/b.txt", count: 1 },
      ],
    },
    ctx: { max: 2 },
  }),

  rules: [
    {
      id: "demo.count",
      scope: "thing",
      severity: "fail",
      check: (s, c) => (s.count > c.max ? { count: s.count } : null),
      message: (s, r) => `count ${r.count} exceeds the maximum`,
      hint: "lower the count",
    },
  ],
};
