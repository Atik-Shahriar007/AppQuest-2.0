import type { ImageSourcePropType } from "react-native";
import type { CatalogProduct } from "../shared/catalog/types";
import { catalogProducts } from "./catalog-adapter";

export type Language = "en" | "bn";
export type Category = "food" | "personalCare" | "household";
export type Localized = { en: string; bn: string };
export type NutritionItem = {
  label: Localized;
  amount: Localized;
  note: Localized;
  detail: Localized;
  tone: "positive" | "caution" | "neutral";
  icon:
    | "cube-outline"
    | "fire"
    | "shaker-outline"
    | "fish"
    | "leaf"
    | "flask-outline"
    | "water-outline"
    | "food-apple-outline";
};

/** Product group (folder category in the product database), e.g. "Juice". */
export type ComparisonFamily = string;
export type HalalEvidence = {
  kind: "package-mark" | "certificate";
  label: Localized;
  sourceTitle: string;
  sourceUrl: string;
};

export type Product = {
  id: string;
  barcode: string;
  category: Category;
  comparisonFamily?: ComparisonFamily;
  name: Localized;
  brand: Localized;
  size: Localized;
  description: Localized;
  image: ImageSourcePropType;
  ingredients: Localized[];
  ingredientExplanations?: Localized[];
  nutrition?: { serving: Localized; items: NutritionItem[] };
  /** Same items scaled to one (estimated) serving. */
  servingNutrition?: { serving: Localized; items: NutritionItem[] };
  demo: boolean;
  score?: number;
  gradeLabel?: Localized;
  factors: {
    label: Localized;
    value: number | null;
    weight?: string;
    note: Localized;
  }[];
  evidence: {
    label: Localized;
    value: Localized;
    status: "demo" | "unknown" | "recorded" | "estimated";
  }[];
  halalEvidence?: HalalEvidence;
  reactionCounts: { likes: number; dislikes: number };
  /** Full real record: nutrients with provenance, NQSS breakdown, labels. */
  catalog?: CatalogProduct;
};

const sample = (en: string, bn: string): Localized => ({ en, bn });

export const products: Product[] = catalogProducts;

export const productById = (id: string | undefined) =>
  products.find((product) => product.id === id);
export const productByBarcode = (barcode: string) => {
  const code = barcode.replace(/\D/g, "");
  if (!code) return undefined;
  // Tolerate UPC-A vs EAN-13 (a leading zero added or dropped by the scanner).
  return products.find(
    (p) =>
      p.barcode === code ||
      p.barcode === `0${code}` ||
      `0${p.barcode}` === code,
  );
};
/** Halal Mode: only products recorded as halal in the product database. */
export const isHalalEligible = (product: Product) =>
  product.catalog?.halal.badge === "halal";
export const filterProductsByHalal = (items: Product[], halalMode: boolean) =>
  halalMode ? items.filter(isHalalEligible) : items;
/** Child Safe Mode hides only "not suitable"; caution items stay visible with a badge (decision 3). */
export const filterProductsByChildSafe = (
  items: Product[],
  childSafeMode: boolean,
) =>
  childSafeMode
    ? items.filter((p) => p.catalog?.child.badge !== "not_suitable")
    : items;
/** Same group, strictly higher NQSS, respecting the active modes, best first. */
export const betterAlternatives = (
  product: Product,
  halalMode = false,
  childSafeMode = false,
) => {
  const currentScore = product.score;
  if (
    product.category !== "food" ||
    currentScore === undefined ||
    !product.comparisonFamily
  )
    return [];
  const pool = products.filter(
    (c) =>
      c.category === "food" &&
      c.id !== product.id &&
      c.comparisonFamily === product.comparisonFamily &&
      c.score !== undefined &&
      c.score > currentScore,
  );
  return filterProductsByChildSafe(
    filterProductsByHalal(pool, halalMode),
    childSafeMode,
  )
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
};

