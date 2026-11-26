# NutriScan Nutritional Quality Scoring Standard (NQSS) — Version 1.0

**Document status:** Proposed implementation standard; suitable for a deterministic pilot, not yet clinically or population-validated.  
**Scope:** Packaged food products sold in Bangladesh.  
**Applies to:** Food products only. Personal Care and Home Care products must use a separate ingredient-assessment system and must not receive an NQSS score.

## 1. Project Background

NutriScan helps people understand the nutritional quality of packaged food products available in Bangladesh. A product record may include the product name, brand, food category and subcategory, ingredients list, nutrition facts, declared serving size, net quantity, barcode, and packaging images.

The NQSS is a transparent, reproducible indicator of the nutritional profile of a packaged food. It is calculated from declared nutrition information and a structured assessment of food components. It is not a diagnosis, a medical recommendation, a food-safety certification, a halal certification, or a guarantee that a product is safe or unsafe.

The reference basis for the numerical score is **per 100 g** for solid and semi-solid foods and **per 100 ml** for liquids. This makes products more comparable than a serving-size basis, because serving sizes are set by manufacturers and vary substantially. Serving information remains useful for user education, but it does not replace the standardized reference basis.

### 1.1 Design objectives

NQSS is designed to:

- return a score from 0 to 100;
- reward fibre, protein, and identifiable whole-food components;
- penalize high free sugar, sodium, saturated fat, trans fat, and energy density;
- distinguish reported facts from inferred or missing facts;
- use universal nutrient rules where the evidence is reasonably transferable;
- use category-specific rules only where the food matrix or nutrient meaning materially differs;
- produce a machine-readable score breakdown;
- allow the same input and algorithm version to reproduce the same result; and
- expose uncertainty instead of hiding it behind a falsely precise number.

### 1.2 Evidence versus NutriScan design decisions

This document uses two different types of statement:

1. **Evidence-based anchors.** Examples include the World Health Organization recommendations that free sugars should be below 10% of energy, saturated fat below 10% of energy, trans fat below 1% of energy, sodium below 2,000 mg/day for adults, and that adults should aim for at least 25 g of naturally occurring dietary fibre and 400 g of fruit and vegetables per day [1] [2] [3].
2. **NutriScan design decisions.** A nutrient value per 100 g cannot by itself determine a complete day’s diet. Therefore, the point bands, weights, score interpretation labels, data-completeness policy, and several product-category rules in this version are proposed implementation choices. They must be validated against Bangladeshi products and expert review before being described as validated health classifications.

## 2. Main Objective and Overall Model

NQSS is a weighted composite of eight subscores. Each subscore is calculated on a 0-to-maximum-point scale. Higher points always mean a more favourable nutritional profile.

The proposed Version 1.0 point allocation is:

| Parameter | Maximum points | Direction |
|---|---:|---|
| Added/free sugar | 20 | Lower is better |
| Sodium | 15 | Lower is better |
| Saturated fat | 15 | Lower is better |
| Trans fat | 10 | Lower is better |
| Energy density | 5 | Lower is better, with category exceptions |
| Dietary fibre | 15 | Higher is better |
| Protein | 10 | Higher is better, interpreted in context |
| Whole-food components | 10 | Higher is better |
| **Total** | **100** | |

These weights are **preliminary and unvalidated**. They are retained in Version 1.0 because they are simple, cover both limiting and beneficial attributes, and sum to 100 without a hidden normalization step. The weight table must not be interpreted as proof that sugar is exactly twice as important as protein.

### 2.1 Critical evaluation of the proposed parameters

The set is a reasonable starting point, but it has important weaknesses:

- **Correlation and double-counting:** High sugar, high energy density, and low fibre often occur together. Saturated fat and energy density may also move together. The framework limits this problem by giving energy only 5 points and by not adding total fat as a separate penalty. Validation must still test correlations and sensitivity.
- **Trans fat sparsity:** Many labels report zero or do not declare trans fat. A 10-point component may have little variation in a product database. It remains because industrial trans fat is a high-priority public-health concern, but its operational weight should be reassessed after label-coverage analysis.
- **Protein is not universally beneficial at the product level:** Protein in a sweetened confection or highly salty snack should not automatically make the product “healthy.” Protein points are therefore capped at 10 and must be read alongside the limiting nutrients and ingredient assessment.
- **Whole-food components are difficult to quantify:** A short ingredients list is not proof of nutritional quality. The whole-food component score uses evidence from the ingredient list and product identity, not marketing language.
- **Category dependence:** A score based only on universal nutrient cut-points can unfairly compare soup with candy, cheese with soft drink, or plain oats with granola. NQSS therefore uses a common core and a limited category rule layer.
- **Missing data:** Fibre, protein, added sugar, and trans fat are not consistently declared in all markets. Missingness must reduce confidence, not silently become zero.
- **Per-100-g limitations:** Per-100-g scoring improves comparability but can misrepresent products normally consumed in large or small portions. NQSS displays serving-level context separately and does not treat the score as an intake recommendation.

No new nutrient is added to Version 1.0 merely to make the framework appear more complete. Micronutrients, non-sugar sweeteners, additives, allergens, and processing are handled outside the numerical score unless a future validated version adds them with an explicit evidence base.

## 3. Input Standardization and Data Definitions

### 3.1 Required or preferred inputs

The scoring engine should accept the following structured fields:

```text
product_id
algorithm_version
category
subcategory
food_form: solid | semi_solid | liquid
reference_basis: per_100_g | per_100_ml
energy_kcal_per_100_reference
sodium_mg_per_100_reference
saturated_fat_g_per_100_reference
trans_fat_g_per_100_reference
fibre_g_per_100_reference
protein_g_per_100_reference
total_sugar_g_per_100_reference
added_sugar_g_per_100_reference
free_sugar_g_per_100_reference
ingredients[]
whole_food_evidence[]
serving_size_g_or_ml
source: label_image | verified_database | manufacturer | other
field_status[]
```

The engine should also retain the original declared value, unit, qualifier, source image or transcription, and extraction timestamp. A normalized value must never replace the original value.

### 3.2 Total sugar versus added/free sugar

