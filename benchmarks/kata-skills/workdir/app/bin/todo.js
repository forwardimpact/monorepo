#!/usr/bin/env node
// Thin CLI shell over src/store.js. Arg parsing uses node:util.parseArgs so the
// fixture stays dependency-free.

import { parseArgs } from "node:util";

import {
  storePath,
  load,
  save,
  addTodo,
  completeTodo,
  formatTodo,
} from "../src/store.js";

const USAGE = `todo — a tiny todo list

Usage:
  todo add "<text>"   Add a todo
  todo list           List all todos
  todo done <id>      Mark a todo complete
`;

function main(argv) {
  const { positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
  });
  const [command, ...rest] = positionals;
  const path = storePath();
  const todos = load(path);

  switch (command) {
    case "add": {
      const todo = addTodo(todos, rest.join(" "));
      save(path, todos);
      console.log(`added ${todo.id}`);
      break;
    }
    case "list": {
      for (const todo of todos) console.log(formatTodo(todo));
      break;
    }
    case "done": {
      completeTodo(todos, Number(rest[0]));
      save(path, todos);
      console.log(`done ${rest[0]}`);
      break;
    }
    default:
      process.stdout.write(USAGE);
  }
}

main(process.argv.slice(2));
