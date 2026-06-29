# Organisation admin invite email (not automated)

**The app does not send organisation admin invite emails.** Platform admins create an invite link in the UI (`create_organisation_admin_invite` RPC) and copy it manually.

When email automation is wired (e.g. Resend API — see `app/api/admin/notify-new-games/route.ts` for a stub), use this copy:

**Subject:** You've been invited to manage a Memory Map

**Body:**

You have been invited to help manage **[Organisation Name]** on NextPlay Memory Map.

Click the link below to create your password and access the admin area.

**Button:** Accept invite

**Link:** use `buildOrganisationAdminInviteUrl(token)` from `lib/memory-map/organisations.ts`.

Until automated email is enabled, platform admins can copy the invite link from the organisation admin screen.
