# Admin security setup

1. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
2. Copy `server/.env.example` to `server/.env` and add values from your Supabase project settings. The service-role key belongs only in `server/.env`.
3. Create an account, then promote it in the SQL Editor. A successful Supabase
   password sign-in alone is intentionally not enough to enter `/admin`:

   ```sql
   update public.profiles set role = 'admin', status = 'verified'
   where email = 'your-admin-email@example.edu';
   ```

   If the update affects zero rows, create the missing profile for existing
   Auth users, then run the promotion again:

   ```sql
   insert into public.profiles (id, first_name, last_name, email)
   select
     id,
     raw_user_meta_data ->> 'first_name',
     raw_user_meta_data ->> 'last_name',
     email
   from auth.users
   on conflict (id) do nothing;
   ```

4. Keep the client URL in `CLIENT_ORIGIN` exact. For a deployed site, set it to its HTTPS origin.

The server verifies a user's Supabase access token, reads their role with its server-only service key, and records protected updates in `admin_audit_logs`. The client must never receive `SUPABASE_SERVICE_ROLE_KEY`.
