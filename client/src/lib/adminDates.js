// datetime-local inputs use the browser timezone; API timestamps use UTC.
export function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
export function toApiDateTime(value) {
  return value ? new Date(value).toISOString() : null;
}
