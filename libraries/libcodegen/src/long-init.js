// protobufjs populates `util.Long` through a dynamic `inquire("long")`.
// `bun build --compile` cannot resolve that call, so `util.Long` stays
// undefined when the code computes a 64-bit field default. The compiled
// fit-codegen binary then crashes at startup
// (`util.Long.fromNumber is not a function`). Bind it explicitly.
//
// Two entry points import this module for its side effect.
// `bin/fit-codegen.js` imports it ahead of the `@grpc/proto-loader` import,
// whose descriptor extension runs `resolveAll()` at module-evaluation time.
// base.js imports it ahead of its own runtime `Root.resolveAll()`. ES module
// imports evaluate in source order, so an ordered side-effect import binds
// before the code loads any proto. A bind statement placed inline in an entry
// body would not bind in time, because imports hoist above it.
import protobuf from "protobufjs";
import Long from "long";

protobuf.util.Long = Long;
protobuf.configure();
