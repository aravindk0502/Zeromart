export const BUSINESS_ACCOUNTS_KEY = 'zeromart-business-accounts';
export const BUSINESS_SESSION_KEY = 'zeromart-business-session';
export const BUSINESS_PRODUCTS_KEY = 'zeromart-business-products';
export const BUSINESS_RULES_KEY = 'zeromart-business-rules';
export const BUSINESS_ORDERS_KEY = 'zeromart-business-orders';
export const BUSINESS_PURCHASES_KEY = 'zeromart-business-purchases';
export const CUSTOMER_ORDERS_KEY = 'zeromart-order-history';

export const DEFAULT_BUSINESS_RULES = [
  { id: 'rule-bakery', category: 'Bakery', days: 0, discount: 40, autoList: true },
  { id: 'rule-dairy', category: 'Dairy', days: 1, discount: 30, autoList: true },
  { id: 'rule-food', category: 'Food', days: 2, discount: 25, autoList: true },
  { id: 'rule-grocery', category: 'Grocery', days: 7, discount: 15, autoList: true },
  { id: 'rule-cosmetics', category: 'Cosmetics', days: 30, discount: 20, autoList: true },
];

const read = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('zeromart-business-change'));
  return value;
};

export const getBusinessAccounts = () => read(BUSINESS_ACCOUNTS_KEY, []);
export const saveBusinessAccounts = (value) => write(BUSINESS_ACCOUNTS_KEY, value);
export const getBusinessSession = () => read(BUSINESS_SESSION_KEY, null);
export const saveBusinessSession = (value) => write(BUSINESS_SESSION_KEY, value);
export const clearBusinessSession = () => {
  localStorage.removeItem(BUSINESS_SESSION_KEY);
  window.dispatchEvent(new CustomEvent('zeromart-business-change'));
};
export const getBusinessProducts = () => read(BUSINESS_PRODUCTS_KEY, []);
export const saveBusinessProducts = (value) => write(BUSINESS_PRODUCTS_KEY, value);
export const getBusinessOrders = () => read(BUSINESS_ORDERS_KEY, []);
export const saveBusinessOrders = (value) => write(BUSINESS_ORDERS_KEY, value);
export const getBusinessPurchases = () => read(BUSINESS_PURCHASES_KEY, []);
export const saveBusinessPurchases = (value) => write(BUSINESS_PURCHASES_KEY, value);
export const updateBusinessPurchaseStatus = (sellerOrderId, status) => {
  const purchases = getBusinessPurchases();
  if (!purchases.some((purchase) => purchase.sellerOrderId === sellerOrderId)) return purchases;
  return saveBusinessPurchases(purchases.map((purchase) => (
    purchase.sellerOrderId === sellerOrderId
      ? { ...purchase, status, updatedAt: new Date().toISOString() }
      : purchase
  )));
};
export const updateCustomerOrderStatus = (orderId, status) => {
  const orders = read(CUSTOMER_ORDERS_KEY, []);
  if (!orders.some((order) => order.id === orderId || order.orderId === orderId)) return orders;
  return write(CUSTOMER_ORDERS_KEY, orders.map((order) => (
    order.id === orderId || order.orderId === orderId
      ? { ...order, status, updatedAt: new Date().toISOString() }
      : order
  )));
};
export const getBusinessRules = () => {
  const saved = read(BUSINESS_RULES_KEY, null);
  if (saved) return saved;
  return write(BUSINESS_RULES_KEY, DEFAULT_BUSINESS_RULES);
};
export const saveBusinessRules = (value) => write(BUSINESS_RULES_KEY, value);

export const daysUntilExpiry = (date) => {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86400000);
};

