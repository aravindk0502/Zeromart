-- ZeroMart Seed Data
-- Run AFTER schema.sql
-- These listings appear for all users on first load

insert into products (title, category, emoji, distance, condition, seller_name, seller_karma, seller_initials, description, nearby_eligible, listed)
values
  ('Sony Bluetooth Speaker',     'Electronics', '🔊', 0.4, 'Good',      'Ravi K',     47,  'RK', 'Used for 6 months, works perfectly. Moving abroad, no use for it.',                  true,  '2 hours ago'),
  ('Wooden Study Table',         'Furniture',   '🪑', 1.2, 'Very Good', 'Priya M',    83,  'PM', 'Solid teak wood. Kids outgrew it. Ideal for 8–14 year olds.',                        false, '5 hours ago'),
  ('Baby Stroller',              'Baby & Kids', '🍼', 0.7, 'Like New',  'Ananya R',   29,  'AR', 'Used only 3 months. Baby preferred to be carried! Perfect condition.',               true,  '1 day ago'),
  ('Yoga Mat',                   'Sports',      '🧘', 2.1, 'Good',      'Karthik S',  62,  'KS', '6mm thick mat, washed and clean. Bought a premium one, giving this away.',           false, '3 hours ago'),
  ('Stack of Engineering Books', 'Books',       '📚', 0.3, 'Good',      'Meera V',    115, 'MV', 'GATE prep books, Anna University syllabus. Take all 12 books.',                     true,  '6 hours ago'),
  ('Air Fryer',                  'Appliances',  '🍳', 1.8, 'Very Good', 'Suresh P',   38,  'SP', 'Upgraded to a bigger one. 2.5L capacity, works great.',                             false, '2 days ago'),
  ('Kids Bicycle',               'Sports',      '🚲', 0.6, 'Good',      'Lakshmi T',  74,  'LT', '14 inch wheels, suitable for 5–8 year olds. Slightly scratched but fully functional.', true,  '4 hours ago'),
  ('Formal Shirts (5 pcs)',      'Clothing',    '👔', 3.0, 'Very Good', 'Vikram B',   21,  'VB', 'Size 40, wore each maybe 3–4 times. Moving to startup life!',                       false, '1 hour ago')
on conflict do nothing;
