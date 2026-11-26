# NagarSeva --- Project Blueprint & AI Coding Prompt

**Version:** 1.0\
**Date:** 19 November 2026\
**Implementation order:** Local-first MVP → simulated voice testing →
WhatsApp/photo workflow → Exotel integration later

------------------------------------------------------------------------

## 1. Project Overview

Build **NagarSeva**, an AI-assisted citizen complaint registration and
tracking platform for a municipal corporation.

The system has three major parts:

1.  **React Admin Dashboard** --- municipal staff can manage citizens,
    calling campaigns, complaints, call records, attachments, AI-agent
    configuration, and reports.
2.  **Node.js + Express Backend** --- REST API, authentication,
    authorization, business logic, MVC structure, database access,
    migrations, file handling, and integrations.
3.  **AI Voice Agent Service (local-first)** --- conducts a structured
    complaint conversation using a microphone and speakers during the
    first phase. It collects the citizen's issue, location, and name;
    reads the details back; and only registers a complaint after
    confirmation.

**Database:** MySQL\
**Database change management:** migrations only\
**Backend pattern:** MVC (Models, Controllers, Routes), with services
and repositories/helpers where appropriate\
**Frontend pattern:** component-based React architecture\
**Telephony:** Exotel is explicitly out of scope for the initial
implementation. Do not integrate, configure, or require Exotel
credentials until the local workflow is complete and tested.

The first deliverable must work on a developer's computer without a paid
phone-calling provider.

------------------------------------------------------------------------

## 2. Product Goals

-   Allow authorized municipal staff to upload or add citizen contact
    records.
-   Run a controlled AI-assisted complaint interview using a local
    browser microphone/speaker workflow.
-   Support Assamese, Hindi, and English, with Assamese as the initial
    default language. Ask the citizen which language they prefer at the
    beginning.
-   Capture and validate complaint details.
-   Read the captured information back and obtain explicit confirmation.
-   Create a complaint and unique ticket ID only after confirmation.
-   Display complaints and call/interview outcomes in the dashboard.
-   Store transcripts and simulated session metadata.
-   Provide a secure way to attach complaint photos. During local
    development, support a secure web upload flow; add WhatsApp Cloud
    API integration only when configured.
-   Keep the architecture ready for a future Exotel integration without
    coupling the core complaint workflow to Exotel.

## 3. Non-Goals for Phase 1

Do not implement these in the initial build:

-   Exotel outbound calls, Exotel webhooks, SIP, Asterisk, or real
    mobile-phone calling.
-   Paid telephony services or provider-specific call streaming.
-   Automatic mass calling of uploaded phone numbers.
-   Production WhatsApp messaging unless Meta credentials and approved
    templates are supplied.
-   Complex analytics or predictive AI features not listed in this
    document.

Use a **simulated call session** in the browser. The same conversation
engine should later be reusable behind a telephony audio-stream adapter.

------------------------------------------------------------------------

## 4. Recommended Technology Stack

### Frontend

-   React with Vite
-   TypeScript
-   React Router
-   Tailwind CSS or CSS Modules (choose one styling approach and use it
    consistently)
-   TanStack Query for server state and API caching
-   React Hook Form + Zod for forms and validation
-   Reusable chart library (for example, Recharts) only where charts add
    value
-   Lucide React icons
-   Responsive layout for desktop, tablet, and mobile

### Backend

-   Node.js LTS
-   TypeScript
-   Express
-   MySQL 8+
-   Sequelize ORM with Sequelize CLI migrations, or another
    migration-capable ORM selected once at project start. **Do not mix
    ORMs.**
-   Zod (or Joi) for request validation
-   JWT access tokens with secure refresh-token handling, or secure
    server sessions. Choose one documented approach.
-   bcrypt/argon2 for password hashing
-   Multer for controlled multipart uploads
-   Helmet, CORS allow-list, rate limiting, structured logging
-   Swagger/OpenAPI for API documentation
-   Jest/Vitest + Supertest for tests

### Voice Service

The Node.js backend calls ElevenLabs directly for speech-to-text and
text-to-speech. Conversation decisions remain in the deterministic state
machine, and the backend remains authoritative for complaint validation
and creation. Browser audio supports local simulation; Exotel Voicebot
provides bidirectional phone audio over WebSocket for real calls.

### Local Infrastructure

-   Docker Compose for MySQL and optional Redis/MinIO.
-   Local filesystem storage for development attachments, behind a
    storage service abstraction.
-   MinIO or an S3-compatible provider can be introduced later.
-   Redis/BullMQ is optional for the first milestone; add it when
    background jobs or campaign queues are required.

------------------------------------------------------------------------

## 5. High-Level Architecture

``` text
React Admin Dashboard
  ├── Authentication & Role-Based Screens
  ├── Citizens / Import
  ├── Campaigns
  ├── Simulated AI Call Studio
  ├── Complaints & Ticket Details
  ├── Call Sessions / Transcript
  ├── Attachments
  ├── AI Configuration / Language Settings
  └── Reports
          |
          | HTTPS REST API
          v
Node.js + Express Backend (MVC)
  ├── Routes
  ├── Controllers
  ├── Services (business rules)
  ├── Models / Repositories
  ├── Middleware (auth, validation, errors)
  ├── Migrations & Seeders
  ├── File Storage Service
  └── AI Session / Complaint Orchestration
          |
          +---------- MySQL
          |
          +---------- ElevenLabs STT / TTS APIs
          |
          +---------- Exotel Voicebot WebSocket

WhatsApp Cloud API → webhook → attachment service
```

### Architectural rules

-   Keep the complaint workflow independent of any telephony vendor.
-   Define interfaces/adapters for audio input/output, speech
    recognition, speech synthesis, and future telephony.
-   Controllers should be thin. Put business logic in services.
-   Models define persistence structure; repositories/data-access
    helpers isolate queries where useful.
-   Never put SQL queries, business logic, or API calls inside React
    components.