export const applyExpiryRules = (products, rules) => products.map((product) => {
  const freeProduct = { ...product, mrp: 0, sellingPrice: 0 };
  if (product.status === 'Sold') return freeProduct;
  const expiryTimestamp = product.expiryDate
    ? new Date(`${product.expiryDate}T${product.expiryTime || '23:59'}:00`).getTime()
    : null;
  if (expiryTimestamp && Date.now() > expiryTimestamp) return { ...freeProduct, status: 'Expired' };
  const daysLeft = daysUntilExpiry(product.expiryDate);
  if (daysLeft < 0) return { ...freeProduct, status: 'Expired' };
  const rule = rules.find((entry) => entry.category.toLowerCase() === String(product.category).toLowerCase());
  const threshold = rule?.days ?? 0;
  if (product.autoList && rule?.autoList && daysLeft <= threshold) {
    return { ...freeProduct, status: 'Listed', nearExpiry: true };
  }
  return { ...freeProduct, status: daysLeft <= Math.max(threshold, 3) ? 'Near Expiry' : 'Safe', nearExpiry: daysLeft <= Math.max(threshold, 3) };
});

export const toMarketplaceItem = (product, account) => ({
  id: `business-product-${product.id}`,
  businessProductId: product.id,
  businessId: product.businessId,
  isBusinessProduct: true,
  sellerType: 'business',
  title: product.name,
  category: product.category,
  condition: product.nearExpiry ? 'Near Expiry Deal' : 'New',
  description: product.description || `${product.name} from ${account?.businessName || product.storeName}.`,
  location: product.pickupLocation || account?.storeLocation || 'Store pickup',
  locationData: product.locationData || account?.locationData || null,
  coordinates: product.coordinates || (account?.locationData ? { latitude: account.locationData.latitude, longitude: account.locationData.longitude } : null),
  distance: 'Nearby',
  sellerName: account?.businessName || product.storeName || 'Business Store',
  sellerId: product.businessId || account?.id || '',
  ownerMobile: account?.mobile || product.businessId || account?.id || '',
  sellerKarma: account?.karma || 0,
  image: product.image || product.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  status: 'Available',
  validTill: product.expiryDate,
  expiryDate: product.expiryDate,
  quantity: product.quantity,
  totalQuantity: Number(product.totalQuantity ?? product.quantity ?? 1),
  availableQuantity: Number(product.availableQuantity ?? product.quantity ?? 1),
  reservedQuantity: Number(product.reservedQuantity || 0),
  soldQuantity: Number(product.soldQuantity || 0),
  expiryTime: product.expiryTime || '',
  listingType: 'business',
  maxQuantityPerUserPer24h: Number(product.maxQuantityPerUserPer24h || 2),
  mrp: 0,
  price: 0,
  businessVerified: true,
  nearExpiryDeal: Boolean(product.nearExpiry),
  createdAt: product.createdAt,
  updatedAt: product.updatedAt || product.createdAt || new Date().toISOString(),
  deliveryMode: 'pickup',
  allowInPersonCollection: true,
  requiresDelivery: false,
});

export const getBusinessMarketplaceItems = () => {
  const accounts = getBusinessAccounts();
  return getBusinessProducts()
    .filter((product) => {
      const status = String(product.status || '').toLowerCase();
      const availableQuantity = Number(product.availableQuantity ?? product.quantity ?? 0);
      return product.autoList !== false
        && availableQuantity > 0
        && !['expired', 'sold', 'hidden', 'completed'].includes(status);
    })
    .map((product) => toMarketplaceItem(product, accounts.find((account) => account.id === product.businessId)));
};

export const createBusinessOrder = (item, buyer, details = {}) => {
  if (!item?.isBusinessProduct) return null;
  const order = {
    id: details.orderId || `ZM-${Date.now().toString(36).toUpperCase()}`,
    orderId: details.orderId || null,
    businessId: item.businessId,
    buyerId: details.buyerId || buyer?.userId || buyer?.mobile || '',
    productId: item.businessProductId,
    productName: item.title,
    buyerName: details.buyerName || buyer?.name || 'Drizn buyer',
    buyerMobile: details.buyerPhone || buyer?.mobile || '',
    buyerLocationData: details.buyerLocationData || buyer?.location || null,
    buyerBusinessId: details.buyerBusinessId || buyer?.businessId || null,
    quantity: Number(details.quantity || 1),
    collectionCode: details.collectionCode || '',
    collectionWindow: details.collectionWindow || '',
    fulfilment: details.type === 'delivery' ? 'Delivery' : 'Collection',
    status: details.status || 'Pending',
    createdAt: new Date().toISOString(),
  };
  saveBusinessOrders([order, ...getBusinessOrders()]);
  return order;
};
