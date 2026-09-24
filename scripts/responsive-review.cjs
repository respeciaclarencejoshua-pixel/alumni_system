// Local, synthetic browser review. All API/Supabase requests are intercepted.
// Usage: set PLAYWRIGHT_MODULE to an installed playwright module, start Vite,
// then node scripts/responsive-review.cjs. Screenshots go to the OS temp folder.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const env = fs.readFileSync(path.join(__dirname, '../client/.env.local'), 'utf8');
const supabaseUrl = env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)?.[1];
if (!supabaseUrl) throw new Error('Local VITE_SUPABASE_URL is required for this review.');
const reviewOrigin = process.env.REVIEW_ORIGIN || 'http://127.0.0.1:5173';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'alumni-responsive-'));
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'review@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: { first_name: 'Review', last_name: 'Administrator' } };
const profile = { ...user, first_name: 'Review', last_name: 'Administrator', role: 'admin', status: 'verified', avatar_url: null };
const person = { ...profile, id: '00000000-0000-4000-8000-000000000002', first_name: 'Maria Teresa', last_name: 'Dela Cruz', email: 'maria.teresa.delacruz@example.test', course: 'Bachelor of Science in Business Administration', graduation_year: 1998, connection_status: 'none' };
const scopes = ['dashboard','members','verification','opportunities','events','moderation','gallery','analytics','settings'];
const session = { user, access_token: `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.test`, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer' };
const verification = { id: 'review-record', user_id: person.id, profiles: person, status: 'pending', program: person.course, graduation_year: 1998, submission_age_days: 2, priority: 'normal', scan_status: 'pending', document_filename: 'Graduation-certificate-for-review.jpeg' };
const sampleEvent = { id: 'sample-event', title: 'Alumni homecoming and community service gathering', description: 'Reconnect with classmates and welcome our newest graduates.', date: '2027-12-15T08:00:00Z', location: 'University campus, General Santos City', category: 'Reunion', status: 'published' };
function apiData(url) {
  const p = url.pathname;
  if (p === '/api/gifs') return { gifs: [{ id: 'g', title: 'Happy alumni', images: { fixed_height_small: { url: 'https://media.giphy.com/media/test/giphy.gif' } } }] };
  if (p === '/api/config') return { captchaEnabled: false, allowOpenSignups: true };
  if (p === '/api/events') return { events: [sampleEvent] };
  if (p === '/api/home') return { news: [{ id: 'news', title: 'Welcome back to the NDDU alumni community', description: 'Stay in touch with your university and classmates.' }], metrics: { alumni: 1500, events: 8, opportunities: 12, photos: 30 } };
  if (p === '/api/admin/resources/events') return { resources: [{ id: sampleEvent.id, payload: sampleEvent }] };
  if (p === '/api/admin/me') return { user: profile, permission: { admin_role: 'super_admin', scopes } };
  if (p === '/api/admin/overview') return { metrics: {}, demographics: {}, activity: [] };
  if (p === '/api/admin/analytics') return { metrics: {}, breakdowns: { verification: [], reports: [], attendance: [], opportunities: [] } };
  if (p === '/api/admin/verifications') return { verifications: [verification] };
  if (p === '/api/admin/members') return { members: [{ ...person, name: 'Maria Teresa Dela Cruz', initials: 'MD', role: 'Alumni', roles: ['Alumni'], status: 'Verified', joined: '2026-09-22', emailConfirmed: true, education: [] }], total: 1 };
  if (p === '/api/admin/settings') return { settings: { allow_open_signups: true, allowed_file_types: [], approved_email_domains: [], moderation_reasons: [], email_templates: {} } };
  return { items: [], news: [], events: [], photos: [], opportunities: [], resources: [], reports: [], posts: [], logs: [], metrics: {}, total: 0 };
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const report = [];
  try {
    for (const width of (process.env.FEED_ONLY ? [390, 820, 1440] : [320, 390, 768, 820, 1024, 1440])) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(({ key, session, reviewOrigin }) => { if (location.origin === reviewOrigin && !location.search.includes('signedout')) localStorage.setItem(key, JSON.stringify(session)); }, { key: `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`, session, reviewOrigin });
      let commentAttempts = 0;
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === '127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue();
        let data = [];
        if (url.pathname.startsWith('/storage/v1/object/feed-media/') && request.method() === 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: url.pathname, Id: 'upload' }) });
        if (url.pathname === '/rest/v1/feed_comments' && request.method() === 'POST') {
          commentAttempts++;
          if (commentAttempts === 1) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) });
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...request.postDataJSON(), id: `new-comment-${commentAttempts}`, created_at: new Date().toISOString() }) });
        }

        if (url.pathname.startsWith('/api/')) data = apiData(url);
        else if (url.pathname.includes('/auth/v1/user')) data = user;
        else if (url.pathname.includes('/rest/v1/profiles')) data = request.headers().accept?.includes('object') ? profile : [profile];
        else if (url.pathname.includes('/rpc/list_alumni_directory')) data = [person];
        else if (url.pathname.includes('/rpc/get_public_alumni_profile')) data = { ...person, batch_name: 'Marist Alumni' };
        else if (url.pathname.includes('/rpc/list_chat_profiles')) data = [{ ...person, batch_name: 'Marist Alumni' }];
        else if (url.pathname.includes('/rpc/community_manager')) data = true;
        else if (url.pathname === '/rest/v1/feed_posts') data = [{ id: 'post', user_id: person.id, author_name: 'Maria Teresa Dela Cruz', content: 'Looking forward to reconnecting with our classmates at the next alumni gathering.', created_at: '2026-09-22T08:00:00Z', feed_reactions: [], feed_saved_posts: [], comment_total: [{ count: 0 }] }];
        else if (url.pathname === '/rest/v1/feed_comments') data = [{ id: 'comment-one', user_id: person.id, author_name: 'Maria Teresa Dela Cruz', content: 'Great to see our classmates together again! Looking forward to the next reunion.', created_at: '2026-09-22T08:00:00Z' }, { id: 'comment-two', parent_comment_id: 'comment-one', user_id: person.id, author_name: 'Maria Teresa Dela Cruz', content: 'See you all soon.', created_at: '2026-09-22T09:00:00Z' }];
        else if (url.pathname === '/rest/v1/opportunities') data = [{ id: 'job', user_id: person.id, author_name: 'Maria Teresa Dela Cruz', category: 'job', title: 'Community relations and alumni engagement coordinator', company_name: 'Sample organization', location: 'General Santos City', description: 'Help connect graduates with opportunities and community projects.', tags: ['Full time'], created_at: '2026-09-22T08:00:00Z', status: 'active' }];
        else if (url.pathname.includes('/rpc/get_own_alumni_profile')) data = { profile, education: [], employment: [] };
        else if (!url.hostname.endsWith('.supabase.co')) return route.abort();
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/0' } });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      async function inspect(name) {
        await page.waitForTimeout(250);
        const result = await page.evaluate(() => {
          const width = innerWidth;
          const overflow = [...document.querySelectorAll('main *, header *, [role=dialog] *, .admin-mobile-bar')].filter(el => {
            const rect = el.getBoundingClientRect(), css = getComputedStyle(el);
            if (!rect.width || css.visibility === 'hidden' || !el.getClientRects().length) return false;
            if (el.closest('.admin-sidebar')) return false;
            // Descendants of deliberate horizontal scrollers are not page overflow.
            for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
            return rect.right > width + 2 || rect.left < -2;
          }).slice(0, 12).map(el => ({ tag: el.tagName, class: String(el.className), width: Math.round(el.getBoundingClientRect().width) }));
          return { documentWidth: document.documentElement.scrollWidth, overflow };
        });
        report.push({ width, page: name, ...result, errors: errors.splice(0) });
        await page.screenshot({ path: path.join(output, `${width}-${name}.png`), fullPage: true });
      }
      await page.goto(`${reviewOrigin}/`);
      await page.locator('.account-trigger').waitFor();
      await inspect('home');
      for (const name of (process.env.FEED_ONLY ? ['Community'] : ['About NDDU', 'Community', 'Directory', 'Opportunities', 'Events', 'Gallery'])) {
        if (width <= 1100) await page.getByRole('button', { name: 'Menu', exact: true }).click();
        await page.locator('.main-nav').getByRole('button', { name, exact: true }).click();
        await inspect(name.toLowerCase());
        if (name === 'Community') {
          await page.locator('.post-creator').getByRole('button', { name: 'Choose GIF', exact: true }).click();
          await page.getByRole('button', { name: 'Happy alumni' }).waitFor();
          await inspect('post-gif-popup');
          await page.getByRole('button', { name: 'Happy alumni' }).click();
          await page.locator('.post-creator').getByAltText('Selected GIF').waitFor();
          await page.locator('.post-creator').getByRole('button', { name: 'Remove GIF' }).click();

          const author = page.locator('.feed-author-button').first();
          await author.waitFor();
          await page.getByText('Batch 1998', { exact: false }).first().waitFor();
          await author.hover();
          await page.locator('.feed-author-preview').first().waitFor({ state: 'visible' });
          await inspect('author-preview');
          await page.locator('.author-preview-action').first().click();
          await page.locator('.mention-profile-dialog').waitFor();
          await page.locator('.mention-profile-dialog').getByText('Marist Alumni', { exact: true }).waitFor();
          await inspect('author-profile');
          await page.keyboard.press('Escape');
          await page.locator('.mention-profile-dialog').waitFor({ state: 'hidden' });
          await page.locator('.reaction-menu-wrap > button').first().click();
          await page.locator('.reaction-menu').first().getByRole('button', { name: 'Sad', exact: true }).waitFor();
          if (await page.locator('.reaction-menu').first().getByRole('button').count() !== 6) throw new Error('Expected six reactions');
          await inspect('reaction-picker');
          await page.locator('.feed-post').first().getByRole('button', { name: 'Comment', exact: true }).click();
          await page.locator('.feed-comment').first().waitFor();
          await inspect('comments');
          await page.locator('.comment-reply-button').first().click();
          if (await page.locator('.comment-input-row input').first().inputValue() !== '@Maria Teresa Dela Cruz ') throw new Error('Reply did not target the comment author');
          await page.locator('.comment-input-row input').first().fill('Test comment submission');
          await page.getByRole('button', { name: 'Post comment', exact: true }).first().click();
          await page.locator('.comment-send-error').first().waitFor();
          if (!await page.locator('.comment-send-error').first().textContent().then(t => t.includes('42501'))) throw new Error('Submission error was hidden');
          if (await page.locator('.comment-input-row input').first().inputValue() !== 'Test comment submission') throw new Error('Failed comment draft lost');
          await page.getByRole('button', { name: 'Post comment', exact: true }).first().click();
          await page.getByText('Test comment submission', { exact: true }).waitFor();
          const tools = page.locator('.comment-attachments').first();
          await tools.getByRole('button', { name: 'Choose emoji', exact: true }).click();
          await page.getByPlaceholder('Search emoji').waitFor();
          const popupBox = await page.locator('.media-picker-popup').boundingBox();
          const triggerBox = await tools.getByRole('button', { name: 'Choose emoji', exact: true }).boundingBox();
          if (popupBox.y < 0 || popupBox.x < 0 || popupBox.x + popupBox.width > width) throw new Error('Picker must fit viewport');
          await page.keyboard.press('Escape');
          await page.locator('.media-picker-popup').waitFor({ state: 'hidden' });
          await tools.getByRole('button', { name: 'Choose emoji', exact: true }).click();
          await tools.locator('.comment-attachment-help').click();
          await page.locator('.media-picker-popup').waitFor({ state: 'hidden' });
          await tools.getByRole('button', { name: 'Choose emoji', exact: true }).click();
          await inspect('comment-emoji-picker');
          await page.getByPlaceholder('Search emoji').fill('grinning');
          await page.locator('.epr-emoji-category[data-name=smileys_people] button.epr-emoji[data-unified="1f600"]').click();
          if (!await page.locator('.comment-input-row input').first().inputValue()) throw new Error('Emoji was not inserted');
          await page.locator('.comment-input-row input').first().fill('');
          await tools.getByRole('button', { name: 'Choose GIF', exact: true }).click();
          await page.getByRole('button', { name: 'Happy alumni' }).waitFor();
          await inspect('comment-gif-picker');
          await page.getByRole('button', { name: 'Happy alumni' }).click();
          await tools.getByRole('button', { name: 'Remove GIF' }).click();
          await tools.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFOcAAAAASUVORK5CYII=', 'base64') });
          await tools.getByAltText('Selected photo').waitFor();
          await inspect('comment-photo-preview');
          await tools.getByRole('button', { name: 'Remove file' }).click();
          await tools.locator('input[type=file]').nth(1).setInputFiles({ name: 'reunion.txt', mimeType: 'text/plain', buffer: Buffer.from('Reunion details') });
          await inspect('comment-file-preview');
          await page.getByRole('button', { name: 'Post comment', exact: true }).first().click();
          await page.getByRole('link', { name: 'Open file: reunion.txt' }).waitFor();




        }
      }

      if (process.env.FEED_ONLY) {
        await page.getByRole('button', { name: 'Open alumni chats' }).click();
        await page.locator('.messenger-people').getByRole('button', { name: /Maria Teresa Dela Cruz/ }).click();

        const messageBox = page.getByRole('textbox', { name: 'Message', exact: true });
        if ((await messageBox.boundingBox()).height > 46) throw new Error('Empty chat input is oversized');
        await messageBox.fill('First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line');
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message"]')?.getBoundingClientRect().height > 44);
        const expandedHeight = (await messageBox.boundingBox()).height;
        if (expandedHeight <= 44 || expandedHeight > 120) throw new Error(`Chat input growth is not bounded: ${expandedHeight}`);
        await messageBox.fill('');
        await page.waitForFunction(() => document.querySelector('textarea[aria-label="Message"]')?.getBoundingClientRect().height === 44);
        if ((await messageBox.boundingBox()).height > 46) throw new Error('Cleared chat input did not shrink');
        await page.locator('.messenger-window').getByRole('button', { name: 'Choose emoji', exact: true }).click();
        await page.getByPlaceholder('Search emoji').fill('grinning');
        await inspect('message-emoji-popup');
        await page.locator('.epr-emoji-category[data-name=smileys_people] button.epr-emoji[data-unified="1f600"]').click();
        if (!await page.getByRole('textbox', { name: 'Message', exact: true }).inputValue()) throw new Error('Message emoji not inserted');
        await page.locator('.messenger-window').getByRole('button', { name: 'Choose GIF', exact: true }).click();
        await page.getByRole('button', { name: 'Happy alumni' }).waitFor();
        await inspect('message-gif-popup');
        const sent = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/rest/v1/direct_messages'));
        await page.getByRole('button', { name: 'Happy alumni' }).click();
        if ((await sent).postDataJSON().message_type !== 'gif') throw new Error('Message GIF payload missing');
        await context.close(); continue;
      }

      await page.getByRole('button', { name: 'Open alumni chats' }).click();
      await inspect('chat-directory');
      await page.getByRole('button', { name: 'Open alumni chats' }).click();
      await page.locator('.notification-button').click();
      await inspect('notifications-popup');
      await page.getByRole('button', { name: 'Close notifications' }).click();
      await page.locator('.account-trigger').click();
      await inspect('account-menu');
      await page.keyboard.press('Escape');
      await page.goto(`${reviewOrigin}/admin`);
      await page.locator('.admin-shell').waitFor();
      await inspect('dashboard');
      for (const name of ['Members', 'Alumni Verification', 'Opportunities & Events', 'Social & News', 'Analytics', 'Settings', 'Help & Support', 'Community & Requests']) {
        if (width <= 1100) await page.getByRole('button', { name: 'Admin menu' }).click();
        await page.locator('.admin-nav').getByRole('button', { name, exact: true }).click();
        await inspect(name.toLowerCase().replace(/[^a-z]+/g, '-'));
        if (name === 'Members') {
          await page.getByRole('button', { name: /Add member/ }).click();
          await inspect('add-member-dialog');
          await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
      }
      if (width <= 1100) {
        await page.getByRole('button', { name: 'Admin menu' }).click();
        await page.screenshot({ path: path.join(output, `${width}-admin-menu.png`) });
        await page.keyboard.press('Escape');
        await page.locator('.admin-sidebar').waitFor({ state: 'hidden' });
      }
      await page.evaluate(() => localStorage.clear());
      await page.goto(`${reviewOrigin}/?signedout`);
      await page.getByRole('button', { name: 'Log in', exact: true }).first().click();
      await inspect('login');
      await page.getByRole('button', { name: 'Create an account', exact: true }).click();
      await inspect('registration');
      await page.goto(`${reviewOrigin}/admin?signedout`);
      await page.locator('.admin-access').waitFor();
      await inspect('admin-login');
      await context.close();
      console.log(`Reviewed ${width}px`);
    }
    if (report.some(x => x.overflow.length || x.errors.length || x.documentWidth > x.width + 2)) process.exitCode = 1;
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ output, checks: report.length, issues: report.filter(x => x.overflow.length || x.errors.length || x.documentWidth > x.width + 2) }, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });


