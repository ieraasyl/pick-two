ALTER TABLE `rooms` ADD `archived_at` integer CONSTRAINT "rooms_archived_not_open" CHECK (`archived_at` IS NULL OR `status` != 'open');
