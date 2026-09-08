Help & Support admin connection

Alumni support requests and admin replies use the existing alumni_service_items and alumni_service_replies tables. Apply the existing 20260907_community_services.sql migration if it has not been installed. No new migration is required for this update.

A verified administrator opens Admin Portal > Help & Support. The badge counts submitted and reviewing requests. Open a request to reply or update its status. Alumni see the same conversation in Help & support > My requests. Both pages poll every 15 seconds while visible, with Check for updates for manual refresh. Older requests can be loaded in batches of 100. Search and filters apply to the loaded requests.

Help-topic buttons preselect a category and add the selected topic to the subject; all four topics submit to this same admin queue. FAQ answers are guidance stored in HelpCenter.jsx, not separate requests or an admin-editable content system.

Access continues to use community_manager() and the existing row-level security policies. Staff roles are not automatically granted access to private requests. The administrator must meet the existing verification, session and MFA requirements.

Live verification: sign in as an alumnus and submit from each topic; confirm the topic/subject appears in the admin Help & Support queue, reply as an admin, change the status, and check the alumnus conversation after the next refresh. Check another alumnus cannot read that request. These live account checks require a connected Supabase environment and were not executed locally.
