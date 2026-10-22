/** Validates input at the edge with a Zod schema. Failures become 422 VALIDATION_ERROR. */
export const parse = (schema, data) => schema.parse(data);
