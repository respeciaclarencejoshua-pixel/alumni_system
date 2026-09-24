import test from 'node:test';
import assert from 'node:assert/strict';
import { commentFileType } from '../../client/src/lib/commentAttachments.js';

test('comment files accept supported formats and infer empty browser MIME types', () => {
  assert.equal(commentFileType({ name: 'Reunion.PDF', type: 'application/pdf' }), 'application/pdf');
  assert.equal(commentFileType({ name: 'notes.txt', type: '' }), 'text/plain');
  assert.equal(commentFileType({ name: 'photo.jpg', type: 'image/jpeg' }), 'image/jpeg');
});
test('comment files reject unsupported formats and mismatched MIME types', () => {
  for (const name of ['script.html', 'picture.svg', 'archive.zip', 'file.exe']) {
    assert.equal(commentFileType({ name, type: '' }), null);
  }
  assert.equal(commentFileType({ name: 'fake.png', type: 'text/html' }), null);
});
