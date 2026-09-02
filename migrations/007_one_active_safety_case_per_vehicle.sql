create unique index safety_cases_one_active_per_vehicle
  on safety_cases (vehicle_id)
  where status <> 'released';