const copy = {
  brand: sample("NutriScan", "নিউট্রিস্ক্যান"),
  tagline: sample("Bangladesh label guide", "বাংলাদেশি লেবেল গাইড"),
  prototypeStatus: sample("Bangladesh · prototype", "বাংলাদেশ · প্রোটোটাইপ"),
  homeTitle: sample("Know What You Eat", "আপনি কী খান, জেনে নিন"),
  homeSubtitle: sample(
    "Scan local products, then explore what the label does—and doesn’t—tell you.",
    "স্থানীয় পণ্য স্ক্যান করুন, তারপর লেবেল কী বলে—আর কী বলে না—দেখুন।",
  ),
  scan: sample("Scan", "স্ক্যান"),
  discover: sample("Discover", "আবিষ্কার"),
  history: sample("History", "ইতিহাস"),
  contribute: sample("Contribute", "তথ্য দিন"),
  community: sample("Community", "কমিউনিটি"),
  support: sample("Support", "সহায়তা"),
  more: sample("More", "আরও"),
  food: sample("Food", "খাবার"),
  personalCare: sample("Personal care", "পার্সোনাল কেয়ার"),
  household: sample("Home care", "গৃহস্থালি"),
  allProducts: sample("All", "সব"),
  categories: sample("Explore by category", "ধরন অনুযায়ী দেখুন"),
  openScanner: sample("Open barcode scanner", "বারকোড স্ক্যানার খুলুন"),
  scannerHint: sample(
    "Camera scan or enter the barcode yourself.",
    "ক্যামেরায় স্ক্যান করুন অথবা বারকোড লিখুন।",
  ),
  enterBarcode: sample("Enter a barcode", "বারকোড লিখুন"),
  barcodePlaceholder: sample("e.g. 8941154036281", "যেমন ৮৯৪১১৫৪০৩৬২৮১"),
  findProduct: sample("Find product", "পণ্য খুঁজুন"),
  sampleCatalog: sample("Explore the catalog", "ক্যাটালগ দেখুন"),
  demoNote: sample("Estimated score", "আনুমানিক স্কোর"),
  demoProductCaveat: sample(
    "Some values on this product are estimated because the label does not show them. The score is a nutrition indicator, not medical advice. Check the current pack before deciding.",
    "লেবেলে না থাকায় এই পণ্যের কিছু মান অনুমান করা হয়েছে। স্কোরটি পুষ্টির নির্দেশক, চিকিৎসা-পরামর্শ নয়। সিদ্ধান্তের আগে বর্তমান প্যাকেট দেখুন।",
  ),
  viewDetails: sample("View details", "বিস্তারিত দেখুন"),
  noMatch: sample("No verified match yet", "এখনও যাচাইকৃত মিল নেই"),
  noMatchBody: sample(
    "This barcode isn’t in the prototype catalog. You can prepare a local product-contribution draft; it won’t be sent anywhere.",
    "এই বারকোডটি প্রোটোটাইপ ক্যাটালগে নেই। পণ্যের তথ্যের স্থানীয় খসড়া তৈরি করতে পারেন; এটি কোথাও পাঠানো হবে না।",
  ),
  sendForReview: sample("Contribute this product", "পণ্যটির তথ্য দিন"),
  grade: sample("Prototype food score", "প্রোটোটাইপ খাবার-স্কোর"),
  method: sample(
    "How this score is calculated",
    "এই স্কোর কীভাবে হিসাব করা হয়",
  ),
  methodNote: sample(
    "Scored with NutriScan’s NQSS v1.0 rules from the label, per 100 g or 100 ml. Values marked (est.) are estimated. It is a nutrition indicator, not medical advice or an official assessment.",
    "লেবেলের তথ্য থেকে প্রতি ১০০ গ্রাম বা ১০০ মি.লি. ভিত্তিতে নিউট্রিস্ক্যানের NQSS v1.0 নিয়মে হিসাব করা। (আনুমানিক) চিহ্নিত মান অনুমান করা। এটি পুষ্টির নির্দেশক, চিকিৎসা-পরামর্শ বা সরকারি মূল্যায়ন নয়।",
  ),
  halal: sample("Halal evidence", "হালাল তথ্য"),
  bstI: sample("BSTI evidence", "BSTI তথ্য"),
  unknown: sample("Not linked", "যুক্ত নেই"),
  source: sample("Source & status", "উৎস ও অবস্থা"),
  ingredients: sample("Label ingredients", "লেবেলের উপাদান"),
  productDetails: sample("Product details", "পণ্যের বিবরণ"),
  limitations: sample("Please note", "মনে রাখুন"),
  limitationText: sample(
    "A barcode or package photo cannot verify lab results, trace contamination, halal status, or personal medical suitability.",
    "বারকোড বা প্যাকেটের ছবি পরীক্ষাগারের ফল, দূষণের উপস্থিতি, হালাল অবস্থা বা ব্যক্তিগত চিকিৎসাগত উপযোগিতা নিশ্চিত করে না।",
  ),
  recent: sample("Your recent scans", "আপনার সাম্প্রতিক স্ক্যান"),
  seeAll: sample("See all", "সব দেখুন"),
  emptyHistory: sample(
    "Your scans will appear here",
    "আপনার স্ক্যান এখানে দেখা যাবে",
  ),
  emptyHistoryBody: sample(
    "Scan a product or search the catalog to get started.",
    "শুরু করতে পণ্য স্ক্যান করুন অথবা ক্যাটালগে খুঁজুন।",
  ),
  clearHistory: sample("Clear history", "ইতিহাস মুছুন"),
  sampleHistory: sample(
    "Your recent scans will appear here after you open products.",
    "পণ্য দেখার পরে আপনার সাম্প্রতিক স্ক্যান এখানে দেখা যাবে।",
  ),
  contributeTitle: sample(
    "Help fill the local product shelf.",
    "স্থানীয় পণ্যের তথ্য যোগ করতে সাহায্য করুন।",
  ),
  contributeBody: sample(
    "Include both sides of a pack. In this prototype, photos and details stay on this device; no review team receives them.",
    "প্যাকেটের দুই পাশের তথ্য দিন। এই প্রোটোটাইপে ছবি ও বিবরণ এই ডিভাইসেই থাকে; কোনো পর্যালোচনা দল এগুলো পায় না।",
  ),
  frontPhoto: sample("Front of pack", "প্যাকেটের সামনের দিক"),
  backPhoto: sample("Back / ingredient label", "পেছনের দিক / উপাদানের লেবেল"),
  addPhoto: sample("Take or choose photo", "ছবি তুলুন বা বাছুন"),
  productName: sample("Product name", "পণ্যের নাম"),
  brandName: sample("Brand / maker", "ব্র্যান্ড / প্রস্তুতকারক"),
  category: sample("Category", "ধরন"),
  barcode: sample("Barcode (if available)", "বারকোড (থাকলে)"),
  submitReview: sample(
    "Save local contribution draft",
    "স্থানীয় তথ্যের খসড়া সংরক্ষণ",
  ),
  pendingReview: sample(
    "Local draft · not sent",
    "স্থানীয় খসড়া · পাঠানো হয়নি",
  ),
  localDemoSubmission: sample(
    "Saving here does not send the package to NutriScan or add it to a verified catalog.",
    "এখানে সংরক্ষণ করলে প্যাকেট NutriScan-এ পাঠানো বা যাচাইকৃত ক্যাটালগে যোগ হয় না।",
  ),
  mySubmissions: sample("Your submissions", "আপনার জমা দেওয়া তথ্য"),
  noSubmissions: sample(
    "No product submissions yet.",
    "এখনও কোনো পণ্যের তথ্য জমা দেননি।",
  ),
  pointsAfterReview: sample(
    "No points are awarded in this prototype. A future live program could award points after team review and acceptance.",
    "এই প্রোটোটাইপে কোনো পয়েন্ট দেওয়া হয় না। ভবিষ্যতের লাইভ ব্যবস্থায় দল পর্যালোচনা করে গ্রহণ করলে পয়েন্ট দেওয়া হতে পারে।",
  ),
  leaderboardTitle: sample("Helpful shelf scouts", "সহায়ক পণ্য-তথ্যদাতারা"),
  leaderboardBody: sample(
    "Demo names and points only—not a live community list. Points never influence product grades or verification.",
    "ডেমো নাম ও পয়েন্ট—লাইভ কমিউনিটি তালিকা নয়। পয়েন্ট কখনো পণ্যের গ্রেড বা যাচাইকে প্রভাবিত করে না।",
  ),
  yourPoints: sample("Your accepted points", "আপনার গৃহীত পয়েন্ট"),
  demoBoard: sample("Demo leaderboard", "ডেমো লিডারবোর্ড"),
  supportTitle: sample(
    "Keep the label library growing.",
    "লেবেলের তথ্যভান্ডার বাড়াতে সহায়তা করুন।",
  ),
  supportBody: sample(
    "NutriScan is exploring community support for catalog review, hosting, and maintenance.",
    "ক্যাটালগ পর্যালোচনা, হোস্টিং ও রক্ষণাবেক্ষণের জন্য কমিউনিটির সহায়তার পথ খুঁজছে NutriScan।",
  ),
  voluntary: sample("Always voluntary", "সম্পূর্ণ ঐচ্ছিক"),
  donationStatus: sample(
    "Payment details are not connected in this prototype. No donation will be charged.",
    "এই প্রোটোটাইপে পেমেন্ট তথ্য যুক্ত নেই। কোনো অনুদান নেওয়া হবে না।",
  ),
  howFundsHelp: sample("Where support would go", "সহায়তা যেসব কাজে লাগবে"),
  fundsOne: sample(
    "Reviewing new local product labels",
    "নতুন স্থানীয় পণ্যের লেবেল পর্যালোচনা",
  ),
  fundsTwo: sample(
    "Keeping the catalog and service running",
    "ক্যাটালগ ও সেবা চালু রাখা",
  ),
  fundsThree: sample(
    "Improving bilingual access and scan tools",
    "দ্বিভাষিক সুবিধা ও স্ক্যান টুল উন্নত করা",
  ),
  scannerTitle: sample("Scan a barcode", "বারকোড স্ক্যান করুন"),
  scannerHelp: sample(
    "Hold the barcode inside the frame, or type the number below.",
    "বারকোডটি ফ্রেমের মধ্যে ধরুন, অথবা নিচে নম্বরটি লিখুন।",
  ),
  cameraPermission: sample(
    "Allow camera access to scan a barcode.",
    "বারকোড স্ক্যান করতে ক্যামেরা ব্যবহারের অনুমতি দিন।",
  ),
  cameraUnavailable: sample(
    "Camera scanning is not available here. Type the barcode number instead.",
    "এখানে ক্যামেরা স্ক্যান পাওয়া যাচ্ছে না। বারকোড নম্বর লিখুন।",
  ),
  unknownBarcode: sample(
    "Not in the prototype catalog",
    "প্রোটোটাইপ ক্যাটালগে নেই",
  ),
  unknownBarcodeBody: sample(
    "No product match was found. That does not mean the product is unsafe or safe.",
    "পণ্যের কোনো মিল পাওয়া যায়নি। এর মানে পণ্যটি নিরাপদ বা অনিরাপদ—কোনোটিই নয়।",
  ),
  chooseDemo: sample(
    "Or browse the product catalog",
    "অথবা পণ্যের ক্যাটালগ দেখুন",
  ),
  uploadHint: sample(
    "Front and back images help distinguish size, variant, and ingredient-label changes.",
    "সামনে ও পেছনের ছবি দিয়ে সাইজ, ধরন এবং উপাদানের লেবেলের পরিবর্তন আলাদা করা যায়।",
  ),
  submissionSuccess: sample(
    "Saved on this device only; nothing was sent.",
    "শুধু এই ডিভাইসে সংরক্ষিত; কিছুই পাঠানো হয়নি।",
  ),
  details: sample("Details", "বিস্তারিত"),
  close: sample("Close", "বন্ধ করুন"),
  sample: sample("Estimated", "আনুমানিক"),
  recorded: sample("Recorded", "রেকর্ড করা"),
  estimated: sample("Estimated", "আনুমানিক"),
  noGrade: sample("No overall grade", "সামগ্রিক গ্রেড নেই"),
  viewAssessment: sample("Assessment approach", "মূল্যায়ন পদ্ধতি"),
  productNotFound: sample(
    "Product record not found",
    "পণ্যের রেকর্ড পাওয়া যায়নি",
  ),
  discoverTitle: sample(
    "Browse the local shelf",
    "স্থানীয় পণ্যের তাক ঘুরে দেখুন",
  ),
  discoverSubtitle: sample(
    "Explore the packaged foods and products in NutriScan.",
    "নিউট্রিস্ক্যানে থাকা প্যাকেটজাত খাবার ও পণ্য দেখুন।",
  ),
  searchCatalog: sample("Search product or brand", "পণ্য বা ব্র্যান্ড খুঁজুন"),
  resultCount: sample("products", "টি পণ্য"),
  foodShelf: sample("Food products", "খাবার পণ্য"),
  allCategories: sample("All categories", "সব ধরন"),
  aboutThisSample: sample("About this product", "এই পণ্য সম্পর্কে"),
  imageNote: sample(
    "Package photo is for recognition; check the current pack for product details.",
    "পণ্য চেনার জন্য প্যাকেটের ছবি; বিস্তারিত জানতে বর্তমান প্যাকেট দেখুন।",
  ),
  perServing: sample("Per serving", "প্রতি পরিবেশন"),
  positiveFactors: sample("Positive factors", "ইতিবাচক দিক"),
  negativeFactors: sample("Caution factors", "সতর্কতার দিক"),
  otherFactors: sample("Other details", "অন্যান্য তথ্য"),
  scoreBreakdown: sample("How the score is made up", "স্কোরের বিভাজন"),
  addFavorite: sample("Add to favorites", "পছন্দের তালিকায় রাখুন"),
  removeFavorite: sample("Remove from favorites", "পছন্দের তালিকা থেকে সরান"),
  savedFavorite: sample("Saved to favorites", "পছন্দের তালিকায় রাখা হয়েছে"),
  viewFoodPreferences: sample("Food preferences", "খাবারের পছন্দ"),
  foodPreferencesNote: sample(
    "Personal preferences do not change this prototype score.",
    "ব্যক্তিগত পছন্দ এই প্রোটোটাইপ স্কোর বদলায় না।",
  ),
  expand: sample("Show explanation", "ব্যাখ্যা দেখুন"),
  collapse: sample("Hide explanation", "ব্যাখ্যা লুকান"),
  brandAbout: sample("Your NutriScan space", "আপনার NutriScan"),
  moreTitle: sample("More for your shelf", "আপনার পণ্যের জন্য আরও"),
  moreSubtitle: sample(
    "Profile, daily facts, community and support.",
    "প্রোফাইল, দৈনিক তথ্য, কমিউনিটি ও সহায়তা।",
  ),
  openCommunity: sample(
    "Open contributor leaderboard",
    "অবদানকারীদের তালিকা খুলুন",
  ),
  openSupport: sample("Support NutriScan", "NutriScan-কে সহায়তা করুন"),
  favoritesTitle: sample("Your favorites", "আপনার পছন্দের পণ্য"),
  noFavorites: sample("No favorites yet", "এখনও পছন্দের পণ্য নেই"),
  emptyFavoritesHint: sample(
    "Save a product from its detail page.",
    "পণ্যের বিবরণ থেকে সেটি পছন্দের তালিকায় রাখুন।",
  ),
  openProfile: sample("My Profile", "আমার প্রোফাইল"),
  profileSubtitle: sample(
    "Edit your local profile",
    "নিজের স্থানীয় প্রোফাইল সম্পাদনা করুন",
  ),
  myProfile: sample("Profile details", "প্রোফাইলের তথ্য"),
  profilePrivacy: sample(
    "This profile is stored on this device only; there is no account sync.",
    "এই প্রোফাইল শুধু এই ডিভাইসে থাকে; কোনো অ্যাকাউন্টে সিঙ্ক হয় না।",
  ),
  displayName: sample("Display name", "প্রদর্শিত নাম"),
  displayNamePlaceholder: sample("Your name", "আপনার নাম"),
  district: sample("District", "জেলা"),
  districtPlaceholder: sample("e.g. Dhaka", "যেমন ঢাকা"),
  saveProfile: sample("Save profile", "প্রোফাইল সংরক্ষণ"),
  profileSaved: sample(
    "Profile saved on this device.",
    "প্রোফাইল এই ডিভাইসে সংরক্ষিত হয়েছে।",
  ),
  openNutriFacts: sample("NutriFacts", "নিউট্রিফ্যাক্টস"),
  nutriFactsSubtitle: sample(
    "Daily tips, ingredient insights and food facts.",
    "দৈনিক পরামর্শ, উপাদানের তথ্য ও খাবারবিষয়ক জ্ঞান।",
  ),
  dailyHealthTip: sample("Daily health tip", "আজকের স্বাস্থ্য-পরামর্শ"),
  ingredientInsight: sample("Ingredient insight", "উপাদান সম্পর্কে জানুন"),
  mythVsFact: sample("Myth vs Fact", "মিথ বনাম সত্য"),
  interestingFact: sample("Interesting fact", "মজার তথ্য"),
  generalEducation: sample(
    "General education · not personal medical advice",
    "সাধারণ তথ্য · ব্যক্তিগত চিকিৎসা-পরামর্শ নয়",
  ),
  readSource: sample("Source", "উৎস"),
  sampleReactions: sample(
    "Your vote helps other shoppers",
    "আপনার ভোট অন্য ক্রেতাদের সাহায্য করে",
  ),
  reactionPrompt: sample(
    "Was this product information useful?",
    "পণ্যের এই তথ্য কি কাজে লেগেছে?",
  ),
  likes: sample("likes", "পছন্দ"),
  dislikes: sample("dislikes", "অপছন্দ"),
  like: sample("Like", "পছন্দ"),
  dislike: sample("Dislike", "অপছন্দ"),
  undoVote: sample("Remove your vote", "আপনার ভোট সরান"),
  betterAlternatives: sample("Better Alternatives", "আরও ভালো বিকল্প"),
  betterAlternativesNote: sample(
    "Products of the same type with a higher NutriScan score, matching your Halal and Child Safe settings. Scores are nutrition indicators, not health or safety rulings.",
    "একই ধরনের পণ্য যাদের নিউট্রিস্ক্যান স্কোর বেশি, আপনার হালাল ও শিশু-নিরাপদ সেটিং মেনে। স্কোর পুষ্টির নির্দেশক, স্বাস্থ্য বা নিরাপত্তার রায় নয়।",
  ),
  halalMode: sample("Halal Mode", "হালাল মোড"),
  halalModeDescription: sample(
    "Show only products with a product-specific halal mark or certificate record.",
    "পণ্যভিত্তিক হালাল মার্ক বা সনদের রেকর্ড থাকা পণ্যই দেখান।",
  ),
  halalModeOn: sample("Halal Mode on", "হালাল মোড চালু"),
  halalModeOff: sample("Halal Mode off", "হালাল মোড বন্ধ"),
  halalModeActive: sample(
    "Only products with exact-product halal evidence are shown.",
    "নির্দিষ্ট পণ্যের হালাল তথ্য থাকা পণ্যই দেখানো হচ্ছে।",
  ),
  halalEmptyTitle: sample("No eligible products here", "এখানে যোগ্য পণ্য নেই"),
  halalEmptyBody: sample(
    "Halal Mode is hiding products without exact-product evidence. Turn it off in More to see the full prototype catalog.",
    "নির্দিষ্ট পণ্যের তথ্য না থাকায় হালাল মোড কিছু পণ্য লুকিয়েছে। সম্পূর্ণ প্রোটোটাইপ ক্যাটালগ দেখতে More থেকে এটি বন্ধ করুন।",
  ),
  halalBlockedTitle: sample(
    "Product hidden in Halal Mode",
    "হালাল মোডে পণ্যটি লুকানো হয়েছে",
  ),
  halalBlockedBody: sample(
    "This product does not have exact-product halal evidence in the prototype catalog. No product details were opened.",
    "এই পণ্যের নির্দিষ্ট হালাল তথ্য প্রোটোটাইপ ক্যাটালগে নেই। পণ্যের বিবরণ খোলা হয়নি।",
  ),
  turnOffHalalMode: sample("Turn off Halal Mode", "হালাল মোড বন্ধ করুন"),
  halalEvidenceLabel: sample("Exact-product evidence", "নির্দিষ্ট পণ্যের তথ্য"),
  packageMarkEvidence: sample(
    "Halal mark shown on the exact package record.",
    "নির্দিষ্ট প্যাকেট রেকর্ডে হালাল মার্ক দেখানো হয়েছে।",
  ),
  nouri: sample("Nouri", "নৌরি"),
  nouriTagline: sample("Your AI nutrition assistant", "আপনার AI পুষ্টি সহকারী"),
  profile: sample("Profile", "প্রোফাইল"),
  home: sample("Home", "হোম"),
  premium: sample("Premium", "প্রিমিয়াম"),
  childSafeMode: sample("Child Safe Mode", "শিশু-নিরাপদ মোড"),
  healthProfile: sample("Health Profile", "স্বাস্থ্য প্রোফাইল"),
  nutritionGoals: sample("Nutrition Goals", "পুষ্টির লক্ষ্য"),
  tipOfDay: sample("Tip for You", "আপনার জন্য টিপ"),
  recentScans: sample("Recent Scans", "সাম্প্রতিক স্ক্যান"),
  goodMorning: sample("Good morning", "শুভ সকাল"),
  goodAfternoon: sample("Good afternoon", "শুভ বিকেল"),
  goodEvening: sample("Good evening", "শুভ সন্ধ্যা"),
  compareProducts: sample("Compare Products", "পণ্য তুলনা করুন"),
  addToCompare: sample("Add to Compare", "তুলনায় যোগ করুন"),
} satisfies Record<string, Localized>;

export type CopyKey = keyof typeof copy;
export const t = (language: Language, key: CopyKey): string =>
  copy[key][language];
export const productName = (product: Product, language: Language) =>
  product.name[language];
export const productBrand = (product: Product, language: Language) =>
  product.brand[language];
export const categoryLabel = (category: Category, language: Language) =>
  t(
    language,
    category === "food"
      ? "food"
      : category === "personalCare"
        ? "personalCare"
        : "household",
  );
