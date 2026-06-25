export const ROWS = [
  {
    id: "add-reporting",
    target: { teamId: "platform" },
    cliOpts: { add: "{ discipline: software-engineering, level: J060 }" },
  },
  {
    id: "add-project",
    target: { projectId: "migration-q2" },
    cliOpts: {
      add: "{ discipline: software-engineering, level: J060 }",
      allocation: "0.5",
    },
  },
  {
    id: "remove",
    target: { teamId: "platform" },
    cliOpts: { remove: "Bob" },
  },
  {
    id: "promote",
    target: { teamId: "platform" },
    cliOpts: { promote: "Carol" },
  },
  {
    id: "promote-focus",
    target: { teamId: "platform" },
    cliOpts: { promote: "Carol", focus: "delivery" },
  },
];
