# FPO witness countersignature

The assigned officer acts as a witness: they attest to the farmer's FPO affiliation and their review of the buyer/farmer agreement. They are not a third buyer/seller, guarantor, payment provider or independent proof of identity. Existing shared demo login/OTP remains sandbox authentication.

## Set up and demonstrate

1. Deploy both updated client and server. No new environment keys are needed.
2. Create/use a **separate operations account** for the officer (Operations login). Do not use the farmer or buyer login for the witness. The current demo authentication uses the configured `DEV_OTP`.
3. In an operations session, select **AgriLink operations** in the Desk picker. Open **Farmers → FPO witness assignments** and choose the officer account for each farmer. The server binds that officer to the farmer's FPO ID. An officer cannot be assigned to a different FPO afterward through this interface. Multiple farmers in the same FPO may share that officer. Assignments require the existing admin desk; picking another desk alone never grants a witness signature.
4. Buyer or farmer opens a draft agreement and selects **Send for signature**. This is blocked with an explanatory error if no matching officer is assigned. The draft PDF includes the officer's name and witness attestation. All three signatories commit to this exact draft hash.
5. Buyer and farmer sign in either order. The agreement remains pending and the quantity remains reserved until the witness signs.
6. The assigned officer receives an in-app notification when both parties have signed. Open **Agreements & witness**, or the notification, then **Witness & sign**. Review the PDF, complete the sandbox OTP check and consent, and apply the signature.
7. The signed PDF/certificate includes all three signatures. The claim activates, then blockchain anchoring is attempted only when configured. Amendment drafts require a new signature round, including the currently assigned matching officer.

Contract lists/details and notifications poll every 15 seconds on serverless deployments; no WebSocket is required. Officer notifications are in-app; Telegram linking is currently farmer-only.

## Scope and records

- User `fpoOfficer` is writable only through the operations assignment endpoint, not farmer profile forms. Officer `officerFpoId` is a separate explicit affiliation; the demo desk picker does not change it.
- The signer snapshot stores officer user ID, FPO ID, name, organisation, signature evidence, timestamps and the exact document hash. The send audit event records the assigned officer/FPO. Changing an assignment later cannot replace the witness on an already-sent document.
- An unrelated officer cannot start verification, verify OTP or sign. A witness cannot edit commercial terms, send drafts or mutate the agreement's party-only workflows.
- The old bond-signing route rejects witness-required agreements, preventing a two-party shortcut around the contract flow. Explicit legacy records remain supported.
- Previously signed documents are not modified. Previously sent two-party rounds keep their existing signatories; use a new agreement or amendment to include a witness rather than silently changing a document already signed. Newly sent drafts always require an assigned witness.
- The existing demo operations account can switch into the admin desk. This is a prototype account policy, not production staff provisioning or strong authentication. Use separate real staff identities and enforce administrative permissions before a production launch. A witness improves accountability; it does not fix shared OTP login.

Endpoints: operations `GET /api/contracts/witness-assignment`, admin-desk `PUT /api/contracts/witness-assignment/:farmerId` with `{ "officerId": "USER_OBJECT_ID" }`. Existing contract identity/sign endpoints authorize the exact snapshotted witness account. No manual database reset or seed is required.
