# NutriScan — Product Context & Application Implementation Requirements

**Project:** AppQuest 2.0 Competition  
**Product:** NutriScan  
**Document Purpose:** Product vision, existing project context, functional expectations, and implementation requirements  
**Implementation Target:** `app/`  
**Reference Prototype:** `prototype/`  
**Product Database:** `NutriScan-Product-Database/`

---

# 1. Introduction

NutriScan is a Bangladesh-focused, AI-powered food intelligence and personalized nutrition platform.

The primary goal of NutriScan is to help consumers understand what they eat, evaluate the nutritional quality of packaged food products, understand ingredients, compare products, discover better alternatives, and make more informed food choices.

The application is designed around three major concepts:

1. **Food Intelligence:** Understanding packaged food products through nutrition analysis, ingredients, additives, allergens, and nutritional quality scoring.
2. **Personalized Nutrition:** Providing information and recommendations based on individual health conditions, dietary preferences, allergies, and nutrition goals.
3. **AI-Powered Assistance:** Offering an intelligent, conversational nutrition assistant named **Nouri**, which understands both NutriScan's product information and the user's personal context.

NutriScan is being developed specifically with the Bangladesh market in mind, initially focusing on packaged food products commonly available in Bangladesh.

This repository contains an existing application prototype, a structured product database, and research-based scoring methodologies. The actual application will be developed inside the existing `app/` directory.

# 2. Existing Project Resources

Before making implementation decisions, understand the existing repository and its purpose.

The repository contains several important resources.

## 2.1 `prototype/` — Existing Application Prototype

This directory contains the complete NutriScan UI/UX and feature prototype.

It is the primary reference for understanding:

- Overall application design and visual identity.
- Navigation structure and screen organization.
- Existing features and their intended purposes.
- User journeys and interactions.
- Product presentation and information hierarchy.
- Nouri's conversational interface.
- Health profile and personalization experience.
- Product comparison and recommendation experience.

**Important:** The prototype is a reference for the actual application, not the final production implementation.

Many of its features currently use mock data, hardcoded product information, predefined responses, simulated OCR, local state, or demonstration-only functionality.

The actual application should preserve the core concepts and user experience of the prototype while replacing these limitations with real functionality.

You have freedom to improve the UI/UX wherever it makes the application more intuitive, consistent, accessible, or user-friendly. However, improvements should preserve NutriScan's original product vision and feature experience.

Read `prototype/README.md` and explore the actual prototype source code to understand the complete application.

## 2.2 `NutriScan-Product-Database/` — Actual Product Database

This directory contains the actual product information collected for NutriScan.

The product records are organized by product category and individual product.

The current structure follows this pattern:

```text
NutriScan-Product-Database/
│
├── Products/
│   ├── food/
│   │   ├── Bun/
│   │   │   ├── Alltime Chocolate Bun/
│   │   │   │   ├── details.json
│   │   │   │   └── product.jpg
│   │   │   │
│   │   │   └── Alltime Vanilla Bun/
│   │   │       ├── details.json
│   │   │       └── product.jpg
│   │   │
│   │   ├── Cake/
│   │   ├── Chips/
│   │   ├── Chanachur/
│   │   ├── Noodles/
│   │   ├── Energy-Drink/
│   │   ├── Juice/
│   │   └── Other Categories/
│   │
│   ├── personal-care/
│   │   └── ...
│   │
│   └── home-care/
│       └── ...
│
└── benchmark/
    └── food-scoring-methodology.md
```

Each product generally has:

- `details.json`: Structured product information.
- `product.jpg`: Product/package image.

The database currently contains 67 product JSON records, including 65 food products and 2 non-food products. The collection may expand over time.

**The actual application must use this product database as its source of product information.**

Do not recreate the existing catalog using hardcoded prototype product records or duplicate product information unnecessarily.

The product database should remain maintainable so that adding another product folder with its JSON and image can make the product available to the application without manually recreating its information across multiple screens.

The existing product JSON structure should be inspected before deciding how to consume and normalize the data.

Some important fields include:

- `product_name`
- `brand`
- `category`
- `net_weight`
- `barcode`
- `halal_status`
- `child_suitability`
- `ingredients`
- `nutrition_per_100g`

Some non-food products contain additional information, including descriptions, chemical information, product information, manufacturer information, usage instructions, allergens, and safety precautions.

Not every product has the same fields. Handle optional and category-specific information appropriately.

