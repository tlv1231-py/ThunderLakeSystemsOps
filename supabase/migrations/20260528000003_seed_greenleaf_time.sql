-- Greenleaf historical time entry import
-- Projects
INSERT INTO public.projects (id, client_id, name, billing_type, is_active)
VALUES
  ('a1b2c3d4-e5f6-4789-8abc-def012345678', 'bd4a36be-2651-40e5-8a05-963f1dc5b4db', 'Access DB & Accounts Receivable', 'hourly', true),
  ('b2c3d4e5-f6a7-4890-9bcd-ef0123456789', 'bd4a36be-2651-40e5-8a05-963f1dc5b4db', 'SuperScheduler', 'hourly', true);

-- Time entries
-- AR = a1b2c3d4-e5f6-4789-8abc-def012345678
-- SS = b2c3d4e5-f6a7-4890-9bcd-ef0123456789
-- client = bd4a36be-2651-40e5-8a05-963f1dc5b4db
-- user   = 9133c4a3-2734-4390-b9b8-19ddd4eecb8e

INSERT INTO public.time_entries
  (user_id, client_id, project_id, date_worked, hours_decimal, description, billable, status)
VALUES
-- === PAID (pre-May 2026) ===
-- March 2025
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-03-26',1.50,'Call with Brian re: Invoicing, SuperScheduler',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-03-30',3.00,'Invoice automation for Tree Work and Plant Health Care switchboards',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-03-30',1.50,'Call with Brian re: Brian''s process, excel, and Access syntax error',true,'paid'),
-- November 2025
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-03',0.50,'Install & credential QB and access, download data from email.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-05',2.00,'Created isolated test versions of access database. Got acquainted with database schema. Found the relevant table relationships. Wrote queries to pull relevant data.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-12',2.00,'Prepped .accdb data for export - learned of proprietary intuit filetypes. Learned intuit parameters and wrote scripts to package .accdb file for proprietary quickbooks migration.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-19',5.00,'In-office Greenleaf. Sorted Dropbox migration. Got access database pulling from local instead of networked computer. Got intuit account credentials updated and current on Brian''s machine. Installed QB.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-20',2.00,'Built in-access reports to generate prototype invoices in access. Investigated option to keep invoicing access-specific rather than QB.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-21',2.00,'After call w/ Brian, traced the data entry process for scheduled vs completed jobs in database to discover relevant data for queries. Built queries for accts receivable.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-26',3.00,'Tested queries and relationships for accts receivable with real back-end data - troubleshooted data flow after connecting to Greenleaf Dropbox.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-11-30',2.00,'Created sql queries specific to "broad", "per-client", and "detail" for accts receivable. Made isolated test environment to design queries and modify switchboards based on existing historical queries and reports.',true,'paid'),
-- December 2025
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-02',3.00,'Created accounts receivable switchboard. Designed reports based on accts receivable queries. Formatted reports. Tested report generations. Saved as version for upload and test.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-03',1.00,'Made report design fixes for print and archive.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-04',3.00,'Updated the accounts receivable system by incorporating partial payments into qryReceivablesByClientIncludePartials and rptReceivablesByClientIncludePartials, and added a totals display on a form sourced from qryTotalReceivables showing AmountDueNumeric formatted as currency.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-05',6.00,'Built qryInvoiceByCustomerBase, qryInvoiceByCustomer, and the report rptInvoiceByCustomer along with the supporting Payments table and its relationships to generate customer-specific printable invoices that correctly calculate AmountDueNumeric, PaidAmount, and BalanceDue.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-06',2.00,'Built Payments table, built OrderSource linked table, built qryPamentsUpdatePdAmt1-6 to update Payments from existing Pd Amt columns in Orders.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-06',5.50,'Created new report for Accounts Receivable by customer based on Payments table. Delivered Dropbox version 12.6.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2025-12-07',4.00,'Created qryCustomerReceivable, with subqueries qryCustomerBillable, qryCustomerBillable2, and qryCustomerTotalPaid.',true,'paid'),
-- April 2026 (AR maintenance)
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-08',0.50,'Call with Brian re: push updates and invoicing input anomalies.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-09',1.50,'Push update 2025_v2.0, 2026_v2.0.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-10',2.00,'Restore CID 9251 and OID 26672 to data-2026.accdb.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-15',2.00,'Resolve accidentally deleted Order Detail data.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-15',1.00,'Resolve accidentally deleted Order Detail data.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-17',1.00,'"Undo" the batch invoice generation, create undo button.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-04-18',1.00,'Call for laptop access setup.',true,'paid'),
-- April 2026 (SuperScheduler begins)
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-04-21',1.00,'Demo and feedback prototype scheduling utility.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-04-23',6.00,'Scheduling Utility prototype build.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-04-29',1.00,'Data cleanup report and queries.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-04-30',1.00,'Scheduling Treatment_Detail intervals list build.',true,'paid'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-04-30',1.00,'Call w Brian for treatment timings & demo.',true,'paid'),
-- === UNINVOICED (May 2026) ===
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-01',3.50,'Add price to scheduling utility, running totals, Update Schedule button.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-05-01',2.00,'Data Restoration â€” ORDER DETAIL, EVENT.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-01',1.50,'Core Pick List Query â€” qrySuperscheduler.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-02',1.00,'Testing use-case for Scheduler, health checks, dev tools.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-02',0.75,'Crew Assignments Query â€” qryCrewAssignments.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-02',0.25,'Missing Start Dates Query â€” qryMissingStartDates.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-03',0.25,'Close-Out Query â€” qryCloseOut.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-04',1.00,'Relink back-end to accommodate Office/Laptop switching without redundancies.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-04',1.50,'Logic for timing intervals and pest cleanup.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-04',0.50,'Temp Assignment Table â€” tblCrewAssignments.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-05',4.00,'Main Scheduler Form â€” frmSuperScheduler.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-06',1.00,'Pest data cleanup for iterative treatments.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-06',1.00,'Iterative intelligence for incremental treatments.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-06',2.50,'Pick List Subform â€” frmSuperSchedulerSub.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-07',1.50,'Crew Assignment Panels â€” frmCrew1Sub, frmCrew2Sub.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-08',1.00,'Call w/ Mark re: sequential treatments.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-08',2.00,'Map Integration â€” cmdMapCrew1/2.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-08',1.50,'Schedule Crew Buttons â€” cmdScheduleCrew1/2.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-09',2.00,'Update Scheduling Logic â€” cmdUpdateScheduling.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-10',1.00,'Crew Schedule Report â€” rptCrewSchedule.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-10',0.50,'Missing Start Dates Report â€” rptMissingStartDates.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-11',1.50,'Smart Link / Switchboard â€” SwitchBoard1.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-12',1.50,'Developer Tools â€” frmDevTools.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-13',2.00,'Pest Data Cleanup â€” ORDER DETAIL.Pest.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-14',3.00,'Update Scheduling button.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-14',0.50,'Backend Schema Changes â€” ORDER DETAIL DDL.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-15',3.00,'Update Scheduling button.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-15',1.50,'Push Process & DevOps â€” Process.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-16',1.50,'City Data Cleanup â€” CUSTOMER.City.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-16',0.75,'Grid Data Cleanup â€” ORDER.Work Grid.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-16',1.50,'TreatmentID build â€” tblTreatmentIntervals, ORDER DETAIL field, scheduler button update, CleanupPestData.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-17',1.00,'Dirty Data Audit & Report â€” Greenleaf_DirtyData_Cleanup.xls.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-17',1.00,'Batch Update VBA Module â€” Greenleaf_Cleanup_Updates.bas.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-18',1.50,'Treatment Intervals Reference â€” Greenleaf_Treatment_Intervals.xls.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-19',1.00,'DB Integrity Audit & Push Verification â€” data-2026_5.19 / 2026_v2_5.19.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-19',2.25,'modScheduling revision and verification per ML feedback.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-20',1.00,'frmSuperScheduler scheduling logic.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-20',1.00,'SuperScheduler priority intervals for recurring Pest data.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-20',1.00,'Update Scheduling button â€” SuperScheduler.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','a1b2c3d4-e5f6-4789-8abc-def012345678','2026-05-21',1.25,'Invoice Switchboard analysis â€” PHC/Tree Work button research, Billed=Yes anomaly documentation, proposed first-run PHC invoice button.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-22',1.00,'Crew close-out workflow: Brian checks/unchecks jobs in crew subforms, clicks Close Out Crew. Checked jobs write EVENT.Completed=Yes + Complete_Date. All jobs cleared from tblCrewAssignments. Unchecked jobs return to pick list.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-25',3.00,'With Mark, UpdateScheduling button logic for Priority handling and tblTreatmentIntervals association.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-25',2.00,'Overhauled the Update Scheduling logic, built two new pre-check reports that fire when you click Update Scheduling (rptMissingStartDates, rptUnmatchedTreatments), Scheduling Utility fixes, data cleanup.',true,'uninvoiced'),
('9133c4a3-2734-4390-b9b8-19ddd4eecb8e','bd4a36be-2651-40e5-8a05-963f1dc5b4db','b2c3d4e5-f6a7-4890-9bcd-ef0123456789','2026-05-27',1.50,'Call w Brian for tblTreatmentIntervals.',true,'uninvoiced');

