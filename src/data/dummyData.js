const DAY_MS = 24 * 60 * 60 * 1000;
const futureDate = (days) => new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
const listedAt = (hoursAgo) => new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

const areas = {
  Velachery: [12.9815, 80.2180],
  'T Nagar': [13.0418, 80.2341],
  'Anna Nagar': [13.0850, 80.2101],
  Kodungaiyur: [13.1370, 80.2479],
  Alandur: [13.0048, 80.2017],
  Poonamallee: [13.0473, 80.0945],
  Adyar: [13.0067, 80.2570],
  Tambaram: [12.9249, 80.1000],
  Porur: [13.0356, 80.1582],
  Ambattur: [13.1143, 80.1548],
};

const images = {
  bread: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
  table: 'https://images.unsplash.com/photo-1519947486511-46149fa0a254?auto=format&fit=crop&w=900&q=80',
  books: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=900&q=80',
  chair: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=900&q=80',
  mixer: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=900&q=80',
  bag: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80',
  milk: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=900&q=80',
  buns: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80',
  fruit: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=80',
  lotion: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80',
  rice: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80',
  juice: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&w=900&q=80',
  bicycle: 'https://images.unsplash.com/photo-1507035895480-2b3156c31fc8?auto=format&fit=crop&w=900&q=80',
  tickets: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=80',
  vegetables: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  coffee: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=900&q=80',
  snacks: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',
  toys: 'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=900&q=80',
  utensils: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=900&q=80',
  plants: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80',
};

const createListing = ({
  id, title, area, offset = [0, 0], sellerName, sellerKarma, image, category,
  condition = 'Good', quantity = 1, hoursAgo = 1, expiryDays = 30, business = false,
}) => {
  const [baseLatitude, baseLongitude] = areas[area];
  const latitude = baseLatitude + offset[0];
  const longitude = baseLongitude + offset[1];
  const locationData = {
    latitude,
    longitude,
    area,
    locality: area,
    city: 'Chennai',
    district: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    countryCode: 'in',
    formattedAddress: `${area}, Chennai, Tamil Nadu, India`,
    fullAddress: `${area}, Chennai, Tamil Nadu, India`,
  };
  return {
    id,
    title,
    brand: business ? sellerName : undefined,
    category,
    condition,
    description: `${title} available for ₹0 from ${sellerName} in ${area}.`,
    location: area,
    locationData,
    coordinates: { latitude, longitude },
    latitude,
    longitude,
    sellerName,
    sellerKarma,
    sellerType: business ? 'business' : 'community',
    listingType: business ? 'business' : 'community',
    isBusinessProduct: business,
    businessId: business ? `demo-store-${area.toLowerCase().replaceAll(' ', '-')}` : undefined,
    businessProductId: business ? id : undefined,
    ownerMobile: business ? undefined : `88${String(id).replace(/\D/g, '').padStart(8, '0').slice(-8)}`,
    image,
    status: 'active',
    price: 0,
    totalQuantity: quantity,
    availableQuantity: quantity,
    reservedQuantity: 0,
    soldQuantity: 0,
    maxQuantityPerUserPer24h: 2,
    expiryDate: futureDate(expiryDays),
    createdAt: listedAt(hoursAgo),
    autoList: true,
    isDemo: true,
  };
};

