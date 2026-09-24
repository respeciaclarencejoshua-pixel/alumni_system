# Phone and tablet UI review

## Changes

- Fixed the hidden admin sidebar consuming layout space on smaller screens. Admin content now fills the available width, with a labeled header and an overlay navigation drawer.
- Added drawer keyboard focus handling, Escape dismissal, background scroll locking, and a visible close button.
- Replaced the cramped public navigation with a labeled mobile menu. Added visible Notices, Alerts, and Account labels, plus a notification close button.
- Applied consistent form sizing, 16px input text, larger touch targets, visible keyboard focus, and skip-to-content links.
- Improved member cards, long names and email wrapping, verification tabs, review actions, filters, and stacked phone layouts.
- Bounded dialogs, notifications, and chat windows to the viewport, including safe-area spacing. Corrected the community feed's double negative margin.
- Use compact Turnstile on containers narrower than 300px to prevent narrow sign-in forms overflowing.

## Verification

- Production build passed. The existing main JavaScript bundle warning above 500kB remains; it is not a build failure.
- All 65 server tests passed.
- Local Edge browser review covers 320, 390, 768, 820, 1024, and 1440px widths. There are 138 page/state checks across public navigation, chat directory, notifications, account menu, nine admin pages, member creation, and three authentication screens. Admin drawer dismissal is also checked.
- Final run: all 138 checks passed with no detected horizontal overflow or uncaught page errors. Selected phone and tablet screenshots were visually reviewed for readability and spacing.
- The browser review uses synthetic data and intercepted API calls. It makes no production changes. Screenshots and a JSON report are written to the OS temporary directory.
- Reproduce with a local Vite server on port 5173, an installed Playwright module (optionally set PLAYWRIGHT_MODULE to its path), Microsoft Edge, and `node scripts/responsive-review.cjs`. The script reads only the local Supabase URL to identify the synthetic session storage key.

## Limits and deployment

These checks validate local layouts with fixture content; they do not establish real-user capacity or verify production CORS, database policies, uploads, or every workflow. Physical iPhone/iPad Safari, the on-screen keyboard, and live CAPTCHA still need device testing. External images and embedded content are blocked in the fixture review.

Commit and push these changes to the branch connected to Vercel, then check the resulting deployment on actual devices. No deployment was performed during this review.
