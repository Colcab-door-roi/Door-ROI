-- Real data imported from "Door ROI.xlsx" (Doors + Ref Type sheets).
-- Run after schema.sql.

insert into plant_types (name, cop) values
  ('Simplex', 1.9),
  ('Multiplex', 2.3),
  ('Waterloop', 4.2),
  ('DX', 2.5);

insert into case_types (name, w_per_ft_without_doors, savings_percent) values
  ('Dairy Std', 450, 50),
  ('Dairy Lofty 2003-2009', 570, 50),
  ('Dairy Lofty 2009 onwards', 480, 50),
  ('800 Dairy', 340, 50),
  ('800 Dairy Lofty', 380, 50),
  ('Huberg Lofty', 410, 40),
  ('800 Huberg Lofty', 330, 40),
  ('Live Wall', 530, 50),
  ('Live Wall Lofty', 590, 50),
  ('High Meat', 400, 50),
  ('High Meat Lofty', 450, 50);
