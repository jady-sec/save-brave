-- No duplicate category names per owner/household and type; lets default seeding be idempotent.
alter table categories add constraint categories_owner_name unique (owner_id, type, name);
alter table categories add constraint categories_household_name unique (household_id, type, name);
