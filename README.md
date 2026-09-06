# NDDU Alumni Management System

React, Express, and Supabase application for alumni profiles, verification,
community content, opportunities, events, gallery submissions, chat, and
role-scoped administration.

## Local development

1. Copy `client/.env.example` to `client/.env.local` and `server/.env.example`
   to `server/.env`.
2. Apply `supabase/schema.sql` in the Supabase SQL editor.
3. Run `npm install`, followed by `npm run dev`.
4. Open `http://localhost:5173`; administration is at `/admin`.

Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client or commit environment
files. Run `npm --workspace server test`, `npm --workspace client run build`,
and `npm audit --omit=dev` before deployment.

Production and recovery procedures are documented in `OPERATIONS.md`.
