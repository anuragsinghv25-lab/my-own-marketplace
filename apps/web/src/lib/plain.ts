/** What a value looks like after crossing from a server component to a client one (Dates become strings). */
export type Jsonify<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonify<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonify<T[K]> }
      : T;

export const plain = <T,>(x: T): Jsonify<T> => JSON.parse(JSON.stringify(x));
