export function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet programs can execute formulas even inside quoted CSV cells.
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