### Product images

Use the actual product images available inside each product directory.

Do not use unrelated images or fictional product representations in place of the actual database images.

Note that one existing image filename contains a typo (`proiduct.jpg`). Product image loading should not depend on assuming that every image filename is identical.

### Category organization

The folder hierarchy represents the product's actual database category.

For example:

- `food/Bun/` contains bun products.
- `food/Cake/` contains cake products.
- `food/Chips/` contains chips products.
- `food/Noodles/` contains noodles products.

The JSON `category` field can contain broader descriptions such as `Bakery`, `Snacks`, or `Beverage`.

For category-based features, particularly Better Alternatives, use the actual category-folder relationship rather than assuming that every JSON category string represents an identical product family.

## 2.3 `NutriScan-Product-Database/benchmark/food-scoring-methodology.md`

This is the primary reference for NutriScan's Nutritional Quality Scoring Standard (NQSS).

Read the complete document before implementing food scoring.

It explains:

- Scoring parameters and weights.
- Nutrition input standardization.
- Category-specific considerations.
- Scoring thresholds.
- Missing-data handling.
- Estimated values and uncertainty.
- Score calculation.
- Score interpretation.
- Backend scoring requirements.
- Scientific limitations and validation requirements.

The actual NQSS implementation must follow this methodology rather than copying the prototype's predefined scores.

## 2.4 `docs/child-suitability-benchmark.md`

This document provides the research and operational framework for evaluating child suitability.

It defines:

- Suitable
- Suitable With Caution
- Not Suitable

It also discusses sugar, sodium, fats, additives, caffeine, allergens, choking hazards, and age-specific considerations.

The actual Child Safe Mode must use product-level child suitability information and this benchmark, not the prototype's numerical NQSS threshold.

## 2.5 `app/` — Actual Application

This is the target directory for the actual NutriScan application.

The existing prototype should be studied and referenced, while the actual application is developed in this directory.

Do not assume that the prototype's existing mock functionality is already implemented in the actual application.

---

# 3. Overall Application Expectations

The actual application should include all the major features available in the existing prototype.

The intention is not to remove features and build a simplified scanner-only application.

The complete NutriScan experience should be preserved, with every feature having meaningful functionality rather than remaining a static UI demonstration.

The application should support:

- English and Bangla.
- Light and dark themes.
- User onboarding and account/profile management.
- Product discovery and search.
- Barcode scanning.
- Nutrition label scanning and OCR.
- Product details and NQSS analysis.
- Better Alternatives.
- Product comparison.
- Nouri AI Nutrition Assistant.
- Personalized health profile and nutrition goals.
- Halal Mode.
- Child Safe Mode.
- Ingredient explanations.
- Scan history and favorites.
- NutriFacts and personalized tips.
- Product contributions.
- Community features.
- Premium features.
- Expiry reminders.
- Settings and other supporting features.

The prototype's existing screens and feature organization should provide a clear reference for these requirements.

---

# 4. Product Discovery and Product Information

## 4.1 Home Screen

The Home screen should provide an overview of the user's NutriScan experience.

Preserve the important concepts from the prototype:

- Personalized greeting.
- Quick barcode scanning access.
- Product search.
- Food and product category navigation.
- Daily nutrition/health tip.
- Recent scans.
- Product highlights and useful shortcuts.

The displayed information should reflect actual application data and the user's saved preferences.

## 4.2 Discover

Discover should allow users to explore the available product database.

Expected functionality:

- Display available products.
- Search by product name or brand.
- Filter by product category.
- Display actual product images.
- Open product details.
- Apply Halal Mode and Child Safe Mode filters.
- Provide meaningful empty states when no products match the selected filters.

Products should be loaded from the actual product database, not from the prototype's separate hardcoded catalog.

## 4.3 Product Details

The Product Details screen is one of NutriScan's most important features.

It should provide a comprehensive overview of the selected product using its actual JSON information and calculated assessments.

For food products, the screen should include:

- Product name and brand.
- Product image.
- Barcode and net weight.
- NQSS score.
- Score interpretation.
- Nutritional breakdown.
- Nutrition values.
- Ingredient list.
- Ingredient explanations.
- Allergens and relevant additive information.
- Positive nutritional attributes.
- Important nutritional concerns.
- Evidence and data-quality information.
- Better Alternatives.
- Add to Compare.
- Ask Nouri about this product.
- Product reactions, such as Like and Dislike.

