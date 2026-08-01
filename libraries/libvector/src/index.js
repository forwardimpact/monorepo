// This module does NOT export VectorProcessor. That avoids unnecessary
// dependencies. Import VectorProcessor from ./processor/vector.js.
// This module does NOT export VectorIndex. That avoids a circular
// dependency. Import VectorIndex from ./index/vector.js.

export { calculateDotProduct } from "./index/vector.js";