**Total sugars** include sugars naturally present in foods and sugars added during manufacture. **Free sugars**, in the WHO definition, include monosaccharides and disaccharides added by the manufacturer, cook, or consumer, plus sugars naturally present in honey, syrups, fruit juice, and fruit-juice concentrates [1]. Total sugar is therefore not equivalent to added sugar or free sugar.

The scoring hierarchy is:

1. Use declared **free sugar** if the label or a verified manufacturer specification defines it clearly.
2. Otherwise use declared **added sugar** if the label defines it clearly and the ingredient evidence is consistent.
3. Otherwise use a verified product-specific estimate only if the estimation method, source, and uncertainty are stored. This is not permitted for an ordinary label transcription.
4. If only total sugar is available, do **not** silently score total sugar as added/free sugar. Set the sugar subscore to `unavailable` or return a provisional score using an explicitly disclosed lower-confidence policy described in Section 9.

For products whose total sugar is naturally intrinsic, such as unsweetened plain milk or whole fruit ingredients, total sugar should not be penalized as free sugar. Conversely, fruit juice and fruit-juice concentrate count toward free sugars under the WHO definition [1].

### 3.3 Energy units

Energy should be stored in both the declared unit and a normalized kcal value. If only kilojoules are declared:

```text
kcal = kJ / 4.184
```

The engine should retain sufficient precision internally and round only at the final display boundary.

### 3.4 Sodium versus salt

If sodium is declared, use sodium. If only salt is declared and the label uses a conventional sodium-chloride-equivalent value, the provisional conversion is:

```text
sodium_mg = salt_g × 400
```

This approximation must be flagged as converted. The underlying label convention should be retained because salt and sodium are not identical quantities. If neither sodium nor salt is available, sodium is unavailable; do not use the presence of a salty ingredient as a numeric substitute.

## 4. Scoring Parameters

Each table below gives the proposed Version 1.0 point allocation. The thresholds are not all of the same evidentiary status. WHO-derived boundaries are evidence anchors; intermediate bands are NutriScan interpolation decisions and require validation.

### 4.1 Added/free sugar — maximum 20 points

#### What it measures

This parameter measures declared or reliably established free sugar per 100 g or 100 ml. It does not measure total sugar unless the product-specific sugar is demonstrably free sugar.

#### Why it matters

WHO recommends limiting free sugars to less than 10% of total energy, with a conditional suggestion that 5% or less may provide additional benefits. The recommendation addresses unhealthy weight gain and dental caries [1]. Bangladesh’s national dietary guidance also recommends limiting free sugar and sugar-sweetened drinks [2].

#### Point allocation

| Free sugar per 100 g/ml | Points |
|---:|---:|
| 0 to 2.5 g | 20 |
| >2.5 to 5 g | 16 |
| >5 to 10 g | 11 |
| >10 to 15 g | 6 |
| >15 to 22.5 g | 2 |
| >22.5 g | 0 |

These cut-points are **provisional product-level interpolation bands**. They are not direct translations of the WHO daily percentage recommendation, because a product concentration cannot be converted into a daily intake recommendation without a portion and total diet.

For liquids, the same concentration bands apply per 100 ml. In addition, a beverage identified as a sugar-sweetened beverage receives 0 sugar points when free sugar is greater than 10 g/100 ml. This beverage rule is provisional and should be checked against Bangladeshi beverage distributions.

#### Example

A fruit drink with 8 g free sugar per 100 ml receives 11 of 20 sugar points. If it contains fruit juice or concentrate, that sugar is treated as free sugar under WHO’s definition even if no sucrose was added [1].

### 4.2 Sodium — maximum 15 points

#### What it measures

Sodium concentration per 100 g or 100 ml, including sodium from salt and sodium-containing ingredients.

#### Why it matters

High sodium intake is associated with raised blood pressure and cardiovascular disease risk. WHO recommends less than 2,000 mg sodium per day for adults, equivalent to less than 5 g salt [3]. Sodium is commonly high in processed foods, salty snacks, bread, cheese, condiments, and ready meals [3].

#### Point allocation

| Sodium per 100 g/ml | Points |
|---:|---:|
| 0 to 120 mg | 15 |
| >120 to 300 mg | 12 |
| >300 to 600 mg | 8 |
| >600 to 900 mg | 4 |
| >900 to 1,200 mg | 1 |
| >1,200 mg | 0 |

These are **provisional product-level bands** anchored to the WHO population recommendation but not directly prescribed by WHO. They are intentionally stricter for concentrated packaged foods than a daily limit alone would be.

For sauces and condiments, the product is scored using the same sodium concentration, but the result is labelled “concentrated product context.” A future validated version may use a separate condiment model because a 10 g serving is common for some sauces. The core score must not silently switch between per-100-g and per-serving rules.

#### Example

A noodle seasoning product containing 900 mg sodium per 100 g receives 1 of 15 points. The user-facing explanation should say that the value is high per 100 g and that actual exposure also depends on the amount of seasoning used.

### 4.3 Saturated fat — maximum 15 points

#### What it measures

Saturated fat in grams per 100 g or 100 ml.

#### Why it matters

WHO recommends that saturated fatty acids provide no more than 10% of total energy, and recommends replacing saturated fat with polyunsaturated or monounsaturated fat, or with carbohydrate from naturally fibre-containing foods [3]. Bangladesh’s national dietary guidance uses the same <10% energy target [2].

#### Point allocation

| Saturated fat per 100 g/ml | Points |
|---:|---:|
| 0 to 1.5 g | 15 |
| >1.5 to 3 g | 12 |
| >3 to 5 g | 8 |
| >5 to 7.5 g | 4 |
| >7.5 to 10 g | 1 |
| >10 g | 0 |

These are **provisional concentration bands**. A product-level threshold cannot exactly reproduce an energy-percentage recommendation because total energy and serving size differ.

#### Example

A biscuit with 6 g saturated fat per 100 g receives 4 of 15 points. Its score must not be increased merely because it contains some protein or whole-wheat flour.

### 4.4 Trans fat — maximum 10 points

#### What it measures

Declared trans-fatty acids per 100 g or 100 ml. The field should distinguish declared zero, measured zero, below-quantification-limit, and not declared.

#### Why it matters