### Nutrition presentation

The prototype includes both Per Serving and Per 100g presentation concepts.

The actual application should preserve useful nutrition context while using the standardized NQSS reference basis.

The methodology specifies:

- Per 100 g for solid and semi-solid foods.
- Per 100 ml for liquids.

Serving-level information should remain available for consumer understanding where the label provides it.

### Added sugar teaspoon indicator

Preserve the prototype's added-sugar visualization.

Use the relationship:

`4 grams of sugar = approximately 1 teaspoon`

Show the teaspoon equivalent alongside the relevant added-sugar amount.

Do not incorrectly label total sugar as added sugar when the product information does not establish that distinction.

### Category-specific product details

Not all products are food products.

NutriScan also contains Personal Care and Home Care products.

These products should have their own information presentation based on their actual records.

For example:

- Personal Care: Ingredients, product information, allergens, skin-related information, and safety warnings.
- Home Care: Ingredients, chemical information, usage instructions, hazard information, and precautions.

**Personal Care and Home Care products must not receive food-style NQSS scores.**

Do not force every product into the same food-scoring framework.

---

# 5. NQSS — Nutritional Quality Scoring Standard

NQSS is one of NutriScan's core differentiating features.

The actual application must use the complete methodology available at:

`NutriScan-Product-Database/benchmark/food-scoring-methodology.md`

The methodology defines eight scoring components:

| Parameter | Maximum Points |
|---|---:|
| Added/Free Sugar | 20 |
| Sodium | 15 |
| Saturated Fat | 15 |
| Trans Fat | 10 |
| Energy Density | 5 |
| Dietary Fibre | 15 |
| Protein | 10 |
| Whole-food Components | 10 |
| **Total** | **100** |

Higher scores indicate a more favourable nutritional profile under the proposed NutriScan methodology.

### Important scoring expectations

1. Use the actual product nutrition information.
2. Follow the thresholds and category rules in the benchmark document.
3. Calculate component-level points and the overall score.
4. Display the score breakdown so users can understand why a product received its score.
5. Distinguish declared values from estimated values.
6. Handle missing values without automatically treating them as zero.
7. Preserve uncertainty and data-quality information.
8. Keep ingredient/allergen assessments separate from the numerical NQSS.

### Missing nutrition information and AI-assisted analysis

An important consideration is that the current product database does not contain every input required by the NQSS methodology.

For example, some products contain total sugar but do not separately declare added/free sugar. Some records also lack energy and dietary fibre information.

We do not want the user experience to become unnecessarily complicated or to withhold scores simply because one or more nutrition fields are missing.

Where appropriate, AI-assisted product analysis and estimation may help determine missing information.

However:

- Estimates must be based on product-specific evidence.
- Generic category averages must not be presented as verified product values.
- Total sugar must not automatically be treated as added/free sugar.
- Missing fibre or protein must not automatically be inferred from ingredient names.
- Estimated values must be distinguishable from label-declared values.
- The scoring methodology's missing-data and provisional-score policies must be respected.
- If there is insufficient evidence for a meaningful assessment, communicate the limitation instead of inventing a reliable-looking score.

The methodology's available-weight rescaling policy provides a way to produce a provisional score when sufficient information exists.

The consumer-facing interface should remain simple. For example, show an **Estimated Score** or **Some Values Estimated** indication when applicable, with additional information available to users who want to understand the data quality.

### Numerical consistency

AI can assist with product analysis, extraction, estimation, and explanations.

However, the final numerical score must follow the NQSS rules. AI-generated explanations must not independently change the scoring weights, thresholds, component points, or final score.

### Score interpretation

The methodology proposes these provisional interpretation bands:

| Score | Label |
|---|---|
| 80–100 | Excellent nutritional profile |
| 60–79.9 | Good nutritional profile |
| 40–59.9 | Moderate nutritional profile |
| 0–39.9 | Low nutritional profile |

These are proposed communication bands, not clinically validated health classifications.

NQSS must not be presented as a medical diagnosis, guarantee of safety, or universal declaration that a product is healthy or unhealthy.

### Product database integrity

AI-assisted analysis should not silently modify the original product JSON records or replace declared label information.

The original product information and any subsequent assessment/estimation should remain distinguishable.

---

# 6. Better Alternatives

Better Alternatives is an important feature that helps users discover comparatively better nutritional options.

The actual application must use the real product database and calculated NQSS scores.

### Expected behaviour