-   Never let an LLM decide whether it may create a complaint. The
    backend enforces confirmation and validation.
-   Do not create a complaint merely because the AI inferred the
    details. Require an explicit citizen confirmation event.

------------------------------------------------------------------------

## 6. Main User Roles and Permissions

### Super Admin

-   Manage municipal organizations/departments and admin users.
-   Manage roles and permissions.
-   View all system records and audit logs.
-   Configure system-wide language and AI settings.

### Municipal Admin

-   Manage citizens and imports.
-   Create, start, pause, and review campaigns.
-   View all complaints, call sessions, attachments, and reports for
    their assigned organization.
-   Assign complaints and update permitted statuses.

### Operator / Staff

-   View assigned complaints.
-   Review transcripts and attachments.
-   Update complaint status and add internal notes according to
    permissions.

### Read-Only / Auditor

-   View permitted reports and records.
-   Cannot create, edit, delete, or change statuses.

Implement role-based access control (RBAC) on the backend. Hiding a
button in React is not authorization.

------------------------------------------------------------------------

## 7. Core Functional Modules

### 7.1 Authentication and User Management

-   Login and logout.
-   Secure password hashing.
-   Access control by role and organization.
-   User profile and password change.
-   Refresh-token/session expiry and revocation.
-   Login attempt throttling.
-   Audit important account and permission changes.

### 7.2 Citizen Management

-   Citizen list with pagination, search, filters, and sorting.
-   Add, edit, view, deactivate citizen records.
-   Fields: full name (if known), phone number, optional WhatsApp
    number, preferred language, locality/ward, consent/authorization
    status, consent source, created date, notes.
-   CSV/XLSX import with preview, column mapping, validation, duplicate
    detection, and import summary.
-   Export only for authorized roles.
-   Normalize phone numbers and validate Indian number format without
    assuming that possession of a number grants permission to call it.
-   Track contact preferences and opt-out status.
-   Do not allow a campaign to include a contact who is opted out or
    lacks the required documented authorization.

### 7.3 Campaign Management (Local Simulation First)

-   Create a campaign with name, description, target group, language
    defaults, questionnaire version, and schedule metadata.
-   Preview eligible citizens before launch.
-   Show excluded contacts and reasons (opt-out, invalid number, missing
    authorization, duplicate, inactive).
-   Phase 1: launch a **simulation session** for a selected citizen from
    the dashboard; optionally run a controlled batch of simulated
    sessions.
-   Campaign states: Draft, Ready, Running, Paused, Completed,
    Cancelled, Failed.
-   Recipient/session states: Pending, In Progress, Completed, Failed,
    Skipped, Opted Out.
-   Retry rules must be configurable and conservative. Never repeatedly
    contact a citizen without policy approval.
-   Campaign pause/cancel must stop pending work.
-   Keep campaign execution separate from the future telephony provider.

### 7.4 Simulated AI Call Studio

This is a key Phase 1 feature.

Dashboard screen should provide: - Select a test citizen or enter a test
identity. - Select preferred language or let the agent ask. - Start,
pause, resume, and end a simulated session. - Microphone permission and
microphone-level/recording state indicator. - Audio playback for the
agent's response. - Live conversation transcript with speaker labels
(Citizen / NagarSeva AI). - Current conversation step and collected
fields. - Clear status: Listening, Processing, Speaking, Waiting for
Confirmation, Completed, Error. - Manual text-input fallback for testing
when microphone/STT is unavailable. - Test mode banner so staff do not
mistake simulations for real calls. - Save session transcript and
metadata when the session ends.

### 7.5 Complaint Management

-   Complaint list with ticket ID, citizen, category, location, created
    date, priority, assigned department/staff, and status.
-   Search by ticket ID, citizen name, phone, locality, and keywords.
-   Filters by status, date range, category, ward, department, and
    priority.
-   Complaint detail page with full description, verified location,
    citizen details, source session, transcript, attachments, status
    history, and internal notes.
-   Status workflow configurable by the municipality, with sensible
    defaults:
    -   Registered
    -   Acknowledged
    -   Assigned
    -   In Progress
    -   Resolved
    -   Closed
    -   Reopened
-   Record who changed a status, when, and any note.
-   Ticket IDs must be generated server-side and unique.
-   Do not hard-delete complaints. Use archival/soft deletion only where
    policy permits.

### 7.6 Transcript and Session History

-   Store session start/end timestamps, duration, language, session mode
    (simulation initially), outcome, transcript, and error metadata.
-   Speaker labels and timestamps where available.
-   Link a session to citizen and complaint when a complaint is created.
-   Show transcript in a readable timeline.
-   Restrict access to recordings/transcripts by role.
-   Phase 1 may store transcript and simulated audio metadata. Do not
    claim a real phone call recording exists when the session was only
    simulated.

### 7.7 Attachments and Photo Upload

-   Upload JPG, JPEG, PNG, and WEBP initially; optionally PDF if
    required.
-   Validate MIME type and file signature, not only file extension.
-   Enforce file-size limits and configurable limits.
-   Generate random storage names; never trust user-provided filenames
    as storage paths.
-   Store file metadata and storage key in MySQL; do not store image
    bytes as Base64 in MySQL.
-   Serve files through an authenticated/authorized endpoint or
    short-lived signed URL.
-   Show attachment preview in complaint details.
-   Store uploader, upload time, ticket association, MIME type, size,
    and checksum.
-   Phase 1: secure web upload link or dashboard upload.
-   Later: WhatsApp Cloud API webhook can associate an inbound photo
    with a ticket using verified sender identity and an active
    ticket/session. If multiple open tickets exist, ask the citizen to
    identify the correct ticket.

### 7.8 AI Agent Configuration

Provide an admin configuration screen for: - Default language. -
Supported languages: Assamese, Hindi, English. - Welcome message per
language. - Questionnaire wording per language. - Speech model and TTS
configuration labels/status. - Confidence thresholds and fallback
behavior. - Maximum clarification attempts. - AI disclosure and
recording notice text. - Versioned questionnaire prompts. - Test
conversation button.