WHO recommends trans fat below 1% of total energy and states that industrially produced trans fats are not part of a healthy diet and should be avoided [3]. This is a high-priority risk marker even though it may be absent or poorly reported on labels.

#### Point allocation

| Trans fat per 100 g/ml | Points |
|---:|---:|
| Declared 0 g or measured 0 g | 10 |
| >0 to 0.2 g | 8 |
| >0.2 to 0.5 g | 5 |
| >0.5 to 1 g | 2 |
| >1 g | 0 |

A value reported as `<0.1 g` receives 10 points only if the label’s legal convention establishes that the product contains less than the stated threshold and the field is explicitly stored as an upper bound. It must not be converted to an exact zero in the database. If trans fat is absent from the label, the subscore is unavailable rather than automatically 10 or 0.

The presence of “partially hydrogenated oil” is an ingredient-level warning and does not justify fabricating a trans-fat number. It can trigger an ingredient attention flag while the numeric field remains unavailable.

#### Example

A cracker with declared trans fat 0.3 g/100 g receives 5 of 10 points. A cracker with no trans-fat declaration receives `unavailable` for this component under the strict policy.

### 4.5 Energy density — maximum 5 points

#### What it measures

Energy density is kcal per 100 g for solids and kcal per 100 ml for liquids. It is a broad measure of how much energy is present in a standardized mass or volume.

#### Why it matters

Energy density can concentrate the effect of fats and sugars and is relevant to portion size and total energy intake. However, it is not an independent measure of nutritional quality. It can double-count information already reflected in sugar and fat, so it receives only 5 points.

#### Point allocation for foods

| Energy density | Points |
|---:|---:|
| 0 to 100 kcal/100 g | 5 |
| >100 to 200 kcal/100 g | 4 |
| >200 to 300 kcal/100 g | 3 |
| >300 to 400 kcal/100 g | 2 |
| >400 to 500 kcal/100 g | 1 |
| >500 kcal/100 g | 0 |

For beverages, use kcal per 100 ml. Water and unsweetened, very-low-energy beverages receive 5 points. The beverage bands are provisional because liquids can have different satiety and consumption patterns from solid foods.

#### Category exceptions

Dry herbs, spices, concentrated bouillon, oils, butter, and products normally used in very small quantities should be marked `concentrated_or_condiment`. They still receive a numeric energy-density result for transparency, but the user interface must not compare that result directly with an ordinary snack without context. Oil and fat products will generally receive 0 energy-density points; this is not a claim that all dietary fat is harmful.

#### Example

A granola with 420 kcal/100 g receives 1 of 5 energy-density points. Its fibre and whole-food points are scored separately; no energy-density penalty is applied a second time for the same ingredient.

### 4.6 Dietary fibre — maximum 15 points

#### What it measures

Total dietary fibre declared per 100 g or 100 ml. Fibre should be the label’s dietary-fibre value, not a calculated difference between total carbohydrate and sugar.

#### Why it matters

WHO recommends at least 25 g of naturally occurring dietary fibre per day for people older than 10 years [1]. Bangladesh’s national guidance also uses 25 g naturally occurring fibre per day and emphasizes fruits, vegetables, pulses, and whole grains [2].

#### Point allocation

| Fibre per 100 g/ml | Points |
|---:|---:|
| 0 to 1 g | 0 |
| >1 to 2.5 g | 4 |
| >2.5 to 5 g | 8 |
| >5 to 7.5 g | 11 |
| >7.5 to 10 g | 13 |
| >10 g | 15 |

These bands are **provisional product-level rewards**. They should not be read as a claim that a food with 10 g/100 g supplies an adequate daily intake by itself. Isolated added fibre may count in the numeric fibre field if declared, but the whole-food component score must depend on food identity and ingredients rather than fibre alone.

#### Example

An oat cereal with 7 g fibre per 100 g receives 11 of 15 fibre points. If the 7 g is not declared and the value is missing, it receives no automatic fibre points under the strict policy.

### 4.7 Protein — maximum 10 points

#### What it measures

Protein per 100 g or 100 ml. Protein quality, digestibility, and amino-acid composition are not inferred from the number alone.

#### Why it matters

Protein provides structural and functional building blocks. WHO notes that 10–15% of energy from protein is generally sufficient for adults, while needs vary by age, growth, pregnancy, lactation, and physical activity [1]. Bangladesh’s guidance emphasizes varied sources including pulses, fish, poultry, eggs, dairy, and other foods [2].

#### Point allocation

| Protein per 100 g/ml | Points |
|---:|---:|
| 0 to 2 g | 0 |
| >2 to 5 g | 3 |
| >5 to 8 g | 5 |
| >8 to 12 g | 7 |
| >12 to 20 g | 9 |
| >20 g | 10 |

These are **provisional product-level bands**. Protein points must never override very poor sugar, sodium, saturated-fat, or trans-fat results. A high-protein confectionery product is not automatically a healthy food.

#### Example

A plain yogurt with 4 g protein per 100 g receives 3 of 10 protein points. A product with missing protein information receives an unavailable component, not zero protein.

### 4.8 Whole-food components — maximum 10 points

#### What it measures

This component captures the presence of recognizable nutrient-dense food bases such as whole grains, pulses, nuts and seeds, fruits, vegetables, and minimally processed animal-source foods. It is not a count of how many ingredients appear on the label.

WHO states that carbohydrates should come primarily from whole grains, vegetables, fruits, and pulses, and encourages dietary variety [1]. Bangladesh’s guidance emphasizes diversification toward cereals, pulses, vegetables, fruits, dairy, fish, poultry, and other nutrient-dense foods while limiting refined and highly processed foods [2].

#### Evidence hierarchy

The engine should assign evidence levels:

- `A`: percentage or mass fraction of the qualifying component is declared by a reliable source;
- `B`: ingredient order and a specific product claim provide strong but incomplete evidence;
- `C`: a generic ingredient is present but quantity and form are unclear;
- `none`: no qualifying component is evidenced.

“Whole grain,” “whole wheat,” “oat,” “brown rice,” “lentil,” “chickpea,” “bean,” “fruit,” “vegetable,” “nut,” and “seed” should be mapped through a controlled ingredient dictionary. “Multigrain,” “natural,” “healthy,” “with vitamins,” and “contains fruit flavour” are not sufficient by themselves.

