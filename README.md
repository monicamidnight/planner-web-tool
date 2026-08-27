# PLANNER WEB TOOL v00.06

Standalone static monitoring frontend for the persistent C.Link Planner roadmap + TO-DO + diary system.

Backend:
- Existing Supabase project: C.Link
- Existing Planner Edge Function / REST data

Deployment target:
- Existing Cloudflare static hosting
- Production branch: main

Global Planner view:
https://planner-web-tool.midnight-d23.workers.dev/

Individual Planner view pattern:
https://planner-web-tool.midnight-d23.workers.dev/?project=<PROJECT_ID>

When `project` is supplied, Project, Roadmap, TO-DO, Repository Authority and Diary are scoped to that PROJECT_ID.

When `project` is omitted, the existing global multi-project view remains available.