Do not expose secrets, raw API keys, or unrestricted system prompts to
ordinary operators.

### 7.9 Dashboard and Reports

Dashboard cards: - Total citizens - Eligible contacts - Total
complaints - New complaints - In-progress complaints - Resolved
complaints - Simulated sessions completed - Failed sessions - Pending
review

Charts and reports: - Complaints by status - Complaints by category -
Complaints by ward/locality - Complaints over time - Session outcomes -
Language distribution - Campaign completion rate

All metrics must come from backend aggregation APIs, respect the user's
organization/role, and show the selected date range. Do not calculate
authoritative totals from only the currently loaded frontend page.

### 7.10 Notifications

-   Phase 1: in-dashboard notification/toast and visible ticket
    confirmation.
-   Future: WhatsApp confirmation only after Meta WhatsApp Cloud API is
    configured and the required opt-in/template rules are met.
-   The agent must not say "a WhatsApp message has been sent" unless the
    backend confirms the message was successfully accepted/sent by the
    provider.
-   In simulation mode, clearly say that no real WhatsApp message was
    sent.

------------------------------------------------------------------------

## 8. AI Conversation Workflow

### 8.1 Conversation States

Implement a deterministic state machine. Suggested states:

1.  `INITIAL`
2.  `DISCLOSURE`
3.  `LANGUAGE_SELECTION`
4.  `ASK_ISSUE`
5.  `CLARIFY_ISSUE`
6.  `ASK_LOCATION`
7.  `CLARIFY_LOCATION`
8.  `ASK_NAME`
9.  `READ_BACK`
10. `AWAIT_CONFIRMATION`
11. `CREATE_COMPLAINT`
12. `TICKET_CONFIRMATION`
13. `COMPLETED`
14. `CANCELLED`
15. `HANDOFF_OR_ERROR`

Persist state transitions for debugging and recovery where appropriate.

### 8.2 Conversation Sequence

1.  Start with a polite greeting.
2.  Clearly disclose that the citizen is interacting with an AI
    assistant for municipal complaint registration.
3.  Give the required privacy/recording notice. If audio is recorded or
    retained, explain this and follow applicable legal and municipal
    policy. Provide a way to stop or opt out.
4.  Ask language preference: Assamese, Hindi, or English. Assamese is
    the default only if the citizen does not choose another language and
    the policy permits this.
5.  Ask: "What problem would you like to report?"
6.  Clarify the issue if it is too vague. Extract a short issue summary
    and possible category.
7.  Ask for exact location: area/colony/road/ward and nearest landmark.
8.  Ask for the citizen's name if it is not already verified/available.
9.  Read back the issue, location, and name in the selected language.
10. Ask a clear yes/no confirmation question.
11. If the citizen says yes, send a structured confirmation event to the
    Node backend.
12. Node backend validates required fields and `confirmed === true`,
    then creates the complaint in a database transaction and returns a
    ticket ID.
13. Agent reads the ticket ID.
14. In simulation mode, tell the citizen that this is a test and no real
    WhatsApp message has been sent. Show the secure photo-upload test
    flow if enabled.
15. If the citizen says no, ask which detail is wrong, update it, read
    back again, and request confirmation again.
16. If the citizen cancels, stop without creating a complaint.
17. If speech recognition confidence is low, ask the citizen to repeat
    or use text fallback.
18. Never invent a name, address, landmark, or complaint detail.

### 8.3 Structured Data Contract

The AI service should return structured data, for example:

``` json
{
  "language": "as",
  "citizen_name": "Example Name",
  "issue_text": "Garbage has not been collected for several days.",
  "category_suggestion": "Waste Management",
  "location": {
    "locality": "Example Colony",
    "ward": "12",
    "landmark": "Near the public school"
  },
  "confirmed": true,
  "missing_fields": [],
  "confidence": {
    "issue": 0.94,
    "location": 0.88,
    "name": 0.97
  }
}
```

The example is illustrative, not real citizen data. Validate all fields
on the backend. Confidence scores are hints, not proof of correctness.

### 8.4 Complaint Creation Guard

The backend must reject complaint creation unless: - The session exists
and belongs to the authenticated/authorized workflow. - Required fields
are present and pass validation. - The citizen has explicitly confirmed
the read-back. - The session has not already created a complaint. - The
request is idempotent (duplicate retries must not create duplicate
tickets).

The LLM must not have direct database credentials. Expose a narrowly
scoped backend tool/action such as `create_civic_complaint`, and
validate it server-side.

------------------------------------------------------------------------

## 9. Database Design

Use MySQL with migrations. Every schema change must be represented by a
migration committed to version control. Never rely on manually editing
the production database or using ORM `sync({ alter: true })` as a
migration strategy.

Suggested tables (adapt names consistently to chosen ORM conventions):

### `organizations`

-   id
-   name
-   code
-   address (nullable)
-   is_active
-   created_at
-   updated_at

### `users`

-   id
-   organization_id
-   name
-   email (unique where present)
-   phone (nullable)
-   password_hash
-   role_id
-   is_active
-   last_login_at
-   created_at
-   updated_at

### `roles`

-   id
-   name
-   description
-   created_at
-   updated_at

### `permissions` and `role_permissions`

-   permission catalog and role-to-permission mapping.

### `citizens`

-   id
-   organization_id
-   full_name (nullable until known)
-   phone_number
-   whatsapp_number (nullable)
-   preferred_language
-   locality (nullable)
-   ward (nullable)
-   contact_authorization_status
-   authorization_source (nullable)
-   authorized_at (nullable)
-   opt_out_at (nullable)
-   is_active
-   notes (nullable)
-   created_at
-   updated_at

Add an appropriate unique constraint for organization + normalized phone
number, based on the municipality's data rules.

### `campaigns`