#### Point allocation

| Evidence of qualifying whole-food components | Points |
|---|---:|
| None evidenced | 0 |
| Minor or unclear component; evidence level C | 2 |
| Clear component in the ingredient list, but quantity not declared; level B | 4 |
| One substantial qualifying component, or a product whose primary identity is a minimally processed qualifying food | 6 |
| Multiple substantial qualifying components, or a predominantly whole-grain/pulse/fruit/vegetable/nut/seed base | 8 |
| Strong verified composition showing a predominantly qualifying whole-food base with meaningful variety | 10 |

The final two bands require a documented product-specific rule. Ingredient order alone should not be described as a measured percentage. These bands are **provisional and require inter-rater validation**.

#### Example

A cereal whose first ingredient is whole oats, with nuts and dried fruit also listed, may receive 8 points if the evidence is clear. If the label only says “multigrain flavour” and lists refined wheat flour first, it should not receive the same score.

## 5. Category and Subcategory Framework

### 5.1 Category taxonomy

The first version should use the following categories and subcategories:

| Category | Subcategories |
|---|---|
| Bakery | Bread, Biscuit, Cake, Muffin, Cookies |
| Beverages | Energy Drink, Soft Drink, Juice, Milkshake, Water, Tea/Coffee Drink |
| Dairy | Milk, Flavoured Milk, Yogurt, Cheese |
| Snacks | Chips, Crackers, Popcorn, Nuts, Extruded Snack |
| Confectionery | Chocolate, Candy, Toffee, Sweets |
| Breakfast | Cereal, Oats, Granola, Breakfast Bar |
| Instant Food | Instant Noodles, Pasta, Soup, Ready Meal |
| Sauces & Condiments | Ketchup, Mayonnaise, Sauces, Pickles, Seasoning |
| Other Food | Packaged food that does not yet fit a validated subcategory |

A product must have exactly one primary scoring category in a given algorithm version. It may have secondary tags such as `contains_dairy`, `beverage`, `sweetened`, `concentrated`, `child_marketed`, or `ready_to_eat`.

### 5.2 Why a universal threshold is insufficient

The same per-100-g value can have different meanings across products. A sauce is used in small amounts but can be extremely sodium-dense. A beverage is consumed by volume and may be low in fibre regardless of its energy. Cheese naturally contains protein and saturated fat. Nuts are energy-dense but can be nutrient-dense. A cereal can be high in fibre but also high in free sugar.

A universal core remains useful because it is transparent and prevents category rules from becoming arbitrary. Category rules should alter only the parameter where the food form changes its meaning. They must not create a hidden route for a product to avoid an objectively high sodium or sugar concentration.

### 5.3 Category-specific rules and evidence status

| Category/subcategory | Version 1.0 rule | Status |
|---|---|---|
| Soft Drink, Energy Drink, sweetened beverage | Use per 100 ml. Apply the additional free-sugar flag above 10 g/100 ml. Do not award fibre points unless fibre is actually declared. | Provisional; anchored to WHO free-sugar guidance [1] |
| Juice | Treat fruit juice and concentrate sugars as free sugars under WHO’s definition. Do not treat “100% juice” as unsweetened for scoring. | Evidence-based definition; concentration bands provisional [1] |
| Milk, plain yogurt | Do not classify naturally occurring lactose as free sugar without evidence of added sugar. Score total declared saturated fat, protein, and fibre normally. | Definition-based; category handling provisional |
| Flavoured milk, milkshake | Added/free sugar is scored as declared or evidenced. Milk protein does not cancel sugar points. | Provisional |
| Cheese | Score sodium, saturated fat, protein, and energy normally. Protein points do not offset sodium or saturated fat. | Provisional |
| Bread and bakery | Use the common core. Whole-grain points require explicit whole-grain evidence, not brown colour or “multigrain” alone. | Provisional |
| Biscuit, cake, muffin, cookie | Use the common core. No positive whole-food points for token amounts of fruit or whole grain unless the ingredient evidence supports them. | Provisional |
| Chips, crackers, popcorn | Use common sodium, saturated-fat, trans-fat, and energy rules. Fried or baked status is not itself a numeric penalty. | Provisional |
| Nuts and seeds | Use common energy-density rules but expose the context label because energy density may coexist with favourable unsaturated-fat and protein profiles. | Provisional |
| Breakfast cereal, oats, granola | Fibre and whole-food evidence should be shown separately from free sugar. “Granola” is not a health claim. | Provisional |
| Instant noodles, pasta, soup | Score the packaged product as sold. If preparation dilution changes the product materially, show both as-sold data and a preparation note; do not invent a prepared value. | Provisional |
| Ketchup, mayonnaise, sauces, pickles | Retain the common per-100-g score and add a concentrated-product context flag. A future release may validate a serving-aware supplement. | Provisional |

No category-specific threshold should be added merely because a category is commercially popular. Before changing a threshold, NutriScan should document the scientific rationale, product-distribution effect, expert review, and sensitivity analysis.

## 6. Calculation Formula

### 6.1 Complete-data score

Let the eight component points be:

```text
S = sugar_points       [0, 20]
N = sodium_points      [0, 15]
F = saturated_points   [0, 15]
T = trans_points       [0, 10]
E = energy_points      [0, 5]
D = fibre_points       [0, 15]
P = protein_points     [0, 10]
W = whole_food_points  [0, 10]
```

For a product with all required numeric fields available:

```text
NQSS_raw = S + N + F + T + E + D + P + W
NQSS = round_half_up(clamp(NQSS_raw, 0, 100), 1)
```

The score is displayed to one decimal place in the backend and may be displayed as a whole number in a consumer interface. The underlying unrounded value and component values must be retained. `round_half_up` means 72.25 becomes 72.3, not banker’s rounding.

### 6.2 Missing-data policy and score status

NQSS has three statuses:

- `complete`: all eight components are calculated from acceptable evidence;
- `provisional`: one or more components are unavailable, bounded, or estimated under an explicitly permitted rule; and
- `withheld`: data quality is too poor to produce a meaningful number.

