# Stakeholder demonstration script

About 20 minutes. Follows the blueprint's end-to-end acceptance scenario. Everything is a
**simulation**: no phone call is made and no WhatsApp message is sent.

## Before the demo

1. Start the stack (staging, or locally: `npm run dev`, plus `npm run dev:ai` for voice).
2. Check `/api/v1/health` shows `"status":"ok"` (and `speechService: "ok"` for voice).
3. Run one voice session in advance so the speech models are loaded (the first reply is slow).
4. Prepare one test citizen with documented consent, a second one without consent, and a
   phone or laptop to open a citizen upload link.

## 1. Overview (2 min)

Sign in as an administrator. Show the dashboard: citizens, eligible contacts, complaints, and
session activity. Point out that access is role-based: an operator sees only their assigned
complaints, and an auditor can read but not change anything.

## 2. A citizen calls in (6 min)

1. Open **AI call studio**, select the test citizen, leave the language as "Let the assistant
   ask", choose **Voice** (or Text), and start.
2. The assistant greets the citizen, **says it is an AI**, explains what is recorded, and asks
   for a language (Assamese, Hindi or English).
3. Answer as the citizen: the problem, then the location and nearest landmark.
4. The assistant **reads everything back** and asks for a yes or no.
5. Say **"no"**, choose what to correct, give the new detail, and confirm with **"yes"**.
6. A ticket number is announced, with the reminder that this was a simulation.

Key message: **the AI never creates a complaint on its own.** The server registers it only
after the citizen explicitly confirms the read-back, exactly once.

## 3. Staff handle the ticket (4 min)

1. Click the ticket. Show the complaint details and status history.
2. Assign it to an operator. Sign in as that operator in another browser and open the ticket.
3. Expand **Conversation transcript** (the operator can read it for their own tickets only).
4. Click **Citizen upload link**, open the link on a phone, and upload a photo without an
   account. It appears on the ticket as "Citizen link".
5. Change the status to _In progress_.

## 4. Controlled outreach (4 min)

1. Open **Campaigns**, create a campaign for one ward, and click **Preview eligibility**.
2. Show that the citizen without consent is **excluded with a reason**: the system only
   includes citizens with documented consent who have not opted out.
3. Start the simulation and click **Run next recipient**. Mention that a citizen who opts out
   mid-campaign is skipped automatically.

## 5. Reports (3 min)

Open **Reports**: complaints over time, by status, category and ward; session outcomes and
languages; campaign completion. Switch a chart to **Table**, change the date range, and export
the complaint CSV (no citizen names or phone numbers).

## 6. Safeguards to mention

- Cancelling ("stop") or answering "no" never creates a complaint.
- Unclear speech is never guessed: the assistant asks again, and typing is always available.
- Every sensitive action (exports, photo views, uploads, sign-ins) is in the audit log.
- Backups are tested by restoring them.

## Known limits to state openly

- **Assamese voice input is not reliable** with the current model; typed replies work. A
  better Assamese model (AI4Bharat IndicConformer) is the planned next step.
- The current speech voice is licensed for non-commercial use only and will be replaced.
- Assamese and Hindi wording still needs review by fluent speakers.
- Real phone calls and WhatsApp are future work and need telecom approvals first.