When a user opens a food product, NutriScan should identify comparatively better products from the same category.

For example:

- A Bun product should be compared with other Bun products.
- A Cake product should be compared with other Cake products.
- A Chips product should be compared with other Chips products.
- A Noodles product should be compared with other Noodles products.

Do not recommend an unrelated product simply because it has a higher score.

### Recommendation rules

1. Identify the current product's category using its product-directory category.
2. Find other food products belonging to that same category.
3. Calculate or retrieve their NQSS assessments.
4. Identify products with a higher NQSS score than the current product.
5. Prefer products from different brands where suitable alternatives are available.
6. Sort recommendations from highest NQSS score to lowest.
7. Display actual product names, brands, images, and scores.
8. Do not invent alternatives when no qualifying product exists.

The recommendations should be dynamically based on the available product records and scoring results, rather than the fixed alternative products hardcoded in the prototype.

The recommendation should communicate that a higher NQSS score represents a comparatively more favourable nutritional profile under NutriScan's scoring methodology, not a guarantee of personal suitability.

If relevant, the user's active Halal Mode and personal dietary restrictions should also be respected.

---

# 7. Compare Products

The application should preserve the dedicated Compare Products experience from the prototype.

Users should be able to select two food products and compare them side by side.

The comparison should include:

### 7.1 NQSS Comparison

- Overall NQSS scores.
- Score interpretation.
- Individual scoring component breakdown.
- Differences between the two products.

### 7.2 Nutritional Comparison

Important nutrition values should be compared, including:

- Energy.
- Added/free sugar where available.
- Sugar teaspoon equivalents.
- Sodium.
- Protein.
- Dietary fibre.
- Total and saturated fat.
- Other declared nutritional values where useful.

Comparisons should use compatible reference bases. Missing information must be shown as unavailable rather than being treated as zero.

### 7.3 Ingredients and Additives

Compare:

- Ingredients.
- Additives.
- Relevant ingredient concerns.
- Common ingredients.
- Allergen information.
- Personal allergy matches from the user's profile.

### 7.4 Nouri Comparison Summary

Nouri should be able to explain the comparison in natural language.

For example, it can explain which product has the more favourable nutritional profile, what the major differences are, and which factors may matter to the user.

The summary must use the actual comparison results rather than inventing nutrition values.

---

# 8. Nouri — AI Nutrition Assistant

Nouri is one of NutriScan's most important features and should be implemented as a genuinely AI-powered conversational nutrition assistant.

It should not remain the keyword-matching or predefined-response chatbot currently used in the prototype.

The goal is to make Nouri a personalized nutrition companion that understands the user's health context, preferences, nutrition goals, and NutriScan product information.

## 8.1 Personalized Responses

Nouri should automatically consider relevant information from the user's profile when answering questions.

The profile information may include:

- Age and other relevant personal information.
- Health conditions.
- Dietary restrictions.
- Food allergies.
- Food intolerances.
- Nutrition goals.
- Food preferences.
- Foods the user wants to avoid.

Nouri should not provide generic recommendations when relevant personal information is available.

For example:

A user asks:

"What are some good sources of protein?"

If the user's profile includes relevant health considerations, dietary restrictions, or food allergies, Nouri should consider those factors before suggesting foods.

A user with a relevant heart-related condition should receive guidance that considers the nutritional context of recommended foods, rather than simply receiving a generic list of high-protein packaged products.

The response should be personalized, relevant, and understandable.

## 8.2 NutriScan Product Awareness

Nouri should understand the actual product database and NutriScan's assessment results.

Users should be able to ask questions such as:

- Is this product a good choice?
- Why did this product receive this NQSS score?
- Which ingredients should I pay attention to?
- Does this product contain anything related to my allergies?
- Can you suggest a better alternative?
- Compare these two products.
- Is this product suitable for my dietary preferences?

Nouri should use the actual product information, nutrition values, ingredients, NQSS breakdown, and other available assessments.

It must not fabricate product information or claim that unavailable information has been verified.

## 8.3 Nouri Memory

Nouri should maintain useful context across conversations.

We want three types of memory:

**1. Profile Memory**

Information explicitly provided in the user's My Account or Health Profile section.

Examples:

- Health conditions.
- Food allergies.
- Dietary restrictions.
- Nutrition goals.

**2. Preference Memory**

Relevant preferences learned from conversations and saved with appropriate user awareness.

Examples:

- Foods the user likes.
- Foods the user dislikes.
- Preferred food choices.
- Dietary preferences mentioned during conversations.

**3. Conversation Context**

Relevant information from previous conversations that helps Nouri understand the user's ongoing questions and preferences.

For example, if a user previously discussed a nutrition goal and later asks a related question, Nouri should be able to use the relevant context instead of treating every conversation as completely new.

Memory should be relevant rather than indiscriminately included in every response.

Users should have appropriate visibility and control over their saved preferences and personal information, including the ability to review or update them.

Nouri must not independently modify a user's health profile or invent medical information.

## 8.4 Conversational Experience

Preserve and improve the existing prototype experience:

- Natural conversation.
- English and Bangla support.
- Suggested questions.
- Context-aware responses.
- Product/action cards where useful.
- Conversation history.
- Typing/loading feedback.
- Product-specific Ask Nouri shortcuts.

## 8.5 Health and Safety

Nouri provides nutrition information and general wellness guidance, not medical diagnosis or treatment.

It should:

- Consider relevant health conditions and allergies.
- Avoid recommendations that conflict with known dietary restrictions.
- Clearly communicate uncertainty.
- Avoid unsupported medical claims.
- Encourage professional medical guidance when an individual's condition requires it.
- Never claim that a product is medically safe for a particular person merely because its NQSS score is high.

Personal health information must be handled carefully and should not be exposed unnecessarily.

## 8.6 Personalized Suggestions

Nouri should be able to suggest relevant alternatives, nutrition tips, and product choices based on the user's profile and goals.

For example, a user trying to reduce sugar should receive suggestions that take sugar content into account.

A user with a known food allergy should receive appropriate allergy-aware guidance.

The system should explain why a recommendation is relevant when that would help the user understand it.

---

# 9. My Account and Health Profile

The My Account section should provide a central place for users to manage their personal information and preferences.

Preserve the prototype's Health Profile experience.

### Health Profile

Users should be able to add and update:

- Personal information.
- Health conditions.
- Dietary restrictions.
- Food allergies.
- Food intolerances.
- Foods to avoid.
- Nutrition goals.

The prototype supports predefined selections and custom manual entries. Preserve both capabilities.

### Nutrition Goals

Users should be able to select from predefined goals and add custom goals.

Examples include:

- Balanced nutrition.
- Increase protein.
- Reduce sugar.
- Reduce sodium.
- Improve fibre intake.
- Limit saturated fat.
- Better food awareness.
- Less processed foods.
- Mindful portions.
- Better hydration.

The user's selected goals should influence relevant Nouri responses, tips, and personalized recommendations.

### Preferences

Users should be able to manage:

- Halal Mode.
- Child Safe Mode.
- Language.
- Light/dark appearance.
- Notification preferences.

All saved preferences should behave consistently across the application.

---

# 10. Halal Mode

Halal Mode should use the product-specific `halal_status` information available in the actual product JSON.

The prototype currently uses a separate `halalEvidence` object and its own hardcoded evidence rules. That is not the source of truth for the actual application.

### Expected behaviour

When Halal Mode is enabled:

- Product eligibility should be determined from the exact product's database status.
- Products with a verified/explicit halal status should be eligible.
- Products marked `not_specified` or with unavailable/unclear status should not be presented as verified halal.
- Do not infer halal status from brand name, country, vegetarian status, or ingredients alone.
- Do not claim that NutriScan itself issues halal certification.

The filter should work consistently across:

- Home product recommendations.
- Discover.
- Search results.
- Category results.
- Barcode lookup.
- Product details.
- Better Alternatives.
- Comparison product selection.
- Other relevant product lists.

When a product is hidden due to Halal Mode, provide an understandable explanation.

Preserve the original product data and make the complete catalog accessible again when the mode is disabled.

**Important data note:** The current database contains `halal_status` values such as `halal`, `not_specified`, and one `suitable_with_caution` entry. The meaning of the latter must be checked rather than automatically interpreted as halal.

---

# 11. Child Safe Mode

Child Safe Mode must use the product-level `child_suitability` information in the actual product JSON.

The prototype currently filters products using a hardcoded NQSS threshold of 60. This behaviour must be replaced.

**NQSS score and Child Suitability are two separate assessments.**

A product with a high NQSS score is not automatically suitable for children. Similarly, Child Suitability must not be calculated from NQSS alone.

### Expected behaviour

When Child Safe Mode is enabled:

- Evaluate each product's `child_suitability` classification.
- Use the research framework in `docs/child-suitability-benchmark.md`.
- Consider relevant age-specific restrictions.
- Display the product's suitability classification clearly.
- Show appropriate caution information where applicable.
- Do not present unassessed products as confirmed suitable for children.

The benchmark defines:

- `suitable`
- `suitable_with_caution`
- `not_suitable`

The current product database also contains some older or more specific values, including `limited`, `not_recommended`, and age-specific restrictions.

The benchmark explicitly identifies `limited` as an older label that should be replaced by `suitable_with_caution`.

Other legacy and age-specific values should be interpreted carefully. Preserve the original product information and avoid silently treating an unknown classification as suitable.

The mode should work consistently across Discover, search, product lists, recommendations, and other relevant product-selection experiences.

The exact handling of cautionary, unassessed, and age-specific classifications should follow the benchmark and be made explicit in the application rather than reverting to an arbitrary numerical score threshold.

---

# 12. Barcode Scanner

The existing prototype provides barcode scanning and manual barcode entry.

The actual application should make this a real product lookup feature.

Expected behaviour:

1. Allow users to scan a barcode using the device camera.
2. Support manual barcode entry.
3. Normalize and validate barcode input.
4. Search the actual product database.
5. Open the matching product details when a match exists.
6. Handle unmatched barcodes gracefully.
7. Provide a path to the product contribution feature when a product is not available.

The scanner should respect active product filters, including Halal Mode.

A barcode match should not be treated as proof that the current package formulation is identical to an older record.

---

# 13. Nutrition Label Scanner and OCR

The prototype includes a simulated Nutrition Label Scanner with sample presets and editable nutrition values.

The actual application should provide genuine label scanning and OCR-based information extraction.

Expected user experience:

- Capture or select a nutrition label image.
- Extract the visible nutrition information.
- Identify nutrient names, quantities, units, and serving/reference information.
- Allow the user to review and correct extracted values.
- Handle uncertain or unreadable values.
- Use the same NQSS methodology for scoring.
- Display the calculated assessment and relevant data-quality information.

OCR extraction must not be treated as automatically verified.

Incorrect decimal points, units, label rows, sodium/salt confusion, and serving-size mistakes can materially affect a score.

The user should have a clear opportunity to review important extracted values.

---

# 14. Ingredient Explainer

Preserve the prototype's Ingredient Explainer feature.

Users should be able to:

- Open ingredient information from product details.
- Understand the purpose of an ingredient.
- Read understandable explanations.
- Identify relevant allergens.
- See additives and their functions.
- Understand why certain ingredients may deserve attention.
- Search the ingredient reference.

Ingredient explanations should distinguish established facts, possible concerns, and uncertainty.

A permitted food additive should not automatically be described as harmful.

Do not make unsupported carcinogenic, toxic, or disease-related claims.

Allergy-related information should be especially clear and should be compared with the user's saved allergy profile where appropriate.

---

# 15. History and Favorites

Preserve the prototype's scan history and favorite-product experience.

Users should be able to:

- View previously scanned products.
- Reopen product details.
- Save and remove favorites.
- Revisit their product activity.
- Clear history when desired.

The data should persist appropriately and should remain consistent with the user's account and device experience.

Halal Mode and Child Safe Mode should not destructively delete hidden products from saved history or favorites.

---

# 16. NutriFacts and Personalized Tips

The prototype includes NutriFacts with educational nutrition content, ingredient insights, daily tips, and Myth vs Fact cards.

Preserve these concepts.

Expected functionality:

- General nutrition education.
- Food-label reading guidance.
- Ingredient information.
- Myth vs Fact.
- Interesting nutrition facts.
- Daily health/nutrition tips.
- Personalized tips based on the user's goals.
- English and Bangla content.

Use credible references and retain appropriate source attribution.

General educational content should be clearly distinguished from personalized medical advice.

---

# 17. Product Contribution

The prototype includes a product contribution form.

Users should be able to submit information about products that are not already available in NutriScan.

The form should support:

- Product name.
- Brand.
- Category.
- Barcode, where available.
- Front package image.
- Back/package-label image.
- Additional product information.

The contribution experience should provide clear submission status and appropriate feedback.

A user-submitted product must not automatically become a verified NutriScan database record.

It should remain distinguishable from verified product information until the relevant review/verification process has taken place.

AI-assisted extraction may help organize submitted information, but extracted information should not silently become verified data.