For a provisional score, use a transparent **available-weight rescaling** whenever the available information is sufficient to make a meaningful product-level assessment. The default consumer-scoring policy should not withhold a score merely because one or more fields are missing. A practical minimum is:

- a valid per-100-g or per-100-ml reference basis;
- at least three scorable components;
- at least one component from the limiting-nutrient group: free sugar, sodium, saturated fat, trans fat, or energy density; and
- no unresolved contradiction in the label or product identity.

This minimum is a **provisional implementation decision**, not a validated scientific cut-off. A deployment may choose a stricter policy for research or regulatory use. If the minimum is met, calculate the available-weight rescaling:

```text
available_weight = sum(max_points_i for available components)
available_points = sum(points_i for available components)
provisional_score = round_half_up(
    100 × available_points / available_weight,
    1
)
```

The backend must store the supported fraction and provisional status. The ordinary consumer interface should not expose internal phrases such as “available-weight rescaling” or “missing 35% scoring weight.” It should show a prominent score with a short label such as **Estimated score** or **Some values estimated**. A detail view may explain which values were estimated or unavailable.

This rescaling assumes missingness is not systematically favourable and must be validated. It prevents an unavailable component from being silently treated as zero and prevents the product from being penalized using invented values.

A product is `withheld` only when any of the following applies:

- the reference basis cannot be established;
- the nutrition panel is unreadable or internally contradictory;
- the product is not food;
- the label appears to combine multiple products without a declared recipe;
- fewer than the minimum number of meaningful components are available under the default policy;
- the product is not food or the reference basis cannot be established; or
- a critical contradiction makes the result misleading, such as two incompatible nutrition panels for the same product snapshot.

The fact that more than 25% of the theoretical points are unavailable is not, by itself, a reason to withhold a consumer-facing estimate. It should lower the confidence indicator and be retained in the backend.

### 6.3 Category rule application sequence

The deterministic sequence is:

1. Confirm that the record is a food product.
2. Assign the versioned category and subcategory.
3. Normalize units to per 100 g or per 100 ml, preserving the label basis.
4. Parse qualifiers such as `<0.1 g`, `trace`, `not detected`, and `not declared`.
5. Select the applicable category rule set.
6. Calculate each component using the tables in Section 4.
7. Apply only documented category modifiers.
8. Calculate complete or provisional score status.
9. Generate the component breakdown, data-quality flags, ingredient flags, and explanation text.
10. Store algorithm version, rule-set version, input snapshot, and calculation timestamp.

### 6.4 Worked example 1 — sweetened beverage

Hypothetical product: **Bangla Cola**, a 330 ml soft drink.

| Component | Input per 100 ml | Points |
|---|---:|---:|
| Free sugar | 10 g | 11/20 |
| Sodium | 15 mg | 15/15 |
| Saturated fat | 0 g | 15/15 |
| Trans fat | declared 0 g | 10/10 |
| Energy | 40 kcal | 5/5 |
| Fibre | 0 g | 0/15 |
| Protein | 0 g | 0/10 |
| Whole-food components | none | 0/10 |
| **Final** | | **56/100** |

Calculation:

```text
11 + 15 + 15 + 10 + 5 + 0 + 0 + 0 = 56
```

The beverage receives a sugar-sweetened beverage flag because its free sugar is 10 g/100 ml. The score does not claim that the drink is unsafe; it indicates a profile with substantial free sugar and no fibre, protein, or whole-food evidence.

### 6.5 Worked example 2 — high-fibre breakfast cereal

Hypothetical product: **Whole Oat Breakfast Cereal**, per 100 g.

| Component | Input | Points |
|---|---:|---:|
| Free sugar | 6 g | 11/20 |
| Sodium | 220 mg | 12/15 |
| Saturated fat | 1.5 g | 15/15 |
| Trans fat | 0 g | 10/10 |
| Energy | 370 kcal | 2/5 |
| Fibre | 7 g | 11/15 |
| Protein | 12 g | 7/10 |
| Whole-food components | whole oats first; nuts present; verified ingredient evidence | 8/10 |
| **Final** | | **76/100** |

Calculation:

```text
11 + 12 + 15 + 10 + 2 + 11 + 7 + 8 = 76
```

The product scores well because it has fibre, protein, low saturated fat, no declared trans fat, and strong whole-food evidence. Its free sugar and energy density still reduce the score.

### 6.6 Worked example 3 — salty instant noodles with incomplete fibre data

Hypothetical product: **Spicy Instant Noodles**, per 100 g as sold.

| Component | Input | Points |
|---|---:|---:|
| Free sugar | 1 g | 20/20 |
| Sodium | 1,600 mg | 0/15 |
| Saturated fat | 8 g | 1/15 |
| Trans fat | not declared | unavailable |
| Energy | 460 kcal | 1/5 |
| Fibre | not declared | unavailable |
| Protein | 9 g | 7/10 |
| Whole-food components | refined wheat and seasoning; no qualifying evidence | 0/10 |

Available points = 20 + 0 + 1 + 1 + 7 + 0 = 29.  
Available maximum = 20 + 15 + 15 + 5 + 10 + 10 = 75.  

```text
provisional_score = 100 × 29 / 75 = 38.666...
provisional_score = 38.7/100
```

The correct result is **Estimated NQSS 38.7/100** under the default consumer policy. The backend status is `provisional`, and the explanation should identify that sodium is very high and that trans fat and fibre were not declared. Missing fibre must not be treated as zero fibre, and missing trans fat must not be treated as zero trans fat.

## 7. Missing and Incomplete Nutrition Data

### 7.1 General rule

Missing is not zero. The database must distinguish:

```text
reported_value
reported_zero
upper_bound
trace_or_below_limit
not_declared
not_applicable
unreadable
conflicting
estimated_with_method
```

A blank field, a field absent from the label, and an explicitly printed “0 g” are different facts.

### 7.2 Missing energy

If energy is absent but carbohydrate, protein, and fat are all declared on a compatible basis, the engine may calculate a **screening estimate** using Atwater factors:

```text
estimated_kcal = 4 × carbohydrate_g + 4 × protein_g + 9 × fat_g
```

