// protobufjs populates `util.Long` through a dynamic `inquire("long")` that
// `bun build --compile` cannot resolve, leaving it undefined when a 64-bit
// field default is computed — crashing the compiled fit-codegen binary at
// startup (`util.Long.fromNumber is not a function`). Bind it explicitly.
//
// Imported for its side effect both by `bin/fit-codegen.js` (ahead of the
// `@grpc/proto-loader` import, whose descriptor extension runs `resolveAll()`
// at module-evaluation time) and by base.js (ahead of its own runtime
// `Root.resolveAll()`). ES module imports evaluate in source order, so an
// ordered side-effect import binds before the proto-loading code runs —
// inline binding statements in an entry body would not, since imports hoist
// above them.
import protobuf from "protobufjs";
import Long from "long";

protobuf.util.Long = Long;
protobuf.configure();