export const initialItems = [
  createListing({ id: 'chennai-01', title: 'Fresh Bread', area: 'Velachery', offset: [0.0010, -0.0008], sellerName: 'Lakshmi', sellerKarma: 48, image: images.bread, category: 'Food', condition: 'Fresh', quantity: 4, hoursAgo: 1, expiryDays: 2 }),
  createListing({ id: 'chennai-02', title: 'Near Expiry Milk', area: 'Velachery', offset: [-0.0015, 0.0011], sellerName: 'Velachery Dairy', sellerKarma: 82, image: images.milk, category: 'Food', condition: 'Fresh', quantity: 6, hoursAgo: 2, expiryDays: 1, business: true }),
  createListing({ id: 'chennai-03', title: 'Study Table', area: 'T Nagar', offset: [0.0012, 0.0007], sellerName: 'Karthik', sellerKarma: 27, image: images.table, category: 'Furniture', quantity: 1, hoursAgo: 4 }),
  createListing({ id: 'chennai-04', title: 'Bakery Buns', area: 'T Nagar', offset: [-0.0010, -0.0010], sellerName: 'T Nagar Bakery', sellerKarma: 96, image: images.buns, category: 'Food', condition: 'Fresh', quantity: 8, hoursAgo: 3, expiryDays: 2, business: true }),
  createListing({ id: 'chennai-05', title: 'Kids Books', area: 'Anna Nagar', offset: [0.0010, 0.0014], sellerName: 'Priya', sellerKarma: 64, image: images.books, category: 'Books', quantity: 5, hoursAgo: 6 }),
  createListing({ id: 'chennai-06', title: 'Fruits Pack', area: 'Anna Nagar', offset: [-0.0013, 0.0006], sellerName: 'Anna Fresh Mart', sellerKarma: 110, image: images.fruit, category: 'Food', condition: 'Fresh', quantity: 7, hoursAgo: 1, expiryDays: 3, business: true }),
  createListing({ id: 'chennai-07', title: 'Old Chair', area: 'Kodungaiyur', offset: [0.0006, -0.0005], sellerName: 'Mohan', sellerKarma: 18, image: images.chair, category: 'Furniture', condition: 'Usable', quantity: 1, hoursAgo: 8 }),
  createListing({ id: 'chennai-08', title: 'Rice Pack', area: 'Kodungaiyur', offset: [-0.0011, 0.0009], sellerName: 'North Chennai Stores', sellerKarma: 73, image: images.rice, category: 'Grocery', condition: 'New', quantity: 10, hoursAgo: 2, expiryDays: 60, business: true }),
  createListing({ id: 'chennai-09', title: 'Mixer Grinder', area: 'Alandur', offset: [0.0007, 0.0010], sellerName: 'Fathima', sellerKarma: 39, image: images.mixer, category: 'Electronics', condition: 'Usable', quantity: 1, hoursAgo: 12 }),
  createListing({ id: 'chennai-10', title: 'Juice Bottle Pack', area: 'Alandur', offset: [-0.0012, -0.0006], sellerName: 'Alandur Supermarket', sellerKarma: 88, image: images.juice, category: 'Food', condition: 'Fresh', quantity: 5, hoursAgo: 3, expiryDays: 5, business: true }),
  createListing({ id: 'chennai-11', title: 'School Bag', area: 'Poonamallee', offset: [0.0014, -0.0009], sellerName: 'Divya', sellerKarma: 31, image: images.bag, category: 'Kids', condition: 'Good', quantity: 2, hoursAgo: 5 }),
  createListing({ id: 'chennai-12', title: 'Cosmetic Lotion', area: 'Poonamallee', offset: [-0.0010, 0.0012], sellerName: 'Poonamallee Wellness', sellerKarma: 57, image: images.lotion, category: 'Cosmetics', condition: 'New', quantity: 4, hoursAgo: 7, expiryDays: 90, business: true }),
  createListing({ id: 'chennai-13', title: 'Kids Bicycle', area: 'Adyar', offset: [0.0008, 0.0013], sellerName: 'Arjun', sellerKarma: 52, image: images.bicycle, category: 'Kids', condition: 'Usable', quantity: 1, hoursAgo: 9 }),
  createListing({ id: 'chennai-14', title: 'Fresh Vegetable Basket', area: 'Adyar', offset: [-0.0013, -0.0007], sellerName: 'Adyar Fresh Cart', sellerKarma: 124, image: images.vegetables, category: 'Food', condition: 'Fresh', quantity: 6, hoursAgo: 1, expiryDays: 3, business: true }),
  createListing({ id: 'chennai-15', title: 'Movie Tickets Tonight', area: 'Tambaram', offset: [0.0010, 0.0008], sellerName: 'Meera', sellerKarma: 76, image: images.tickets, category: 'Movie Tickets', condition: 'New', quantity: 2, hoursAgo: 1, expiryDays: 1 }),
  createListing({ id: 'chennai-16', title: 'Snack Box', area: 'Tambaram', offset: [-0.0014, -0.0006], sellerName: 'Tambaram Foods', sellerKarma: 67, image: images.snacks, category: 'Food', condition: 'Fresh', quantity: 8, hoursAgo: 4, expiryDays: 4, business: true }),
  createListing({ id: 'chennai-17', title: 'Kitchen Utensils', area: 'Porur', offset: [0.0009, -0.0010], sellerName: 'Ravi', sellerKarma: 44, image: images.utensils, category: 'Home', condition: 'Good', quantity: 3, hoursAgo: 14 }),
  createListing({ id: 'chennai-18', title: 'Coffee Beans Pack', area: 'Porur', offset: [-0.0010, 0.0011], sellerName: 'Porur Pantry', sellerKarma: 91, image: images.coffee, category: 'Food', condition: 'New', quantity: 5, hoursAgo: 2, expiryDays: 30, business: true }),
  createListing({ id: 'chennai-19', title: 'Indoor Plants', area: 'Ambattur', offset: [0.0012, 0.0005], sellerName: 'Nisha', sellerKarma: 35, image: images.plants, category: 'Home', condition: 'Healthy', quantity: 3, hoursAgo: 10 }),
  createListing({ id: 'chennai-20', title: 'Family Toy Set', area: 'Ambattur', offset: [-0.0010, -0.0012], sellerName: 'Ambattur Kids Store', sellerKarma: 69, image: images.toys, category: 'Kids', condition: 'New', quantity: 4, hoursAgo: 6, expiryDays: 120, business: true }),
  createListing({ id: 'chennai-21', title: 'Exam Preparation Books', area: 'Kodungaiyur', offset: [0.0021, 0.0012], sellerName: 'Suresh', sellerKarma: 90, image: images.books, category: 'Books', quantity: 6, hoursAgo: 2 }),
  createListing({ id: 'chennai-22', title: 'Breakfast Buns', area: 'Velachery', offset: [0.0020, 0.0015], sellerName: 'Morning Oven', sellerKarma: 105, image: images.buns, category: 'Food', condition: 'Fresh', quantity: 9, hoursAgo: 1, expiryDays: 2, business: true }),
];