This estimate must be flagged as estimated because label carbohydrate definitions, fibre, sugar alcohols, organic acids, and rounding can affect the result. If the macronutrients are incomplete, energy is unavailable. Do not infer energy from product category.

If energy is missing, the energy-density component is unavailable. The score may be provisional only under the Section 6 policy.

### 7.3 Product-specific estimation of free sugar

Free sugar may be estimated only when the available evidence supports a defensible product-specific range. The estimator may use the declared total sugar, ingredient order, explicit sugar-containing ingredients, product category, and a verified product formulation. It must not use a generic category average as though it were the product's value.

The preferred approach is to store an interval or bounded estimate:

```text
estimated_free_sugar_g = {
  "lower_bound": 0,
  "upper_bound": total_sugar_g,
  "method": "ingredient_evidence_bound",
  "confidence": "low|medium|high"
}
```

For a consumer score, an estimate may be promoted to a single scoring value only when product-specific evidence is strong enough to justify it. The selected value must be marked `estimated_with_method`, never `reported_value`. If the evidence only establishes that added sugar is present but does not establish its quantity, leave the sugar component unavailable. Never assume total sugar equals added/free sugar.

When an estimate is used, the backend should retain the input value, method, supporting evidence, and uncertainty. The frontend should communicate this briefly as “Some values estimated.”

### 7.4 Missing dietary fibre

If fibre is not declared, do not infer it from whole grains, oats, vegetables, or the ingredient list. Set fibre to `not_declared` and the component to unavailable. Ingredient evidence may still support the separate whole-food score.

### 7.5 Missing protein

If protein is not declared, do not estimate it from the presence of dairy, legumes, nuts, meat, or eggs. Set protein to unavailable. A future validated food-composition database could provide an estimate, but that would require a product identity match and must never be silently substituted for the label.

### 7.6 Missing added/free sugar

If only total sugar is declared, do not equate it with added/free sugar. The score should be:

- `complete` if free/added sugar is explicitly available;
- `provisional` if a documented product-specific estimate is available and the uncertainty is displayed; or
- `withheld` in a strict mode, or `provisional` under available-weight rescaling in a permissive mode.

A product with total sugar 12 g/100 g could be a plain dairy product, a fruit product, or a sweetened biscuit. The same number cannot support the same free-sugar inference across those products. If ingredient evidence and product identity make a bounded estimate reasonable, use the product-specific estimation procedure in Section 7.3 and label the value as estimated.

### 7.6 Values declared as less than a threshold

Preserve both the qualifier and the bound. For `<0.1 g`, store:

```json
{
  "value": 0.1,
  "operator": "<",
  "exact_value_available": false,
  "display_value": "<0.1 g"
}
```

For scoring, a conservative interval policy is recommended:

- for a harmful nutrient, use the upper bound for a conservative score;
- for a beneficial nutrient, use the lower bound, usually zero, for a conservative score;
- expose that the result is bound-based rather than exact.

For example, `<0.1 g` saturated fat may score using 0.1 g, while `<0.1 g` fibre should not automatically receive points. The trans-fat table may award the declared below-limit band only if the label convention and limit are documented.

### 7.7 Per-serving labels

If only per-serving values are given, convert to the reference basis only when serving size and the serving’s mass or volume are declared:

```text
value_per_100 = value_per_serving × 100 / serving_mass_or_volume
```

If a serving is described as “one packet” but the packet mass is unknown, do not convert. Retain the per-serving data for display and mark the NQSS reference value unavailable.

If both per-serving and per-100-g values are present but conflict, flag the product for review and do not choose one silently.

### 7.8 Unclear labels and OCR

OCR output is not authoritative. A reviewer or a second extraction pass should verify decimal points, units, sodium/salt labels, and row alignment. If an unreadable label could change the score materially, the score should be withheld rather than guessed.

### 7.9 Product reformulation

A barcode identifies a product record, not necessarily an eternal formulation. Store label image, source date, country/market, and algorithm version. A reformulated product should create a new nutrition snapshot and may require a new assessment even if the barcode remains unchanged.

## 8. Separate Ingredient and Safety Assessment

NQSS evaluates nutritional quality. It does not attempt to capture every aspect of food safety or suitability.

The application should present separate sections for:

- ingredient explanations and functions;
- positive nutritional attributes;
- ingredients requiring attention;
- food additives and their technological functions;
- allergens and cross-contact statements;
- evidence-based potential health concerns;
- halal status and the evidence basis for that status; and
- child suitability, including age-specific cautions.

A permitted additive must not automatically reduce the NQSS. Additives should be described according to their function and, where relevant, the applicable regulatory context. A label such as “carcinogenic” or “harmful” must not be generated without reliable evidence, relevant exposure context, and careful distinction between hazard classification and actual risk at normal exposure levels.

The ingredient system may create a `needs_attention` flag for partially hydrogenated oil, undeclared allergen risk, or an ambiguous ingredient, but it must not convert that flag into a numeric NQSS penalty unless a future version documents a separate validated rule.

NQSS is also not a sustainability score, authenticity score, microbiological safety test, contamination test, or medical nutrition therapy assessment.

## 9. Score Interpretation

The following labels are proposed for user-interface testing only:

| Score | Proposed label | Status |
|---:|---|---|
| 80–100 | Excellent nutritional profile | Provisional |
| 60–79.9 | Good nutritional profile | Provisional |
| 40–59.9 | Moderate nutritional profile | Provisional |
| 0–39.9 | Low nutritional profile | Provisional |

These ranges are not validated health cut-offs. They are communication bands selected for simple interpretation and must be tested for face validity, distribution, and unintended category bias. The product page should always show the component breakdown because two products with the same total score may have very different trade-offs.

Recommended wording:

> NQSS is an indicator of the nutritional profile of this packaged food using the declared information and NutriScan Version 1.0 rules. It is not a medical recommendation and does not guarantee that a food is safe or unsafe. Scores may be provisional when label information is incomplete.

The interface should avoid claims such as “healthy,” “unhealthy,” “safe,” “unsafe,” “recommended for everyone,” or “suitable for children” based solely on NQSS.

### 9.1 Consumer-facing display policy

The frontend should remain separate from the scoring engine and should present the most useful information without exposing internal implementation language. A normal product page should show:

1. a prominent score out of 100;
2. a short nutritional-profile description;
3. positive nutritional aspects;
4. the main nutritional concerns; and
5. a short reason for the score.

If one or more values were estimated, show a small **Estimated score** or **Some values estimated** label. Do not show “WITHHELD,” “missing 35% scoring weight,” “available-weight rescaling,” or the internal calculation formula in the ordinary consumer view. Those details belong in the backend record and, where needed, an expandable technical detail view.

The frontend may simplify a backend status of `provisional` to “Estimated score,” but it must not remove material warnings from the detailed assessment. A score that is genuinely withheld should show a clear request for better label information rather than a fabricated number.

## 10. Backend Implementation Requirements

### 10.1 Deterministic architecture

The numerical engine must be a deterministic rules module. AI may generate a plain-language explanation from the stored score breakdown, but AI must not independently invent, alter, round, or override numerical values.

A recommended processing boundary is:

```text
raw_label_data
  -> validated_normalized_record
  -> category_rule_selection
  -> component_scoring
  -> missingness/status calculation
  -> NQSS result
  -> explanation generator
```

The explanation generator receives immutable numerical outputs. If a user disputes an explanation, the score is recalculated from the same structured record rather than edited by a language model.

The AI may assist with extraction, ingredient interpretation, and user-friendly explanations, but it must follow these boundaries:

- it may estimate a value only under a documented, product-specific method;
- it must store whether each value is declared, estimated, bounded, or unavailable;
- it must never treat missing data as zero;
- it must never assume total sugar equals added/free sugar;
- it must never assume undeclared trans fat is zero;
- it must not change NQSS weights or thresholds for an individual product; and
- it must pass the final numerical inputs to the deterministic scoring module.

The scoring module, not the language model, owns the final score, component points, rounding, and provisional status.

### 10.2 Versioning and reproducibility

Every assessment must record:

- `algorithm_name`: `NutriScan NQSS`;
- `algorithm_version`: for example, `1.0.0`;
- `rule_set_version`;
- category and subcategory identifiers;
- normalized input snapshot;
- original label values and qualifiers;
- source type and source timestamp;
- component points and maximum points;
- score status: complete, provisional, or withheld;
- missing-data flags;
- provenance for each nutrition field: declared, estimated, bounded, or unavailable;
- estimation method and confidence, where applicable;
- ingredient and allergen assessment version; and
- final score and rounding method.

A rule change that can change a score requires a new algorithm version. Historical scores must remain reproducible under their original version.

### 10.3 Illustrative JSON output

```json
{
  "assessment_id": "nqss_demo_0001",
  "product_id": "barcode-or-internal-id",
  "product_name": "Whole Oat Breakfast Cereal",
  "category": "Breakfast",
  "subcategory": "Cereal",
  "algorithm": "NutriScan NQSS",
  "algorithm_version": "1.0.0",
  "status": "complete",
  "reference_basis": "per_100_g",
  "inputs": {
    "energy_kcal": 370,
    "free_sugar_g": 6,
    "total_sugar_g": 8,
    "sodium_mg": 220,
    "saturated_fat_g": 1.5,
    "trans_fat_g": 0,
    "fibre_g": 7,
    "protein_g": 12,
    "whole_food_evidence": [
      {"component": "whole_oats", "evidence_level": "A"},
      {"component": "nuts", "evidence_level": "B"}
    ]
  },
  "points": {
    "free_sugar": {"points": 11, "maximum": 20},
    "sodium": {"points": 12, "maximum": 15},
    "saturated_fat": {"points": 15, "maximum": 15},
    "trans_fat": {"points": 10, "maximum": 10},
    "energy_density": {"points": 2, "maximum": 5},
    "dietary_fibre": {"points": 11, "maximum": 15},
    "protein": {"points": 7, "maximum": 10},
    "whole_food_components": {"points": 8, "maximum": 10}
  },
  "score": {
    "raw": 76,
    "final": 76.0,
    "rounding": "round_half_up_1_decimal",
    "interpretation": "Good nutritional profile",
    "interpretation_status": "provisional_bands"
  },
  "data_quality": {
    "missing_components": [],
    "estimated_components": [],
    "qualifier_components": [],
    "source": "label_image_verified",
    "confidence_note": "Numerical fields complete; whole-food evidence is rule-based and provisional."
  },
  "separate_assessments": {
    "ingredient_flags": [],
    "allergens": [],
    "halal_status": "not_assessed",
    "child_suitability": "not_assessed"
  }
}
```

### 10.4 Testing requirements

The implementation should include unit tests for every boundary, including exactly 2.5 g, 5 g, 10 g, and 22.5 g free sugar; exact sodium boundaries; zero and below-limit trans fat; missing values; per-serving conversion; category selection; and rounding.

Property tests should confirm:

- a lower harmful-nutrient value never earns fewer points than a higher value within the same rule;
- a higher fibre or protein value never earns fewer points within the same rule;
- scores never fall below 0 or above 100;
- changing only an unavailable value does not silently change a complete score;
- the same input, category, and version always produce the same output; and
- a rule-version change is visible in the result.

## 11. Scientific Validation and Limitations

### 11.1 Benchmarking

NQSS should be benchmarked against established nutrient-profile methods, not treated as an established replacement. Suitable comparators include WHO nutrient-profile models and the revised Nutri-Score algorithm. The comparison should measure rank correlation, agreement on clearly nutrient-poor and nutrient-dense products, category-specific disagreement, and sensitivity to missing data. A high correlation does not prove that either system predicts health outcomes.

The 2022 WHO report on nutrient-profile models explains that such models are policy tools built around nutrients and food components and that model purpose and context matter [4]. Nutri-Score is another front-of-pack profiling approach; its algorithm should be treated as a comparator rather than as a source of automatic truth [5].

### 11.2 Weight and threshold validation

Validation should use a large, stratified sample of packaged foods sold in Bangladesh. The sample should cover brands, price points, urban and rural availability where feasible, all major categories, local and imported products, and products marketed to children.

The study should:

1. describe the distribution of every input and component score;
2. quantify missingness by category and manufacturer;
3. calculate correlations between component scores;
4. run one-at-a-time and global sensitivity analyses for weights and cut-points;
5. test whether category rules cause systematic advantages or penalties;
6. compare scores with independent expert ratings using a prespecified protocol;
7. evaluate inter-rater reliability for whole-food evidence; and
8. predefine criteria for changing or retaining Version 1.0 rules.

Expert review should include nutritionists, food scientists, epidemiologists, clinicians with relevant public-health expertise, data-quality reviewers, and Bangladesh food-label/regulatory specialists. Conflicts of interest should be recorded.

### 11.3 Important limitations

NQSS is limited by the quality and completeness of packaged-food labels. It does not observe actual portion size, total daily diet, cooking additions, food frequency, physical activity, age, pregnancy, disease status, or nutrient bioavailability. A product’s score cannot predict an individual’s disease risk.

Category-specific rules can introduce bias. They may make two products with similar nutrient profiles receive different results, or may reward products because of category conventions rather than better nutrition. Category-specific thresholds should therefore be rare, documented, and audited.

Whole-food scoring is partly dependent on ingredient-list interpretation and may be vulnerable to formulation ambiguity, ingredient-order limitations, and marketing language. Protein points can over-reward products that are high in protein but also high in sugar, sodium, or saturated fat. Energy density overlaps with other variables. Missing data may be non-random, because products with less favourable profiles may be less likely to disclose certain values.

The score should not be presented as a clinically validated health prediction. Its intended role is a transparent nutritional-profile indicator that helps users inspect trade-offs in packaged foods.

## 12. Implementation Decision Log for Version 1.0

| Decision | Rationale | Evidence status |
|---|---|---|
| Use per 100 g/ml as the primary basis | Improves comparability across manufacturer serving sizes | Standardization decision |
| Retain the proposed 20/15/15/10/5/15/10/10 weights | Provides an auditable 100-point pilot without hidden normalization | Unvalidated design decision |
| Keep energy at 5 points | Limits double-counting with sugar and fat | Design decision informed by construct overlap |
| Do not add total fat as a separate penalty | Total fat is not equivalent to unhealthy fat; fat quality matters | WHO fat guidance [1] [3] |
| Treat missing as unavailable, not zero | Prevents fabricated certainty | Data-integrity requirement |
| Separate ingredients and safety from NQSS | Nutritional profile, food safety, allergens, halal status, and suitability are different questions | Scope decision |
| Provisional interpretation bands | No outcome validation exists for these exact boundaries | Unvalidated design decision |
| Category rules limited to contextual adjustments | Prevents arbitrary category-specific scoring | Design decision |

## 13. References and Scientific Sources

[1]: https://www.who.int/news-room/fact-sheets/detail/healthy-diet "Healthy diet — World Health Organization, 2026. Supports free-sugar definition and target, sodium, saturated and trans fat, fibre, protein, and food-group principles used throughout NQSS."

[2]: https://cdn.who.int/media/docs/default-source/searo/bangladesh/national-dietary-guidelines-for-bangladesh.pdf "National Dietary Guidelines for Bangladesh — Government of Bangladesh and Institute of Public Health Nutrition, 2025. Supports Bangladesh-specific guidance on free sugar, sodium/salt, saturated fat, trans fat, fibre, fruit and vegetables, pulses, whole grains, and food selection."

[3]: https://www.ncbi.nlm.nih.gov/books/NBK593397/ "Saturated Fatty Acid and Trans-Fatty Acid Intake for Adults and Children: WHO Guideline — World Health Organization, 2023. Supports the <10% saturated-fat and <1% trans-fat energy recommendations and replacement context."

[4]: https://iris.who.int/server/api/core/bitstreams/7daa1151-8f42-41af-ac38-0465ffc648fd/content "Use of Nutrient Profile Models for Nutrition and Health Policies — World Health Organization, 2022. Supports the use of nutrient-profile models as context-dependent public-health policy tools and informs benchmarking and limitations."

[5]: https://www.santepubliquefrance.fr/en/nutri-score "Nutri-Score — Santé publique France, current official information page. Provides an established front-of-pack nutritional profiling comparator; NQSS should compare against it rather than claim equivalence."

[6]: https://www.who.int/publications/i/item/9789241549028 "Guideline: sugars intake for adults and children — World Health Organization, 2015. Supports the evidence-based definition of free sugars, the <10% energy recommendation, and the conditional 5% or less suggestion."

[7]: https://openknowledge.fao.org/server/api/core/bitstreams/9fdfbe0e-c3f6-45e0-a45d-39a53b4fd5b5/content "Dietary Guidelines for Bangladesh — Food and Agriculture Organization of the United Nations and Bangladesh authorities, publication year shown in source document. Supports food-based guidance on cereals, whole grains, pulses, fruits, vegetables, protein foods, salt, sugar, and fat."

[8]: https://www.who.int/publications/i/item/9789240073593 "Carbohydrate intake for adults and children — World Health Organization, 2023. Supports recommendations on preferred carbohydrate sources, fruit and vegetable intake, and naturally occurring dietary fibre."

[9]: https://www.who.int/publications/i/item/924120916X "Diet, nutrition and the prevention of chronic diseases: report of a joint WHO/FAO expert consultation — World Health Organization and Food and Agriculture Organization of the United Nations, 2003. Provides historical scientific context for population nutrient goals used in national dietary guidance."

[10]: https://doi.org/10.1016/S0140-6736%2818%2931788-4 "Food in the Anthropocene: the EAT–Lancet Commission on healthy diets from sustainable food systems — Willett et al., 2019. Provides contextual evidence on dietary patterns and food-group diversity; it is not used as a direct NQSS scoring rule."

[11]: https://iris.who.int/server/api/core/bitstreams/38f9093d-88a6-4fa0-a864-aa7c30e95d12/content "WHO Regional Office for Europe nutrient profile model — World Health Organization Regional Office for Europe, 2023. Provides an established nutrient-profile comparator and definitions for nutrients used in profiling."

[12]: https://www.who.int/news/item/17-07-2023-who-updates-guidelines-on-fats-and-carbohydrates "WHO updates guidelines on fats and carbohydrates — World Health Organization, 2023. Summarizes updated guidance on carbohydrate quality, fruits and vegetables, fibre, and fat-related recommendations relevant to NQSS."
