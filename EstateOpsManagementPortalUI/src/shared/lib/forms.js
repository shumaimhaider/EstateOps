/**
 * Formik + Zod glue. Forms validate on the client with the same Zod schema they
 * submit with; server field errors (already renamed to form fields by the
 * repository) are pushed back with applyServerErrors.
 */

/** Returns a Formik `validate` function backed by a Zod schema. */
export function zodValidate(schema) {
  return (values) => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return errors;
  };
}

/** Pushes server field errors into Formik. Returns true when any field error was applied. */
export function applyServerErrors(helpers, error) {
  const fieldErrors = error?.fieldErrors ?? {};
  if (Object.keys(fieldErrors).length === 0) return false;
  helpers.setErrors(fieldErrors);
  return true;
}
