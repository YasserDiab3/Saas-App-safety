-- ============================================================
-- 0003_seed.sql — default plans + sheet registry
-- ============================================================

-- ---- Plans (limits are starting defaults; tune later) --------
insert into app.plans (id, name, price_id, max_users, storage_mb, modules, sort_order) values
  ('free',       'Free',        null, 5,   200,   '[]'::jsonb, 1),
  ('pro',        'Pro',         null, 50,  5000,  '[]'::jsonb, 2),
  ('enterprise', 'Enterprise',  null, 1000,100000,'[]'::jsonb, 3)
on conflict (id) do nothing;
-- modules = [] means "all modules enabled". Restrict per-plan later by
-- listing allowed module keys, e.g. '["clinic","ppe","incidents"]'.

-- ---- Sheet registry -----------------------------------------
-- Every logical sheet used by the 38 frontend modules. The generic
-- app.records store needs no per-sheet table; this registry powers
-- validation, module-gating, and (later) alias normalization.
-- alias_of is left NULL here; confirmed aliases are added in Phase 2
-- after checking real data (e.g. PPEStock vs PPE_Stock).
insert into app.sheets (name, module_key, is_config) values
  ('ActionTrackingRegister',     'action-tracking',      false),
  ('AnnualTrainingPlans',        'training',             false),
  ('AppEmergencyNumbers',        'emergency',            true),
  ('ApprovedContractors',        'contractors',          false),
  ('BehaviorMonitoring',         'behavior-monitoring',  false),
  ('Blacklist_Register',         'contractors',          false),
  ('ChemicalSafety',             'chemical-safety',      false),
  ('ClinicContractorInjuries',   'clinic',               false),
  ('ClinicContractorVisits',     'clinic',               false),
  ('ClinicInventory',            'clinic',               false),
  ('ClinicVisits',               'clinic',               false),
  ('ContractorApprovalRequests', 'contractors',          false),
  ('ContractorBehaviorMonitoring','behavior-monitoring', false),
  ('ContractorDeletionRequests', 'contractors',          false),
  ('ContractorEvaluations',      'contractors',          false),
  ('ContractorTrainings',        'training',             false),
  ('Contractors',                'contractors',          false),
  ('DailyObservations',          'daily-observations',   false),
  ('DailySafetyCheckList',       'periodic-inspections', false),
  ('DocumentCodes',              'iso',                  true),
  ('DocumentVersions',           'iso',                  false),
  ('EmergencyAlerts',            'emergency',            false),
  ('EmergencyPlans',             'emergency',            false),
  ('EmergencyPlansUpdates',      'emergency',            false),
  ('Employees',                  'employees',            false),
  ('ExternalWorkforceMonthly',   'employees',            false),
  ('FireEquipment',              'fire-equipment',       false),
  ('FireEquipmentAssets',        'fire-equipment',       false),
  ('HSEMonitoringPlans',         'hse',                  false),
  ('HSENonConformities',         'hse',                  false),
  ('ISODocuments',               'iso',                  false),
  ('Incidents',                  'incidents',            false),
  ('Injuries',                   'clinic',               false),
  ('KPIAnnualPlans',             'safety-kpis',          false),
  ('LegalDocuments',             'legal-documents',      false),
  ('Medications',                'clinic',               false),
  ('ModuleManagement',           'settings',             true),
  ('NearMiss',                   'nearmiss',             false),
  ('Notifications',              'core',                 false),
  ('PPE',                        'ppe',                  false),
  ('PPE_Stock',                  'ppe',                  false),
  ('PPE_Transactions',           'ppe',                  false),
  ('PPEStock',                   'ppe',                  false),
  ('PTW',                        'ptw',                  false),
  ('PTWIdMapping',               'ptw',                  true),
  ('PTWRegistry',                'ptw',                  false),
  ('PeriodicInspectionCategories','periodic-inspections',true),
  ('PeriodicInspectionRecords',  'periodic-inspections', false),
  ('PeriodicInspectionSchedules','periodic-inspections', false),
  ('RiskAssessments',            'risk-assessment',      false),
  ('SOPJHA',                     'sop-jha',              false),
  ('SafetyBudgets',              'safety-budget',        false),
  ('SafetyPerformanceKPIs',      'safety-kpis',          false),
  ('SafetyTeamAttendance',       'periodic-inspections', false),
  ('SafetyTeamMembers',          'settings',             true),
  ('SickLeave',                  'clinic',               false),
  ('Sustainability',             'sustainability',       false),
  ('Training',                   'training',             false),
  ('TrainingCertificates',       'training',             false),
  ('UserActivityLog',            'core',                 false),
  ('UserTasks',                  'user-tasks',           false),
  ('Violations',                 'violations',           false)
on conflict (name) do nothing;
