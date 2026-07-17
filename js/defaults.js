// ============================================================
// defaults.js — Industry defaults for Loyalty Portal Generator
// ============================================================

const INDUSTRY_DEFAULTS = {
  carwash: {
    label: 'Car Wash',
    colors: { primary: '#1B3A2D', secondary: '#F5F5F5', accent: '#E8B931', dark: '#1A1A1A' },
    tiers: [
      { name: 'Everyday Perks', points: 0 },
      { name: 'Premium Perks', points: 2000 },
      { name: 'Elite Perks', points: 5000 }
    ],
    navLinks: ['Home', 'Brands', 'Locations', 'Referrals', 'Partnerships', 'Cares'],
    vouchers: [
      { title: 'Gas Card ($25)', vendor: 'Giant Eagle', description: '', expiry: 'Ends in 24 days', actionType: 'points', actionValue: '250pts', emoji: '⛽', gradient: ['amber-400','orange-500'] },
      { title: 'Concert Ticket Credit', vendor: 'January-June Season', description: '', expiry: 'Expires today', actionType: 'code', actionValue: 'TCH3454', emoji: '🎫', gradient: ['purple-400','indigo-500'] },
      { title: 'Gift A Free Carwash', vendor: 'Perfect Gift to Family & Friends! 15 points', description: '', expiry: '', actionType: 'qr', actionValue: '', emoji: '🚗', gradient: ['emerald-400','teal-500'] },
      { title: 'Pet Photo Shoot', vendor: 'Participate for 50pts! Votes = bonus points', description: '', expiry: '', actionType: 'qr', actionValue: '', emoji: '📸', gradient: ['pink-400','rose-500'] }
    ],
    offers: [
      { title: 'Be the Fastest Carwash in All The Land', description: 'Play for your chance to be the winner', cta: 'Play Now', playerCount: '1500 Playing', expiry: "Expires on 26 October '25", emoji: '🏎️', gradient: ['sky-700','blue-900'] },
      { title: 'Double Your Points this Winter', description: 'Referrals to Memberships are worth double for all of October', cta: 'Refer Now', playerCount: '', expiry: '', emoji: '🌟', gradient: ['amber-500','orange-600'] }
    ],
    badges: [
      { name: 'Charity Towel Champ', emoji: '🧹', color: 'amber' },
      { name: "Always Sparklin'", emoji: '✨', color: 'emerald' },
      { name: 'EWC Ambassador', emoji: '🏆', color: 'blue' }
    ],
    clubs: [
      { name: 'Charity Chargers', description: 'Charity is the thread that runs through everything we do.', memberCount: 8050, emoji: '❤️', gradient: ['red-500','red-700'] },
      { name: 'Chevy Club', description: 'A Chevrolet community', memberCount: 13870, emoji: '🚙', gradient: ['blue-500','blue-700'] }
    ],
    earnMore: [
      { title: 'Your Review is important to us', description: 'Answer questions about your Washing Experience and earn 100 pts.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite your friends and get 100 pts when they subscribe to our emails.', hasCodeInput: false },
      { title: 'Donate and earn points!', description: 'Donate your clothes, earn points, and get some gear in exchange!', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Breeze Wash Experience', emoji: '🚿' },
      { name: 'Free Car Air Freshener', emoji: '🌲' },
      { name: 'Level 1 Travel Access', emoji: '✈️' },
      { name: 'Welcome Bonus', emoji: '🎁' },
      { name: 'Birthday Surprise', emoji: '🎂' },
      { name: 'Recyclers', emoji: '♻️' },
      { name: 'Bath Extras', emoji: '🧴' }
    ],
    profileTasks: [
      { description: 'Vote for Best Picture of Pets posing during a car wash & earn <strong>100</strong> rewards pts.', cta: 'Vote!' },
      { description: 'Post your freshly washed car, tag our Instagram Channel, and earn <strong>150 pts</strong>.', cta: 'Instagram' },
      { description: 'Add your favorite Scents & <strong>100</strong> rewards pts.', cta: 'Add Scents' }
    ],
    upsell: { title: 'Crème de la Crème', subtitle: 'Our Best Wash!', price: '$36', period: 'Monthly Unlimited', tagline: 'Upgrade & get 2x benefits', cta: 'How To Upgrade' },
    footerLinks: {
      col1: { title: 'Customer Care', links: ['Contact Us', 'Delivery & Returns', 'Click & Collect', 'My Account', 'Size Guide'] },
      col2: { title: 'About Us', links: ['Our Story', 'Our 2 Year Guarantee', 'Current Promotions', 'Loyalty Club', 'Store Locator'] },
      col3: { title: 'Our Products', links: ['Express Wash', 'Premium Detail', 'Interior Clean', 'Tire Shine', 'Monthly Plans'] }
    }
  },

  restaurant: {
    label: 'Restaurant / Food',
    colors: { primary: '#8B0000', secondary: '#FFF8F0', accent: '#DAA520', dark: '#1A1A1A' },
    tiers: [
      { name: 'Starter', points: 0 },
      { name: 'Foodie', points: 1500 },
      { name: "VIP Chef's Table", points: 4000 }
    ],
    navLinks: ['Home', 'Menu', 'Locations', 'Catering', 'Gift Cards', 'Events'],
    vouchers: [
      { title: 'Free Appetizer', vendor: 'Any location', description: '', expiry: 'Ends in 14 days', actionType: 'points', actionValue: '200pts', emoji: '🍽️', gradient: ['red-400','red-600'] },
      { title: 'Birthday Dessert', vendor: 'Valid on your birthday month', description: '', expiry: 'Expires in 30 days', actionType: 'code', actionValue: 'BDAY2025', emoji: '🎂', gradient: ['pink-400','pink-600'] },
      { title: 'Brunch Credit ($15)', vendor: 'Weekend brunch only', description: '', expiry: '', actionType: 'qr', actionValue: '', emoji: '🥞', gradient: ['amber-400','amber-600'] },
      { title: 'Wine Pairing Experience', vendor: 'Chef selected pairing for 2', description: '', expiry: 'Ends in 7 days', actionType: 'points', actionValue: '500pts', emoji: '🍷', gradient: ['purple-400','purple-600'] }
    ],
    offers: [
      { title: 'Taste Explorer Challenge', description: 'Try 5 new dishes this month to win a free dinner for 2', cta: 'Start Challenge', playerCount: '850 Playing', expiry: "Expires on 30 November '25", emoji: '🍴', gradient: ['red-700','red-900'] },
      { title: 'Bring a Friend, Get Double Points', description: 'Every friend you bring earns you double loyalty points all weekend', cta: 'Invite Now', playerCount: '', expiry: '', emoji: '👯', gradient: ['amber-500','orange-600'] }
    ],
    badges: [
      { name: 'Taste Explorer', emoji: '🍽️', color: 'amber' },
      { name: 'Brunch Boss', emoji: '☕', color: 'emerald' },
      { name: 'Late Night Legend', emoji: '🌙', color: 'blue' }
    ],
    clubs: [
      { name: 'Wine Lovers', description: 'For those who appreciate a perfect pairing.', memberCount: 5200, emoji: '🍷', gradient: ['purple-500','purple-700'] },
      { name: 'BBQ Masters', description: 'Fire, smoke, and flavor enthusiasts.', memberCount: 7800, emoji: '🔥', gradient: ['orange-500','red-700'] }
    ],
    earnMore: [
      { title: 'Rate your last meal', description: 'Share your dining experience and earn 75 pts.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite friends and get 100 pts when they dine with us.', hasCodeInput: false },
      { title: 'Share on social media', description: 'Post your meal with our hashtag and earn 50 pts.', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Free Appetizer Monthly', emoji: '🍽️' },
      { name: 'Skip the Line', emoji: '⏭️' },
      { name: "Chef's Special Preview", emoji: '👨‍🍳' },
      { name: 'Free Delivery', emoji: '🚗' },
      { name: 'Birthday Dessert', emoji: '🎂' },
      { name: 'Early Happy Hour', emoji: '🍸' },
      { name: 'Recipe Access', emoji: '📖' }
    ],
    profileTasks: [
      { description: 'Tell us your dietary preferences & earn <strong>50</strong> rewards pts.', cta: 'Update' },
      { description: 'Follow us on Instagram and earn <strong>75 pts</strong>.', cta: 'Follow' },
      { description: 'Add your favorite cuisine & earn <strong>50</strong> rewards pts.', cta: 'Add' }
    ],
    upsell: { title: 'VIP Dining Club', subtitle: 'Exclusive Experience!', price: '$29', period: 'Monthly', tagline: 'Upgrade & get priority reservations + 3x points', cta: 'Join VIP' },
    footerLinks: {
      col1: { title: 'Customer Care', links: ['Contact Us', 'Reservations', 'Delivery Info', 'My Account', 'FAQ'] },
      col2: { title: 'About Us', links: ['Our Story', 'Our Chefs', 'Sustainability', 'Careers', 'Press'] },
      col3: { title: 'Menu', links: ['Lunch', 'Dinner', 'Brunch', 'Drinks', 'Catering'] }
    }
  },

  retail: {
    label: 'Retail / Fashion',
    colors: { primary: '#1A1A2E', secondary: '#F8F8FA', accent: '#E94560', dark: '#0F0F1A' },
    tiers: [
      { name: 'Browser', points: 0 },
      { name: 'Insider', points: 1000 },
      { name: 'VIP', points: 3000 }
    ],
    navLinks: ['Home', 'Shop', 'New Arrivals', 'Sale', 'Stores', 'Lookbook'],
    vouchers: [
      { title: '$25 Store Credit', vendor: 'All stores & online', description: '', expiry: 'Ends in 30 days', actionType: 'code', actionValue: 'SAVE25', emoji: '💳', gradient: ['indigo-400','indigo-600'] },
      { title: 'Free Shipping Pass', vendor: 'Valid for 3 orders', description: '', expiry: 'Ends in 14 days', actionType: 'points', actionValue: '150pts', emoji: '📦', gradient: ['blue-400','blue-600'] },
      { title: 'Early Access Token', vendor: 'Next collection launch', description: '', expiry: '', actionType: 'qr', actionValue: '', emoji: '🔑', gradient: ['amber-400','amber-600'] },
      { title: 'Gift Wrap Service', vendor: 'Complimentary premium wrap', description: '', expiry: '', actionType: 'points', actionValue: '100pts', emoji: '🎁', gradient: ['rose-400','rose-600'] }
    ],
    offers: [
      { title: 'Style Challenge: Build Your Look', description: 'Create an outfit from our new collection to win a $200 gift card', cta: 'Enter Now', playerCount: '2300 Entered', expiry: "Expires on 15 December '25", emoji: '👗', gradient: ['indigo-700','purple-900'] },
      { title: 'Flash Sale: Double Points Weekend', description: 'Earn 2x points on all purchases this weekend only', cta: 'Shop Now', playerCount: '', expiry: '', emoji: '⚡', gradient: ['rose-500','red-600'] }
    ],
    badges: [
      { name: 'Trendsetter', emoji: '🌟', color: 'amber' },
      { name: 'Loyal Shopper', emoji: '🛍️', color: 'emerald' },
      { name: 'Style Icon', emoji: '👑', color: 'blue' }
    ],
    clubs: [
      { name: 'Sneakerheads', description: 'For the sneaker obsessed.', memberCount: 12500, emoji: '👟', gradient: ['gray-600','gray-800'] },
      { name: 'Sustainable Fashion', description: 'Eco-conscious style community.', memberCount: 8900, emoji: '🌿', gradient: ['green-500','green-700'] }
    ],
    earnMore: [
      { title: 'Write a product review', description: 'Review your latest purchase and earn 50 pts.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite friends and get 150 pts when they make their first purchase.', hasCodeInput: false },
      { title: 'Complete your style profile', description: 'Tell us your preferences to get personalized recommendations & 75 pts.', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Free Returns', emoji: '↩️' },
      { name: 'Personal Stylist', emoji: '👔' },
      { name: 'Exclusive Sales Access', emoji: '🔓' },
      { name: 'Free Shipping', emoji: '📦' },
      { name: 'Birthday Gift', emoji: '🎂' },
      { name: 'Early Access', emoji: '⏰' },
      { name: 'VIP Events', emoji: '🎟️' }
    ],
    profileTasks: [
      { description: 'Add your size preferences & earn <strong>50</strong> rewards pts.', cta: 'Add Sizes' },
      { description: 'Follow us on Instagram & earn <strong>75 pts</strong>.', cta: 'Follow' },
      { description: 'Set your style preferences & earn <strong>100</strong> rewards pts.', cta: 'Set Style' }
    ],
    upsell: { title: 'VIP Insider Club', subtitle: 'Exclusive Access!', price: '$19', period: 'Monthly', tagline: 'Upgrade & get free shipping + early access to sales', cta: 'Go VIP' },
    footerLinks: {
      col1: { title: 'Customer Care', links: ['Contact Us', 'Returns', 'Shipping Info', 'My Account', 'Size Guide'] },
      col2: { title: 'About Us', links: ['Our Story', 'Sustainability', 'Careers', 'Press', 'Stores'] },
      col3: { title: 'Shop', links: ['New Arrivals', 'Bestsellers', 'Sale', 'Collections', 'Gift Cards'] }
    }
  },

  fitness: {
    label: 'Fitness / Wellness',
    colors: { primary: '#FF6B35', secondary: '#F5F7FA', accent: '#004E98', dark: '#1A1A1A' },
    tiers: [
      { name: 'Starter', points: 0 },
      { name: 'Pro', points: 2000 },
      { name: 'Champion', points: 5000 }
    ],
    navLinks: ['Home', 'Classes', 'Trainers', 'Plans', 'Shop', 'Community'],
    vouchers: [
      { title: 'Free Class Pass', vendor: 'Any group class', description: '', expiry: 'Ends in 7 days', actionType: 'qr', actionValue: '', emoji: '🏋️', gradient: ['orange-400','red-500'] },
      { title: 'Guest Pass', vendor: 'Bring a friend free', description: '', expiry: 'Ends in 30 days', actionType: 'code', actionValue: 'GUEST25', emoji: '🤝', gradient: ['blue-400','blue-600'] },
      { title: 'Smoothie Credit ($10)', vendor: 'Juice bar', description: '', expiry: '', actionType: 'points', actionValue: '200pts', emoji: '🥤', gradient: ['green-400','green-600'] },
      { title: 'Merch Discount (20%)', vendor: 'Online & in-gym shop', description: '', expiry: 'Ends in 14 days', actionType: 'code', actionValue: 'FIT20', emoji: '👕', gradient: ['purple-400','purple-600'] }
    ],
    offers: [
      { title: '30-Day Transformation Challenge', description: 'Complete 20 workouts in 30 days to win a free month', cta: 'Join Challenge', playerCount: '3200 Joined', expiry: "Starts 1 November '25", emoji: '💪', gradient: ['orange-600','red-800'] },
      { title: 'Bring a Buddy Month', description: 'Every friend who signs up earns you both 500 bonus points', cta: 'Invite Now', playerCount: '', expiry: '', emoji: '👥', gradient: ['blue-500','indigo-600'] }
    ],
    badges: [
      { name: 'Iron Will', emoji: '💪', color: 'amber' },
      { name: 'Yoga Master', emoji: '🧘', color: 'emerald' },
      { name: 'Early Bird', emoji: '🌅', color: 'blue' }
    ],
    clubs: [
      { name: 'Running Crew', description: 'Weekly group runs and races.', memberCount: 6500, emoji: '🏃', gradient: ['orange-500','red-700'] },
      { name: 'Yoga Circle', description: 'Find your center with like-minded yogis.', memberCount: 4200, emoji: '🧘', gradient: ['teal-500','teal-700'] }
    ],
    earnMore: [
      { title: 'Log your workout', description: 'Track your session and earn 25 pts per workout.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite friends and get 200 pts when they join.', hasCodeInput: false },
      { title: 'Complete a fitness assessment', description: 'Book a free assessment and earn 100 pts.', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Priority Booking', emoji: '📅' },
      { name: 'Free Towel Service', emoji: '🧺' },
      { name: 'Locker Upgrade', emoji: '🔐' },
      { name: 'Guest Passes', emoji: '🤝' },
      { name: 'Birthday Workout', emoji: '🎂' },
      { name: 'Nutrition Plan', emoji: '🥗' },
      { name: 'Recovery Room', emoji: '🧖' }
    ],
    profileTasks: [
      { description: 'Set your fitness goals & earn <strong>50</strong> rewards pts.', cta: 'Set Goals' },
      { description: 'Share your progress on social & earn <strong>75 pts</strong>.', cta: 'Share' },
      { description: 'Add your preferred workout time & earn <strong>25</strong> rewards pts.', cta: 'Set Time' }
    ],
    upsell: { title: 'Champion Membership', subtitle: 'Unlimited Everything!', price: '$49', period: 'Monthly', tagline: 'Upgrade & get unlimited classes + personal training', cta: 'Go Champion' },
    footerLinks: {
      col1: { title: 'Support', links: ['Contact Us', 'FAQ', 'Membership Info', 'My Account', 'App Download'] },
      col2: { title: 'About Us', links: ['Our Story', 'Trainers', 'Facilities', 'Careers', 'Blog'] },
      col3: { title: 'Programs', links: ['Group Classes', 'Personal Training', 'Nutrition', 'Recovery', 'Kids'] }
    }
  },

  healthcare: {
    label: 'Healthcare / Pharmacy',
    colors: { primary: '#0077B6', secondary: '#F0F9FF', accent: '#00B4D8', dark: '#1A1A2E' },
    tiers: [
      { name: 'Member', points: 0 },
      { name: 'Preferred', points: 1500 },
      { name: 'Premium Care', points: 4000 }
    ],
    navLinks: ['Home', 'Services', 'Pharmacy', 'Wellness', 'Appointments', 'Resources'],
    vouchers: [
      { title: 'Wellness Consultation', vendor: 'Free 30-min session', description: '', expiry: 'Ends in 60 days', actionType: 'qr', actionValue: '', emoji: '🩺', gradient: ['blue-400','blue-600'] },
      { title: 'Vitamin Discount (25%)', vendor: 'All vitamins & supplements', description: '', expiry: 'Ends in 30 days', actionType: 'code', actionValue: 'WELL25', emoji: '💊', gradient: ['green-400','green-600'] },
      { title: 'Health Screening Credit', vendor: '$50 off annual screening', description: '', expiry: '', actionType: 'points', actionValue: '300pts', emoji: '🔬', gradient: ['teal-400','teal-600'] },
      { title: 'Flu Shot Credit', vendor: 'Complimentary for members', description: '', expiry: 'Seasonal', actionType: 'qr', actionValue: '', emoji: '💉', gradient: ['cyan-400','cyan-600'] }
    ],
    offers: [
      { title: 'Wellness Week Challenge', description: 'Log healthy habits for 7 days and earn bonus rewards', cta: 'Start Today', playerCount: '1800 Participating', expiry: "Ends 15 November '25", emoji: '🏥', gradient: ['blue-700','blue-900'] },
      { title: 'Family Health Bundle', description: 'Add family members to your plan and get 2x points', cta: 'Add Family', playerCount: '', expiry: '', emoji: '👨‍👩‍👧‍👦', gradient: ['teal-500','cyan-600'] }
    ],
    badges: [
      { name: 'Wellness Champion', emoji: '🏆', color: 'amber' },
      { name: 'Health Hero', emoji: '💪', color: 'emerald' },
      { name: 'Consistent Care', emoji: '📅', color: 'blue' }
    ],
    clubs: [
      { name: 'Wellness Warriors', description: 'Supporting each other on the health journey.', memberCount: 4500, emoji: '💚', gradient: ['green-500','green-700'] },
      { name: 'Active Aging', description: 'Staying active and healthy at every age.', memberCount: 3200, emoji: '🌟', gradient: ['blue-500','indigo-700'] }
    ],
    earnMore: [
      { title: 'Complete health survey', description: 'Answer wellness questions and earn 100 pts.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite friends and get 150 pts when they enroll.', hasCodeInput: false },
      { title: 'Log daily steps', description: 'Connect your fitness tracker to earn daily bonus pts.', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Priority Appointments', emoji: '📅' },
      { name: 'Free Delivery', emoji: '🚚' },
      { name: 'Annual Health Review', emoji: '📋' },
      { name: 'Wellness Webinars', emoji: '💻' },
      { name: 'Birthday Wellness Kit', emoji: '🎂' },
      { name: 'Family Discounts', emoji: '👨‍👩‍👧' },
      { name: 'Telehealth Access', emoji: '📱' }
    ],
    profileTasks: [
      { description: 'Complete your health profile & earn <strong>100</strong> rewards pts.', cta: 'Complete' },
      { description: 'Set medication reminders & earn <strong>50 pts</strong>.', cta: 'Set Up' },
      { description: 'Add emergency contacts & earn <strong>50</strong> rewards pts.', cta: 'Add' }
    ],
    upsell: { title: 'Premium Care Plan', subtitle: 'Complete Coverage!', price: '$39', period: 'Monthly', tagline: 'Upgrade & get priority care + free delivery', cta: 'Upgrade Care' },
    footerLinks: {
      col1: { title: 'Support', links: ['Contact Us', 'Insurance Info', 'Prescriptions', 'My Account', 'FAQ'] },
      col2: { title: 'About Us', links: ['Our Mission', 'Our Team', 'Accreditations', 'Careers', 'Privacy'] },
      col3: { title: 'Services', links: ['Pharmacy', 'Wellness', 'Telehealth', 'Lab Work', 'Vaccinations'] }
    }
  },

  generic: {
    label: 'Generic',
    colors: { primary: '#2D3748', secondary: '#F7FAFC', accent: '#4299E1', dark: '#1A202C' },
    tiers: [
      { name: 'Basic', points: 0 },
      { name: 'Plus', points: 2000 },
      { name: 'Premium', points: 5000 }
    ],
    navLinks: ['Home', 'Products', 'Services', 'Rewards', 'About', 'Support'],
    vouchers: [
      { title: '$25 Credit', vendor: 'Any purchase', description: '', expiry: 'Ends in 30 days', actionType: 'points', actionValue: '250pts', emoji: '💳', gradient: ['blue-400','blue-600'] },
      { title: 'Partner Discount', vendor: '20% off at partner locations', description: '', expiry: 'Ends in 14 days', actionType: 'code', actionValue: 'PERK20', emoji: '🤝', gradient: ['purple-400','purple-600'] },
      { title: 'Exclusive Access Pass', vendor: 'Early access to new products', description: '', expiry: '', actionType: 'qr', actionValue: '', emoji: '🔑', gradient: ['amber-400','amber-600'] },
      { title: 'Referral Bonus', vendor: 'Earn when friends join', description: '', expiry: '', actionType: 'points', actionValue: '500pts', emoji: '🎁', gradient: ['emerald-400','emerald-600'] }
    ],
    offers: [
      { title: 'Monthly Challenge', description: 'Complete activities to win exclusive rewards', cta: 'Join Now', playerCount: '2000 Playing', expiry: "Expires end of month", emoji: '🎯', gradient: ['gray-700','gray-900'] },
      { title: 'Double Points Weekend', description: 'Earn 2x points on all activities this weekend', cta: 'Learn More', playerCount: '', expiry: '', emoji: '⚡', gradient: ['blue-500','indigo-600'] }
    ],
    badges: [
      { name: 'Community Star', emoji: '⭐', color: 'amber' },
      { name: 'Ambassador', emoji: '🏅', color: 'emerald' },
      { name: 'Power User', emoji: '🚀', color: 'blue' }
    ],
    clubs: [
      { name: 'Community Forum', description: 'Connect with fellow members.', memberCount: 10000, emoji: '💬', gradient: ['blue-500','blue-700'] },
      { name: 'Local Network', description: 'Meet members in your area.', memberCount: 5000, emoji: '📍', gradient: ['green-500','green-700'] }
    ],
    earnMore: [
      { title: 'Share your feedback', description: 'Complete a quick survey and earn 50 pts.', hasCodeInput: false },
      { title: 'Refer Friends & Earn', description: 'Invite friends and get 100 pts when they join.', hasCodeInput: false },
      { title: 'Complete your profile', description: 'Fill in all profile fields and earn 75 pts.', hasCodeInput: false },
      { title: 'Redeem Code to unlock bonus points', description: '', hasCodeInput: true }
    ],
    benefits: [
      { name: 'Priority Support', emoji: '⚡' },
      { name: 'Exclusive Content', emoji: '🔒' },
      { name: 'Birthday Reward', emoji: '🎂' },
      { name: 'Free Shipping', emoji: '📦' },
      { name: 'Early Access', emoji: '⏰' },
      { name: 'Member Events', emoji: '🎟️' },
      { name: 'Partner Discounts', emoji: '🤝' }
    ],
    profileTasks: [
      { description: 'Set your preferences & earn <strong>50</strong> rewards pts.', cta: 'Set Up' },
      { description: 'Follow us on social media & earn <strong>75 pts</strong>.', cta: 'Follow' },
      { description: 'Add your interests & earn <strong>50</strong> rewards pts.', cta: 'Add' }
    ],
    upsell: { title: 'Premium Membership', subtitle: 'Unlock Everything!', price: '$29', period: 'Monthly', tagline: 'Upgrade & get unlimited access + 3x points', cta: 'Go Premium' },
    footerLinks: {
      col1: { title: 'Support', links: ['Contact Us', 'FAQ', 'Terms', 'My Account', 'Help Center'] },
      col2: { title: 'Company', links: ['About Us', 'Careers', 'Press', 'Blog', 'Partners'] },
      col3: { title: 'Products', links: ['Featured', 'New', 'Popular', 'Collections', 'Gift Cards'] }
    }
  }
};

// Gradient color options for badges
const GRADIENT_COLORS = ['amber', 'emerald', 'blue', 'purple', 'rose', 'teal', 'orange', 'indigo', 'red', 'green'];

// Voucher gradient pairs
const VOUCHER_GRADIENTS = [
  ['amber-400','orange-500'], ['purple-400','indigo-500'], ['emerald-400','teal-500'],
  ['pink-400','rose-500'], ['blue-400','blue-600'], ['red-400','red-600'],
  ['sky-400','cyan-500'], ['green-400','emerald-500']
];

// Club gradient pairs
const CLUB_GRADIENTS = [
  ['red-500','red-700'], ['blue-500','blue-700'], ['green-500','green-700'],
  ['purple-500','purple-700'], ['orange-500','orange-700'], ['teal-500','teal-700']
];

// Offer gradient pairs
const OFFER_GRADIENTS = [
  ['sky-700','blue-900'], ['amber-500','orange-600'], ['red-700','red-900'],
  ['indigo-700','purple-900'], ['teal-600','emerald-800']
];

// Helper to lighten a hex color
function lightenColor(hex, percent = 20) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(2.55 * percent));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// Helper to darken a hex color
function darkenColor(hex, percent = 15) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * percent));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function getDefaults(industry) {
  return INDUSTRY_DEFAULTS[industry] || INDUSTRY_DEFAULTS.generic;
}
