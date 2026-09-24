const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain' };
export function commentFileType(file) {
  const type = types[file.name.split('.').pop().toLowerCase()];
  return type && (!file.type || file.type === type) ? type : null;
}