---

# 18. Community

Preserve the Community feature and contributor leaderboard concept from the prototype.

The actual experience should represent genuine user or contributor activity rather than fabricated demonstration identities or arbitrary ranking values.

Where community data is unavailable, communicate that clearly instead of presenting fictional information as live community activity.

---

# 19. Premium

The prototype includes a Premium section with Free and Premium plan concepts.

Preserve the premium experience and its relationship to NutriScan features.

The existing product concept includes premium access and expanded/unlimited scanning capabilities.

The actual application should represent subscription status and feature access consistently.

Do not display a successful subscription, payment, or purchase unless it has actually been confirmed by the relevant service.

Pricing, payment provider, and final subscription entitlements are not specified by this document.

---

# 20. Expiry Reminders

Preserve the Expiry Reminders feature.

Users should be able to:

- Add a product name.
- Enter its expiry/best-before date.
- View saved reminders.
- Identify products that are safe by date, expiring soon, or expired according to the application's clearly defined reminder logic.
- Receive appropriate notifications when notification permission is available.

The feature should provide useful reminder management rather than only displaying static example cards.

---

# 21. Support Us

Preserve the Support Us section from the prototype.

It should communicate the purpose of supporting NutriScan and provide an appropriate user experience.

The current prototype does not have a configured real bKash/Nagad payment or donation connection.

Do not display a fake successful payment or claim that a donation has been processed without a real, confirmed transaction.

---

# 22. Onboarding, Authentication, and User Experience

The prototype includes an onboarding and simulated authentication flow.

The actual application should provide an appropriate user onboarding and account experience.

Users should understand:

- What NutriScan does.
- How scanning works.
- What NQSS means.
- How Nouri provides personalized assistance.
- Why setting up a health profile improves personalization.
- How privacy and saved personal information are handled.

Authentication should not remain a purely simulated sign-in/register experience in the actual application.

The application should preserve the prototype's welcoming and accessible user experience.

---

# 23. Language and Appearance

NutriScan should retain its bilingual English/Bangla experience.

Important expectations:

- English and Bangla support across application screens.
- Consistent localized labels and descriptions.
- Appropriate Bengali typography.
- Proper text wrapping.
- Light and dark themes.
- Consistent colors and visual hierarchy.
- Accessible controls and readable text.

The prototype uses the NutriScan visual identity and the Delta Field Notes design direction.

These are useful references, but the actual application may improve the presentation while preserving the brand's identity and overall user experience.

---

# 24. Important Differences Between the Prototype and Actual Application

The following distinctions are especially important.

| Feature | Prototype behaviour | Actual application expectation |
|---|---|---|
| Product catalog | Hardcoded demo catalog | Actual product JSON database |
| Product images | Prototype assets and generated images | Actual database product images |
| NQSS | Predefined demonstration scores | Actual methodology-based scoring |
| Missing nutrition data | Simplified demo values | Evidence-based handling and provisional assessment |
| Better Alternatives | Hardcoded product families and scores | Dynamically calculated same-category alternatives |
| Halal Mode | Prototype `halalEvidence` logic | Actual product-level `halal_status` |
| Child Safe Mode | NQSS threshold of 60 | Actual `child_suitability` classification |
| Nouri | Keyword-based predefined responses | Genuine personalized AI assistant |
| Nouri Memory | Local prototype chat history | Profile, preference, and conversation context memory |
| Product Comparison | Hardcoded prototype product information | Actual database product comparison |
| Barcode Scanner | Prototype catalog lookup | Actual product database lookup |
| OCR Scanner | Simulated extraction | Actual OCR-based label extraction |
| Health Profile | Local prototype state | Functional saved user profile |
| Product Contribution | Local submission draft | Functional submission and review status |
| Community | Demonstration leaderboard | Genuine community data |
| Premium | Simulated activation | Actual subscription status and confirmed access |
| Expiry Reminders | Local prototype tracker | Functional reminder management |

This table highlights the most important differences, not every individual implementation detail.

The actual application should preserve the useful functionality and experience of the prototype while replacing demonstration-only behaviour.

---

# 25. Important Product Principles

The following principles should guide the application as a whole.

### 25.1 Accuracy over assumptions

Use actual product information and reliable references.

Do not invent nutrition values, ingredients, certifications, product facts, or medical claims.

### 25.2 Separate assessments

Do not confuse:

- Nutritional quality.
- Ingredient safety and concerns.
- Allergen information.
- Halal status.
- Child suitability.
- Personal medical suitability.

These are different assessments and should remain distinguishable.

### 25.3 Personalization matters

NutriScan should not treat every user identically when relevant personal context is available.

Health profile information, dietary restrictions, allergies, preferences, and nutrition goals should influence relevant recommendations and Nouri responses.

### 25.4 Transparency

Users should understand:

- Where product information comes from.
- Why a score was assigned.
- Which values were estimated.
- Why a product is recommended.
- Why a product is hidden by a particular filter.
- Where information is incomplete.

### 25.5 No fake functionality

A feature should not merely look functional.

Avoid simulated success messages, fabricated product records, fake AI responses presented as real AI, fictional community activity, and unconfirmed payment states.

If an external integration requires configuration, make its actual status clear.

### 25.6 Maintainability

The product database and its methodology may expand over time.

Avoid unnecessary duplication of product information and ensure that changes to the source records can be reflected consistently throughout the application.

### 25.7 User-friendly experience

The application should be understandable to ordinary consumers, not just technically knowledgeable users.

Keep complex scoring and data-quality details available without making the normal user experience unnecessarily complicated.

---

# 26. Important Existing Reference Files

The following files should be explored directly during implementation:

| File / Directory | Purpose |
|---|---|
| `prototype/README.md` | Complete prototype overview |
| `prototype/TODO.md` | Prototype feature and outcome checklist |
| `prototype/plan.md` | Existing UI/UX design direction |
| `prototype/app/` | Existing application screens |
| `prototype/lib/nutriscan-data.ts` | Prototype product structure and helper logic |
| `prototype/lib/nutriscan-state.tsx` | Prototype state and persistence concepts |
| `prototype/lib/nouri-engine.ts` | Existing mock Nouri behaviour |
| `prototype/lib/comparison-engine.ts` | Existing comparison behaviour |
| `prototype/lib/nutrition-utils.ts` | Nutrition-related utilities |
| `NutriScan-Product-Database/Products/` | Actual product JSON and images |
| `NutriScan-Product-Database/benchmark/food-scoring-methodology.md` | Primary NQSS methodology |
| `docs/child-suitability-benchmark.md` | Child suitability research and classification framework |
| `app/` | Actual application implementation target |

The prototype's source code should be explored wherever additional feature-specific behaviour needs clarification.

---

# 27. Final Expectations

NutriScan is intended to become a complete, functional application rather than a static prototype or a basic food-scanning utility.

The existing prototype represents the product experience we want to build upon.

The actual product database represents the real product information that should power the application.

The NQSS methodology and Child Suitability benchmark provide the assessment frameworks.

Nouri represents the personalized AI experience that should connect the user's profile, preferences, previous conversations, and NutriScan's product intelligence.

All major prototype features are within the intended application scope.

**The most important expectations are:**

1. Understand the complete existing prototype before making major decisions.
2. Use the actual product database instead of the prototype's hardcoded catalog.
3. Implement NQSS according to the provided methodology.
4. Use product-level Halal and Child Suitability information.
5. Make Better Alternatives dynamically compare products within the same category.
6. Implement genuine AI-powered Nouri with personalization and memory.
7. Preserve the complete feature experience of the prototype.
8. Make the application functional, consistent, and maintainable.
9. Improve the UI/UX where appropriate without losing the original product vision.
10. Avoid inventing information or presenting simulated functionality as real.

---

# 28. Freedom for Technical Planning

This document intentionally describes **what NutriScan is, what already exists, and how the application is expected to behave**.

It does not prescribe a specific implementation sequence, database architecture, API structure, backend design, AI provider, or development workflow.

The existing codebase, project resources, and requirements should be analysed before making technical decisions.

You and your development teammate have the freedom to discuss and decide:

- Appropriate application architecture.
- Frontend and backend organization.
- Database design and integration.
- AI and OCR integration.
- Authentication and user-data management.
- Nouri's memory and context management.
- External services and integrations.
- Development phases and implementation priorities.

The implementation plan should be created collaboratively after understanding the project and discussing the available options.

**This document should serve as the shared product understanding and requirements reference throughout development.**

The ultimate objective is simple:

**Build the actual NutriScan application envisioned in the prototype, powered by real product information, reliable nutritional analysis, meaningful personalization, and genuinely functional features.**

**Know What You Eat. Make Better Choices.**