-   id
-   organization_id
-   name
-   description
-   status
-   questionnaire_version_id
-   default_language
-   created_by
-   scheduled_at (nullable)
-   started_at (nullable)
-   completed_at (nullable)
-   created_at
-   updated_at

### `campaign_recipients`

-   id
-   campaign_id
-   citizen_id
-   status
-   attempt_count
-   last_attempt_at (nullable)
-   exclusion_reason (nullable)
-   created_at
-   updated_at

### `call_sessions`

Use a vendor-neutral name even though Phase 1 is simulated. - id -
organization_id - citizen_id (nullable for anonymous test) - campaign_id
(nullable) - mode (`simulation`, future `telephony`) - provider
(`local`, future provider name) - provider_session_id (nullable) -
status - language - started_at - ended_at - duration_seconds -
transcript_text (or transcript stored in related transcript table) -
outcome - recording_storage_key (nullable) - error_code (nullable) -
error_message (nullable) - created_at - updated_at

### `session_messages` (recommended)

-   id
-   session_id
-   speaker (`citizen`, `assistant`, `system`)
-   message_text
-   language
-   sequence_number
-   confidence (nullable)
-   created_at

### `complaint_categories`

-   id
-   organization_id (nullable for global defaults)
-   name
-   description
-   is_active

### `complaints`

-   id
-   organization_id
-   ticket_number (unique)
-   citizen_id
-   session_id (nullable)
-   category_id (nullable)
-   title
-   description
-   locality
-   ward
-   landmark
-   priority
-   status
-   assigned_department_id (nullable)
-   assigned_user_id (nullable)
-   confirmed_at
-   created_at
-   updated_at
-   closed_at (nullable)

### `complaint_status_history`

-   id
-   complaint_id
-   old_status
-   new_status
-   changed_by_user_id (nullable for system action)
-   note (nullable)
-   created_at

### `complaint_attachments`

-   id
-   complaint_id
-   uploaded_by_user_id (nullable)
-   source (`dashboard`, `upload_link`, future `whatsapp`)
-   original_filename
-   storage_key
-   mime_type
-   file_size
-   checksum
-   created_at

### `upload_tokens` (for secure citizen upload links)

-   id
-   complaint_id
-   token_hash
-   expires_at
-   max_uploads
-   upload_count
-   revoked_at (nullable)
-   created_at

Store only a hash of a high-entropy upload token. Tokens must expire, be
revocable, and have usage limits.

### `questionnaire_versions`

-   id
-   organization_id
-   version
-   language_content (JSON or normalized translation table)
-   is_active
-   created_by
-   created_at

### `audit_logs`

-   id
-   organization_id
-   user_id (nullable)
-   action
-   entity_type
-   entity_id
-   metadata (JSON, avoid secrets and unnecessary personal data)
-   ip_address (where appropriate)
-   created_at

### Database requirements

-   Use InnoDB and `utf8mb4`.
-   Add indexes for frequently filtered fields: organization, ticket
    number, status, created date, citizen phone, campaign, session, and
    ward.
-   Add foreign keys and deliberate delete/update behavior.
-   Use transactions for complaint creation and status changes.
-   Use UTC timestamps in storage; convert to the user's timezone in the
    UI.
-   Use decimal/integer types appropriately; never store phone numbers
    as numeric values.
-   Add seeders for roles, permissions, complaint statuses/categories,
    and a development admin account.
-   Keep secrets and production citizen data out of seeders and source
    control.
-   Include migration rollback logic where practical.
-   Add a migration naming convention and document commands.

------------------------------------------------------------------------

## 10. Backend Project Structure (MVC)

Use a structure similar to:

``` text
backend/
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   ├── env.ts
│   │   ├── cors.ts
│   │   └── logger.ts
│   ├── models/
│   │   ├── User.ts
│   │   ├── Role.ts
│   │   ├── Citizen.ts
│   │   ├── Campaign.ts
│   │   ├── CampaignRecipient.ts
│   │   ├── CallSession.ts
│   │   ├── SessionMessage.ts
│   │   ├── Complaint.ts
│   │   ├── ComplaintCategory.ts
│   │   ├── ComplaintAttachment.ts
│   │   ├── UploadToken.ts
│   │   └── AuditLog.ts
│   ├── migrations/
│   ├── seeders/
│   ├── routes/
│   │   ├── index.ts
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── citizens.routes.ts
│   │   ├── campaigns.routes.ts
│   │   ├── sessions.routes.ts
│   │   ├── complaints.routes.ts
│   │   ├── attachments.routes.ts
│   │   ├── ai-config.routes.ts
│   │   └── reports.routes.ts
│   ├── controllers/
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── CitizenService.ts
│   │   ├── ImportService.ts
│   │   ├── CampaignService.ts
│   │   ├── SessionService.ts
│   │   ├── ComplaintService.ts
│   │   ├── AttachmentService.ts
│   │   ├── UploadTokenService.ts
│   │   ├── AIOrchestratorService.ts
│   │   └── ReportService.ts
│   ├── repositories/             # Add where query complexity warrants it
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── authorize.ts
│   │   ├── validate.ts
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── requestId.ts
│   ├── validators/
│   ├── types/
│   ├── utils/
│   ├── constants/
│   ├── docs/
│   ├── app.ts
│   └── server.ts
├── tests/
├── storage/                      # local development only; gitignored
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

### MVC responsibilities

-   **Model:** schema, relationships, persistence mapping, model-level
    constraints.
-   **View:** React frontend; backend returns JSON, not HTML templates.
-   **Controller:** receives HTTP request, validates/normalizes input,
    calls service, returns consistent response.
-   **Service:** business rules and orchestration.
-   **Repository:** optional data-access abstraction for complex
    queries; do not add needless layers.
-   **Middleware:** authentication, authorization, request validation,
    rate limiting, error handling.

------------------------------------------------------------------------

## 11. Frontend Project Structure

``` text
frontend/
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── providers/
│   │   └── queryClient.ts
│   ├── assets/
│   ├── components/
│   │   ├── ui/                    # Button, Input, Modal, Table, Badge, etc.
│   │   ├── layout/                # Sidebar, Header, PageContainer
│   │   ├── feedback/              # Loader, EmptyState, ErrorState, Toast
│   │   └── data-display/          # StatCard, DataTable, StatusBadge
│   ├── features/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── citizens/
│   │   ├── campaigns/
│   │   ├── ai-studio/
│   │   ├── complaints/
│   │   ├── sessions/
│   │   ├── attachments/
│   │   ├── ai-settings/
│   │   ├── reports/
│   │   └── users/
│   ├── hooks/
│   ├── lib/
│   │   ├── apiClient.ts
│   │   ├── auth.ts
│   │   ├── permissions.ts
│   │   └── formatters.ts
│   ├── services/                  # API functions grouped by domain
│   ├── types/
│   ├── constants/
│   ├── styles/
│   └── main.tsx
├── .env.example
├── package.json
└── README.md
```

### Frontend standards

-   Use TypeScript strict mode.
-   Build reusable, accessible components.
-   Keep feature-specific components inside their feature folder.
-   Keep API calls outside UI components.
-   Use TanStack Query for API data, caching, retries, invalidation, and
    loading/error states.
-   Use local component state for temporary UI state only.
-   Centralize API base URL and request handling.
-   Add route guards for user experience, but always enforce permissions
    in the backend.
-   Use forms with schema validation and useful field-level error
    messages.
-   Avoid giant components; split by responsibility.
-   Avoid duplicated formatting, status mapping, table, modal, and form
    logic.
-   Do not create generic abstractions that make simple features harder
    to understand.

------------------------------------------------------------------------

## 12. Dashboard UI/UX Specification

### Overall look

Create a professional municipal operations dashboard. Use a clean, calm,
trustworthy design: - Light background, white content surfaces, neutral
borders. - Deep blue/teal or restrained civic-service accent. - Clear
typography and consistent spacing. - Avoid excessive gradients, neon
colors, oversized decoration, and unnecessary animation. - Use a
consistent icon set. - Provide visible focus states and keyboard
accessibility. - Design desktop-first for staff operations but fully
responsive.

### Main layout

-   Left sidebar: Dashboard, Citizens, Campaigns, AI Call Studio,
    Complaints, Sessions & Transcripts, Reports, AI Settings, Users
    (permission-dependent).
-   Top header: page title/breadcrumb, global search if useful,
    notifications, profile menu.
-   Main content: page-specific cards, filters, tables, charts, and
    details.

### Dashboard page

-   Summary metric cards.
-   Complaints trend chart.
-   Complaint status breakdown.
-   Recent complaints table.
-   Recent simulation sessions.
-   Campaign status summary.
-   Quick actions: Add Citizen, Import Citizens, New Campaign, Start
    Test Session.

### Citizens page

-   Search, filters, pagination.
-   Add Citizen button.
-   Import CSV/XLSX wizard with upload, column mapping, validation
    preview, duplicate handling, and final summary.
-   Citizen detail drawer/page with contact authorization and opt-out
    history.
-   Clearly display whether the citizen is eligible for contact.

### Campaigns page

-   Campaign table with status and counts.
-   Create campaign wizard.
-   Eligibility preview before starting.
-   For Phase 1, action label should be "Start Simulation" or "Run Test
    Sessions," not "Call Citizens."
-   Pause/cancel controls and session outcomes.

### AI Call Studio page

-   Prominent "Simulation Mode" label.
-   Citizen/test profile selector.
-   Start Session button.
-   Microphone permission state.
-   Agent audio playback and microphone input controls.
-   Conversation transcript panel.
-   Current question/state indicator.
-   Extracted data panel: language, name, issue, location, confirmation
    state.
-   End Session button.
-   Manual text mode fallback.
-   Display errors in plain language.

### Complaints page

-   Searchable/filterable data table.
-   Status and priority badges.
-   Ticket detail view with timeline.
-   Assignment controls for permitted users.
-   Transcript and attachment sections.

### Sessions page

-   Session list with mode, citizen, language, start time, duration,
    outcome.
-   Transcript viewer with speaker labels.
-   Clearly distinguish simulated sessions from future real calls.
-   Never show a recording-play button unless an actual recording asset
    exists and the user has permission.

### Reports page

-   Date range and organization filters.
-   Charts and export.
-   Show data freshness and applied filters.
-   Ensure exported data follows the same authorization rules.

### Responsive behavior

-   Sidebar collapses to a mobile drawer.
-   Tables become horizontally scrollable or transform into compact
    cards.
-   Forms stack vertically.
-   Buttons remain touch-friendly.
-   Avoid horizontal overflow at common mobile widths.
-   Test at 360px, 768px, 1024px, and 1440px.

------------------------------------------------------------------------

## 13. API Design

Base path: `/api/v1`

Use consistent JSON response formats, status codes, pagination, and
error shapes.

Example success:

``` json
{
  "success": true,
  "message": "Citizens retrieved successfully",
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

Example error:

``` json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "phone_number", "message": "Enter a valid phone number" }
  ],
  "requestId": "..."
}
```

### Authentication

-   `POST /auth/login`
-   `POST /auth/logout`
-   `POST /auth/refresh` (if refresh-token approach is used)
-   `GET /auth/me`
-   `POST /auth/change-password`

### Users and roles

-   `GET /users`
-   `POST /users`
-   `GET /users/:id`
-   `PATCH /users/:id`
-   `PATCH /users/:id/status`
-   `GET /roles`
-   `GET /permissions`

### Citizens

-   `GET /citizens`
-   `POST /citizens`
-   `GET /citizens/:id`
-   `PATCH /citizens/:id`
-   `PATCH /citizens/:id/opt-out`
-   `POST /citizens/import/preview`
-   `POST /citizens/import/commit`
-   `GET /citizens/import/:jobId`

### Campaigns

-   `GET /campaigns`
-   `POST /campaigns`
-   `GET /campaigns/:id`
-   `PATCH /campaigns/:id`
-   `POST /campaigns/:id/eligibility-preview`
-   `POST /campaigns/:id/start-simulation`
-   `POST /campaigns/:id/pause`
-   `POST /campaigns/:id/resume`
-   `POST /campaigns/:id/cancel`
-   `GET /campaigns/:id/recipients`

### Sessions / AI

-   `POST /sessions`
-   `GET /sessions`
-   `GET /sessions/:id`
-   `POST /sessions/:id/messages`
-   `POST /sessions/:id/turn` (or use a WebSocket/audio transport if
    required)
-   `POST /sessions/:id/confirm`
-   `POST /sessions/:id/cancel`
-   `POST /sessions/:id/complete`
-   `GET /sessions/:id/transcript`
-   `GET /ai/config`
-   `PATCH /ai/config`
-   `GET /ai/health`

### Complaints

-   `GET /complaints`
-   `POST /complaints` (restricted; normally invoked by validated
    session confirmation service)
-   `GET /complaints/:id`
-   `PATCH /complaints/:id`
-   `POST /complaints/:id/assign`
-   `POST /complaints/:id/status`
-   `POST /complaints/:id/notes`
-   `GET /complaints/:id/history`

### Attachments

-   `POST /complaints/:id/attachments`
-   `GET /complaints/:id/attachments`
-   `GET /attachments/:id/download`
-   `POST /complaints/:id/upload-link`
-   `POST /public/uploads/:token` (strictly limited, token-authorized
    endpoint)
-   `POST /upload-links/:id/revoke`

### Reports

-   `GET /reports/overview`
-   `GET /reports/complaints-by-status`
-   `GET /reports/complaints-by-category`
-   `GET /reports/complaints-over-time`
-   `GET /reports/sessions`
-   `GET /reports/campaigns`

Document every endpoint in OpenAPI/Swagger, including permissions,
request schema, response schema, and error cases.

------------------------------------------------------------------------

## 14. Local Audio and AI Integration

### Development sequence

1.  First build the questionnaire state machine using text input/output
    only.
2.  Test the entire flow with deterministic mock responses.
3.  Add speech-to-text and text-to-speech behind interfaces.
4.  Add browser microphone capture and audio playback.
5.  Test Assamese, Hindi, and English with native/fluent speakers.
6.  Add confidence handling and text fallback.
7.  Only after this works, prepare a telephony adapter interface for
    later use.

### Important audio considerations

-   Browser microphone access requires HTTPS in deployed environments
    (localhost is generally treated as secure for development).
-   Ask for microphone permission only when the user starts a session.
-   Show a clear recording/listening indicator.
-   Stop microphone tracks when the session ends or the user navigates
    away.
-   Handle denied permission, no microphone, noisy input, silence, and
    model failures.
-   Do not save audio by default unless explicitly enabled and
    disclosed.
-   If audio is stored, secure it, define retention, and restrict
    access.
-   Test speech recognition quality for Assamese; do not assume a model
    supports Assamese accurately just because it supports Hindi.

### AI service interface

Define stable internal contracts, such as: -
`transcribeAudio(audio, languageHint)` -
`generateAssistantTurn(sessionState, userText, language)` -
`synthesizeSpeech(text, language)` -
`extractComplaintFields(transcript, language)` -
`validateConversationTransition(currentState, requestedTransition)`

The Node backend owns session persistence and complaint creation. The AI
service provides transcription, language generation, and structured
suggestions only.

------------------------------------------------------------------------

## 15. WhatsApp and Future Integrations

Do not block the Phase 1 milestone on WhatsApp.

When ready: - Set up Meta WhatsApp Cloud API and verify business/phone
configuration. - Store credentials in server environment/secret
manager. - Implement webhook signature verification. - Respect opt-in,
approved template, and messaging-window rules. - Send ticket
confirmation only after a ticket exists. - Store provider message ID and
delivery status. - Handle inbound images, sender verification, ticket
association, retries, and duplicate webhook delivery. - If a sender has
multiple active complaints, ask which ticket the image belongs to. -
Never trust a phone number alone as sufficient proof to expose private
complaint data.

------------------------------------------------------------------------

## 16. Security, Privacy, and Compliance

This project handles personal data, citizen contact details, complaint
information, and potentially sensitive photos/audio. Treat security and
privacy as core requirements.

-   Obtain municipal authorization and establish a lawful basis before
    contacting citizens.
-   Do not assume that uploading a phone list means consent to automated
    calls.
-   Implement opt-out and do-not-contact controls.
-   Follow applicable Indian telecom requirements, TRAI rules,
    DLT/consent requirements where applicable, and provider terms before
    real outbound calls.
-   Provide clear AI disclosure and recording notice.
-   Define data retention and deletion policies with the municipal
    authority.
-   Encrypt traffic with HTTPS/TLS.
-   Hash passwords using Argon2 or bcrypt.
-   Keep secrets in environment variables/secret management; never
    commit `.env`.
-   Validate every input on the server.
-   Use parameterized ORM queries; avoid raw SQL unless safely
    parameterized.
-   Apply RBAC and organization-level data isolation to every relevant
    endpoint.
-   Rate-limit login, public upload, and sensitive endpoints.
-   Validate uploads by MIME type, file signature, size, and allowed
    extension.
-   Prevent path traversal and unauthorized file access.
-   Use random storage keys and short-lived links.
-   Add audit logs for sensitive reads/actions where policy requires.
-   Avoid logging passwords, tokens, full audio, or unnecessary personal
    data.
-   Add CSRF protection if cookie-based authentication is used.
-   Configure strict CORS allow-list.
-   Use dependency scanning and keep dependencies updated.
-   Back up MySQL and test restoration.
-   Use least-privilege database credentials.
-   Separate development, staging, and production environments.

Before production, obtain review from the municipal authority and
qualified legal/compliance personnel. This blueprint is an engineering
plan, not legal advice.

------------------------------------------------------------------------

## 17. Error Handling and Observability

-   Centralized error middleware.
-   Stable error codes.
-   Request/correlation ID on every API request.
-   Structured logs with severity and context.
-   Do not expose stack traces or database details to the frontend.
-   Health endpoints for backend, database, and AI service.
-   Track AI latency, transcription failures, TTS failures, session
    abandonment, and complaint-creation errors.
-   Provide user-friendly retry guidance.
-   Use timeouts and bounded retries; do not retry complaint creation
    blindly.
-   Make state-changing endpoints idempotent where appropriate.

------------------------------------------------------------------------

## 18. Testing Strategy

### Backend tests

-   Unit tests for services and validators.
-   Integration tests for API routes and database behavior.
-   Authentication and RBAC tests.
-   Organization data-isolation tests.
-   Migration up/down tests.
-   Complaint confirmation guard tests.
-   Duplicate/idempotency tests.
-   Upload security tests.
-   Campaign eligibility and opt-out tests.

### Frontend tests

-   Component tests for forms, tables, filters, dialogs, and status
    controls.
-   Route/permission tests.
-   API loading, empty, success, and error states.
-   Responsive layout checks.
-   Accessibility and keyboard navigation checks.

### AI tests

-   Scripted conversations for each language.
-   Missing location/name/issue cases.
-   Incorrect read-back correction.
-   Yes/no/ambiguous confirmation.
-   Citizen cancellation.
-   Low-confidence speech.
-   Silence, noise, and interruption.
-   Prompt-injection attempts in citizen speech.
-   Verify that no complaint is created before explicit confirmation.
-   Native speaker review for Assamese pronunciation and transcription.

### End-to-end acceptance scenario

1.  Admin logs in.
2.  Admin creates or imports a test citizen.
3.  Admin opens AI Call Studio and starts a simulated session.
4.  Agent discloses AI role and asks language preference.
5.  Test user answers the questions.
6.  Agent reads back issue, location, and name.
7.  Test user confirms.
8.  Backend creates exactly one complaint and returns a ticket ID.
9.  Dashboard displays the complaint and links it to the session.
10. Operator opens the ticket and views transcript.
11. Operator uploads a test photo.
12. Attachment appears on the complaint detail page.
13. Reports reflect the new complaint/session.
14. Test cancellation and "no" confirmation paths create no complaint.

------------------------------------------------------------------------

## 19. Environment Variables

Create `.env.example` files with placeholder values only.

Backend examples:

``` env
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5173
API_BASE_URL=http://localhost:5000/api/v1
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nagar_seva
DB_USER=nagar_seva_app
DB_PASSWORD=change_me
JWT_ACCESS_SECRET=replace_with_long_random_secret
JWT_REFRESH_SECRET=replace_with_long_random_secret
UPLOAD_DIR=./storage/uploads
MAX_UPLOAD_SIZE_MB=10
AI_SERVICE_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:5173
```

AI service examples:

``` env
APP_ENV=development
PORT=8000
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=choose_a_tested_model
STT_MODEL=choose_a_tested_model
TTS_MODEL=choose_a_tested_model
```

Do not put real credentials in the repository. Validate required
environment variables at startup and fail with a clear message if
missing.

------------------------------------------------------------------------

## 20. Migrations and Development Commands

Use migration files as the single source of truth for schema changes.

Expected scripts (adapt to the selected ORM):

``` bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Roll back the latest migration
npm run db:migrate:undo

# Run seeders
npm run db:seed

# Start backend in development
npm run dev

# Run tests
npm test

# Build production output
npm run build
```

Requirements: - Commit each migration with the feature that requires
it. - Never edit an already-applied migration in a shared environment;
create a new migration. - Test migrations on a clean database and on a
copy of the previous schema. - Back up before production migrations. -
Keep seeders repeatable/idempotent where practical. - Document how to
create, run, and roll back migrations.

------------------------------------------------------------------------

## 21. Implementation Phases and Deliverables

### Phase 0 --- Repository and foundation

-   Create frontend and backend folders.
-   Set up TypeScript, linting, formatting, environment validation,
    Docker Compose, and README.
-   Configure MySQL connection and migration tooling.
-   Create initial migrations and seeders.
-   Add health endpoints and API documentation.

**Exit criteria:** app starts locally, database connects, migrations and
seeders run cleanly.

### Phase 1 --- Authentication and dashboard shell

-   Login, user roles, permissions.
-   Protected React routes.
-   Sidebar/header/layout and responsive design.
-   Dashboard overview API with initial empty states.

**Exit criteria:** authorized users can log in and see only permitted
screens/data.

### Phase 2 --- Citizens

-   Citizen CRUD.
-   CSV/XLSX preview and import.
-   Duplicate detection and contact eligibility/opt-out fields.
-   Search, filters, pagination.

**Exit criteria:** test citizens can be safely managed and imported.

### Phase 3 --- Complaints

-   Complaint models/migrations/services/controllers/routes.
-   Ticket ID generation.
-   Complaint list, details, filters, status history, assignment.
-   Backend confirmation guard and idempotency.

**Exit criteria:** authorized test complaint can be created through a
controlled API test and appears in dashboard.

### Phase 4 --- Text-based AI session engine

-   State machine and questionnaire.
-   Language selection and translation content.
-   Session/message persistence.
-   Read-back and confirmation.
-   Complaint creation only after confirmation.

**Exit criteria:** scripted text conversation creates one complaint only
after explicit confirmation.

### Phase 5 --- Browser microphone and speech

-   STT/TTS adapter interfaces.
-   Integrate selected local models.
-   Browser audio capture/playback.
-   Error and fallback handling.
-   Assamese/Hindi/English testing.

**Exit criteria:** local simulated voice conversation completes
successfully with acceptable tested quality.

### Phase 6 --- Attachments

-   Secure dashboard upload.
-   Expiring upload tokens/link.
-   Attachment listing and preview.
-   Access control and file validation.

**Exit criteria:** authorized operator can upload and view a photo
linked to a ticket; unauthorized access is rejected.

### Phase 7 --- Campaign simulation and reports

-   Campaign creation and eligibility preview.
-   Run/pause/cancel simulation sessions.
-   Session outcomes and dashboard metrics.
-   Reports and exports.

**Exit criteria:** end-to-end simulation campaign works without
contacting real phone numbers.

### Phase 8 --- Stabilization

-   Full test suite.
-   Security review.
-   Responsive/accessibility review.
-   Error monitoring, backup/restore test, documentation.
-   Staging deployment.

**Exit criteria:** all acceptance scenarios pass and the system is ready
for stakeholder demonstration.

### Phase 9 --- Future integrations (not now)

Only after the above phases are accepted: - Confirm Exotel account
approval, exact pricing, outbound API access, and bidirectional audio
streaming capability. - Implement a provider adapter and secure
webhooks. - Test calls with authorized internal test numbers first. -
Add WhatsApp Cloud API only after business verification, opt-in/template
review, and webhook setup. - Add production recording, retention, and
compliance controls. - Never assume a standard virtual-number plan
includes real-time AI audio streaming; confirm the exact feature and
charges with the provider before purchase.

------------------------------------------------------------------------

## 22. Coding Standards and Best Practices

-   TypeScript strict mode across frontend and backend.
-   ESLint + Prettier; consistent naming and formatting.
-   Use `camelCase` for variables/functions, `PascalCase` for React
    components/classes, and consistent database naming.
-   Avoid `any`; define API request/response types.
-   Keep functions focused and small.
-   Reuse shared components, hooks, validators, formatters, and
    services.
-   Do not duplicate business rules between controllers.
-   Keep frontend display logic separate from backend business logic.
-   Use constants/enums for statuses and roles.
-   Validate at API boundaries.
-   Use pagination for large lists.
-   Use database transactions for multi-step writes.
-   Add indexes based on actual query patterns.
-   Avoid N+1 database queries.
-   Use lazy loading/code splitting for large frontend routes.
-   Include loading, empty, error, and success states.
-   Ensure accessible labels, contrast, focus, and keyboard operation.
-   Write meaningful tests for critical paths.
-   Add comments for non-obvious decisions, not obvious code.
-   Keep README instructions current.
-   Do not over-engineer. Add abstractions when they solve real
    duplication or complexity.
-   Do not silently swallow errors.
-   Do not log secrets or sensitive personal data.

------------------------------------------------------------------------

## 23. Definition of Done

A feature is complete only when: - Database changes are implemented
through migrations. - Backend validation, authorization, and error
handling exist. - API is documented. - Frontend is connected to the real
API (not hardcoded mock data, except explicitly labeled demo
fixtures). - Loading, empty, error, and success states are
implemented. - Responsive layout is checked. - Tests cover important
business rules. - No duplicated logic has been introduced
unnecessarily. - Logs do not leak sensitive data. - Documentation and
environment examples are updated.

------------------------------------------------------------------------

## 24. Instructions for the AI Coding Assistant

Use this document as the source of truth when generating the NagarSeva
project.

1.  Read the full document before writing code.
2.  Do not generate the entire application in one huge response.
    Implement one phase at a time.
3.  Start by proposing the repository structure, package choices,
    database migration tool, and setup commands. Explain any stack
    choice before changing it.
4.  Use React + TypeScript for frontend, Node.js + Express + TypeScript
    for backend, and MySQL for persistence.
5.  Follow MVC on the backend and feature-based component architecture
    on the frontend.
6.  Use migrations and seeders. Never rely on automatic schema
    synchronization.
7.  Build reusable components and shared utilities. Before creating a
    new component/helper, check whether an existing one should be
    reused.
8.  Keep controllers thin and put business rules in services.
9.  Keep AI dialogue generation separate from authoritative backend
    business logic.
10. Implement the text-based questionnaire and confirmation guard before
    integrating speech models.
11. Build the browser microphone simulation before any telephony
    integration.
12. Do not integrate Exotel now. Do not request Exotel credentials. Do
    not create fake Exotel integration code. Keep only clean adapter
    interfaces for future use.
13. Do not claim WhatsApp messages or real phone calls were sent during
    simulation.
14. Use environment variables for configuration and provide
    `.env.example`.
15. Do not hardcode secrets, ticket IDs, dashboard metrics, or
    production data.
16. Add tests as each phase is implemented.
17. After each phase, report:
    -   Files created/updated
    -   Migrations added
    -   APIs implemented
    -   UI screens completed
    -   Tests run and results
    -   Commands to run locally
    -   Known limitations and next phase
18. If a requirement is ambiguous, ask one focused question rather than
    inventing a consequential behavior.
19. Do not skip security, authorization, validation, auditability, or
    opt-out handling for convenience.
20. Keep the implementation understandable and maintainable for a small
    development team.

### First task to execute

Begin with **Phase 0 only**: - Recommend and finalize the project
folder/repository structure. - Initialize the React frontend and
Node/Express backend using TypeScript. - Configure MySQL with migrations
and seeders. - Add Docker Compose for local MySQL. - Add environment
validation, linting, formatting, health checks, and starter READMEs. -
Do not start Phase 1 until Phase 0 runs successfully and its setup steps
are documented.

------------------------------------------------------------------------

## 25. Important Product Principle

**NagarSeva must be useful and testable without Exotel.** The first
complete milestone is:

> Admin logs in → adds a test citizen → starts a browser-based simulated
> AI conversation → agent collects and reads back complaint details →
> citizen confirms → backend creates a unique ticket → dashboard
> displays the complaint and transcript → operator attaches a test
> photo.

Only after this complete workflow is stable should real phone calling
and WhatsApp delivery be considered.
